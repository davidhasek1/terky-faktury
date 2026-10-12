import ExcelJS from "exceljs"

import { EXPENSE_CATEGORY_LABELS } from "@/components/expenses/category-labels"
import { toDecimal, type Scaled } from "@/lib/money"

import type { PeriodReport } from "./period-report"
import { periodLabel } from "./report-period"

/**
 * Výkaz za období jako sešit Excelu: Souhrn, Faktury, Náklady.
 *
 * Na rozdíl od CSV nese typy — částky jsou čísla ve formátu €, data jsou
 * data — a součty jsou vzorce, takže se přepočtou, když účetní řádek upraví.
 * Text zadaný uživatelem se zapisuje jako řetězec, nikdy jako vzorec.
 */

const MONEY = '#,##0.00 "€"'
const PERCENT = "0%"
const DATE = "d.m.yyyy"

const STATUS_LABELS = {
  paid: "Zaplaceno",
  unpaid: "Nezaplaceno",
  overdue: "Po splatnosti",
} as const

function money(value: Scaled): number {
  return toDecimal(value)
}

/** Sazba v setinách procenta (2100) → podíl pro formát procent (0,21). */
function rate(value: Scaled): number {
  return toDecimal(value) / 100
}

/** DATE z DB jako půlnoc UTC — exceljs datum převádí bez posunu zóny. */
function date(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.border = { bottom: { style: "thin" } }
  sheet.views = [{ state: "frozen", ySplit: 1 }]
}

/**
 * Řádek součtů pod tabulkou. Prázdná tabulka dostane nulu místo
 * `SUM(D2:D1)`, který by Excel vyhodnotil přes záhlaví.
 */
function addTotalsRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  sums: Record<string, Scaled>,
  dataRows: number,
) {
  const row = sheet.addRow({})
  row.getCell(1).value = label
  for (const [key, value] of Object.entries(sums)) {
    const cell = row.getCell(key)
    const letter = sheet.getColumn(key).letter
    cell.value =
      dataRows === 0
        ? 0
        : { formula: `SUM(${letter}2:${letter}${dataRows + 1})`, result: money(value) }
  }
  row.font = { bold: true }
  row.border = { top: { style: "thin" } }
}

function addSummarySheet(workbook: ExcelJS.Workbook, report: PeriodReport) {
  const sheet = workbook.addWorksheet("Souhrn")
  const { totals, period } = report

  sheet.columns = [
    { key: "label", width: 36 },
    { key: "count", width: 10 },
    { key: "subtotal", width: 16, style: { numFmt: MONEY } },
    { key: "tax", width: 16, style: { numFmt: MONEY } },
    { key: "total", width: 16, style: { numFmt: MONEY } },
  ]

  sheet.addRow(["Výkaz za období", periodLabel(period)]).font = { bold: true, size: 14 }
  sheet.addRow(["Od", date(period.from)]).getCell(2).numFmt = DATE
  sheet.addRow(["Do", date(period.to)]).getCell(2).numFmt = DATE
  sheet.addRow([])

  const lines: [string, Scaled][] = [
    ["Příjmy bez IVA", totals.income.subtotal],
    ["Náklady bez IVA", totals.expenses.subtotal],
    ["Zisk (příjmy − náklady, bez IVA)", totals.profit],
    ["IVA vybraná", totals.income.tax],
    ["IVA z nákladů", totals.expenses.tax],
    [totals.vatBalance < 0 ? "IVA k vrácení" : "IVA k odvodu", Math.abs(totals.vatBalance)],
    ["Retención (sraženo zákazníky)", totals.income.retention],
    ["Fakturováno celkem", totals.income.total],
  ]
  for (const [label, value] of lines) {
    const row = sheet.addRow([label, money(value)])
    row.getCell(2).numFmt = MONEY
  }
  sheet.getColumn(2).width = 18

  if (totals.expensesByCategory.length === 0) return

  sheet.addRow([])
  const header = sheet.addRow(["Náklady podle kategorií", "Počet", "Základ", "IVA", "Celkem"])
  header.font = { bold: true }
  header.border = { bottom: { style: "thin" } }
  for (const bucket of totals.expensesByCategory) {
    const row = sheet.addRow([
      EXPENSE_CATEGORY_LABELS[bucket.category],
      bucket.count,
      money(bucket.subtotal),
      money(bucket.tax),
      money(bucket.total),
    ])
    row.getCell(2).numFmt = "0"
  }
}

