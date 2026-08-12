import { beforeEach, describe, expect, it } from "vitest"

import type { ServiceContext } from "@/lib/services/context"
import {
  buildInvoiceDraft,
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  updateInvoice,
} from "@/lib/services/invoices"
import { invoiceInputSchema } from "@/lib/validation/invoices"

import {
  createFakeDatabase,
  createFakeSupabaseClient,
  type FakeDatabase,
} from "../helpers/fake-supabase"
import { seedCustomer, seedInvoice } from "../helpers/seed"

const OWNER = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

let db: FakeDatabase
let owner: ServiceContext
let other: ServiceContext

beforeEach(() => {
  db = createFakeDatabase()
  owner = { supabase: createFakeSupabaseClient(db, OWNER), userId: OWNER }
  other = { supabase: createFakeSupabaseClient(db, OTHER), userId: OTHER }
})

function input(customerId: string, overrides: Record<string, unknown> = {}) {
  return invoiceInputSchema.parse({
    customer_id: customerId,
    issue_date: "2026-03-01",
    due_date: "2026-03-15",
    tax_rate: "21",
    currency: "EUR",
    items: [{ description: "Úklid", quantity: "2", unit_price: "50" }],
    ...overrides,
  })
}

describe("createInvoice", () => {
  it("uloží fakturu i položky a spočítá součty", async () => {
    const customerId = seedCustomer(db, OWNER)
    const invoice = await createInvoice(owner, input(customerId))

    expect(invoice.subtotal).toBe(100)
    expect(invoice.tax_amount).toBe(21)
    expect(invoice.total).toBe(121)
    expect(invoice.items).toHaveLength(1)
    expect(db.invoices).toHaveLength(1)
  })

  it("číslo faktury nechává na databázi", async () => {
    const customerId = seedCustomer(db, OWNER)
    const first = await createInvoice(owner, input(customerId))
    const second = await createInvoice(owner, input(customerId))

    expect(first.invoice_number).not.toBe(second.invoice_number)
    expect(first.invoice_number).toMatch(/^\d{4}-\d{3,}$/)
  })

  it("odmítne fakturu na cizího zákazníka", async () => {
    const foreignCustomer = seedCustomer(db, OTHER)

    await expect(createInvoice(owner, input(foreignCustomer))).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    })
    expect(db.invoices).toHaveLength(0)
  })
})

describe("buildInvoiceDraft", () => {
  it("doplní retención podle typu zákazníka", async () => {
    const business = seedCustomer(db, OWNER, { is_business: true })
    const draft = await buildInvoiceDraft(
      owner,
      input(business, { retention_rate: undefined }),
    )

    expect(draft.retention_rate).toBe(1_500)
    expect(draft.retention_amount).toBe(1_500)
    expect(draft.total).toBe(10_600)
  })

  it("výslovně zadanou sazbu nepřepisuje", async () => {
    const business = seedCustomer(db, OWNER, { is_business: true })
    const draft = await buildInvoiceDraft(owner, input(business, { retention_rate: "0" }))

    expect(draft.retention_rate).toBe(0)
  })
})

describe("updateInvoice", () => {
  it("nahradí položky a přepočítá součty", async () => {
    const customerId = seedCustomer(db, OWNER)
    const created = await createInvoice(owner, input(customerId))

    const updated = await updateInvoice(
      owner,
      created.id,
      input(customerId, {
        items: [
          { description: "Praní", quantity: "1", unit_price: "40" },
          { description: "Úklid", quantity: "1", unit_price: "60" },
        ],
      }),
    )

    expect(updated.items).toHaveLength(2)
    expect(updated.total).toBe(121)
    expect(db.invoice_items.filter((item) => item.invoice_id === created.id)).toHaveLength(2)
  })

  it("neupraví fakturu jiného uživatele", async () => {
    const foreignCustomer = seedCustomer(db, OTHER)
    const foreignInvoice = seedInvoice(db, OTHER, foreignCustomer)
    const ownCustomer = seedCustomer(db, OWNER)

    await expect(
      updateInvoice(owner, foreignInvoice, input(ownCustomer)),
    ).rejects.toMatchObject({ code: "INVOICE_NOT_FOUND" })
  })
})

describe("deleteInvoice", () => {
  it("smaže fakturu i její položky", async () => {
    const customerId = seedCustomer(db, OWNER)
    const created = await createInvoice(owner, input(customerId))

    await deleteInvoice(owner, created.id)

    expect(db.invoices).toHaveLength(0)
    expect(db.invoice_items).toHaveLength(0)
  })

  it("nesmaže fakturu jiného uživatele", async () => {
    const foreignCustomer = seedCustomer(db, OTHER)
    const foreignInvoice = seedInvoice(db, OTHER, foreignCustomer)

    await deleteInvoice(owner, foreignInvoice)

    expect(db.invoices).toHaveLength(1)
    await expect(getInvoice(other, foreignInvoice)).resolves.toMatchObject({ id: foreignInvoice })
  })
})

describe("listInvoices", () => {
  it("respektuje stránkování", async () => {
    const customerId = seedCustomer(db, OWNER)
    seedInvoice(db, OWNER, customerId)
    seedInvoice(db, OWNER, customerId)
    seedInvoice(db, OWNER, customerId)

    const page = await listInvoices(owner, {
      status: "all",
      limit: 2,
      offset: 0,
    })

    expect(page).toHaveLength(2)
  })
})
