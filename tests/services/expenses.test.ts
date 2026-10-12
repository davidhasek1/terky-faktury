import { beforeEach, describe, expect, it } from "vitest"

import type { ServiceContext } from "@/lib/services/context"
import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  updateExpense,
} from "@/lib/services/expenses"
import { expenseInputSchema } from "@/lib/validation/expenses"

import {
  createFakeDatabase,
  createFakeSupabaseClient,
  type FakeDatabase,
} from "../helpers/fake-supabase"
import { seedExpense } from "../helpers/seed"

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

function input(overrides: Record<string, unknown> = {}) {
  return expenseInputSchema.parse({
    expense_date: "2026-03-05",
    description: "Benzín",
    supplier: "Repsol",
    category: "transport",
    subtotal: "50",
    tax_rate: "21",
    ...overrides,
  })
}

describe("validace vstupu", () => {
  it("odmítne prázdný popis a zápornou částku", () => {
    expect(expenseInputSchema.safeParse({ ...input(), description: "  " }).success).toBe(false)
    expect(
      expenseInputSchema.safeParse({ expense_date: "2026-03-05", description: "x", subtotal: "-1", tax_rate: "21" })
        .success,
    ).toBe(false)
  })

  it("prázdné volitelné texty uloží jako null a kategorii doplní", () => {
    const parsed = expenseInputSchema.parse({
      expense_date: "2026-03-05",
      description: "Káva pro klienta",
      supplier: "",
      subtotal: "3,50",
      tax_rate: "10",
    })
    expect(parsed).toMatchObject({ supplier: null, note: null, category: "other", subtotal: 350 })
  })
})

describe("createExpense", () => {
  it("uloží náklad s dopočítanou IVA", async () => {
    const expense = await createExpense(owner, input())

    expect(expense).toMatchObject({
      user_id: OWNER,
      description: "Benzín",
      subtotal: 50,
      tax_rate: 21,
      tax_amount: 10.5,
      total: 60.5,
    })
    expect(db.expenses).toHaveLength(1)
  })
})

describe("updateExpense", () => {
  it("přepíše náklad a znovu dopočte IVA", async () => {
    const id = seedExpense(db, OWNER)
    const updated = await updateExpense(owner, id, input({ subtotal: "100", tax_rate: "4" }))

    expect(updated).toMatchObject({ subtotal: 100, tax_amount: 4, total: 104 })
  })

  it("cizí náklad neupraví", async () => {
    const id = seedExpense(db, OTHER)
    await expect(updateExpense(owner, id, input())).rejects.toMatchObject({
      code: "EXPENSE_NOT_FOUND",
    })
    expect(db.expenses[0].description).toBe("Čisticí prostředky")
  })
})

describe("čtení", () => {
  it("vrátí vlastní náklady v období, nejnovější první", async () => {
    seedExpense(db, OWNER, { expense_date: "2026-01-31" })
    seedExpense(db, OWNER, { expense_date: "2026-02-01", description: "První v únoru" })
    seedExpense(db, OWNER, { expense_date: "2026-02-28", description: "Poslední v únoru" })
    seedExpense(db, OTHER, { expense_date: "2026-02-10" })

    const rows = await listExpenses(owner, { date_from: "2026-02-01", date_to: "2026-02-28" })

    expect(rows.map((row) => row.description)).toEqual(["Poslední v únoru", "První v únoru"])
  })

  it("cizí náklad nenajde", async () => {
    const id = seedExpense(db, OWNER)
    await expect(getExpense(other, id)).rejects.toMatchObject({ code: "EXPENSE_NOT_FOUND" })
  })
})

describe("deleteExpense", () => {
  it("smaže vlastní, cizí nechá být", async () => {
    const mine = seedExpense(db, OWNER)
    const theirs = seedExpense(db, OTHER)

    await deleteExpense(owner, mine)
    await deleteExpense(owner, theirs)

    expect(db.expenses.map((row) => row.id)).toEqual([theirs])
  })
})
