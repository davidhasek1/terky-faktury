import { createClient } from "@/lib/supabase/server"
import { CustomerForm } from "@/components/customers/customer-form"
import { Topbar } from "@/components/app-shell/topbar"
import { PageHeader } from "@/components/patterns/page-header"
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
      <Topbar title={customer.name} />
      <PageShell width="narrow">
        <PageHeader
          eyebrow="Úprava záznamu"
          title={customer.name}
          description="Uprav údaje zákazníka. Změny se promítnou do nově vystavovaných faktur."
        />
        <CustomerForm customer={customer} />
      </PageShell>
    </>
  )
}
