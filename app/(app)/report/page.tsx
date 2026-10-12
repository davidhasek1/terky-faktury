import Link from "next/link"
import { Download, FileSpreadsheet, FileText, Plus, Receipt } from "lucide-react"

import { Topbar } from "@/components/app-shell/topbar"
import { EXPENSE_CATEGORY_LABELS } from "@/components/expenses/category-labels"
import { ExpenseTable } from "@/components/expenses/expense-table"
import { DataTable, TableCell, TableHead } from "@/components/patterns/data-table"
import { EmptyState } from "@/components/patterns/empty-state"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"
import { SectionLabel } from "@/components/patterns/section-label"
import { StatTile } from "@/components/patterns/stat-tile"
import { PeriodPicker } from "@/components/report/period-picker"
import { ReportInvoiceTable } from "@/components/report/report-invoice-table"
import { Button } from "@/components/ui/button"
import { formatScaled, toDecimal, type Scaled } from "@/lib/money"
import { getPeriodReport, type PeriodTotals } from "@/lib/services/period-report"
import { localToday, periodLabel, resolvePeriod } from "@/lib/services/report-period"
import { createServerServiceContext } from "@/lib/services/server-context"

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { period } = resolvePeriod(await searchParams, localToday())
  const ctx = await createServerServiceContext()
  const report = await getPeriodReport(ctx, period)
  const { totals } = report
  const query = `from=${period.from}&to=${period.to}`

  return (
    <>
      <Topbar title="Výkaz" />
      <PageShell>
        <PageHeader
          eyebrow={periodLabel(period)}
          title="Výkaz za období"
          description="Vystavené faktury podle data vystavení, náklady a souhrn pro přiznání IVA a IRPF."
          actions={
            <>
              <Button asChild size="sm">
                <a href={`/api/report/xlsx?${query}`} download>
                  <FileSpreadsheet className="size-4" />
                  Excel
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/report/invoices?${query}`} download>
                  <Download className="size-4" />
                  Faktury (CSV)
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/report/expenses?${query}`} download>
                  <Download className="size-4" />
                  Náklady (CSV)
                </a>
              </Button>
            </>
          }
        />

        <div className="mb-6">
          <PeriodPicker key={query} period={period} />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Příjmy bez IVA"
            value={formatScaled(totals.income.subtotal)}
            meta={`${totals.income.count} faktur`}
          />
          <StatTile
            label="Náklady bez IVA"
            value={formatScaled(totals.expenses.subtotal)}
            meta={`${totals.expenses.count} nákladů`}
          />
          <StatTile
            label="Zisk"
            value={formatScaled(totals.profit)}
            meta="Příjmy − náklady, bez IVA"
            tone={totals.profit < 0 ? "overdue" : "settled"}
          />
          <StatTile
            label="Retención"
            value={formatScaled(totals.income.retention)}
            meta="Sraženo zákazníky na IRPF"
          />
        </div>
        <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="IVA vybraná" value={formatScaled(totals.income.tax)} meta="Z vystavených faktur" />
          <StatTile label="IVA z nákladů" value={formatScaled(totals.expenses.tax)} meta="K odpočtu" />
          <StatTile
            label={totals.vatBalance < 0 ? "IVA k vrácení" : "IVA k odvodu"}
            value={formatScaled(Math.abs(totals.vatBalance))}
            meta="Vybraná − z nákladů"
            tone={totals.vatBalance > 0 ? "due" : "neutral"}
          />
          <StatTile label="Fakturováno celkem" value={formatScaled(totals.income.total)} meta="Po IVA a retención" />
        </div>

        <section className="mb-10">
          <SectionLabel title="Vystavené faktury" />
          {report.invoices.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-8" />}
              title="V tomhle období žádná faktura."
              action={
                <Button asChild>
                  <Link href="/invoices/new">
                    <Plus className="size-4" />
                    Nová faktura
                  </Link>
                </Button>
              }
            />
          ) : (
            <ReportInvoiceTable invoices={report.invoices} totals={totals.income} />
          )}
        </section>

        <section className="mb-10">
          <SectionLabel
            title="Náklady"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href={`/expenses?${query}`}>Spravovat náklady</Link>
              </Button>
            }
          />
          {report.expenses.length === 0 ? (
            <EmptyState
              icon={<Receipt className="size-8" />}
              title="V tomhle období žádné náklady."
              action={
                <Button asChild>
                  <Link href="/expenses/new">
                    <Plus className="size-4" />
                    Nový náklad
                  </Link>
                </Button>
              }
            />
          ) : (
            <ExpenseTable expenses={report.expenses} totals={totals.expenses} />
          )}
        </section>

        {(totals.income.byRate.length > 0 || totals.expenses.byRate.length > 0) && (
          <section className="mb-10">
            <SectionLabel title="IVA podle sazeb" />
            <DataTable
              head={
                <>
                  <TableHead>Sazba</TableHead>
                  <TableHead align="right">Základ příjmů</TableHead>
                  <TableHead align="right">IVA vybraná</TableHead>
                  <TableHead align="right">Základ nákladů</TableHead>
                  <TableHead align="right">IVA z nákladů</TableHead>
                </>
              }
            >
              {vatRates(totals).map((row) => (
                <tr key={row.taxRate} className="border-b border-border/60 last:border-0">
                  <TableCell className="tabular-nums">{toDecimal(row.taxRate)} %</TableCell>
                  <TableCell align="right" className="tabular-nums">{formatScaled(row.incomeSubtotal)}</TableCell>
                  <TableCell align="right" className="tabular-nums">{formatScaled(row.incomeTax)}</TableCell>
                  <TableCell align="right" className="tabular-nums">{formatScaled(row.expenseSubtotal)}</TableCell>
                  <TableCell align="right" className="tabular-nums">{formatScaled(row.expenseTax)}</TableCell>
                </tr>
              ))}
            </DataTable>
          </section>
        )}

        {totals.expensesByCategory.length > 0 && (
          <section>
            <SectionLabel title="Náklady podle kategorií" />
            <DataTable
              head={
                <>
                  <TableHead>Kategorie</TableHead>
                  <TableHead align="right">Počet</TableHead>
                  <TableHead align="right">Základ</TableHead>
                  <TableHead align="right">IVA</TableHead>
                  <TableHead align="right">Celkem</TableHead>
                </>
              }
            >
              {totals.expensesByCategory.map((bucket) => (
                <tr key={bucket.category} className="border-b border-border/60 last:border-0">
                  <TableCell>{EXPENSE_CATEGORY_LABELS[bucket.category]}</TableCell>
                  <TableCell align="right" className="tabular-nums">{bucket.count}</TableCell>
                  <TableCell align="right" className="tabular-nums">{formatScaled(bucket.subtotal)}</TableCell>
                  <TableCell align="right" className="tabular-nums">{formatScaled(bucket.tax)}</TableCell>
                  <TableCell align="right" className="font-semibold tabular-nums">
                    {formatScaled(bucket.total)}
                  </TableCell>
                </tr>
              ))}
            </DataTable>
          </section>
        )}
      </PageShell>
    </>
  )
}

/** Sazby z příjmů i nákladů vedle sebe — tak, jak se přepisují do modelo 303. */
function vatRates(totals: PeriodTotals) {
  const rates = new Map<
    Scaled,
    { taxRate: Scaled; incomeSubtotal: Scaled; incomeTax: Scaled; expenseSubtotal: Scaled; expenseTax: Scaled }
  >()
  const row = (taxRate: Scaled) =>
    rates.get(taxRate) ??
    rates
      .set(taxRate, { taxRate, incomeSubtotal: 0, incomeTax: 0, expenseSubtotal: 0, expenseTax: 0 })
      .get(taxRate)!

  for (const bucket of totals.income.byRate) {
    Object.assign(row(bucket.taxRate), { incomeSubtotal: bucket.subtotal, incomeTax: bucket.taxAmount })
  }
  for (const bucket of totals.expenses.byRate) {
    Object.assign(row(bucket.taxRate), { expenseSubtotal: bucket.subtotal, expenseTax: bucket.taxAmount })
  }
  return [...rates.values()].sort((a, b) => b.taxRate - a.taxRate)
}
