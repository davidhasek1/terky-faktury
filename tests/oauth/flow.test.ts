import { beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeDatabase, createFakeSupabaseClient, type FakeDatabase } from "../helpers/fake-supabase"

/**
 * OAuth 2.1 tok, na kterém stojí připojení ChatGPT.
 *
 * Testuje se přes skutečné route handlery; nahrazuje se jen service-role
 * klient, aby testy nepotřebovaly databázi.
 */

// vi.mock se hoistuje nad importy, takže sdílený stav musí vzniknout taky nahoře.
const shared = vi.hoisted(() => ({ db: null as FakeDatabase | null }))

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => createFakeSupabaseClient(shared.db!, "service-role"),
}))

import { POST as registerRoute } from "@/app/api/oauth/register/route"
import { POST as tokenRoute } from "@/app/api/oauth/token/route"
import { POST as revokeRoute } from "@/app/api/oauth/revoke/route"
import { GET as asMetadata } from "@/app/api/well-known/oauth-authorization-server/route"
import { GET as resourceMetadata } from "@/app/api/well-known/oauth-protected-resource/route"
import { sha256Base64Url, verifyPkce } from "@/lib/oauth/crypto"
import { storeAuthorizationCode } from "@/lib/oauth/store"
import { verifyAccessToken } from "@/lib/oauth/tokens"

const USER = "11111111-1111-4111-8111-111111111111"
const VERIFIER = "verifier-".padEnd(64, "abcdefghijklmnopqrstuvwxyz0123456789")

let db: FakeDatabase

beforeEach(() => {
  db = createFakeDatabase()
  shared.db = db
})

async function registerClient(overrides: Record<string, unknown> = {}) {
  const response = await registerRoute(
    new Request("https://faktury.test/api/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "ChatGPT",
        redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
        ...overrides,
      }),
    }),
  )

  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function issueCode(clientId: string, challenge: string) {
  return storeAuthorizationCode({
    client_id: clientId,
    user_id: USER,
    redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "invoices:read invoices:write",
    resource: "https://faktury.test/mcp",
  })
}

