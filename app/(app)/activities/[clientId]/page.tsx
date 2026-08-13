import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus, Pencil } from "lucide-react"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
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
    console.error("[v0] Error fetching activities:", activitiesError)
  }

  const activities = (activitiesData ?? []) as Activity[]

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-6xl">
      <PageHeader
        eyebrow="Deník klienta"
        title={
          <>
            {customer.name}
          </>
        }
        description={
          [customer.email, customer.phone, customer.address].filter(Boolean).join(" · ") ||
          undefined
        }
        actions={
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="outline"
              className="text-[11px] uppercase tracking-[0.22em] shadow-none"
            >
              <Link href={`/customers/${clientId}/edit`}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Upravit klienta
              </Link>
            </Button>
            <Button
              asChild
              className="text-[11px] uppercase tracking-[0.22em] shadow-none"
            >
              <Link href={`/activities/${clientId}/new`}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Nová aktivita
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex items-center justify-between gap-4">
        <ActivityStatusFilter customerId={clientId} current={statusFilter} />
      </div>

      <ActivityListTable customerId={clientId} activities={activities} />
    </div>
  )
}
