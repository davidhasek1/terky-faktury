import Link from "next/link"
import { FileText, Plus } from "lucide-react"

import { Topbar } from "@/components/app-shell/topbar"
import { InvoiceActions } from "@/components/invoices/invoice-actions"
import { InvoiceFilters } from "@/components/invoices/invoice-filters"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { DataTable, Dash, TableCell, TableHead } from "@/components/patterns/data-table"
import { EmptyState } from "@/components/patterns/empty-state"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"
import { StatTile } from "@/components/patterns/stat-tile"
import { Button } from "@/components/ui/button"
import { DateTimeDisplay } from "@/components/ui/date-time-display"
import { createClient } from "@/lib/supabase/server"
import { invoiceStatus } from "@/lib/services/invoices"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

const FILTER_LABEL: Record<string, string> = {
  paid: "Zaplacené",
  unpaid: "Nezaplacené",
  overdue: "Po splatnosti",
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  let query = supabase
    .from("invoices")
    .select("*, customer:customers(name, email)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (params.status === "paid") query = query.not("paid_date", "is", null)
  else if (params.status === "unpaid") query = query.is("paid_date", null)
  else if (params.status === "overdue") {
    query = query.is("paid_date", null).lt("due_date", new Date().toISOString().split("T")[0])
  }

  const [{ data: invoices, error }, { data: allInvoices }] = await Promise.all([
    query,
    supabase.from("invoices").select("total, paid_date, due_date").eq("user_id", user.id),
  ])

  if (error) console.error("[invoices] load failed:", error)

  const all = allInvoices ?? []
  const paid = all.filter((i) => i.paid_date)
  const unpaid = all.filter((i) => !i.paid_date)
  const overdue = unpaid.filter((i) => invoiceStatus(i) === "overdue")
  const rows = invoices ?? []

  return (
    <>
      <Topbar
        title="Faktury"
        action={
          <Button asChild size="sm">
            <Link href="/invoices/new">
              <Plus className="size-4" />
              Nová faktura
            </Link>
          </Button>
        }
      />
      <PageShell>
        <PageHeader
          eyebrow={params.status ? FILTER_LABEL[params.status] : undefined}
          title="Faktury"
          description="Vystavuj, sleduj a posílej faktury zákazníkům."
        />

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Celkem"
            value={String(all.length)}
            meta={formatCurrency(all.reduce((s, i) => s + i.total, 0))}
          />
          <StatTile
            label="Zaplaceno"
            value={String(paid.length)}
            meta={formatCurrency(paid.reduce((s, i) => s + i.total, 0))}
            tone="settled"
          />
          <StatTile
            label="Nezaplaceno"
            value={String(unpaid.length)}
            meta={formatCurrency(unpaid.reduce((s, i) => s + i.total, 0))}
            tone="due"
          />
          <StatTile
            label="Po splatnosti"
            value={String(overdue.length)}
            meta={overdue.length > 0 ? "Vyžaduje pozornost" : "Vše v pořádku"}
            tone={overdue.length > 0 ? "overdue" : "neutral"}
          />
        </div>

        <div className="mb-4 flex justify-end">
          <InvoiceFilters currentStatus={params.status} />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-8" />}
            title={params.status ? "Pro tenhle filtr tu nic není." : "Zatím žádné faktury."}
            description="Vystav první fakturu a objeví se tady i na časové ose."
            action={
              <Button asChild>
                <Link href="/invoices/new">
                  <Plus className="size-4" />
                  Vystavit fakturu
                </Link>
              </Button>
            }
          />
        ) : (
          <DataTable
            head={
              <>
                <TableHead>Číslo</TableHead>
                <TableHead>Zákazník</TableHead>
                <TableHead>Vystavena</TableHead>
                <TableHead>Splatná</TableHead>
                <TableHead>Odesláno</TableHead>
                <TableHead align="right">Částka</TableHead>
                <TableHead>Stav</TableHead>
                <TableHead align="right">Akce</TableHead>
              </>
            }
          >
            {rows.map((invoice) => {
              const status = invoiceStatus(invoice)
              return (
                <tr
                  key={invoice.id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    status === "overdue" && "border-l-2 border-l-status-overdue-line",
                  )}
                >
                  <TableCell>
                    <Link
                      href={`/invoices/${invoice.id}/view`}
                      className="font-ident text-sm text-foreground hover:text-primary"
                    >
                      {invoice.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.customer?.name || <Dash />}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.issue_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.due_date)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {invoice.email_sent_at ? (
                      <DateTimeDisplay date={invoice.email_sent_at} />
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <span className="font-display font-semibold tabular-nums">
                      {formatCurrency(invoice.total)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={status} />
                  </TableCell>
                  <TableCell align="right">
                    <InvoiceActions
                      invoiceId={invoice.id}
                      isPaid={!!invoice.paid_date}
                      customerEmail={invoice.customer?.email}
                    />
                  </TableCell>
                </tr>
              )
            })}
          </DataTable>
        )}
      </PageShell>
    </>
  )
}
