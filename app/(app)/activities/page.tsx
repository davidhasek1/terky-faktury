import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import { ArrowUpRight } from "lucide-react"

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
    console.error("[v0] Error fetching customers:", customersResult.error)
  }
  if (unpaidResult.error) {
    console.error("[v0] Error fetching unpaid activities:", unpaidResult.error)
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
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-6xl">
      <PageHeader
        eyebrow="Deník služeb"
        title={
          <>
            Aktivity <span className="text-primary">u klientů</span>
          </>
        }
        description="Vyberte klienta pro zobrazení deníku odvedené práce a stavu plateb."
      />

      {customers.length === 0 ? (
        <div className="border border-border bg-card px-6 py-20 text-center">
          <p className="font-serif text-2xl text-muted-foreground mb-6">
            Žádní zákazníci.
          </p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Nejprve přidejte zákazníka v sekci Zákazníci, pak se sem můžete vrátit.
          </p>
        </div>
      ) : (
        <ul className="border border-border bg-card divide-y divide-border/60">
          {customers.map((customer) => {
            const unpaid = unpaidCountByCustomer.get(customer.id) ?? 0
            return (
              <li key={customer.id}>
                <Link
                  href={`/activities/${customer.id}`}
                  className="group flex items-center justify-between gap-4 px-6 py-5 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-serif text-xl text-foreground truncate">
                      {customer.name}
                    </p>
                    {customer.email && (
                      <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {unpaid > 0 ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase tracking-[0.18em] font-medium"
                      >
                        {unpaid} nezaplaceno
                      </Badge>
                    ) : (
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                        Bez nezaplacených
                      </span>
                    )}
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
