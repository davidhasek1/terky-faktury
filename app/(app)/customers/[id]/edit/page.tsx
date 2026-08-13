import { createClient } from "@/lib/supabase/server"
import { CustomerForm } from "@/components/customers/customer-form"
import { Topbar } from "@/components/app-shell/topbar"
import { PageShell } from "@/components/patterns/page-shell"
import { notFound } from "next/navigation"

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customer, error } = await supabase.from("customers").select("*").eq("id", id).single()

  if (error || !customer) {
    notFound()
  }

  return (
    <>
      <Topbar asHeading title={customer.name} />
      <PageShell width="form">
        <CustomerForm customer={customer} />
      </PageShell>
    </>
  )
}
