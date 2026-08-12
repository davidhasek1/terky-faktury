import { resourceIdentifier } from "@/lib/oauth/config"
import { sha256Base64Url, timingSafeEqual, verifyPkce } from "@/lib/oauth/crypto"
import { jsonResponse, oauthError, preflightResponse } from "@/lib/oauth/http"
import {
  consumeAuthorizationCode,
  findRefreshToken,
  getClient,
  issueRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenFamily,
  type OAuthClient,
} from "@/lib/oauth/store"
import { issueAccessToken } from "@/lib/oauth/tokens"

/**
 * Token endpoint. Podporuje `authorization_code` (vždy s PKCE) a rotující
 * `refresh_token`.
 *
 * Chybové odpovědi jsou schválně neurčité — klient se z nich nedozví, jestli
 * selhal kód, ověření klienta nebo PKCE.
 */
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const form = await readForm(request)
  if (!form) return oauthError("invalid_request", "Očekáván formulářový formát těla")

  const grantType = form.get("grant_type")
  const credentials = clientCredentials(request, form)

  if (!credentials.clientId) {
    return oauthError("invalid_client", "Chybí client_id", 401)
  }

  const client = await getClient(credentials.clientId)
  if (!client || !(await clientAuthenticated(client, credentials.clientSecret))) {
    return oauthError("invalid_client", "Ověření klienta selhalo", 401)
  }

  if (grantType === "authorization_code") {
    return exchangeAuthorizationCode(client, form)
  }

  if (grantType === "refresh_token") {
    return exchangeRefreshToken(client, form)
  }

  return oauthError("unsupported_grant_type", "Nepodporovaný grant_type")
}

async function exchangeAuthorizationCode(client: OAuthClient, form: FormData) {
  const code = form.get("code")
  const codeVerifier = form.get("code_verifier")
  const redirectUri = form.get("redirect_uri")

  if (typeof code !== "string" || typeof codeVerifier !== "string") {
    return oauthError("invalid_request", "Chybí code nebo code_verifier")
  }

  const record = await consumeAuthorizationCode(code)
  if (!record || record.client_id !== client.client_id) {
    return oauthError("invalid_grant", "Autorizační kód je neplatný nebo vypršel")
  }

  if (typeof redirectUri !== "string" || redirectUri !== record.redirect_uri) {
    return oauthError("invalid_grant", "redirect_uri neodpovídá autorizačnímu kódu")
  }

  if (!(await verifyPkce(codeVerifier, record.code_challenge, record.code_challenge_method))) {
    return oauthError("invalid_grant", "Ověření PKCE selhalo")
  }

  const resource = form.get("resource")
  if (typeof resource === "string" && resource.replace(/\/$/, "") !== resourceIdentifier()) {
    return oauthError("invalid_target", "Neznámý chráněný zdroj")
  }

  return issueTokens({
    clientId: client.client_id,
    userId: record.user_id,
    scope: record.scope,
  })
}

async function exchangeRefreshToken(client: OAuthClient, form: FormData) {
  const refreshToken = form.get("refresh_token")
  if (typeof refreshToken !== "string") {
    return oauthError("invalid_request", "Chybí refresh_token")
  }

  const record = await findRefreshToken(refreshToken)
  if (!record || record.client_id !== client.client_id) {
    return oauthError("invalid_grant", "Refresh token je neplatný")
  }

  if (record.revoked_at) {
    // Použití už zrotovaného tokenu znamená, že někdo pracuje s ukradenou
    // kopií. Zneplatníme celou rodinu, ať přijde o přístup i on.
    await revokeRefreshTokenFamily(record.family_id)
    return oauthError("invalid_grant", "Refresh token je neplatný")
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    return oauthError("invalid_grant", "Refresh token vypršel")
  }

  await revokeRefreshToken(record.id)

  return issueTokens({
    clientId: client.client_id,
    userId: record.user_id,
    scope: record.scope,
    familyId: record.family_id,
  })
}

async function issueTokens(params: {
  clientId: string
  userId: string
  scope: string
  familyId?: string
}) {
  const [{ token, expiresIn }, refreshToken] = await Promise.all([
    issueAccessToken(params),
    issueRefreshToken(params),
  ])

  return jsonResponse(
    {
      access_token: token,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: params.scope,
    },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  )
}

async function clientAuthenticated(
  client: OAuthClient,
  providedSecret: string | null,
): Promise<boolean> {
  if (!client.client_secret_hash) return true
  if (!providedSecret) return false
  return timingSafeEqual(await sha256Base64Url(providedSecret), client.client_secret_hash)
}

function clientCredentials(
  request: Request,
  form: FormData,
): { clientId: string | null; clientSecret: string | null } {
  const header = request.headers.get("authorization")

  if (header?.toLowerCase().startsWith("basic ")) {
    try {
      const [id, secret] = atob(header.slice(6)).split(":")
      if (id) return { clientId: decodeURIComponent(id), clientSecret: secret ?? null }
    } catch {
      // Nečitelnou Basic hlavičku ignorujeme a zkusíme parametry v těle.
    }
  }

  const clientId = form.get("client_id")
  const clientSecret = form.get("client_secret")

  return {
    clientId: typeof clientId === "string" ? clientId : null,
    clientSecret: typeof clientSecret === "string" ? clientSecret : null,
  }
}

async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData()
  } catch {
    return null
  }
}

export function OPTIONS() {
  return preflightResponse()
}
