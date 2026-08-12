/**
 * Konfigurace vestavěného OAuth 2.1 autorizačního serveru.
 *
 * Aplikace je zároveň authorization server (vydává tokeny) i resource server
 * (chrání /mcp). Supabase Auth zůstává zdrojem identity — přihlašuje uživatele
 * na `/auth/login`, ale tokeny pro ChatGPT vydáváme my.
 */

export const OAUTH_SCOPES = ["invoices:read", "invoices:write"] as const

export type OAuthScope = (typeof OAUTH_SCOPES)[number]

export const DEFAULT_SCOPE = OAUTH_SCOPES.join(" ")

/** Autorizační kód žije jen do okamžiku výměny za token. */
export const AUTHORIZATION_CODE_TTL_SECONDS = 60

/** Krátká životnost access tokenu; odvolání se projeví nejpozději za tuto dobu. */
export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

/** Podepsaný požadavek předávaný souhlasné obrazovce. */
export const AUTHORIZATION_REQUEST_TTL_SECONDS = 10 * 60

/**
 * Veřejný původ aplikace. Musí přesně sedět na doménu, kterou zadáš do
 * ChatGPT — z něj se skládá `issuer` i `resource` v metadatech.
 */
export function baseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL
  if (!value) throw new Error("Chybí proměnná prostředí NEXT_PUBLIC_SITE_URL")
  return value.replace(/\/$/, "")
}

export function issuer(): string {
  return baseUrl()
}

/** Kanonický identifikátor chráněného zdroje (RFC 8707). */
export function resourceIdentifier(): string {
  return `${baseUrl()}/mcp`
}

export function protectedResourceMetadataUrl(): string {
  return `${baseUrl()}/.well-known/oauth-protected-resource`
}

/** Tajemství pro podpis access tokenů a autorizačních požadavků. */
export function tokenSecret(): Uint8Array {
  const value = process.env.MCP_TOKEN_SECRET
  if (!value || value.length < 32) {
    throw new Error("MCP_TOKEN_SECRET musí být nastavený a mít alespoň 32 znaků")
  }
  return new TextEncoder().encode(value)
}

/** Ponechá jen scopes, které server skutečně zná. */
export function normalizeScope(requested: string | null | undefined): string {
  if (!requested) return DEFAULT_SCOPE
  const granted = requested
    .split(/\s+/)
    .filter((scope): scope is OAuthScope => (OAUTH_SCOPES as readonly string[]).includes(scope))
  return granted.length > 0 ? Array.from(new Set(granted)).join(" ") : DEFAULT_SCOPE
}

export function hasScope(scope: string, required: OAuthScope): boolean {
  return scope.split(/\s+/).includes(required)
}
