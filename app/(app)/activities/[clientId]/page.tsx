import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus, Pencil } from "lucide-react"
import { notFound } from "next/navigation"
import { Topbar } from "@/components/app-shell/topbar"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"
import { ActivityListTable } from "@/components/activities/activity-list-table"
import { ActivityStatusFilter } from "@/components/activities/activity-status-filter"
import type { Activity } from "@/lib/types"

interface PageProps {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ status?: string }>
}

export default async function ClientDiaryPage(context: PageProps) {
  const { clientId } = await context.params
  const { status: rawStatus } = await context.searchParams
  const statusFilter: "all" | "unpaid" | "paid" =
    rawStatus === "unpaid" || rawStatus === "paid" ? rawStatus : "all"

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single()

  if (customerError || !customer) {
    notFound()
  }

  let query = supabase
    .from("activities")
    .select("*, services:activity_services(*)")
    .eq("user_id", user.id)
    .eq("customer_id", clientId)
    .order("activity_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter)
  }

  const { data: activitiesData, error: activitiesError } = await query
  if (activitiesError) {
    console.error("[activities] Nepodařilo se načíst aktivity:", activitiesError)
  }

  const activities = (activitiesData ?? []) as Activity[]

  return (
    <>
      <Topbar
        title={customer.name}
        action={
          <Button asChild size="sm">
            <Link href={`/activities/${clientId}/new`}>
              <Plus className="size-4" />
              Nová aktivita
            </Link>
          </Button>
        }
      />
      <PageShell>
        <PageHeader
          eyebrow="Deník klienta"
          title={customer.name}
          description={
            [customer.email, customer.phone, customer.address].filter(Boolean).join(" · ") ||
            undefined
          }
          actions={
            <Button asChild variant="outline">
              <Link href={`/customers/${clientId}/edit`}>
                <Pencil className="size-4" />
                Upravit klienta
              </Link>
            </Button>
          }
        />

        <div className="mb-6 flex items-center justify-between gap-4">
          <ActivityStatusFilter customerId={clientId} current={statusFilter} />
        </div>

        <ActivityListTable customerId={clientId} activities={activities} />
      </PageShell>
    </>
  )
}
