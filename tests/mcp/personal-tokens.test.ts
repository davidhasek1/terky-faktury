import { beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeDatabase, createFakeSupabaseClient, type FakeDatabase } from "../helpers/fake-supabase"
import { seedCustomer, seedInvoice } from "../helpers/seed"

/**
 * Osobní přístupové tokeny — generování na `/connect`, ověření na `/mcp`.
 *
 * Nahrazují se dva klienti: service-role (ověření tokenu) a cookie klient
 * (správa tokenů z UI). Zbytek cesty je skutečný, včetně obalu nástrojů.
 */

const shared = vi.hoisted(() => ({
  db: null as FakeDatabase | null,
  signedInUser: "" as string,
}))

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => createFakeSupabaseClient(shared.db!, "service-role"),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => createFakeSupabaseClient(shared.db!, shared.signedInUser),
}))

import { DELETE as revokeRoute } from "@/app/api/mcp/tokens/[id]/route"
import { GET as listRoute, POST as createRoute } from "@/app/api/mcp/tokens/route"
import { PERSONAL_TOKEN_PREFIX } from "@/lib/mcp/personal-tokens"
import { sha256Base64Url } from "@/lib/oauth/crypto"

import { callTool, rpc } from "../helpers/mcp-client"

const OWNER = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

let db: FakeDatabase

beforeEach(() => {
  db = createFakeDatabase()
  shared.db = db
  shared.signedInUser = OWNER
})

async function createToken(
  body: Record<string, unknown> = { name: "Claude na notebooku", scope: "invoices:read", ttl_days: 90 },
) {
  const response = await createRoute(
    new Request("https://faktury.test/api/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )

  return {
    status: response.status,
    body: (await response.json()) as { token?: { token: string; id: string }; error?: string },
  }
}

describe("generování tokenu", () => {
  it("vrátí token jen jednou a v databázi nechá pouze otisk", async () => {
    const { status, body } = await createToken()

    expect(status).toBe(201)
    const token = body.token!.token
    expect(token.startsWith(PERSONAL_TOKEN_PREFIX)).toBe(true)

    const stored = db.mcp_personal_tokens[0]
    expect(stored.token_hash).toBe(await sha256Base64Url(token))
    expect(JSON.stringify(stored)).not.toContain(token)

    // Seznam vydaných tokenů otevřenou hodnotu ani otisk nevrací.
    const list = (await (await listRoute()).json()) as { tokens: Record<string, unknown>[] }
    expect(list.tokens).toHaveLength(1)
    expect(list.tokens[0]).not.toHaveProperty("token")
    expect(list.tokens[0]).not.toHaveProperty("token_hash")
    expect(list.tokens[0].token_hint).toBe(token.slice(-4))
  })

  it("odmítne prázdný název", async () => {
    const { status } = await createToken({ name: "  ", scope: "invoices:read", ttl_days: 90 })
    expect(status).toBe(400)
  })

  it("odmítne neplatnou platnost", async () => {
    const { status } = await createToken({ name: "Test", scope: "invoices:read", ttl_days: 9999 })
    expect(status).toBe(400)
  })

  it("odmítne vymyšlené oprávnění", async () => {
    const { status } = await createToken({ name: "Test", scope: "admin:all", ttl_days: 90 })
    expect(status).toBe(400)
  })

  it("nepustí přes deset platných tokenů", async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await createToken({ name: `Token ${i}`, scope: "invoices:read", ttl_days: 30 })).status).toBe(201)
    }

    const { status, body } = await createToken({ name: "Jedenáctý", scope: "invoices:read", ttl_days: 30 })
    expect(status).toBe(409)
    expect(body.error).toContain("maximální počet")
  })
})

