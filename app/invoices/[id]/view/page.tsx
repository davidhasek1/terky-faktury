import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, ArrowLeft, CheckCircle } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { InvoicePreview } from "@/components/invoices/invoice-preview"
import { MarkAsPaidButton } from "@/components/invoices/mark-as-paid-button"
import { DateTimeDisplay } from "@/components/ui/date-time-display"

export default async function ViewInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `
      *,
      customer:customers(*)
    `,
    )
    .eq("id", id)
    .single()

  if (invoiceError || !invoice) {
    notFound()
  }

  const [{ data: items }, { data: companyDetails }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id),
    supabase.from("company_details").select("*").eq("user_id", invoice.user_id).maybeSingle(),
  ])

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" asChild>
          <Link href="/invoices">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zpět na faktury
          </Link>
        </Button>
        <div className="flex gap-2">
          {!invoice.paid_date && <MarkAsPaidButton invoiceId={invoice.id} />}
          <form action={`/api/invoices/${id}/pdf`} method="GET">
            <Button type="submit">
              <Download className="mr-2 h-4 w-4" />
              Stáhnout PDF
            </Button>
          </form>
        </div>
      </div>

      {invoice.paid_date && (
        <Card className="mb-6 bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">
                Faktura byla zaplacena dne {new Date(invoice.paid_date).toLocaleDateString("cs-CZ")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {invoice.email_sent_at && (
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-blue-700">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">
                Email byl odeslán <DateTimeDisplay date={invoice.email_sent_at} />
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <InvoicePreview invoice={invoice} items={items || []} companyDetails={companyDetails} />
    </div>
  )
}
