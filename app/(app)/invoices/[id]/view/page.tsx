import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Download, ArrowLeft, CheckCircle, Mail } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Topbar } from "@/components/app-shell/topbar"
import { PageShell } from "@/components/patterns/page-shell"
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
    <>
      <Topbar
        title={`Faktura ${invoice.invoice_number}`}
        action={
          <div className="flex items-center gap-2">
            {!invoice.paid_date && <MarkAsPaidButton invoiceId={invoice.id} />}
            <form action={`/api/invoices/${id}/pdf`} method="GET">
              <Button type="submit" size="sm">
                <Download className="size-4" />
                Stáhnout PDF
              </Button>
            </form>
          </div>
        }
      />
      <PageShell>
        <Button
          variant="ghost"
          asChild
          className="-ml-3 mb-6 text-muted-foreground hover:text-foreground"
        >
          <Link href="/invoices">
            <ArrowLeft className="size-4" />
            Zpět na faktury
          </Link>
        </Button>

        {(invoice.paid_date || invoice.email_sent_at) && (
          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {invoice.paid_date && (
              <div className="flex items-center gap-3 rounded-lg border border-status-settled-line/30 bg-status-settled-bg px-5 py-4">
                <CheckCircle className="size-4 shrink-0 text-status-settled-fg" />
                <p className="text-sm text-status-settled-fg">
                  <span className="mr-2 text-xs text-status-settled-fg/70">Zaplaceno</span>
                  {new Date(invoice.paid_date).toLocaleDateString("cs-CZ")}
                </p>
              </div>
            )}
            {invoice.email_sent_at && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 px-5 py-4">
                <Mail className="size-4 shrink-0 text-primary" />
                <p className="text-sm text-foreground">
                  <span className="mr-2 text-xs text-muted-foreground">E-mail</span>
                  <DateTimeDisplay date={invoice.email_sent_at} />
                </p>
              </div>
            )}
          </div>
        )}

        <InvoicePreview invoice={invoice} items={items || []} companyDetails={companyDetails} />
      </PageShell>
    </>
  )
}
