import { OAUTH_SCOPES, issuer, resourceIdentifier } from "@/lib/oauth/config"
import { jsonResponse, preflightResponse } from "@/lib/oauth/http"

/**
 * Metadata chráněného zdroje (RFC 9728). Klient si sem sáhne poté, co dostane
 * 401 s hlavičkou `WWW-Authenticate`, a zjistí, který autorizační server má
 * použít.
 *
 * Cesta `/.well-known/oauth-protected-resource` je na tuto routu přesměrovaná
 * v `next.config.mjs` (App Router neumí složky začínající tečkou).
 */
export const dynamic = "force-dynamic"

export function GET() {
  return jsonResponse({
    resource: resourceIdentifier(),
    authorization_servers: [issuer()],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
  })
}

export function OPTIONS() {
  return preflightResponse()
}
