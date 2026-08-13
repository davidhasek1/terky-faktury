import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Download, ArrowLeft, CheckCircle, Mail } from "lucide-react"
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
    <div className="container mx-auto py-8 sm:py-12 px-4 sm:px-8 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 sm:mb-10">
        <Button
          variant="ghost"
          asChild
          className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground -ml-3"
        >
          <Link href="/invoices">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            Zpět na faktury
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {!invoice.paid_date && <MarkAsPaidButton invoiceId={invoice.id} />}
          <form action={`/api/invoices/${id}/pdf`} method="GET">
            <Button type="submit" className="text-[11px] uppercase tracking-[0.22em] shadow-none">
              <Download className="mr-2 h-3.5 w-3.5" />
              Stáhnout PDF
            </Button>
          </form>
        </div>
      </div>

      {(invoice.paid_date || invoice.email_sent_at) && (
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {invoice.paid_date && (
            <div className="flex items-center gap-3 border border-status-settled-line/30 bg-status-settled-bg px-5 py-4">
              <CheckCircle className="h-4 w-4 text-status-settled-fg shrink-0" />
              <p className="text-sm text-status-settled-fg">
                <span className="text-[10px] uppercase tracking-[0.22em] text-status-settled-fg/70 mr-2">
                  Zaplaceno
                </span>
                {new Date(invoice.paid_date).toLocaleDateString("cs-CZ")}
              </p>
            </div>
          )}
          {invoice.email_sent_at && (
            <div className="flex items-center gap-3 border border-border bg-secondary/50 px-5 py-4">
              <Mail className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm text-foreground">
                <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mr-2">
                  E-mail
                </span>
                <DateTimeDisplay date={invoice.email_sent_at} />
              </p>
            </div>
          )}
        </div>
      )}

      <InvoicePreview invoice={invoice} items={items || []} companyDetails={companyDetails} />
    </div>
  )
}
