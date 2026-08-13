import Link from "next/link"
import { ArrowUpRight, Users } from "lucide-react"

import { Topbar } from "@/components/app-shell/topbar"
import { EmptyState } from "@/components/patterns/empty-state"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/server"

export default async function ActivitiesIndexPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const [customersResult, unpaidResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase
      .from("activities")
      .select("customer_id")
      .eq("user_id", user.id)
      .eq("status", "unpaid"),
  ])

  if (customersResult.error) {
    console.error("[activities] Nepodařilo se načíst zákazníky:", customersResult.error)
  }
  if (unpaidResult.error) {
    console.error("[activities] Nepodařilo se načíst nezaplacené aktivity:", unpaidResult.error)
  }

  const customers = customersResult.data ?? []
  const unpaidRows = unpaidResult.data ?? []
  const unpaidCountByCustomer = new Map<string, number>()
  for (const row of unpaidRows) {
    unpaidCountByCustomer.set(
      row.customer_id,
      (unpaidCountByCustomer.get(row.customer_id) ?? 0) + 1,
    )
  }

  return (
    <>
      <Topbar title="Aktivity" />
      <PageShell>
        <PageHeader
          eyebrow="Deník služeb"
          title="Aktivity u klientů"
          description="Vyber klienta pro zobrazení deníku odvedené práce a stavu plateb."
        />

        {customers.length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" />}
            title="Žádní zákazníci."
            description="Nejprve přidej zákazníka v sekci Zákazníci, pak se sem můžeš vrátit."
          />
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border bg-card">
            {customers.map((customer) => {
              const unpaid = unpaidCountByCustomer.get(customer.id) ?? 0
              return (
                <li key={customer.id}>
                  <Link
                    href={`/activities/${customer.id}`}
                    className="group flex items-center justify-between gap-4 px-6 py-5 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg text-foreground">
                        {customer.name}
                      </p>
                      {customer.email && (
                        <p className="truncate text-xs text-muted-foreground">{customer.email}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      {unpaid > 0 ? (
                        <Badge variant="secondary">{unpaid} nezaplaceno</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">
                          Bez nezaplacených
                        </span>
                      )}
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </PageShell>
    </>
  )
}
