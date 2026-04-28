import { createClient } from "@/lib/supabase/server"
import { CustomerForm } from "@/components/customers/customer-form"
import { PageHeader } from "@/components/layout/page-header"
import { notFound } from "next/navigation"

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customer, error } = await supabase.from("customers").select("*").eq("id", id).single()

  if (error || !customer) {
    notFound()
  }

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-3xl">
      <PageHeader
        eyebrow="Úprava záznamu"
        title={
          <>
            <span className="italic">{customer.name}</span>
          </>
        }
        description="Upravte údaje zákazníka. Změny se promítnou do nově vystavovaných faktur."
      />
      <CustomerForm customer={customer} />
    </div>
  )
}
