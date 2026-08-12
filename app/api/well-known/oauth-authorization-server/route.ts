import { OAUTH_SCOPES, baseUrl, issuer } from "@/lib/oauth/config"
import { jsonResponse, preflightResponse } from "@/lib/oauth/http"

/**
 * Metadata autorizačního serveru (RFC 8414). Podporujeme výhradně
 * Authorization Code Flow s PKCE S256; implicit ani password grant ne.
 */
export const dynamic = "force-dynamic"

export function GET() {
  const base = baseUrl()

  return jsonResponse({
    issuer: issuer(),
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    scopes_supported: OAUTH_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  })
}

export function OPTIONS() {
  return preflightResponse()
}
