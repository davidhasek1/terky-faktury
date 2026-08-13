import { describe, expect, it, vi } from "vitest"

import { SignJWT } from "jose"

import { handleMcpRequest } from "@/lib/mcp/handler"
import { MCP_SERVER_NAME } from "@/lib/mcp/server"
import { INVOICE_ITEM_PRESETS } from "@/lib/invoice-items"
import { issuer, resourceIdentifier, tokenSecret } from "@/lib/oauth/config"

import { createFakeDatabase } from "../helpers/fake-supabase"
import { fakeDeps, mcpRequest, rpc, tokenFor, MCP_URL } from "../helpers/mcp-client"

describe("MCP endpoint /mcp", () => {
  it("inicializuje server a ohlásí své jméno", async () => {
    const db = createFakeDatabase()
    const { status, body } = await rpc(db, await tokenFor("user-1"), "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    })

    expect(status).toBe(200)
    expect(body?.result?.serverInfo).toMatchObject({ name: MCP_SERVER_NAME })
  })

  it("vrátí seznam nástrojů se schématy a anotacemi", async () => {
    const db = createFakeDatabase()
    const { body } = await rpc(db, await tokenFor("user-1"), "tools/list")

    const tools = body?.result?.tools as
      | { name: string; description?: string; inputSchema: unknown; annotations?: Record<string, boolean> }[]
      | undefined

    expect(tools).toBeDefined()
    const names = tools!.map((tool) => tool.name)

    expect(names.sort()).toEqual(
      [
        "search_customers",
        "get_customer",
        "create_customer",
        "update_customer",
        "list_invoices",
        "get_invoice",
        "get_invoice_summary",
        "get_invoice_download_link",
        "create_invoice",
        "update_invoice",
        "set_invoice_payment",
        "send_invoice_email",
        "delete_invoice",
        "list_activities",
        "get_activity",
        "create_activity",
        "update_activity",
        "set_activity_status",
        "get_company_profile",
      ].sort(),
    )

    for (const tool of tools!) {
      expect(tool.description, `${tool.name} musí mít popis`).toBeTruthy()
      expect(tool.inputSchema, `${tool.name} musí mít vstupní schéma`).toBeTruthy()
      expect(tool.annotations, `${tool.name} musí mít anotace`).toBeDefined()
    }
  })

  it("označí čtecí nástroje jako readOnly a nevratné jako destruktivní", async () => {
    const db = createFakeDatabase()
    const { body } = await rpc(db, await tokenFor("user-1"), "tools/list")
    const tools = body!.result!.tools as { name: string; annotations: Record<string, boolean> }[]
    const byName = new Map(tools.map((tool) => [tool.name, tool.annotations]))

    expect(byName.get("list_invoices")?.readOnlyHint).toBe(true)
    expect(byName.get("get_invoice")?.readOnlyHint).toBe(true)

    expect(byName.get("create_invoice")?.readOnlyHint).toBe(false)
    expect(byName.get("delete_invoice")?.destructiveHint).toBe(true)
    expect(byName.get("send_invoice_email")?.destructiveHint).toBe(true)
    expect(byName.get("send_invoice_email")?.openWorldHint).toBe(true)
  })

  it("zapisující nástroje mají přirozené povinné argumenty", async () => {
    // Dřív se do schématu prosákl tvar otisku potvrzení: mazání faktury
    // vyžadovalo `action` a `paid_date: null`. Model takové volání nesestavil
    // a klient ho zahodil dřív, než dorazilo na server.
    const db = createFakeDatabase()
    const { body } = await rpc(db, await tokenFor("user-1"), "tools/list")
    const tools = body!.result!.tools as {
      name: string
      inputSchema: { required?: string[]; properties?: Record<string, unknown> }
    }[]
    const required = (name: string) =>
      tools.find((tool) => tool.name === name)!.inputSchema.required ?? []

    expect(required("delete_invoice")).toEqual(["invoice_id"])
    expect(required("send_invoice_email")).toEqual(["invoice_id"])
    expect(required("set_invoice_payment")).toEqual(["invoice_id"])
    expect(required("create_invoice")).toEqual(["customer_id", "items"])
    expect(required("create_customer")).toEqual(["name"])

    // confirmation_token je vždy volitelný — první fáze ho nemá čím vyplnit.
    for (const name of ["create_invoice", "create_customer", "delete_invoice"]) {
      expect(required(name), name).not.toContain("confirmation_token")
      expect(
        tools.find((tool) => tool.name === name)!.inputSchema.properties,
        name,
      ).toHaveProperty("confirmation_token")
    }
  })

  it("řekne modelu, že popisy položek patří na fakturu španělsky", async () => {
    const db = createFakeDatabase()
    const { body } = await rpc(db, await tokenFor("user-1"), "tools/list")
    const tools = body!.result!.tools as { name: string; inputSchema: Record<string, unknown> }[]

    for (const name of ["create_invoice", "update_invoice"]) {
      const schema = JSON.stringify(tools.find((tool) => tool.name === name)!.inputSchema)

      for (const preset of INVOICE_ITEM_PRESETS) {
        expect(schema, `${name} musí nabízet popis „${preset.description}"`).toContain(
          preset.description,
        )
      }
      expect(schema).toContain("španělsky")
    }
  })

  it("bez tokenu odpoví 401 a odkáže na metadata zdroje", async () => {
    const response = await handleMcpRequest(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      fakeDeps(createFakeDatabase()),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain(
      "resource_metadata=\"https://faktury.test/.well-known/oauth-protected-resource\"",
    )
  })

  it("odmítne poškozený token", async () => {
    const db = createFakeDatabase()
    const { status } = await rpc(db, "rozhodne.neplatny.token", "tools/list")
    expect(status).toBe(401)
  })

  it("odmítne vypršelý token", async () => {
    const db = createFakeDatabase()
    const issuedAt = Math.floor(Date.now() / 1000) - 3600

    const expiredToken = await new SignJWT({ client_id: "test-client", scope: "invoices:read" })
      .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
      .setIssuer(issuer())
      .setAudience(resourceIdentifier())
      .setSubject("user-1")
      .setJti(crypto.randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 60)
      .sign(tokenSecret())

    const { status } = await rpc(db, expiredToken, "tools/list")
    expect(status).toBe(401)
  })

  it("odmítne token vydaný pro jiný zdroj", async () => {
    const db = createFakeDatabase()
    const originalSite = process.env.NEXT_PUBLIC_SITE_URL

    process.env.NEXT_PUBLIC_SITE_URL = "https://jina-aplikace.test"
    const foreignToken = await tokenFor("user-1")
    process.env.NEXT_PUBLIC_SITE_URL = originalSite

    const { status } = await rpc(db, foreignToken, "tools/list")
    expect(status).toBe(401)
  })

  it("selhání Supabase session vrátí JSON-RPC chybu, ne holou 500", async () => {
    // Regrese: vydání session sahá po síti a bylo mimo try/catch, takže
    // z výpadku byla neošetřená 500 — klient hlásil nedostupný konektor
    // a do auditu se nezapsalo nic.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const response = await handleMcpRequest(
      mcpRequest({ jsonrpc: "2.0", id: 7, method: "tools/list" }, await tokenFor("user-1")),
      {
        createClient: async () => {
          throw new Error("supabase auth nedostupné")
        },
        resolveEmail: async () => null,
      },
    )
    const body = (await response.json()) as { id: number; error?: { message: string } }
    spy.mockRestore()

    expect(response.status).toBe(200)
    expect(body.id).toBe(7)
    expect(body.error?.message).toContain("ověřit identitu")
    expect(JSON.stringify(body)).not.toContain("supabase auth nedostupné")
  })

  it("odmítne tělo, které není platný JSON", async () => {
    const response = await handleMcpRequest(
      new Request(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${await tokenFor("user-1")}`,
        },
        body: "{tohle není json",
      }),
      fakeDeps(createFakeDatabase()),
    )

    expect(response.status).toBe(400)
  })

  it("odmítne příliš velké tělo", async () => {
    const huge = { jsonrpc: "2.0", id: 1, method: "tools/list", padding: "x".repeat(300_000) }
    const response = await handleMcpRequest(
      mcpRequest(huge, await tokenFor("user-1")),
      fakeDeps(createFakeDatabase()),
    )

    expect(response.status).toBe(413)
  })
})
