import { beforeEach, describe, expect, it } from "vitest"

import { createFakeDatabase, type FakeDatabase } from "../helpers/fake-supabase"
import { callTool, tokenFor, type ToolEnvelopeResult } from "../helpers/mcp-client"
import { seedActivity, seedCustomer, seedInvoice } from "../helpers/seed"

/**
 * Dvoufázový zápis: tentýž nástroj, tytéž argumenty, podruhé navíc token.
 *
 * Tenhle tvar nahradil dvojici prepare_* + zapisující nástroj, na které to
 * opakovaně padalo — model buď druhý nástroj vůbec nezavolal, nebo sestavil
 * volání, které neprošlo schématem. Testy tady jedou obě fáze přesně tak,
 * jak je jede model: druhé volání je kopie prvního plus confirmation_token.
 */

const OWNER = "11111111-1111-4111-8111-111111111111"

let db: FakeDatabase
let token: string

beforeEach(async () => {
  db = createFakeDatabase()
  token = await tokenFor(OWNER)
})

/** Návrh (první fáze) — bez tokenu. */
function draft(tool: string, args: Record<string, unknown>) {
  return callTool(db, token, tool, args)
}

/** Potvrzení (druhá fáze) — stejné argumenty plus token z návrhu. */
function confirm(tool: string, args: Record<string, unknown>, prepared: ToolEnvelopeResult) {
  return callTool(db, token, tool, {
    ...args,
    confirmation_token: prepared.data?.confirmation_token,
  })
}

describe("první fáze nic neuloží", () => {
  it.each([
    ["create_customer", { name: "Jan Novák" }],
    ["create_activity", { customer_id: "", activity_date: "2026-05-05", services: [{ service_type: "cleaning", price: "30" }] }],
  ])("%s vrátí návrh a nezapíše", async (tool, rawArgs) => {
    const customerId = seedCustomer(db, OWNER)
    const args = "customer_id" in rawArgs ? { ...rawArgs, customer_id: customerId } : rawArgs

    const prepared = await draft(tool, args)

    expect(prepared.success).toBe(true)
    expect(prepared.data?.saved).toBe(false)
    expect(String(prepared.data?.status)).toContain("NEB")
    expect(prepared.data?.required_action).toMatchObject({ tool })
    expect(prepared.data?.confirmation_token).toBeTruthy()
    expect(db.customers.filter((c) => c.name === "Jan Novák")).toHaveLength(0)
    expect(db.activities).toHaveLength(0)
  })
})

describe("zákazník", () => {
  it("stejné argumenty plus token ho vytvoří", async () => {
    const args = { name: "Jan Novák" }
    const prepared = await draft("create_customer", args)
    const created = await confirm("create_customer", args, prepared)

    expect(created.success).toBe(true)
    expect(created.data?.saved).toBe(true)
    expect(db.customers).toHaveLength(1)
    expect(db.customers[0]).toMatchObject({ name: "Jan Novák", user_id: OWNER })
  })

  it("projde i s vyplněnými poli", async () => {
    const args = {
      name: "Podnikatel s.r.o.",
      email: "fakturace@podnikatel.test",
      is_business: true,
    }
    const created = await confirm("create_customer", args, await draft("create_customer", args))

    expect(created.success).toBe(true)
    expect(db.customers[0]).toMatchObject({ is_business: true })
  })

  it("úprava projde stejnou cestou", async () => {
    const customerId = seedCustomer(db, OWNER, { name: "Původní" })
    const args = { customer_id: customerId, name: "Přejmenovaný" }
    const updated = await confirm("update_customer", args, await draft("update_customer", args))

    expect(updated.success).toBe(true)
    expect(db.customers[0].name).toBe("Přejmenovaný")
  })
})

