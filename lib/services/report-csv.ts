import { EXPENSE_CATEGORY_LABELS } from "@/components/expenses/category-labels"
import { toDecimal, type Scaled } from "@/lib/money"

import type { PeriodReport } from "./period-report"

/**
 * CSV pro účetní. Formát míří na Excel v české i španělské lokalizaci:
 * oddělovač `;`, desetinná čárka, UTF-8 s BOM (bez něj Excel rozbije
 * diakritiku) a konce řádků CRLF.
 */

const BOM = "﻿"

const STATUS_LABELS = {
  paid: "Zaplaceno",
  unpaid: "Nezaplaceno",
  overdue: "Po splatnosti",
} as const

function money(value: Scaled): string {
  return toDecimal(value).toFixed(2).replace(".", ",")
}

/** Text zadaný uživatelem. Vzorce na začátku buňky Excel neprovede. */
function text(value: string | null | undefined): string {
  const raw = value ?? ""
  return /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
}

function cell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function toCsv(rows: string[][]): string {
  return BOM + rows.map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n"
}

export function invoicesCsv(report: PeriodReport): string {
  const { income } = report.totals
  return toCsv([
    ["Číslo faktury", "Datum vystavení", "Zákazník", "Základ", "IVA %", "IVA", "Retención %", "Retención", "Celkem", "Stav"],
    ...report.invoices.map((invoice) => [
      text(invoice.invoice_number),
      invoice.issue_date,
      text(invoice.customer_name),
      money(invoice.subtotal),
      money(invoice.tax_rate),
      money(invoice.tax),
      money(invoice.retention_rate),
      money(invoice.retention),
      money(invoice.total),
      STATUS_LABELS[invoice.status],
    ]),
    ["Celkem", "", "", money(income.subtotal), "", money(income.tax), "", money(income.retention), money(income.total), ""],
  ])
}

export function expensesCsv(report: PeriodReport): string {
  const { expenses } = report.totals
  return toCsv([
    ["Datum", "Popis", "Dodavatel", "Kategorie", "Základ", "IVA %", "IVA", "Celkem"],
    ...report.expenses.map((expense) => [
      expense.expense_date,
      text(expense.description),
      text(expense.supplier),
      EXPENSE_CATEGORY_LABELS[expense.category],
      money(expense.subtotal),
      money(expense.tax_rate),
      money(expense.tax),
      money(expense.total),
    ]),
    ["Celkem", "", "", "", money(expenses.subtotal), "", money(expenses.tax), money(expenses.total)],
  ])
}
