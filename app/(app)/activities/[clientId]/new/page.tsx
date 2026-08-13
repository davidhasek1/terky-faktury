import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
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
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-4xl">
      <PageHeader
        eyebrow="Nová aktivita"
        title={
          <>
            {customer.name}
          </>
        }
        description="Zaznamenejte odvedené služby pro tohoto klienta."
      />
      <ActivityForm customerId={clientId} />
    </div>
  )
}
