import Link from "next/link"
import { FileText, Plus, Users } from "lucide-react"

import { Topbar } from "@/components/app-shell/topbar"
import { DueTimeline, type TimelineInvoice } from "@/components/invoices/due-timeline"
import { PageShell } from "@/components/patterns/page-shell"
import { StatTile } from "@/components/patterns/stat-tile"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency } from "@/lib/utils"

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: invoices }, { count: customerCount }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, total, due_date, paid_date, customer:customers(name)")
      .eq("user_id", user.id)
      .order("due_date", { ascending: true })
      .returns<TimelineInvoice[]>(),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ])

  const rows = invoices ?? []
  const today = new Date()
  const unpaid = rows.filter((r) => !r.paid_date)
  const paid = rows.filter((r) => r.paid_date)

  return (
    <>
      <Topbar
        title="Přehled"
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
        <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-foreground">
          Vítej zpátky, Terko.
        </h1>

        <DueTimeline invoices={rows} today={today} />

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Čeká na platbu"
            value={formatCurrency(unpaid.reduce((s, r) => s + r.total, 0))}
            meta={`${unpaid.length} nezaplacených`}
            tone="due"
          />
          <StatTile
            label="Zaplaceno celkem"
            value={formatCurrency(paid.reduce((s, r) => s + r.total, 0))}
            meta={`${paid.length} faktur`}
            tone="settled"
          />
          <StatTile label="Faktur celkem" value={String(rows.length)} />
          <StatTile label="Zákazníků" value={String(customerCount ?? 0)} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/invoices">
              <FileText className="size-4" />
              Všechny faktury
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/customers/new">
              <Users className="size-4" />
              Přidat zákazníka
            </Link>
          </Button>
        </div>
      </PageShell>
    </>
  )
}
