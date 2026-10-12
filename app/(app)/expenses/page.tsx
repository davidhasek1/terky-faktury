import Link from "next/link"
import { ChartColumn, Plus, Receipt } from "lucide-react"

import { Topbar } from "@/components/app-shell/topbar"
import { ExpenseTable } from "@/components/expenses/expense-table"
import { EmptyState } from "@/components/patterns/empty-state"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"
import { StatTile } from "@/components/patterns/stat-tile"
import { PeriodPicker } from "@/components/report/period-picker"
import { Button } from "@/components/ui/button"
import { formatScaled } from "@/lib/money"
import { listExpenses } from "@/lib/services/expenses"
import { buildPeriodReport } from "@/lib/services/period-report"
import { localToday, periodLabel, resolvePeriod } from "@/lib/services/report-period"
import { createServerServiceContext } from "@/lib/services/server-context"

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { period } = resolvePeriod(await searchParams, localToday())
  const ctx = await createServerServiceContext()
  const expenses = await listExpenses(ctx, { date_from: period.from, date_to: period.to })
  // Seznam ukazujeme od nejnovějšího, součty bereme ze stejného výpočtu jako výkaz.
  const report = buildPeriodReport(period, [], expenses)
  const rows = [...report.expenses].reverse()
  const { totals } = report

  const newButton = (
    <Button asChild size="sm">
      <Link href="/expenses/new">
        <Plus className="size-4" />
        Nový náklad
      </Link>
    </Button>
  )

  return (
    <>
      <Topbar title="Náklady" action={newButton} />
      <PageShell>
        <PageHeader
          eyebrow={periodLabel(period)}
          title="Náklady"
          description="Co, kdy a za kolik jsi zaplatila. Náklady se promítají do výkazu za období."
          actions={
            <Button asChild variant="outline">
              <Link href={`/report?from=${period.from}&to=${period.to}`}>
                <ChartColumn className="size-4" />
                Výkaz za období
              </Link>
            </Button>
          }
        />

        <div className="mb-6">
          <PeriodPicker key={`${period.from}-${period.to}`} period={period} />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Nákladů" value={String(totals.expenses.count)} />
          <StatTile label="Základ bez IVA" value={formatScaled(totals.expenses.subtotal)} />
          <StatTile label="IVA" value={formatScaled(totals.expenses.tax)} />
          <StatTile label="Celkem" value={formatScaled(totals.expenses.total)} />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-8" />}
            title="V tomhle období žádné náklady."
            description="Zapiš nákup, pohonné hmoty, telefon nebo odvody a objeví se tady i ve výkazu."
            action={newButton}
          />
        ) : (
          <ExpenseTable expenses={rows} totals={totals.expenses} editable />
        )}
      </PageShell>
    </>
  )
}
