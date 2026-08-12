import { SignJWT, jwtVerify } from "jose"

import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_REQUEST_TTL_SECONDS,
  issuer,
  resourceIdentifier,
  tokenSecret,
} from "./config"

/**
 * Access tokeny a podepsané autorizační požadavky.
 *
 * Access token je JWT (HS256) — resource server ho ověří bez dotazu do
 * databáze. Cenou je, že odvolání se projeví až po vypršení; proto je
 * životnost krátká (30 minut) a dlouhodobý přístup drží refresh token,
 * který odvolat lze okamžitě.
 */

export interface AccessTokenClaims {
  userId: string
  clientId: string
  scope: string
  tokenId: string
}

/** `aud` odlišuje účel podpisu, aby se jeden token nedal použít místo druhého. */
const AUTHORIZATION_REQUEST_AUDIENCE = "urn:terky:oauth:authorization-request"

export async function issueAccessToken(params: {
  userId: string
  clientId: string
  scope: string
}): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000)

  const token = await new SignJWT({ client_id: params.clientId, scope: params.scope })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setIssuer(issuer())
    .setAudience(resourceIdentifier())
    .setSubject(params.userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(tokenSecret())

  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
}

/** @throws pokud je token neplatný, cizí, vypršelý nebo pro jiný zdroj */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, tokenSecret(), {
    issuer: issuer(),
    audience: resourceIdentifier(),
    algorithms: ["HS256"],
  })

  const clientId = payload.client_id
  const scope = payload.scope

  if (!payload.sub || typeof clientId !== "string" || typeof scope !== "string" || !payload.jti) {
    throw new Error("Access token nemá požadované claimy")
  }

  return { userId: payload.sub, clientId, scope, tokenId: payload.jti }
}

export interface AuthorizationRequest {
  client_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  scope: string
  state: string | null
  resource: string | null
}

/**
 * Ověřený autorizační požadavek se souhlasné obrazovce předává jako podepsaný
 * token. Uživatel (ani model) tak nemůže mezi zobrazením a potvrzením změnit
 * cílovou aplikaci, redirect URI ani rozsah oprávnění.
 */
export async function signAuthorizationRequest(request: AuthorizationRequest): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ ...request })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer())
    .setAudience(AUTHORIZATION_REQUEST_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + AUTHORIZATION_REQUEST_TTL_SECONDS)
    .sign(tokenSecret())
}

export async function verifyAuthorizationRequest(token: string): Promise<AuthorizationRequest> {
  const { payload } = await jwtVerify(token, tokenSecret(), {
    issuer: issuer(),
    audience: AUTHORIZATION_REQUEST_AUDIENCE,
    algorithms: ["HS256"],
  })

  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
  } = payload

  if (
    typeof clientId !== "string" ||
    typeof redirectUri !== "string" ||
    typeof codeChallenge !== "string" ||
    typeof codeChallengeMethod !== "string" ||
    typeof scope !== "string"
  ) {
    throw new Error("Autorizační požadavek nemá požadované claimy")
  }

  return {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
    state: typeof payload.state === "string" ? payload.state : null,
    resource: typeof payload.resource === "string" ? payload.resource : null,
  }
}
