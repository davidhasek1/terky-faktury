-- Zázemí pro MCP server (ovládání aplikace z ChatGPT) a vlastní OAuth 2.1 server.
--
-- Dvě skupiny tabulek:
--
--   1. oauth_*  — klienti, autorizační kódy a refresh tokeny. Sahá na ně jen
--      service-role klient v /api/oauth/*, protože běží před přihlášením.
--
--   2. mcp_*    — potvrzovací tokeny, idempotence, audit a rate limit. Sahá na
--      ně MCP vrstva jménem konkrétního uživatele.
--
-- U obou skupin je RLS zapnutá a záměrně BEZ politik: přímý přístup je tedy
-- pro role `anon` i `authenticated` zakázaný. K mcp_* tabulkám se chodí výhradně
-- přes SECURITY DEFINER funkce níže, které si uživatele berou z auth.uid().
-- Model tak nemůže žádným parametrem sáhnout na cizí řádek.

-- ---------------------------------------------------------------------------
-- OAuth 2.1
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  -- SHA-256 client secretu; NULL u veřejných klientů (ChatGPT + PKCE).
  client_secret_hash TEXT,
  client_name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires_at ON oauth_authorization_codes(expires_at);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  -- Rodina tokenů vzniklá rotací. Při zneužití starého tokenu zneplatníme celou.
  family_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_family ON oauth_refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user ON oauth_refresh_tokens(user_id);

ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MCP runtime
-- ---------------------------------------------------------------------------

-- Potvrzení zápisové operace. prepare_* založí řádek, zapisující nástroj ho
-- jednorázově spotřebuje. Hash parametrů zajistí, že po změně čehokoli
-- v návrhu potvrzení neplatí.
CREATE TABLE IF NOT EXISTS mcp_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  summary JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_confirmations_user ON mcp_confirmations(user_id, expires_at);

-- Idempotence zápisů. Opakované volání se stejným klíčem vrátí původní výsledek
-- místo aby vzniklá druhá faktura nebo druhý e-mail.
CREATE TABLE IF NOT EXISTS mcp_idempotency (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, tool_name, idempotency_key)
);

-- Audit. Obsahuje jen metadata operace, nikdy vstupní objekty, osobní údaje
-- ani tokeny.
CREATE TABLE IF NOT EXISTS mcp_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL,
  client_id TEXT,
  tool_name TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'error')),
  error_code TEXT,
  resource_type TEXT,
  resource_id UUID,
  idempotency_key TEXT,
  confirmation_id UUID,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_user_time ON mcp_audit_log(user_id, occurred_at DESC);

-- Rate limit s pevným oknem.
CREATE TABLE IF NOT EXISTS mcp_rate_limit (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);

ALTER TABLE mcp_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_rate_limit ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER API pro MCP vrstvu
--
-- Uživatele si každá funkce bere z auth.uid(), takže ho volající nemůže
-- podvrhnout parametrem.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_current_user()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'MCP volání bez ověřené identity' USING ERRCODE = '28000';
  END IF;
  RETURN v_user;
END;
$$;

-- Vrátí TRUE, pokud se volání ještě vejde do limitu.
CREATE OR REPLACE FUNCTION public.mcp_consume_rate_limit(
  p_bucket TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
  v_window TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO mcp_rate_limit (user_id, bucket, window_start, count)
  VALUES (v_user, p_bucket, v_window, 1)
  ON CONFLICT (user_id, bucket, window_start)
    DO UPDATE SET count = mcp_rate_limit.count + 1
  RETURNING count INTO v_count;

  DELETE FROM mcp_rate_limit
   WHERE user_id = v_user
     AND window_start < now() - INTERVAL '1 hour';

  RETURN v_count <= p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_create_confirmation(
  p_tool TEXT,
  p_params_hash TEXT,
  p_summary JSONB,
  p_ttl_seconds INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
  v_id UUID;
BEGIN
  DELETE FROM mcp_confirmations
   WHERE user_id = v_user
     AND expires_at < now() - INTERVAL '1 hour';

  INSERT INTO mcp_confirmations (user_id, tool_name, params_hash, summary, expires_at)
  VALUES (v_user, p_tool, p_params_hash, p_summary, now() + make_interval(secs => p_ttl_seconds))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 'ok' | 'not_found' | 'mismatch' | 'expired' | 'already_used'
CREATE OR REPLACE FUNCTION public.mcp_consume_confirmation(
  p_id UUID,
  p_tool TEXT,
  p_params_hash TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
  v_row mcp_confirmations%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM mcp_confirmations
   WHERE id = p_id AND user_id = v_user;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_row.tool_name <> p_tool OR v_row.params_hash <> p_params_hash THEN
    RETURN 'mismatch';
  END IF;

  IF v_row.consumed_at IS NOT NULL THEN
    RETURN 'already_used';
  END IF;

  IF v_row.expires_at <= now() THEN
    RETURN 'expired';
  END IF;

  UPDATE mcp_confirmations
     SET consumed_at = now()
   WHERE id = p_id AND consumed_at IS NULL;

  IF NOT FOUND THEN
    RETURN 'already_used';
  END IF;

  RETURN 'ok';
END;
$$;

-- {"state":"fresh"} | {"state":"replay","result":…} | {"state":"in_progress"} | {"state":"conflict"}
CREATE OR REPLACE FUNCTION public.mcp_begin_idempotent(
  p_tool TEXT,
  p_key TEXT,
  p_request_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
  v_row mcp_idempotency%ROWTYPE;
BEGIN
  INSERT INTO mcp_idempotency (user_id, tool_name, idempotency_key, request_hash)
  VALUES (v_user, p_tool, p_key, p_request_hash)
  ON CONFLICT (user_id, tool_name, idempotency_key) DO NOTHING;

  IF FOUND THEN
    RETURN jsonb_build_object('state', 'fresh');
  END IF;

  SELECT * INTO v_row
    FROM mcp_idempotency
   WHERE user_id = v_user AND tool_name = p_tool AND idempotency_key = p_key;

  IF v_row.request_hash <> p_request_hash THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;

  IF v_row.result IS NULL THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  RETURN jsonb_build_object('state', 'replay', 'result', v_row.result);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_complete_idempotent(
  p_tool TEXT,
  p_key TEXT,
  p_result JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
BEGIN
  UPDATE mcp_idempotency
     SET result = p_result, completed_at = now()
   WHERE user_id = v_user AND tool_name = p_tool AND idempotency_key = p_key;
END;
$$;

-- Uvolní rezervaci klíče, když operace selhala — jinak by šla znovu zkusit
-- až po ručním zásahu.
CREATE OR REPLACE FUNCTION public.mcp_release_idempotent(
  p_tool TEXT,
  p_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
BEGIN
  DELETE FROM mcp_idempotency
   WHERE user_id = v_user
     AND tool_name = p_tool
     AND idempotency_key = p_key
     AND result IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_write_audit(
  p_client_id TEXT,
  p_tool TEXT,
  p_outcome TEXT,
  p_error_code TEXT,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_idempotency_key TEXT,
  p_confirmation_id UUID,
  p_duration_ms INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := public.mcp_current_user();
BEGIN
  INSERT INTO mcp_audit_log (
    user_id, client_id, tool_name, outcome, error_code,
    resource_type, resource_id, idempotency_key, confirmation_id, duration_ms
  )
  VALUES (
    v_user, p_client_id, p_tool, p_outcome, p_error_code,
    p_resource_type, p_resource_id, p_idempotency_key, p_confirmation_id, p_duration_ms
  );
END;
$$;

-- Anonymní role nemá na MCP funkce co dělat.
REVOKE ALL ON FUNCTION public.mcp_consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_create_confirmation(TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_consume_confirmation(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_begin_idempotent(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_complete_idempotent(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_release_idempotent(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_write_audit(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mcp_consume_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_create_confirmation(TEXT, TEXT, JSONB, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_consume_confirmation(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_begin_idempotent(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_complete_idempotent(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_release_idempotent(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_write_audit(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, INTEGER) TO authenticated;
