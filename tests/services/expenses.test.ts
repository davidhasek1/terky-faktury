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
    description: "Nákup",
    supplier: "Mercadona",
    category: "material",
    items: [
      { subtotal: "23,50", tax_rate: "10" },
      { subtotal: "12", tax_rate: "21" },
    ],
    ...overrides,
  })
}

describe("validace vstupu", () => {
  it("odmítne prázdný popis, doklad bez položek a zápornou částku", () => {
    expect(expenseInputSchema.safeParse({ ...input(), description: "  " }).success).toBe(false)
    expect(expenseInputSchema.safeParse({ ...input(), items: [] }).success).toBe(false)
    expect(
      expenseInputSchema.safeParse({
        expense_date: "2026-03-05",
        description: "x",
        items: [{ subtotal: "-1", tax_rate: "21" }],
      }).success,
    ).toBe(false)
  })

  it("prázdné volitelné texty uloží jako null a kategorii doplní", () => {
    const parsed = expenseInputSchema.parse({
      expense_date: "2026-03-05",
      description: "Káva pro klienta",
      supplier: "",
      items: [{ subtotal: "3,50", tax_rate: "10" }],
    })
    expect(parsed).toMatchObject({ supplier: null, note: null, category: "other" })
    expect(parsed.items).toEqual([{ subtotal: 350, tax_rate: 1000 }])
  })
})

describe("createExpense", () => {
  it("uloží doklad se součty a položky po sazbách", async () => {
    const expense = await createExpense(owner, input())

    expect(expense).toMatchObject({
      user_id: OWNER,
      subtotal: 35.5,
      tax_amount: 4.87,
      total: 40.37,
    })
    expect(expense.items).toMatchObject([
      { position: 0, subtotal: 23.5, tax_rate: 10, tax_amount: 2.35, total: 25.85 },
      { position: 1, subtotal: 12, tax_rate: 21, tax_amount: 2.52, total: 14.52 },
    ])
    expect(db.expenses[0]).not.toHaveProperty("tax_rate")
  })

  it("když se položky nezapíšou, doklad nenechá viset", async () => {
    const failing = createFakeSupabaseClient(db, OWNER)
    const from = failing.from.bind(failing)
    failing.from = ((table: string) =>
      table === "expense_items"
        ? { insert: () => Promise.resolve({ data: null, error: { message: "boom" } }) }
        : from(table)) as typeof failing.from

    await expect(createExpense({ supabase: failing, userId: OWNER }, input())).rejects.toMatchObject({
      code: "DATABASE_ERROR",
    })
    expect(db.expenses).toHaveLength(0)
  })
})

describe("updateExpense", () => {
  it("nahradí položky a přepočte součty", async () => {
    const id = seedExpense(db, OWNER)
    const updated = await updateExpense(owner, id, input({ items: [{ subtotal: "100", tax_rate: "4" }] }))

    expect(updated).toMatchObject({ subtotal: 100, tax_amount: 4, total: 104 })
    expect(updated.items).toHaveLength(1)
    expect(db.expense_items).toHaveLength(1)
  })

  it("cizí náklad neupraví ani mu nesmaže položky", async () => {
    const id = seedExpense(db, OTHER)
    await expect(updateExpense(owner, id, input())).rejects.toMatchObject({
      code: "EXPENSE_NOT_FOUND",
    })
    expect(db.expenses[0].description).toBe("Čisticí prostředky")
    expect(db.expense_items).toHaveLength(1)
  })
})

describe("čtení", () => {
  it("vrátí vlastní náklady v období s položkami, nejnovější první", async () => {
    seedExpense(db, OWNER, { expense_date: "2026-01-31" })
    seedExpense(db, OWNER, { expense_date: "2026-02-01", description: "První v únoru" })
    seedExpense(db, OWNER, { expense_date: "2026-02-28", description: "Poslední v únoru" }, [
      { subtotal: 10, tax_rate: 10, tax_amount: 1, total: 11 },
      { subtotal: 10, tax_rate: 21, tax_amount: 2.1, total: 12.1 },
    ])
    seedExpense(db, OTHER, { expense_date: "2026-02-10" })

    const rows = await listExpenses(owner, { date_from: "2026-02-01", date_to: "2026-02-28" })

    expect(rows.map((row) => row.description)).toEqual(["Poslední v únoru", "První v únoru"])
    expect(rows[0].items.map((item) => item.tax_rate)).toEqual([10, 21])
    expect(rows[1].items).toHaveLength(1)
  })

  it("cizí náklad nenajde", async () => {
    const id = seedExpense(db, OWNER)
    await expect(getExpense(other, id)).rejects.toMatchObject({ code: "EXPENSE_NOT_FOUND" })
  })
})

describe("deleteExpense", () => {
  it("smaže vlastní doklad i s položkami, cizí nechá být", async () => {
    const mine = seedExpense(db, OWNER)
    const theirs = seedExpense(db, OTHER)

    await deleteExpense(owner, mine)
    await deleteExpense(owner, theirs)

    expect(db.expenses.map((row) => row.id)).toEqual([theirs])
    expect(db.expense_items.map((item) => item.expense_id)).toEqual([theirs])
  })
})
