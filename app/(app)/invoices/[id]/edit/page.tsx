import { createClient } from "@/lib/supabase/server"
import { InvoiceForm } from "@/components/invoices/invoice-form"
import { Topbar } from "@/components/app-shell/topbar"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"
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
    <>
      <Topbar title={`Faktura ${invoice.invoice_number}`} />
      <PageShell width="narrow">
        <PageHeader
          eyebrow="Úprava faktury"
          title={`Faktura ${invoice.invoice_number}`}
          description="Uprav údaje, položky nebo poznámku. Změny se uloží po stisku tlačítka."
        />
        <InvoiceForm customers={customers || []} invoice={invoice} existingItems={items || []} />
      </PageShell>
    </>
  )
}
