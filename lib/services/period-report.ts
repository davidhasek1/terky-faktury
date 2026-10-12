import { fromDecimal, sumScaled, type Scaled } from "@/lib/money"
import type { Expense, ExpenseCategory, Invoice } from "@/lib/types"
import type { ReportPeriod } from "@/lib/validation/report"

import type { ServiceContext } from "./context"
import { toServiceError } from "./errors"
import { groupByRate, type RateTotal } from "./expense-totals"
import { listExpenses } from "./expenses"
import { invoiceStatus, type InvoiceStatus } from "./invoices"

/**
 * Výkaz za období: vystavené faktury s rozpadem na základ, IVA a retención,
 * náklady a souhrn pro přiznání IVA (modelo 303) a IRPF (modelo 130).
 *
 * Faktury se do období řadí podle data vystavení a patří tam i nezaplacené —
 * španělská IVA se odvádí podle vystavení (criterio de devengo), ne úhrady.
 *
 * Všechny částky jsou v setinách. Stránku, CSV export i MCP nástroj
 * `get_period_report` pohání tatáž funkce, takže čísla sedí všude.
 */

export interface ReportInvoice {
  id: string
  invoice_number: string
  issue_date: string
  customer_name: string | null
  status: InvoiceStatus
  tax_rate: Scaled
  retention_rate: Scaled
  subtotal: Scaled
  tax: Scaled
  retention: Scaled
  total: Scaled
}

export interface ReportExpenseItem {
  tax_rate: Scaled
  subtotal: Scaled
  tax: Scaled
  total: Scaled
}

export interface ReportExpense {
  id: string
  expense_date: string
  description: string
  supplier: string | null
  category: ExpenseCategory
  subtotal: Scaled
  tax: Scaled
  total: Scaled
  items: ReportExpenseItem[]
}

export interface CategoryTotal {
  category: ExpenseCategory
  count: number
  subtotal: Scaled
  tax: Scaled
  total: Scaled
}

export interface PeriodTotals {
  income: {
    count: number
    subtotal: Scaled
    tax: Scaled
    retention: Scaled
    total: Scaled
    /** Základ a IVA podle sazby — řádky modelo 303 (IVA devengado). */
    byRate: RateTotal[]
  }
  expenses: {
    count: number
    subtotal: Scaled
    tax: Scaled
    total: Scaled
    /** Základ a IVA podle sazby z položek dokladů (IVA soportado). */
    byRate: RateTotal[]
  }
  /** IVA vybraná − IVA zaplacená. Záporná = nárok na vrácení. */
  vatBalance: Scaled
  /** Příjmy bez DPH − náklady bez DPH. */
  profit: Scaled
  expensesByCategory: CategoryTotal[]
}

export interface PeriodReport {
  period: ReportPeriod
  invoices: ReportInvoice[]
  expenses: ReportExpense[]
  totals: PeriodTotals
}

type InvoiceRow = Pick<
  Invoice,
  | "id"
  | "invoice_number"
  | "issue_date"
  | "due_date"
  | "paid_date"
  | "tax_rate"
  | "retention_rate"
  | "subtotal"
  | "tax_amount"
  | "retention_amount"
  | "total"
> & { customer: { name: string } | null }

export async function getPeriodReport(
  ctx: ServiceContext,
  period: ReportPeriod,
): Promise<PeriodReport> {
  const [invoiceResult, expenses] = await Promise.all([
    ctx.supabase
      .from("invoices")
      .select(
        "id, invoice_number, issue_date, due_date, paid_date, tax_rate, retention_rate, subtotal, tax_amount, retention_amount, total, customer:customers(name)",
      )
      .eq("user_id", ctx.userId)
      .gte("issue_date", period.from)
      .lte("issue_date", period.to)
      .order("issue_date", { ascending: true })
      .returns<InvoiceRow[]>(),
    listExpenses(ctx, { date_from: period.from, date_to: period.to }),
  ])

  if (invoiceResult.error) throw toServiceError(invoiceResult.error, "Nepodařilo se načíst faktury")

  return buildPeriodReport(period, invoiceResult.data ?? [], expenses)
}

/** Čistá část výkazu — převod řádků a součty. */
export function buildPeriodReport(
  period: ReportPeriod,
  invoiceRows: readonly InvoiceRow[],
  expenseRows: readonly Expense[],
): PeriodReport {
  const invoices = invoiceRows
    .map(
      (row): ReportInvoice => ({
        id: row.id,
        invoice_number: row.invoice_number,
        issue_date: row.issue_date,
        customer_name: row.customer?.name ?? null,
        status: invoiceStatus(row),
        tax_rate: fromDecimal(row.tax_rate),
        retention_rate: fromDecimal(row.retention_rate),
        subtotal: fromDecimal(row.subtotal),
        tax: fromDecimal(row.tax_amount),
        retention: fromDecimal(row.retention_amount),
        total: fromDecimal(row.total),
      }),
    )
    .sort(
      (a, b) =>
        a.issue_date.localeCompare(b.issue_date) ||
        a.invoice_number.localeCompare(b.invoice_number, "cs", { numeric: true }),
    )

  const expenses = expenseRows
    .map(
      (row): ReportExpense => ({
        id: row.id,
        expense_date: row.expense_date,
        description: row.description,
        supplier: row.supplier ?? null,
        category: row.category,
        subtotal: fromDecimal(row.subtotal),
        tax: fromDecimal(row.tax_amount),
        total: fromDecimal(row.total),
        items: row.items.map((item) => ({
          tax_rate: fromDecimal(item.tax_rate),
          subtotal: fromDecimal(item.subtotal),
          tax: fromDecimal(item.tax_amount),
          total: fromDecimal(item.total),
        })),
      }),
    )
    .sort((a, b) => a.expense_date.localeCompare(b.expense_date))

  const income = {
    count: invoices.length,
    subtotal: sumScaled(invoices.map((i) => i.subtotal)),
    tax: sumScaled(invoices.map((i) => i.tax)),
    retention: sumScaled(invoices.map((i) => i.retention)),
    total: sumScaled(invoices.map((i) => i.total)),
    byRate: groupByRate(
      invoices.map((i) => ({ taxRate: i.tax_rate, subtotal: i.subtotal, taxAmount: i.tax })),
    ),
  }

  const spent = {
    count: expenses.length,
    subtotal: sumScaled(expenses.map((e) => e.subtotal)),
    tax: sumScaled(expenses.map((e) => e.tax)),
    total: sumScaled(expenses.map((e) => e.total)),
    byRate: groupByRate(
      expenses.flatMap((e) =>
        e.items.map((item) => ({ taxRate: item.tax_rate, subtotal: item.subtotal, taxAmount: item.tax })),
      ),
    ),
  }

  const byCategory = new Map<ExpenseCategory, CategoryTotal>()
  for (const expense of expenses) {
    const bucket = byCategory.get(expense.category) ?? {
      category: expense.category,
      count: 0,
      subtotal: 0,
      tax: 0,
      total: 0,
    }
    bucket.count += 1
    bucket.subtotal += expense.subtotal
    bucket.tax += expense.tax
    bucket.total += expense.total
    byCategory.set(expense.category, bucket)
  }

  return {
    period,
    invoices,
    expenses,
    totals: {
      income,
      expenses: spent,
      vatBalance: income.tax - spent.tax,
      profit: income.subtotal - spent.subtotal,
      expensesByCategory: [...byCategory.values()].sort((a, b) => b.subtotal - a.subtotal),
    },
  }
}
