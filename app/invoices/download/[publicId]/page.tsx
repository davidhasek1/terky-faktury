import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { InvoicePreview } from "@/components/invoices/invoice-preview"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import Link from "next/link"

export default async function PublicInvoiceDownloadPage({ params }: { params: { publicId: string } }) {
  const supabase = await createClient()

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*, customer:customers(*)")
    .eq("public_id", params.publicId)
    .single()

  if (invoiceError || !invoice) {
    notFound()
  }

  const [{ data: items, error: itemsError }, { data: companyDetails }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("created_at", { ascending: true }),
    supabase.from("company_details").select("*").eq("user_id", invoice.user_id).single(),
  ])

  if (itemsError) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Factura {invoice.invoice_number}</h1>
            <p className="text-muted-foreground">Vista previa de la factura</p>
          </div>
          <Link href={`/api/invoices/download/${params.publicId}`} target="_blank">
            <Button size="lg">
              <Download className="mr-2 h-5 w-5" />
              Descargar PDF
            </Button>
          </Link>
        </div>

        <InvoicePreview invoice={invoice} items={items || []} companyDetails={companyDetails} />
      </div>
    </div>
  )
}
