import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it } from "vitest"

import type { ServiceContext } from "@/lib/services/context"
import { getPeriodReport } from "@/lib/services/period-report"
import { reportXlsx } from "@/lib/services/report-xlsx"

import {
  createFakeDatabase,
  createFakeSupabaseClient,
  type FakeDatabase,
} from "../helpers/fake-supabase"
import { seedCustomer, seedExpense, seedInvoice } from "../helpers/seed"

const OWNER = "11111111-1111-4111-8111-111111111111"
const Q1 = { from: "2026-01-01", to: "2026-03-31" }

let db: FakeDatabase
let owner: ServiceContext

beforeEach(() => {
  db = createFakeDatabase()
  owner = { supabase: createFakeSupabaseClient(db, OWNER), userId: OWNER }
})

async function workbookFor(period = Q1) {
  const bytes = await reportXlsx(await getPeriodReport(owner, period))
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer)
  return workbook
}

describe("reportXlsx", () => {
  it("má listy Souhrn, Faktury a Náklady", async () => {
    const workbook = await workbookFor()
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Souhrn", "Faktury", "Náklady"])
  })

  it("zapíše faktury jako čísla a data se součtovým vzorcem", async () => {
    const customerId = seedCustomer(db, OWNER, { name: "Casa Sol" })
    seedInvoice(db, OWNER, customerId, { invoice_number: "2026-001", issue_date: "2026-01-10" })
    seedInvoice(db, OWNER, customerId, {
      invoice_number: "2026-002",
      issue_date: "2026-02-10",
      subtotal: 200,
      tax_amount: 42,
      retention_rate: 15,
      retention_amount: 30,
      total: 212,
    })

    const sheet = (await workbookFor()).getWorksheet("Faktury")!

    expect(sheet.getRow(1).getCell(1).value).toBe("Číslo faktury")
    const first = sheet.getRow(2)
    expect(first.getCell(1).value).toBe("2026-001")
    expect(first.getCell(2).value).toEqual(new Date(Date.UTC(2026, 0, 10)))
    expect(first.getCell(3).value).toBe("Casa Sol")
    expect(first.getCell(4).value).toBe(100)
    expect(first.getCell(4).numFmt).toContain("€")
    expect(first.getCell(5).value).toBe(0.21)
    expect(sheet.getRow(3).getCell(8).value).toBe(30)

    const totals = sheet.getRow(4)
    expect(totals.getCell(1).value).toBe("Celkem")
    expect(totals.getCell(4).value).toMatchObject({ formula: "SUM(D2:D3)", result: 300 })
    expect(totals.getCell(9).value).toMatchObject({ formula: "SUM(I2:I3)", result: 333 })
  })

  it("text zadaný uživatelem nezapíše jako vzorec", async () => {
    seedExpense(db, OWNER, { expense_date: "2026-01-05", description: "=1+1" })

    const sheet = (await workbookFor()).getWorksheet("Náklady")!

    expect(sheet.getRow(2).getCell(2).value).toBe("=1+1")
    expect(sheet.getRow(2).getCell(4).value).toBe("Materiál a čisticí prostředky")
    expect(sheet.getRow(3).getCell(5).value).toMatchObject({ formula: "SUM(E2:E2)", result: 40 })
  })

  it("souhrn nese IVA k odvodu a zisk", async () => {
    const customerId = seedCustomer(db, OWNER)
    seedInvoice(db, OWNER, customerId, { issue_date: "2026-03-01" })
    seedExpense(db, OWNER, { expense_date: "2026-03-02" })

    const sheet = (await workbookFor()).getWorksheet("Souhrn")!
    const values = new Map<string, unknown>()
    sheet.eachRow((row) => values.set(String(row.getCell(1).value), row.getCell(2).value))

    expect(values.get("Výkaz za období")).toBe("1. čtvrtletí 2026")
    expect(values.get("IVA k odvodu")).toBe(12.6)
    expect(values.get("Zisk (příjmy − náklady, bez IVA)")).toBe(60)
    expect(values.get("Materiál a čisticí prostředky")).toBe(1)
  })

  it("prázdné období má v součtech nulu, ne vzorec přes záhlaví", async () => {
    const sheet = (await workbookFor()).getWorksheet("Faktury")!
    expect(sheet.getRow(2).getCell(1).value).toBe("Celkem")
    expect(sheet.getRow(2).getCell(4).value).toBe(0)
  })
})

describe("reportXlsx s více sazbami", () => {
  it("rozepíše doklad na řádky položek a souhrn po sazbách", async () => {
    seedExpense(db, OWNER, { expense_date: "2026-02-01", description: "Nákup" }, [
      { subtotal: 23.5, tax_rate: 10, tax_amount: 2.35, total: 25.85 },
      { subtotal: 12, tax_rate: 21, tax_amount: 2.52, total: 14.52 },
    ])

    const workbook = await workbookFor()
    const sheet = workbook.getWorksheet("Náklady")!

    expect(sheet.getRow(2).getCell(6).value).toBe(0.1)
    expect(sheet.getRow(3).getCell(6).value).toBe(0.21)
    expect(sheet.getRow(4).getCell(5).value).toMatchObject({ formula: "SUM(E2:E3)", result: 35.5 })

    const summary = workbook.getWorksheet("Souhrn")!
    const rateRows: unknown[][] = []
    let inExpenseRates = false
    summary.eachRow((row) => {
      if (row.getCell(1).value === "IVA z nákladů podle sazby") inExpenseRates = true
      else if (inExpenseRates && row.getCell(1).value === "" && typeof row.getCell(2).value === "number") {
        rateRows.push([row.getCell(2).value, row.getCell(3).value, row.getCell(4).value])
      } else inExpenseRates = false
    })
    expect(rateRows).toEqual([
      [0.21, 12, 2.52],
      [0.1, 23.5, 2.35],
    ])
  })
})
