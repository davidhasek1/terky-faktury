-- Osobní přístupové tokeny pro MCP.
--
-- ChatGPT se připojuje přes OAuth (migrace 014) a token si vyřídí sám. Klienti,
-- kteří OAuth neumí — Claude Desktop, MCP Inspector, skripty, curl — potřebují
-- prostý Bearer token. Ten si uživatel vygeneruje na stránce /pripojeni.
--
-- Token se ukládá jen jako SHA-256; v otevřené podobě ho uživatel vidí jedinkrát
-- při vytvoření. `token_hint` jsou poslední čtyři znaky, aby šlo v seznamu poznat,
-- který token je který, bez toho aby se dal odvodit.
--
-- Tabulka nemá RLS politiky: přímo se k ní nedostane ani `anon`, ani
-- `authenticated`. Uživatel s ní pracuje přes SECURITY DEFINER funkce níže
-- (ty si ho berou z auth.uid()), ověřování tokenu při MCP volání běží pod
-- service-role klientem, protože v ten okamžik žádná identita ještě neexistuje.

CREATE TABLE IF NOT EXISTS mcp_personal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_personal_tokens_user
  ON mcp_personal_tokens(user_id, created_at DESC);

ALTER TABLE mcp_personal_tokens ENABLE ROW LEVEL SECURITY;

-- Kolik tokenů smí mít jeden uživatel naráz aktivních.
CREATE OR REPLACE FUNCTION public.mcp_create_personal_token(
  p_name TEXT,
  p_token_hash TEXT,
  p_token_hint TEXT,
  p_scope TEXT,
  p_ttl_days INTEGER
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  token_hint TEXT,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
  v_active INTEGER;
BEGIN
  SELECT count(*) INTO v_active
    FROM mcp_personal_tokens
   WHERE user_id = v_user
     AND revoked_at IS NULL
     AND expires_at > now();

  IF v_active >= 10 THEN
    RAISE EXCEPTION 'Dosáhli jste maxima 10 platných tokenů' USING ERRCODE = '54000';
  END IF;

  RETURN QUERY
  INSERT INTO mcp_personal_tokens (
    user_id, name, token_hash, token_hint, scope, expires_at
  )
  VALUES (
    v_user, p_name, p_token_hash, p_token_hint, p_scope,
    now() + make_interval(days => p_ttl_days)
  )
  RETURNING
    mcp_personal_tokens.id,
    mcp_personal_tokens.name,
    mcp_personal_tokens.token_hint,
    mcp_personal_tokens.scope,
    mcp_personal_tokens.expires_at,
    mcp_personal_tokens.created_at;
END;
$$;

-- Seznam bez otisku tokenu — ten se ven nedostane nikdy.
CREATE OR REPLACE FUNCTION public.mcp_list_personal_tokens()
RETURNS TABLE (
  id UUID,
  name TEXT,
  token_hint TEXT,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.name, t.token_hint, t.scope,
    t.expires_at, t.last_used_at, t.revoked_at, t.created_at
    FROM mcp_personal_tokens t
   WHERE t.user_id = v_user
   ORDER BY t.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_revoke_personal_token(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
BEGIN
  UPDATE mcp_personal_tokens
     SET revoked_at = now()
   WHERE id = p_id
     AND user_id = v_user
     AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_create_personal_token(TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_list_personal_tokens() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_revoke_personal_token(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mcp_create_personal_token(TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_list_personal_tokens() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_revoke_personal_token(UUID) TO authenticated;