function tokenRequest(params: Record<string, string>) {
  return tokenRoute(
    new Request("https://faktury.test/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    }),
  )
}

describe("metadata", () => {
  it("ohlásí autorizační server s PKCE S256", async () => {
    const body = (await asMetadata().json()) as Record<string, unknown>

    expect(body.issuer).toBe("https://faktury.test")
    expect(body.authorization_endpoint).toBe("https://faktury.test/api/oauth/authorize")
    expect(body.token_endpoint).toBe("https://faktury.test/api/oauth/token")
    expect(body.registration_endpoint).toBe("https://faktury.test/api/oauth/register")
    expect(body.code_challenge_methods_supported).toEqual(["S256"])
    expect(body.grant_types_supported).toEqual(["authorization_code", "refresh_token"])
  })

  it("ohlásí chráněný zdroj /mcp", async () => {
    const body = (await resourceMetadata().json()) as Record<string, unknown>

    expect(body.resource).toBe("https://faktury.test/mcp")
    expect(body.authorization_servers).toEqual(["https://faktury.test"])
  })
})

describe("dynamická registrace klienta", () => {
  it("zaregistruje veřejného klienta bez tajemství", async () => {
    const { status, body } = await registerClient()

    expect(status).toBe(201)
    expect(body.client_id).toBeTruthy()
    expect(body).not.toHaveProperty("client_secret")
    expect(db.oauth_clients).toHaveLength(1)
  })

  it("odmítne redirect URI bez HTTPS", async () => {
    const { status } = await registerClient({ redirect_uris: ["http://zlo.example/callback"] })
    expect(status).toBe(400)
  })

  it("odmítne redirect URI s fragmentem", async () => {
    const { status } = await registerClient({ redirect_uris: ["https://ok.example/cb#kotva"] })
    expect(status).toBe(400)
  })
})

describe("výměna autorizačního kódu", () => {
  it("vydá access i refresh token při správném PKCE", async () => {
    const { body: client } = await registerClient()
    const code = await issueCode(String(client.client_id), await sha256Base64Url(VERIFIER))

    const response = await tokenRequest({
      grant_type: "authorization_code",
      client_id: String(client.client_id),
      code,
      code_verifier: VERIFIER,
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    })

    expect(response.status).toBe(200)
    const tokens = (await response.json()) as Record<string, string>

    expect(tokens.token_type).toBe("Bearer")
    expect(tokens.refresh_token).toBeTruthy()

    const claims = await verifyAccessToken(tokens.access_token)
    expect(claims.userId).toBe(USER)
    expect(claims.clientId).toBe(client.client_id)
    expect(claims.scope).toContain("invoices:write")
  })

  it("odmítne špatný code_verifier", async () => {
    const { body: client } = await registerClient()
    const code = await issueCode(String(client.client_id), await sha256Base64Url(VERIFIER))

    const response = await tokenRequest({
      grant_type: "authorization_code",
      client_id: String(client.client_id),
      code,
      code_verifier: VERIFIER.replace("verifier", "podvrzen"),
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("invalid_grant")
  })

  it("kód lze vyměnit jen jednou", async () => {
    const { body: client } = await registerClient()
    const code = await issueCode(String(client.client_id), await sha256Base64Url(VERIFIER))

    const params = {
      grant_type: "authorization_code",
      client_id: String(client.client_id),
      code,
      code_verifier: VERIFIER,
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    }

    expect((await tokenRequest(params)).status).toBe(200)
    expect((await tokenRequest(params)).status).toBe(400)
  })

  it("odmítne kód vydaný jinému klientovi", async () => {
    const { body: first } = await registerClient()
    const { body: second } = await registerClient({ client_name: "Cizí aplikace" })
    const code = await issueCode(String(first.client_id), await sha256Base64Url(VERIFIER))

    const response = await tokenRequest({
      grant_type: "authorization_code",
      client_id: String(second.client_id),
      code,
      code_verifier: VERIFIER,
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    })

    expect(response.status).toBe(400)
  })

  it("odmítne nesouhlasící redirect_uri", async () => {
    const { body: client } = await registerClient()
    const code = await issueCode(String(client.client_id), await sha256Base64Url(VERIFIER))

    const response = await tokenRequest({
      grant_type: "authorization_code",
      client_id: String(client.client_id),
      code,
      code_verifier: VERIFIER,
      redirect_uri: "https://chatgpt.com/jina-adresa",
    })

    expect(response.status).toBe(400)
  })

  it("odmítne neznámého klienta", async () => {
    const response = await tokenRequest({
      grant_type: "authorization_code",
      client_id: "neexistuje",
      code: "cokoli",
      code_verifier: VERIFIER,
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    })

    expect(response.status).toBe(401)
  })
})

describe("refresh token", () => {
  async function firstTokens() {
    const { body: client } = await registerClient()
    const code = await issueCode(String(client.client_id), await sha256Base64Url(VERIFIER))

    const response = await tokenRequest({
      grant_type: "authorization_code",
      client_id: String(client.client_id),
      code,
      code_verifier: VERIFIER,
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    })

    return {
      clientId: String(client.client_id),
      tokens: (await response.json()) as Record<string, string>,
    }
  }

  it("rotuje se při každém použití", async () => {
    const { clientId, tokens } = await firstTokens()

    const response = await tokenRequest({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: tokens.refresh_token,
    })

    expect(response.status).toBe(200)
    const refreshed = (await response.json()) as Record<string, string>
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token)
  })

  it("opakované použití starého tokenu zneplatní celou rodinu", async () => {
    const { clientId, tokens } = await firstTokens()

    const rotated = (await (
      await tokenRequest({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: tokens.refresh_token,
      })
    ).json()) as Record<string, string>

    // Útočník zkusí starý token…
    const replay = await tokenRequest({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: tokens.refresh_token,
    })
    expect(replay.status).toBe(400)

    // …čímž přijde o přístup i legitimní klient s čerstvým tokenem.
    const afterBreach = await tokenRequest({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: rotated.refresh_token,
    })
    expect(afterBreach.status).toBe(400)
  })

  it("odvolání zneplatní refresh token", async () => {
    const { clientId, tokens } = await firstTokens()

    const revoked = await revokeRoute(
      new Request("https://faktury.test/api/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokens.refresh_token }),
      }),
    )
    expect(revoked.status).toBe(200)

    const response = await tokenRequest({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: tokens.refresh_token,
    })
    expect(response.status).toBe(400)
  })
})

describe("PKCE", () => {
  it("přijme jen metodu S256", async () => {
    const challenge = await sha256Base64Url(VERIFIER)

    expect(await verifyPkce(VERIFIER, challenge, "S256")).toBe(true)
    expect(await verifyPkce(VERIFIER, VERIFIER, "plain")).toBe(false)
  })

  it("odmítne příliš krátký verifier", async () => {
    expect(await verifyPkce("kratky", await sha256Base64Url("kratky"), "S256")).toBe(false)
  })
})
