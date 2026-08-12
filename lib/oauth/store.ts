import { createServiceRoleClient } from "@/lib/supabase/service-role"

import {
  AUTHORIZATION_CODE_TTL_SECONDS,
  DEFAULT_SCOPE,
  REFRESH_TOKEN_TTL_SECONDS,
  normalizeScope,
} from "./config"
import { randomToken, sha256Base64Url } from "./crypto"

/**
 * Úložiště OAuth klientů, autorizačních kódů a refresh tokenů.
 *
 * Běží před přihlášením uživatele, takže jako jediná část MCP integrace
 * používá service-role klienta. Tabulky nemají žádné RLS politiky, takže se
 * k nim jinudy nedá dostat.
 *
 * Kódy ani refresh tokeny se neukládají v otevřené podobě — v databázi je
 * vždy jen jejich SHA-256.
 */

export interface OAuthClient {
  client_id: string
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  token_endpoint_auth_method: string
  scope: string
  client_secret_hash: string | null
}

export interface AuthorizationCodeRecord {
  client_id: string
  user_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  scope: string
  resource: string | null
}

export interface RefreshTokenRecord {
  id: string
  client_id: string
  user_id: string
  scope: string
  family_id: string
  expires_at: string
  revoked_at: string | null
}

export interface RegisterClientInput {
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  token_endpoint_auth_method: string
  scope?: string
}

export async function registerClient(
  input: RegisterClientInput,
): Promise<{ client: OAuthClient; clientSecret: string | null }> {
  const supabase = createServiceRoleClient()

  const clientId = randomToken()
  const isConfidential = input.token_endpoint_auth_method !== "none"
  const clientSecret = isConfidential ? randomToken() : null

  const row = {
    client_id: clientId,
    client_secret_hash: clientSecret ? await sha256Base64Url(clientSecret) : null,
    client_name: input.client_name,
    redirect_uris: input.redirect_uris,
    grant_types: input.grant_types,
    token_endpoint_auth_method: input.token_endpoint_auth_method,
    scope: normalizeScope(input.scope ?? DEFAULT_SCOPE),
  }

  const { data, error } = await supabase
    .from("oauth_clients")
    .insert(row)
    .select("*")
    .single<OAuthClient>()

  if (error) throw new Error(`Registrace OAuth klienta selhala: ${error.code ?? "unknown"}`)
  return { client: data, clientSecret }
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from("oauth_clients")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle<OAuthClient>()

  if (error) throw new Error("Nepodařilo se načíst OAuth klienta")
  return data
}

export async function storeAuthorizationCode(record: AuthorizationCodeRecord): Promise<string> {
  const supabase = createServiceRoleClient()
  const code = randomToken()

  const { error } = await supabase.from("oauth_authorization_codes").insert({
    code_hash: await sha256Base64Url(code),
    ...record,
    expires_at: new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000).toISOString(),
  })

  if (error) throw new Error("Nepodařilo se vydat autorizační kód")
  return code
}

/**
 * Jednorázová výměna kódu. Vrací `null`, když kód neexistuje, vypršel nebo
 * už byl použit — volající to nemá rozlišovat, aby útočník nezjistil,
 * který z případů nastal.
 */
export async function consumeAuthorizationCode(
  code: string,
): Promise<AuthorizationCodeRecord | null> {
  const supabase = createServiceRoleClient()
  const codeHash = await sha256Base64Url(code)

  const { data, error } = await supabase
    .from("oauth_authorization_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code_hash", codeHash)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource")
    .maybeSingle<AuthorizationCodeRecord>()

  if (error) throw new Error("Nepodařilo se ověřit autorizační kód")
  return data
}

export async function issueRefreshToken(params: {
  clientId: string
  userId: string
  scope: string
  familyId?: string
}): Promise<string> {
  const supabase = createServiceRoleClient()
  const token = randomToken()

  const { error } = await supabase.from("oauth_refresh_tokens").insert({
    token_hash: await sha256Base64Url(token),
    client_id: params.clientId,
    user_id: params.userId,
    scope: params.scope,
    family_id: params.familyId ?? crypto.randomUUID(),
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
  })

  if (error) throw new Error("Nepodařilo se vydat refresh token")
  return token
}

export async function findRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from("oauth_refresh_tokens")
    .select("id, client_id, user_id, scope, family_id, expires_at, revoked_at")
    .eq("token_hash", await sha256Base64Url(token))
    .maybeSingle<RefreshTokenRecord>()

  if (error) throw new Error("Nepodařilo se ověřit refresh token")
  return data
}

export async function revokeRefreshToken(tokenId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  await supabase
    .from("oauth_refresh_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .is("revoked_at", null)
}

/**
 * Zneplatní celou rotační rodinu. Voláme, když se objeví už použitý refresh
 * token — to je příznak, že token unikl.
 */
export async function revokeRefreshTokenFamily(familyId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  await supabase
    .from("oauth_refresh_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("family_id", familyId)
    .is("revoked_at", null)
}
