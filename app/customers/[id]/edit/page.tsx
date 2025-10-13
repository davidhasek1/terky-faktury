import { createClient } from "@/lib/supabase/server"
import { CustomerForm } from "@/components/customers/customer-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { notFound } from "next/navigation"

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customer, error } = await supabase.from("customers").select("*").eq("id", id).single()

  if (error || !customer) {
    notFound()
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Upravit zákazníka</CardTitle>
          <CardDescription>Upravte informace o zákazníkovi</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerForm customer={customer} />
        </CardContent>
      </Card>
    </div>
  )
}
