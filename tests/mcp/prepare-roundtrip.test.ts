import { beforeEach, describe, expect, it } from "vitest"

import { createFakeDatabase, type FakeDatabase } from "../helpers/fake-supabase"
import { callTool, tokenFor, type ToolEnvelopeResult } from "../helpers/mcp-client"
import { seedCustomer, seedInvoice, seedActivity } from "../helpers/seed"

/**
 * Průchod prepare_* → zapisující nástroj.
 *
 * Modelu říkáme, ať zapisujícímu nástroji předá hodnoty z `execute_arguments`
 * beze změny. Pokud tedy `prepare_*` vrátí něco, co vstupní schéma zapisujícího
 * nástroje nepřijme, uživatel dostane „zápis se nepodařil" a nikdo netuší proč.
 *
 * Přesně to se stalo dvakrát: nejdřív u `notes` na faktuře a pak u nevyplněných
 * polí zákazníka — `prepare_*` posílá `null`, schéma mělo `optional()`, které
 * `null` odmítá. Tyhle testy jedou celý pár tak, jak ho jede model, takže
 * další takovou neshodu chytnou dřív než produkce.
 */

const OWNER = "11111111-1111-4111-8111-111111111111"

let db: FakeDatabase
let token: string

beforeEach(async () => {
  db = createFakeDatabase()
  token = await tokenFor(OWNER)
})

/** Zavolá zapisující nástroj přesně tak, jak to má dělat model. */
function execute(prepared: ToolEnvelopeResult, tool: string, extra: Record<string, unknown> = {}) {
  const args = prepared.data?.execute_arguments as Record<string, unknown>
  return callTool(db, token, tool, {
    ...args,
    confirmation_token: prepared.data?.confirmation_token,
    ...extra,
  })
}

/** Nástroj, který má podle přípravy následovat — bereme ho z odpovědi, ne z hlavy. */
function requiredTool(prepared: ToolEnvelopeResult): string {
  return (prepared.data?.required_action as { tool: string }).tool
}

describe("zákazník", () => {
  it("projde i s nevyplněnými poli, která příprava vrací jako null", async () => {
    const prepared = await callTool(db, token, "prepare_customer", { name: "Jan Novák" })

    expect(prepared.success).toBe(true)
    expect(prepared.data?.execute_arguments).toMatchObject({ email: null, phone: null })

    const created = await execute(prepared, requiredTool(prepared))

    expect(created.success).toBe(true)
    expect(db.customers).toHaveLength(1)
    expect(db.customers[0]).toMatchObject({ name: "Jan Novák", user_id: OWNER })
  })

  it("projde i s vyplněnými poli", async () => {
    const prepared = await callTool(db, token, "prepare_customer", {
      name: "Podnikatel s.r.o.",
      email: "fakturace@podnikatel.test",
      is_business: true,
    })
    const created = await execute(prepared, requiredTool(prepared))

    expect(created.success).toBe(true)
    expect(db.customers[0]).toMatchObject({ is_business: true })
  })

  it("úprava projde stejnou cestou", async () => {
    const customerId = seedCustomer(db, OWNER, { name: "Původní" })
    const prepared = await callTool(db, token, "prepare_customer", {
      customer_id: customerId,
      name: "Přejmenovaný",
    })

    expect(requiredTool(prepared)).toBe("update_customer")
    const updated = await execute(prepared, "update_customer", { customer_id: customerId })

    expect(updated.success).toBe(true)
    expect(db.customers[0].name).toBe("Přejmenovaný")
  })
})

describe("faktura", () => {
  it("projde bez poznámky, kterou příprava vrací jako null", async () => {
    const customerId = seedCustomer(db, OWNER)
    const prepared = await callTool(db, token, "prepare_invoice", {
      customer_id: customerId,
      items: [{ description: "Lavado de ropa", quantity: "1", unit_price: "30" }],
    })

    expect(prepared.data?.execute_arguments).toMatchObject({ notes: null })

    const created = await execute(prepared, requiredTool(prepared))

    expect(created.success).toBe(true)
    expect(db.invoices).toHaveLength(1)
    expect(db.invoice_items).toHaveLength(1)
  })

  it("úprava projde stejnou cestou", async () => {
    const customerId = seedCustomer(db, OWNER)
    const invoiceId = seedInvoice(db, OWNER, customerId)
    const prepared = await callTool(db, token, "prepare_invoice", {
      invoice_id: invoiceId,
      customer_id: customerId,
      items: [{ description: "Limpieza de apartamentos", quantity: "2", unit_price: "50" }],
    })

    const updated = await execute(prepared, requiredTool(prepared), { invoice_id: invoiceId })
    expect(updated.success).toBe(true)
  })
})

describe("operace s fakturou", () => {
  it.each([
    ["mark_paid", "set_invoice_payment"],
    ["unmark_paid", "set_invoice_payment"],
    ["delete", "delete_invoice"],
  ])("akce %s projde přes %s", async (action, tool) => {
    const customerId = seedCustomer(db, OWNER)
    const invoiceId = seedInvoice(db, OWNER, customerId)

    const prepared = await callTool(db, token, "prepare_invoice_action", {
      invoice_id: invoiceId,
      action,
    })

    expect(requiredTool(prepared)).toBe(tool)
    const done = await execute(prepared, tool)
    expect(done.success, JSON.stringify(done.error)).toBe(true)
  })
})

describe("aktivita", () => {
  it("zápis projde i s poznámkou jako null", async () => {
    const customerId = seedCustomer(db, OWNER)
    const prepared = await callTool(db, token, "prepare_activity", {
      customer_id: customerId,
      activity_date: "2026-05-05",
      services: [{ service_type: "cleaning", price: "30" }],
    })

    const created = await execute(prepared, requiredTool(prepared))

    expect(created.success).toBe(true)
    expect(db.activities).toHaveLength(1)
  })

  it("změna stavu projde", async () => {
    const customerId = seedCustomer(db, OWNER)
    const activityId = seedActivity(db, OWNER, customerId)

    const prepared = await callTool(db, token, "prepare_activity_status", {
      activity_id: activityId,
      status: "paid",
    })

    const done = await execute(prepared, requiredTool(prepared))

    expect(done.success).toBe(true)
    expect(db.activities[0].status).toBe("paid")
  })
})
