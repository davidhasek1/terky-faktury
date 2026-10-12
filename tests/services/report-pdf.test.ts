import { beforeEach, describe, expect, it } from "vitest"

import { generateExpensesReportPdf, generateInvoicesReportPdf } from "@/lib/report-pdf"
import type { ServiceContext } from "@/lib/services/context"
import { getPeriodReport } from "@/lib/services/period-report"

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

/** PDF je binární; strukturu stačí číst jako latin1. */
function asText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1")
}

function pageCount(pdf: string): number {
  return pdf.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0
}

describe("generateInvoicesReportPdf", () => {
  it("vytvoří platné PDF s písmem, které umí češtinu", async () => {
    const customerId = seedCustomer(db, OWNER, { name: "Řeznictví Čížek" })
    seedInvoice(db, OWNER, customerId, { issue_date: "2026-02-01" })

    const pdf = asText(await generateInvoicesReportPdf(await getPeriodReport(owner, Q1), null))

    expect(pdf.startsWith("%PDF-")).toBe(true)
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true)
    // Vestavěná Helvetica by č/ř/ě rozbila — v PDF musí být vložený Inter.
    expect(pdf).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+Inter-Regular/)
    expect(pdf).not.toMatch(/\/BaseFont\s*\/Helvetica/)
    expect(pageCount(pdf)).toBe(1)
  })

  it("dlouhý seznam zalomí na další stránky", async () => {
    const customerId = seedCustomer(db, OWNER)
    for (let day = 1; day <= 90; day += 1) {
      const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10)
      seedInvoice(db, OWNER, customerId, { issue_date: date })
    }

    const pdf = asText(await generateInvoicesReportPdf(await getPeriodReport(owner, Q1), null))

    expect(pageCount(pdf)).toBeGreaterThan(1)
  })

  it("prázdné období vyrenderuje stránku s hláškou", async () => {
    const pdf = asText(await generateInvoicesReportPdf(await getPeriodReport(owner, Q1), null))
    expect(pageCount(pdf)).toBe(1)
  })
})

describe("generateExpensesReportPdf", () => {
  it("vytvoří PDF nákladů s doklady o více sazbách", async () => {
    seedExpense(db, OWNER, { expense_date: "2026-02-01", description: "Nákup drogerie a potravin" }, [
      { subtotal: 23.5, tax_rate: 10, tax_amount: 2.35, total: 25.85 },
      { subtotal: 12, tax_rate: 21, tax_amount: 2.52, total: 14.52 },
    ])

    const pdf = asText(await generateExpensesReportPdf(await getPeriodReport(owner, Q1), null))

    expect(pdf.startsWith("%PDF-")).toBe(true)
    expect(pdf).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+Inter-Regular/)
    expect(pageCount(pdf)).toBe(1)
  })

  it("prázdné období vyrenderuje stránku s hláškou", async () => {
    const pdf = asText(await generateExpensesReportPdf(await getPeriodReport(owner, Q1), null))
    expect(pageCount(pdf)).toBe(1)
  })
})
