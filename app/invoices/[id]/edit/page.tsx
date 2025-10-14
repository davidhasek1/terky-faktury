import { createClient } from "@/lib/supabase/server"
import { InvoiceForm } from "@/components/invoices/invoice-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { notFound } from "next/navigation"

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const [{ data: invoice, error: invoiceError }, { data: customers }, { data: items }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", id).eq("user_id", user.id).single(),
    supabase.from("customers").select("*").eq("user_id", user.id).order("name"),
    supabase.from("invoice_items").select("*").eq("invoice_id", id),
  ])

  if (invoiceError || !invoice) {
    notFound()
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>Upravit fakturu</CardTitle>
          <CardDescription>Upravte informace o faktuře</CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceForm customers={customers || []} invoice={invoice} existingItems={items || []} />
        </CardContent>
      </Card>
    </div>
  )
}
