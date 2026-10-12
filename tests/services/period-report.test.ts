import { beforeEach, describe, expect, it } from "vitest"

import type { ServiceContext } from "@/lib/services/context"
import { getPeriodReport } from "@/lib/services/period-report"
import { expensesCsv, invoicesCsv } from "@/lib/services/report-csv"

import {
  createFakeDatabase,
  createFakeSupabaseClient,
  type FakeDatabase,
} from "../helpers/fake-supabase"
import { seedCustomer, seedExpense, seedInvoice } from "../helpers/seed"

const OWNER = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const Q1 = { from: "2026-01-01", to: "2026-03-31" }

let db: FakeDatabase
let owner: ServiceContext

beforeEach(() => {
  db = createFakeDatabase()
  owner = { supabase: createFakeSupabaseClient(db, OWNER), userId: OWNER }
})

function seedQuarter() {
  const customerId = seedCustomer(db, OWNER, { name: "Casa Sol" })
  // Na hranicích období — patří dovnitř.
  seedInvoice(db, OWNER, customerId, {
    invoice_number: "2026-002",
    issue_date: "2026-03-31",
    subtotal: 200,
    tax_amount: 42,
    retention_rate: 15,
    retention_amount: 30,
    total: 212,
    paid_date: "2026-04-02",
  })
  seedInvoice(db, OWNER, customerId, { invoice_number: "2026-001", issue_date: "2026-01-01" })
  // Mimo období.
  seedInvoice(db, OWNER, customerId, { invoice_number: "2025-099", issue_date: "2025-12-31" })
  seedInvoice(db, OWNER, customerId, { invoice_number: "2026-003", issue_date: "2026-04-01" })
  // Cizí.
  seedInvoice(db, OTHER, seedCustomer(db, OTHER), { issue_date: "2026-02-01" })

  seedExpense(db, OWNER, { expense_date: "2026-02-15" })
  seedExpense(
    db,
    OWNER,
    { expense_date: "2026-03-01", description: "Cuota autónomo", category: "social_security" },
    [{ subtotal: 294, tax_rate: 0, tax_amount: 0, total: 294 }],
  )
  seedExpense(db, OWNER, { expense_date: "2026-04-01" })
  seedExpense(db, OTHER, { expense_date: "2026-02-15" })
}

describe("getPeriodReport", () => {
  it("vezme jen vlastní faktury a náklady v období včetně hranic", async () => {
    seedQuarter()
    const report = await getPeriodReport(owner, Q1)

    expect(report.invoices.map((i) => i.invoice_number)).toEqual(["2026-001", "2026-002"])
    expect(report.invoices[0].customer_name).toBe("Casa Sol")
    expect(report.invoices[1].status).toBe("paid")
    expect(report.expenses.map((e) => e.expense_date)).toEqual(["2026-02-15", "2026-03-01"])
  })

  it("spočte souhrn pro přiznání", async () => {
    seedQuarter()
    const { totals } = await getPeriodReport(owner, Q1)

    expect(totals.income).toMatchObject({
      count: 2,
      subtotal: 30000,
      tax: 6300,
      retention: 3000,
      total: 33300,
    })
    expect(totals.expenses).toMatchObject({ count: 2, subtotal: 33400, tax: 840, total: 34240 })
    expect(totals.vatBalance).toBe(6300 - 840)
    expect(totals.profit).toBe(30000 - 33400)
    expect(totals.expensesByCategory.map((c) => [c.category, c.subtotal])).toEqual([
      ["social_security", 29400],
      ["material", 4000],
    ])
  })

  it("prázdné období vrátí nuly", async () => {
    const report = await getPeriodReport(owner, Q1)
    expect(report.invoices).toEqual([])
    expect(report.totals.vatBalance).toBe(0)
    expect(report.totals.expensesByCategory).toEqual([])
  })
})

describe("IVA podle sazeb", () => {
  it("rozepíše příjmy i náklady po sazbách včetně víceřádkových dokladů", async () => {
    const customerId = seedCustomer(db, OWNER)
    seedInvoice(db, OWNER, customerId, { issue_date: "2026-01-10" })
    seedInvoice(db, OWNER, customerId, {
      issue_date: "2026-01-11",
      tax_rate: 10,
      subtotal: 50,
      tax_amount: 5,
      total: 55,
    })
    seedExpense(db, OWNER, { expense_date: "2026-02-01" }, [
      { subtotal: 23.5, tax_rate: 10, tax_amount: 2.35, total: 25.85 },
      { subtotal: 12, tax_rate: 21, tax_amount: 2.52, total: 14.52 },
    ])
    seedExpense(db, OWNER, { expense_date: "2026-02-02" })

    const { totals, expenses } = await getPeriodReport(owner, Q1)

    expect(totals.income.byRate).toEqual([
      { taxRate: 2100, subtotal: 10000, taxAmount: 2100 },
      { taxRate: 1000, subtotal: 5000, taxAmount: 500 },
    ])
    expect(totals.expenses.byRate).toEqual([
      { taxRate: 2100, subtotal: 5200, taxAmount: 1092 },
      { taxRate: 1000, subtotal: 2350, taxAmount: 235 },
    ])
    expect(expenses[0].items).toHaveLength(2)
    expect(totals.expenses.tax).toBe(1092 + 235)
  })
})

describe("CSV", () => {
  it("faktury mají BOM, středníky, desetinnou čárku a součet", async () => {
    seedQuarter()
    const csv = invoicesCsv(await getPeriodReport(owner, Q1))
    const lines = csv.slice(1).trimEnd().split("\r\n")

    expect(csv.startsWith("﻿")).toBe(true)
    expect(lines[0]).toBe(
      "Číslo faktury;Datum vystavení;Zákazník;Základ;IVA %;IVA;Retención %;Retención;Celkem;Stav",
    )
    expect(lines[2]).toBe("2026-002;2026-03-31;Casa Sol;200,00;21,00;42,00;15,00;30,00;212,00;Zaplaceno")
    expect(lines.at(-1)).toBe("Celkem;;;300,00;;63,00;;30,00;333,00;")
  })

  it("náklady ošetří středníky, uvozovky a vzorce v textu", async () => {
    seedExpense(db, OWNER, {
      expense_date: "2026-01-10",
      description: 'Mop; kbelík "XL"',
      supplier: "=HYPERLINK(\"x\")",
    })
    const csv = expensesCsv(await getPeriodReport(owner, Q1))
    const lines = csv.slice(1).trimEnd().split("\r\n")

    expect(lines[1]).toBe(
      '2026-01-10;"Mop; kbelík ""XL""";"\'=HYPERLINK(""x"")";Materiál a čisticí prostředky;40,00;21,00;8,40;48,40',
    )
  })
})

describe("CSV nákladů s více sazbami", () => {
  it("vypíše jeden řádek za položku a součet přes všechny", async () => {
    seedExpense(db, OWNER, { expense_date: "2026-02-01", description: "Nákup" }, [
      { subtotal: 23.5, tax_rate: 10, tax_amount: 2.35, total: 25.85 },
      { subtotal: 12, tax_rate: 21, tax_amount: 2.52, total: 14.52 },
    ])
    const lines = expensesCsv(await getPeriodReport(owner, Q1)).slice(1).trimEnd().split("\r\n")

    expect(lines.slice(1)).toEqual([
      "2026-02-01;Nákup;Mercadona;Materiál a čisticí prostředky;23,50;10,00;2,35;25,85",
      "2026-02-01;Nákup;Mercadona;Materiál a čisticí prostředky;12,00;21,00;2,52;14,52",
      "Celkem;;;;35,50;;4,87;40,37",
    ])
  })
})
