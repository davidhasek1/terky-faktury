import { createClient } from "@/lib/supabase/server"
import { InvoiceForm } from "@/components/invoices/invoice-form"
import { Topbar } from "@/components/app-shell/topbar"
import { PageHeader } from "@/components/patterns/page-header"
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
      <Topbar title="Nová faktura" />
      <PageShell width="narrow">
        <PageHeader
          eyebrow="Nový dokument"
          title="Nová faktura"
          description="Vystav fakturu pro zákazníka. Po uložení ji můžeš stáhnout jako PDF nebo poslat e-mailem."
        />
        <InvoiceForm key={resetKey} customers={customers || []} />
      </PageShell>
    </>
  )
}
