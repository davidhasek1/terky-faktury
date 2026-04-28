import { createClient } from "@/lib/supabase/server"
import { InvoiceForm } from "@/components/invoices/invoice-form"
import { PageHeader } from "@/components/layout/page-header"

export default async function NewInvoicePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const [{ data: customers }, { data: invoices }] = await Promise.all([
    supabase.from("customers").select("*").eq("user_id", user.id).order("name"),
    supabase.from("invoices").select("invoice_number").eq("user_id", user.id).order("created_at", { ascending: false }),
  ])

  const resetKey = Math.random()

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-5xl">
      <PageHeader
        eyebrow="Nový dokument"
        title={
          <>
            Nová <span className="italic text-primary">faktura</span>
          </>
        }
        description="Vystavte fakturu pro zákazníka. Po uložení ji můžete stáhnout jako PDF nebo poslat e-mailem."
      />
      <InvoiceForm key={resetKey} customers={customers || []} existingInvoices={invoices || []} />
    </div>
  )
}
