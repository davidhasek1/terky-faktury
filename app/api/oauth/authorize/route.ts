import { NextResponse } from "next/server"

import { baseUrl, normalizeScope, resourceIdentifier } from "@/lib/oauth/config"
import { oauthError, withOAuthErrors } from "@/lib/oauth/http"
import { getClient, storeAuthorizationCode } from "@/lib/oauth/store"
import { signAuthorizationRequest, verifyAuthorizationRequest } from "@/lib/oauth/tokens"
import { createClient } from "@/lib/supabase/server"

/**
 * Autorizační endpoint (Authorization Code Flow + PKCE).
 *
 * GET  — ověří parametry a klienta, a přesměruje na souhlasnou obrazovku
 *        `/oauth/authorize` s podepsaným popisem požadavku.
 * POST — přijme rozhodnutí uživatele ze souhlasné obrazovky a vydá kód.
 *
 * Chyby, které nastanou dřív než ověříme `redirect_uri`, se NIKDY neposílají
 * přesměrováním — jinak by šel endpoint zneužít jako otevřený redirector.
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return withOAuthErrors("authorize", () => startAuthorization(request))
}

async function startAuthorization(request: Request) {
  const params = new URL(request.url).searchParams

  const clientId = params.get("client_id")
  const redirectUri = params.get("redirect_uri")

  if (!clientId || !redirectUri) {
    return oauthError("invalid_request", "Chybí client_id nebo redirect_uri")
  }

  const client = await getClient(clientId)
  if (!client) {
    return oauthError("invalid_client", "Neznámý klient")
  }

  if (!client.redirect_uris.includes(redirectUri)) {
    return oauthError("invalid_request", "redirect_uri neodpovídá registraci klienta")
  }

  // Od této chvíle je redirect_uri ověřená, takže chyby smíme vracet přes ni.
  const state = params.get("state")
  const fail = (error: string, description: string) =>
    NextResponse.redirect(errorRedirect(redirectUri, error, description, state), 303)

  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "Podporován je pouze response_type=code")
  }

  const codeChallenge = params.get("code_challenge")
  const codeChallengeMethod = params.get("code_challenge_method")

  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return fail("invalid_request", "Vyžadováno PKCE s code_challenge_method=S256")
  }

  const resource = params.get("resource")
  if (resource && resource.replace(/\/$/, "") !== resourceIdentifier()) {
    return fail("invalid_target", "Neznámý chráněný zdroj")
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Middleware sem uživatele bez session nepustí, tohle je pojistka.
    const returnTo = `/api/oauth/authorize?${params.toString()}`
    return NextResponse.redirect(
      `${baseUrl()}/auth/login?redirect_to=${encodeURIComponent(returnTo)}`,
      303,
    )
  }

  const requestToken = await signAuthorizationRequest({
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope: normalizeScope(params.get("scope")),
    state,
    resource,
  })

  return NextResponse.redirect(
    `${baseUrl()}/oauth/authorize?request=${encodeURIComponent(requestToken)}`,
    303,
  )
}

export async function POST(request: Request) {
  return withOAuthErrors("authorize", () => completeAuthorization(request))
}

async function completeAuthorization(request: Request) {
  const form = await request.formData()
  const requestToken = form.get("request")
  const decision = form.get("decision")

  if (typeof requestToken !== "string") {
    return oauthError("invalid_request", "Chybí popis autorizačního požadavku")
  }

  let authorizationRequest
  try {
    authorizationRequest = await verifyAuthorizationRequest(requestToken)
  } catch {
    return oauthError("invalid_request", "Autorizační požadavek vypršel nebo byl pozměněn")
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return oauthError("access_denied", "Přihlášení vypršelo, zkuste to znovu", 401)
  }

  if (decision !== "allow") {
    return NextResponse.redirect(
      errorRedirect(
        authorizationRequest.redirect_uri,
        "access_denied",
        "Uživatel přístup odmítl",
        authorizationRequest.state,
      ),
      303,
    )
  }

  const code = await storeAuthorizationCode({
    client_id: authorizationRequest.client_id,
    user_id: user.id,
    redirect_uri: authorizationRequest.redirect_uri,
    code_challenge: authorizationRequest.code_challenge,
    code_challenge_method: authorizationRequest.code_challenge_method,
    scope: authorizationRequest.scope,
    resource: authorizationRequest.resource,
  })

  const target = new URL(authorizationRequest.redirect_uri)
  target.searchParams.set("code", code)
  if (authorizationRequest.state) target.searchParams.set("state", authorizationRequest.state)

  return NextResponse.redirect(target.toString(), 303)
}

function errorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state: string | null,
): string {
  const target = new URL(redirectUri)
  target.searchParams.set("error", error)
  target.searchParams.set("error_description", description)
  if (state) target.searchParams.set("state", state)
  return target.toString()
}