describe("ověření tokenu na /mcp", () => {
  it("token pro čtení pustí ke čtení", async () => {
    const customerId = seedCustomer(db, OWNER)
    seedInvoice(db, OWNER, customerId)

    const { body } = await createToken()
    const result = await callTool(db, body.token!.token, "list_invoices", {})

    expect(result.success).toBe(true)
    expect(result.data?.count).toBe(1)
  })

  it("token pro čtení nepustí k zápisu", async () => {
    const customerId = seedCustomer(db, OWNER)
    const { body } = await createToken()

    const result = await callTool(db, body.token!.token, "create_invoice", {
      customer_id: customerId,
      items: [{ description: "Úklid", quantity: "1", unit_price: "100" }],
    })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe("FORBIDDEN")
  })

  it("token se zápisem zápis pustí", async () => {
    const customerId = seedCustomer(db, OWNER)
    const { body } = await createToken({
      name: "Skript",
      scope: "invoices:read invoices:write",
      ttl_days: 30,
    })

    const result = await callTool(db, body.token!.token, "create_invoice", {
      customer_id: customerId,
      items: [{ description: "Úklid", quantity: "1", unit_price: "100" }],
    })

    expect(result.success).toBe(true)
    expect(result.data?.confirmation_token).toBeTruthy()
    expect(result.data?.saved).toBe(false)
  })

  it("odmítne neznámý token", async () => {
    const { status } = await rpc(db, `${PERSONAL_TOKEN_PREFIX}naprosto-vymysleny`, "tools/list")
    expect(status).toBe(401)
  })

  it("odmítne odvolaný token", async () => {
    const { body } = await createToken()
    const token = body.token!.token

    const revoked = await revokeRoute(new Request("https://faktury.test", { method: "DELETE" }), {
      params: Promise.resolve({ id: body.token!.id }),
    })
    expect(revoked.status).toBe(200)

    const { status } = await rpc(db, token, "tools/list")
    expect(status).toBe(401)
  })

  it("odmítne vypršelý token", async () => {
    const { body } = await createToken()

    db.mcp_personal_tokens[0].expires_at = new Date(Date.now() - 1000).toISOString()

    const { status } = await rpc(db, body.token!.token, "tools/list")
    expect(status).toBe(401)
  })

  it("zapíše čas posledního použití", async () => {
    const { body } = await createToken()
    expect(db.mcp_personal_tokens[0].last_used_at).toBeNull()

    await callTool(db, body.token!.token, "get_invoice_summary", {})

    expect(db.mcp_personal_tokens[0].last_used_at).toBeTruthy()
  })

  it("nevidí data jiného uživatele", async () => {
    const foreignCustomer = seedCustomer(db, OTHER)
    const foreignInvoice = seedInvoice(db, OTHER, foreignCustomer)

    const { body } = await createToken()
    const result = await callTool(db, body.token!.token, "get_invoice", {
      invoice_id: foreignInvoice,
    })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe("INVOICE_NOT_FOUND")
  })

  it("audit zaznamená, kterým tokenem se volalo", async () => {
    const { body } = await createToken()
    await callTool(db, body.token!.token, "get_invoice_summary", {})

    expect(db.mcp_audit_log[0]).toMatchObject({
      user_id: OWNER,
      client_id: `pat:${body.token!.id}`,
      tool_name: "get_invoice_summary",
      outcome: "success",
    })
  })
})

describe("odvolání tokenu", () => {
  it("nelze odvolat token jiného uživatele", async () => {
    const { body } = await createToken()

    shared.signedInUser = OTHER
    const response = await revokeRoute(new Request("https://faktury.test", { method: "DELETE" }), {
      params: Promise.resolve({ id: body.token!.id }),
    })

    expect(response.status).toBe(409)
    expect(db.mcp_personal_tokens[0].revoked_at).toBeNull()
  })

  it("seznam ukazuje jen vlastní tokeny", async () => {
    await createToken()

    shared.signedInUser = OTHER
    const list = (await (await listRoute()).json()) as { tokens: unknown[] }

    expect(list.tokens).toHaveLength(0)
  })
})
