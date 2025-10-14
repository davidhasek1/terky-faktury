import { createClient } from "@/lib/supabase/server"
import { InvoiceForm } from "@/components/invoices/invoice-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function NewInvoicePage() {
  const supabase = await createClient()

  const [{ data: customers }, { data: invoices }] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    supabase.from("invoices").select("invoice_number").order("created_at", { ascending: false }),
  ])

  const resetKey = Math.random()

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>Nová faktura</CardTitle>
          <CardDescription>Vytvořte novou fakturu pro zákazníka</CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceForm key={resetKey} customers={customers || []} existingInvoices={invoices || []} />
        </CardContent>
      </Card>
    </div>
  )
}
