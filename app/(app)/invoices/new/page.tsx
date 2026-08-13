import { createClient } from "@/lib/supabase/server"
import { InvoiceForm } from "@/components/invoices/invoice-form"
import { Topbar } from "@/components/app-shell/topbar"
import { PageShell } from "@/components/patterns/page-shell"

export default async function NewInvoicePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .order("name")

  const resetKey = Math.random()

  return (
    <>
      <Topbar asHeading title="Nová faktura" />
      <PageShell width="form">
        <InvoiceForm key={resetKey} customers={customers || []} />
      </PageShell>
    </>
  )
}
