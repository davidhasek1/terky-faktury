import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Plus, ArrowUpRight, FileText } from "lucide-react"
import Link from "next/link"
import { InvoiceActions } from "@/components/invoices/invoice-actions"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { invoiceStatus } from "@/lib/services/invoices"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { InvoiceFilters } from "@/components/invoices/invoice-filters"
import { DateTimeDisplay } from "@/components/ui/date-time-display"
import { PageHeader } from "@/components/layout/page-header"
import { SectionLabel } from "@/components/layout/section-label"

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

  if (!user) {
    return null
  }

  let query = supabase
    .from("invoices")
    .select(
      `
      *,
      customer:customers(name, email)
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (params.status === "paid") {
    query = query.not("paid_date", "is", null)
  } else if (params.status === "unpaid") {
    query = query.is("paid_date", null)
  } else if (params.status === "overdue") {
    query = query.is("paid_date", null).lt("due_date", new Date().toISOString().split("T")[0])
  }

  const { data: invoices, error } = await query

  if (error) {
    console.error("[v0] Error fetching invoices:", error)
  }

  const { data: allInvoices } = await supabase.from("invoices").select("*").eq("user_id", user.id)
  const stats = {
    total: allInvoices?.length || 0,
    paid: allInvoices?.filter((inv) => inv.paid_date).length || 0,
    unpaid: allInvoices?.filter((inv) => !inv.paid_date).length || 0,
    overdue: allInvoices?.filter((inv) => !inv.paid_date && new Date(inv.due_date) < new Date()).length || 0,
    totalAmount: allInvoices?.reduce((sum, inv) => sum + inv.total, 0) || 0,
    paidAmount: allInvoices?.filter((inv) => inv.paid_date).reduce((sum, inv) => sum + inv.total, 0) || 0,
    unpaidAmount: allInvoices?.filter((inv) => !inv.paid_date).reduce((sum, inv) => sum + inv.total, 0) || 0,
  }

  const statItems = [
    {
      label: "Celkem faktur",
      value: stats.total.toString(),
      meta: formatCurrency(stats.totalAmount),
      tone: "neutral" as const,
    },
    {
      label: "Zaplaceno",
      value: stats.paid.toString(),
      meta: formatCurrency(stats.paidAmount),
      tone: "positive" as const,
    },
    {
      label: "Nezaplaceno",
      value: stats.unpaid.toString(),
      meta: formatCurrency(stats.unpaidAmount),
      tone: "pending" as const,
    },
    {
      label: "Po splatnosti",
      value: stats.overdue.toString(),
      meta: stats.overdue > 0 ? "Vyžaduje pozornost" : "Vše v pořádku",
      tone: stats.overdue > 0 ? ("danger" as const) : ("neutral" as const),
    },
  ]

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-6xl">
      <PageHeader
        eyebrow={params.status ? `Filtr — ${labelFor(params.status)}` : "Všechny záznamy"}
        title={
          <>
            Tvoje <span className="text-primary">faktury</span>
          </>
        }
        description="Vystavujte, sledujte a posílejte faktury zákazníkům. Vše přehledně na jednom místě."
        actions={
          <Button asChild className="text-[11px] uppercase tracking-[0.22em] shadow-none">
            <Link href="/invoices/new">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Nová faktura
            </Link>
          </Button>
        }
      />

      <section className="mb-12 sm:mb-16">
        <SectionLabel number="01" title="Souhrn" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
          {statItems.map((item) => (
            <div key={item.label} className="bg-card px-5 py-7 sm:px-7 sm:py-9">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
                {item.label}
              </p>
              <p
                className={cn(
                  "font-serif text-3xl sm:text-4xl leading-none mb-2 tabular-nums",
                  toneClass(item.tone),
                )}
              >
                {item.value}
              </p>
              <p className="text-xs text-muted-foreground">{item.meta}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-6 sm:mb-8 gap-4">
          <SectionLabelInline number="02" title="Seznam" />
          <InvoiceFilters currentStatus={params.status} />
        </div>

        {!invoices || invoices.length === 0 ? (
          <div className="border border-border bg-card px-6 py-20 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/50 mb-6" />
            <p className="font-serif text-2xl text-muted-foreground mb-6">
              {params.status ? "Žádný záznam pro tento filtr." : "Zatím prázdno."}
            </p>
            <Button
              asChild
              variant="outline"
              className="bg-transparent text-[11px] uppercase tracking-[0.22em]"
            >
              <Link href="/invoices/new">
                Vytvořit první fakturu
                <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <Th>Číslo</Th>
                  <Th>Zákazník</Th>
                  <Th>Vystavena</Th>
                  <Th>Splatná</Th>
                  <Th>Proplacena</Th>
                  <Th>Email</Th>
                  <Th align="right">Částka</Th>
                  <Th>Stav</Th>
                  <Th align="right">Akce</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice, idx) => {
                  const status = invoiceStatus(invoice)
                  return (
                  <tr
                    key={invoice.id}
                    className={cn(
                      idx !== invoices.length - 1 && "border-b border-border/60",
                      // Pruh u levého okraje, ať je řádek po splatnosti vidět
                      // i bez čtení sloupce se stavem.
                      status === "overdue" && "border-l-2 border-l-rose-500",
                    )}
                  >
                    <Td>
                      <Link
                        href={`/invoices/${invoice.id}/view`}
                        className="font-serif text-lg text-foreground hover:text-primary transition-colors"
                      >
                        {invoice.invoice_number}
                      </Link>
                    </Td>
                    <Td>{invoice.customer?.name || <Dash />}</Td>
                    <Td className="text-muted-foreground">{formatDate(invoice.issue_date)}</Td>
                    <Td className="text-muted-foreground">{formatDate(invoice.due_date)}</Td>
                    <Td className="text-muted-foreground">
                      {invoice.paid_date ? formatDate(invoice.paid_date) : <Dash />}
                    </Td>
                    <Td className="text-muted-foreground text-xs">
                      {invoice.email_sent_at ? <DateTimeDisplay date={invoice.email_sent_at} /> : <Dash />}
                    </Td>
                    <Td align="right">
                      <span className="font-serif text-base text-foreground tabular-nums">
                        {formatCurrency(invoice.total)}
                      </span>
                    </Td>
                    <Td>
                      <InvoiceStatusBadge status={status} />
                    </Td>
                    <Td align="right">
                      <InvoiceActions
                        invoiceId={invoice.id}
                        isPaid={!!invoice.paid_date}
                        customerEmail={invoice.customer?.email}
                      />
                    </Td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function toneClass(tone: "positive" | "pending" | "danger" | "neutral") {
  switch (tone) {
    case "positive":
      return "text-emerald-700"
    case "pending":
      return "text-amber-700"
    case "danger":
      return "text-rose-700 italic"
    default:
      return "text-foreground"
  }
}

function labelFor(status: string) {
  switch (status) {
    case "paid":
      return "Zaplaceno"
    case "unpaid":
      return "Nezaplaceno"
    case "overdue":
      return "Po splatnosti"
    default:
      return "Vše"
  }
}

function SectionLabelInline({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-4 min-w-0 flex-1">
      <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-medium tabular-nums">
        {number}
      </span>
      <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground" aria-hidden="true">
        —
      </span>
      <span className="font-serif text-xl sm:text-2xl text-foreground">{title}</span>
      <span className="flex-1 h-px bg-border" aria-hidden="true" />
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={
        "text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground py-4 px-5 " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align,
  className = "",
}: {
  children: React.ReactNode
  align?: "right"
  className?: string
}) {
  return (
    <td
      className={
        "py-5 px-5 text-sm text-foreground " +
        (align === "right" ? "text-right " : "") +
        className
      }
    >
      {children}
    </td>
  )
}

function Dash() {
  return <span className="text-muted-foreground/50">—</span>
}
