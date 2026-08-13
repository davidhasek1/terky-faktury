import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { ActivityForm } from "@/components/activities/activity-form"
import type { Activity, ActivityService } from "@/lib/types"

interface PageProps {
  params: Promise<{ clientId: string; activityId: string }>
}

export default async function EditActivityPage(context: PageProps) {
  const { clientId, activityId } = await context.params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single()

  if (customerError || !customer) {
    notFound()
  }

  const { data: activityData, error: activityError } = await supabase
    .from("activities")
    .select("*, services:activity_services(*)")
    .eq("id", activityId)
    .eq("customer_id", clientId)
    .eq("user_id", user.id)
    .single()

  if (activityError || !activityData) {
    notFound()
  }

  const activity = activityData as Activity
  const existingServices: ActivityService[] = activity.services ?? []

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-4xl">
      <PageHeader
        eyebrow="Upravit aktivitu"
        title={
          <>
            {customer.name}
          </>
        }
        description="Upravte zaznamenané služby a datum aktivity."
      />
      <ActivityForm
        customerId={clientId}
        activity={activity}
        existingServices={existingServices}
      />
    </div>
  )
}
