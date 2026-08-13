import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Topbar } from "@/components/app-shell/topbar"
import { PageShell } from "@/components/patterns/page-shell"
import { ActivityForm } from "@/components/activities/activity-form"

interface PageProps {
  params: Promise<{ clientId: string }>
}

export default async function NewActivityPage(context: PageProps) {
  const { clientId } = await context.params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single()

  if (error || !customer) {
    notFound()
  }

  return (
    <>
      <Topbar asHeading title={customer.name} />
      <PageShell width="form">
        <ActivityForm customerId={clientId} />
      </PageShell>
    </>
  )
}
