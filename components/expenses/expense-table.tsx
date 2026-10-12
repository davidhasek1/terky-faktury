import { DataTable, Dash, TableCell, TableHead } from "@/components/patterns/data-table"
import { formatScaled, toDecimal } from "@/lib/money"
import type { PeriodTotals, ReportExpense } from "@/lib/services/period-report"
import { expenseCount, formatDate } from "@/lib/utils"

import { EXPENSE_CATEGORY_LABELS } from "./category-labels"
import { ExpenseRowActions } from "./expense-row-actions"

/**
 * Náklady za období s patičkou součtů. Na stránce Náklady s akcemi,
 * ve výkazu jen ke čtení.
 */
export function ExpenseTable({
  expenses,
  totals,
  editable = false,
}: {
  expenses: ReportExpense[]
  totals: PeriodTotals["expenses"]
  editable?: boolean
}) {
  return (
    <DataTable
      head={
        <>
          <TableHead>Datum</TableHead>
          <TableHead>Popis</TableHead>
          <TableHead>Kategorie</TableHead>
          <TableHead align="right">Základ</TableHead>
          <TableHead align="right">IVA</TableHead>
          <TableHead align="right">Celkem</TableHead>
          {editable && <TableHead align="right">Akce</TableHead>}
        </>
      }
    >
      {expenses.map((expense) => (
        <tr key={expense.id} className="border-b border-border/60">
          <TableCell className="whitespace-nowrap tabular-nums">{formatDate(expense.expense_date)}</TableCell>
          <TableCell>
            <span className="font-medium">{expense.description}</span>
            {expense.supplier && (
              <span className="block text-xs text-muted-foreground">{expense.supplier}</span>
            )}
          </TableCell>
          <TableCell className="text-muted-foreground">{EXPENSE_CATEGORY_LABELS[expense.category]}</TableCell>
          <TableCell align="right" className="tabular-nums">{formatScaled(expense.subtotal)}</TableCell>
          <TableCell align="right" className="whitespace-nowrap tabular-nums">
            {expense.tax === 0 ? <Dash /> : formatScaled(expense.tax)}
            <span className="block text-xs text-muted-foreground">{rateList(expense)}</span>
          </TableCell>
          <TableCell align="right" className="font-display font-semibold tabular-nums">
            {formatScaled(expense.total)}
          </TableCell>
          {editable && (
            <TableCell align="right">
              <ExpenseRowActions expenseId={expense.id} />
            </TableCell>
          )}
        </tr>
      ))}
      <tr className="bg-muted/40">
        <TableCell className="font-medium">Celkem</TableCell>
        <TableCell className="text-muted-foreground">{expenseCount(totals.count)}</TableCell>
        <TableCell>{null}</TableCell>
        <TableCell align="right" className="font-semibold tabular-nums">{formatScaled(totals.subtotal)}</TableCell>
        <TableCell align="right" className="font-semibold tabular-nums">{formatScaled(totals.tax)}</TableCell>
        <TableCell align="right" className="font-display font-semibold tabular-nums">
          {formatScaled(totals.total)}
        </TableCell>
        {editable && <TableCell>{null}</TableCell>}
      </tr>
    </DataTable>
  )
}

/** Použité sazby IVA, např. „10 % · 21 %“. */
function rateList(expense: ReportExpense): string {
  const rates = [...new Set(expense.items.map((item) => item.tax_rate))].sort((a, b) => a - b)
  return rates.map((rate) => `${toDecimal(rate)} %`).join(" · ")
}