function addInvoicesSheet(workbook: ExcelJS.Workbook, report: PeriodReport) {
  const sheet = workbook.addWorksheet("Faktury")
  sheet.columns = [
    { header: "Číslo faktury", key: "number", width: 14 },
    { header: "Datum vystavení", key: "issue_date", width: 15, style: { numFmt: DATE } },
    { header: "Zákazník", key: "customer", width: 32 },
    { header: "Základ", key: "subtotal", width: 14, style: { numFmt: MONEY } },
    { header: "IVA %", key: "tax_rate", width: 8, style: { numFmt: PERCENT } },
    { header: "IVA", key: "tax", width: 13, style: { numFmt: MONEY } },
    { header: "Retención %", key: "retention_rate", width: 12, style: { numFmt: PERCENT } },
    { header: "Retención", key: "retention", width: 13, style: { numFmt: MONEY } },
    { header: "Celkem", key: "total", width: 14, style: { numFmt: MONEY } },
    { header: "Stav", key: "status", width: 14 },
  ]

  for (const invoice of report.invoices) {
    sheet.addRow({
      number: invoice.invoice_number,
      issue_date: date(invoice.issue_date),
      customer: invoice.customer_name ?? "",
      subtotal: money(invoice.subtotal),
      tax_rate: rate(invoice.tax_rate),
      tax: money(invoice.tax),
      retention_rate: rate(invoice.retention_rate),
      retention: money(invoice.retention),
      total: money(invoice.total),
      status: STATUS_LABELS[invoice.status],
    })
  }

  styleHeader(sheet)
  sheet.autoFilter = { from: "A1", to: { row: report.invoices.length + 1, column: 10 } }

  const { income } = report.totals
  addTotalsRow(
    sheet,
    "Celkem",
    { subtotal: income.subtotal, tax: income.tax, retention: income.retention, total: income.total },
    report.invoices.length,
  )
}

function addExpensesSheet(workbook: ExcelJS.Workbook, report: PeriodReport) {
  const sheet = workbook.addWorksheet("Náklady")
  sheet.columns = [
    { header: "Datum", key: "expense_date", width: 12, style: { numFmt: DATE } },
    { header: "Popis", key: "description", width: 36 },
    { header: "Dodavatel", key: "supplier", width: 22 },
    { header: "Kategorie", key: "category", width: 32 },
    { header: "Základ", key: "subtotal", width: 14, style: { numFmt: MONEY } },
    { header: "IVA %", key: "tax_rate", width: 8, style: { numFmt: PERCENT } },
    { header: "IVA", key: "tax", width: 13, style: { numFmt: MONEY } },
    { header: "Celkem", key: "total", width: 14, style: { numFmt: MONEY } },
  ]

  for (const expense of report.expenses) {
    sheet.addRow({
      expense_date: date(expense.expense_date),
      description: expense.description,
      supplier: expense.supplier ?? "",
      category: EXPENSE_CATEGORY_LABELS[expense.category],
      subtotal: money(expense.subtotal),
      tax_rate: rate(expense.tax_rate),
      tax: money(expense.tax),
      total: money(expense.total),
    })
  }

  styleHeader(sheet)
  sheet.autoFilter = { from: "A1", to: { row: report.expenses.length + 1, column: 8 } }

  const { expenses } = report.totals
  addTotalsRow(
    sheet,
    "Celkem",
    { subtotal: expenses.subtotal, tax: expenses.tax, total: expenses.total },
    report.expenses.length,
  )
}

export async function reportXlsx(report: PeriodReport): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Terky Faktury"
  workbook.created = new Date()

  addSummarySheet(workbook, report)
  addInvoicesSheet(workbook, report)
  addExpensesSheet(workbook, report)

  return new Uint8Array(await workbook.xlsx.writeBuffer())
}
