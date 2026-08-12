import { protectedResourceMetadataUrl } from "@/lib/oauth/config"
import { corsHeaders } from "@/lib/oauth/http"
import { verifyAccessToken } from "@/lib/oauth/tokens"

import { PERSONAL_TOKEN_PREFIX, verifyPersonalToken } from "./personal-tokens"

/**
 * Ověření MCP požadavku.
 *
 * Bez platného Bearer tokenu se dál nedostane nic. Uznáváme dvě podoby:
 *
 *  - **OAuth access token** (JWT) — tudy chodí ChatGPT konektor,
 *  - **osobní token** s prefixem `tfm_` — pro klienty bez OAuth
 *    (Claude Desktop, MCP Inspector, skripty). Vydává si ho uživatel
 *    na stránce `/connect`.
 *
 * Obě cesty končí stejně: identita uživatele a rozsah oprávnění. Zbytek
 * aplikace mezi nimi nerozlišuje, takže rate limit, potvrzování i audit
 * fungují pro obě totožně.
 *
 * Odpověď 401 nese hlavičku `WWW-Authenticate` s odkazem na metadata
 * chráněného zdroje — podle ní si OAuth klient najde autorizační server.
 * Nikdy neprozradí víc, než co protokol vyžaduje; popis je schválně anglicky
 * bez diakritiky, protože hodnoty HTTP hlaviček musí být ASCII.
 */

export interface AuthenticatedIdentity {
  userId: string
  /** Kdo volá — `client_id` u OAuth, `pat:<id>` u osobního tokenu. */
  clientId: string
  scope: string
}

export type AuthOutcome =
  | { authenticated: true; identity: AuthenticatedIdentity; token: string }
  | { authenticated: false; response: Response }

export async function authenticateRequest(request: Request): Promise<AuthOutcome> {
  const header = request.headers.get("authorization")

  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return { authenticated: false, response: unauthorized("missing access token") }
  }

  const token = header.slice(7).trim()

  if (token.startsWith(PERSONAL_TOKEN_PREFIX)) {
    const identity = await verifyPersonalToken(token)

    if (!identity) {
      return { authenticated: false, response: unauthorized("invalid or expired personal token") }
    }

    return {
      authenticated: true,
      token,
      identity: {
        userId: identity.userId,
        clientId: `pat:${identity.tokenId}`,
        scope: identity.scope,
      },
    }
  }

  try {
    const claims = await verifyAccessToken(token)
    return {
      authenticated: true,
      token,
      identity: { userId: claims.userId, clientId: claims.clientId, scope: claims.scope },
    }
  } catch {
    return { authenticated: false, response: unauthorized("invalid or expired access token") }
  }
}

function unauthorized(description: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Přihlaš aplikaci k účtu Terky Faktury.",
        retryable: false,
      },
    }),
    {
      status: 401,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json",
        "WWW-Authenticate":
          `Bearer error="invalid_token", error_description="${description}", ` +
          `resource_metadata="${protectedResourceMetadataUrl()}"`,
      },
    },
  )
}