describe("faktura", () => {
  const items = [{ description: "Lavado de ropa", quantity: "1", unit_price: "30" }]

  it("vystaví se s dopočítanými výchozími hodnotami", async () => {
    const customerId = seedCustomer(db, OWNER, { is_business: true })
    const args = { customer_id: customerId, items }

    const prepared = await draft("create_invoice", args)
    const summary = prepared.data?.summary as Record<string, unknown>

    // 30 € + 21 % DPH − 15 % retención
    expect(summary.total).toMatchObject({ amount: "31.80" })

    const created = await confirm("create_invoice", args, prepared)

    expect(created.success).toBe(true)
    expect(db.invoices).toHaveLength(1)
    expect(db.invoices[0].total).toBe(31.8)
  })

  it("úprava projde stejnou cestou", async () => {
    const customerId = seedCustomer(db, OWNER)
    const invoiceId = seedInvoice(db, OWNER, customerId)
    const args = {
      invoice_id: invoiceId,
      customer_id: customerId,
      items: [{ description: "Limpieza de apartamentos", quantity: "2", unit_price: "50" }],
    }

    const updated = await confirm("update_invoice", args, await draft("update_invoice", args))
    expect(updated.success).toBe(true)
  })

  it("úprava jednoho pole nechá zbytek faktury být", async () => {
    // „Posuň splatnost o týden" nesmí znamenat, že model musí znovu poslat
    // zákazníka i všechny položky — a riskovat, že je zrekonstruuje špatně.
    const customerId = seedCustomer(db, OWNER)
    const invoiceId = seedInvoice(db, OWNER, customerId)
    const args = { invoice_id: invoiceId, due_date: "2026-09-30" }

    const prepared = await draft("update_invoice", args)
    const summary = prepared.data?.summary as Record<string, unknown>
    expect(summary.due_date).toBe("2026-09-30")
    expect(summary.total).toMatchObject({ amount: "121.00" })

    const updated = await confirm("update_invoice", args, prepared)

    expect(updated.success).toBe(true)
    expect(db.invoices[0].due_date).toBe("2026-09-30")
    expect(db.invoices[0].total).toBe(121)
    expect(db.invoice_items).toHaveLength(1)
    expect(db.invoice_items[0].description).toBe("Úklid apartmánu")
  })
})

describe("operace nad fakturou mají přirozené argumenty", () => {
  it("smazání chce jen invoice_id", async () => {
    const customerId = seedCustomer(db, OWNER)
    const args = { invoice_id: seedInvoice(db, OWNER, customerId) }

    const prepared = await draft("delete_invoice", args)
    expect(prepared.data?.warnings).toContain(
      "Smazání je nevratné. Aplikace nemá archivaci ani koš.",
    )
    expect(db.invoices).toHaveLength(1)

    const deleted = await confirm("delete_invoice", args, prepared)

    expect(deleted.success).toBe(true)
    expect(db.invoices).toHaveLength(0)
    expect(db.invoice_items).toHaveLength(0)
  })

  it("označení jako zaplacené chce jen id a datum", async () => {
    const customerId = seedCustomer(db, OWNER)
    const args = { invoice_id: seedInvoice(db, OWNER, customerId), paid_date: "2026-04-01" }

    const done = await confirm("set_invoice_payment", args, await draft("set_invoice_payment", args))

    expect(done.success).toBe(true)
    expect(db.invoices[0].paid_date).toBe("2026-04-01")
  })

  it("zrušení platby projde bez paid_date", async () => {
    const customerId = seedCustomer(db, OWNER)
    const args = { invoice_id: seedInvoice(db, OWNER, customerId, { paid_date: "2026-04-01" }) }

    const done = await confirm("set_invoice_payment", args, await draft("set_invoice_payment", args))

    expect(done.success).toBe(true)
    expect(db.invoices[0].paid_date).toBeNull()
  })
})

describe("aktivita", () => {
  it("zápis projde", async () => {
    const customerId = seedCustomer(db, OWNER)
    const args = {
      customer_id: customerId,
      activity_date: "2026-05-05",
      services: [{ service_type: "cleaning", price: "30" }],
    }

    const created = await confirm("create_activity", args, await draft("create_activity", args))

    expect(created.success).toBe(true)
    expect(db.activities).toHaveLength(1)
  })

  it("změna stavu projde", async () => {
    const customerId = seedCustomer(db, OWNER)
    const args = { activity_id: seedActivity(db, OWNER, customerId), status: "paid" }

    const done = await confirm("set_activity_status", args, await draft("set_activity_status", args))

    expect(done.success).toBe(true)
    expect(db.activities[0].status).toBe("paid")
  })
})
