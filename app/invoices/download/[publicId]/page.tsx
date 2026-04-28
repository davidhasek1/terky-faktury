"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { InvoicePreview } from "@/components/invoices/invoice-preview"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import Link from "next/link"
import type { Invoice, InvoiceItem, CompanyDetails, Customer } from "@/lib/types"

export default function PublicInvoiceDownloadPage() {
  const params = useParams()
  const publicId = params.publicId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    invoice: Invoice & { customer: Customer }
    items: InvoiceItem[]
    companyDetails: CompanyDetails | null
  } | null>(null)

  useEffect(() => {
    async function fetchInvoice() {
      try {
        const response = await fetch(`/api/invoices/public/${publicId}`)

        if (!response.ok) {
          throw new Error("Faktura nenalezena")
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        console.error("Error fetching invoice:", err)
        setError(err instanceof Error ? err.message : "Nepodařilo se načíst fakturu")
      } finally {
        setLoading(false)
      }
    }

    fetchInvoice()
  }, [publicId])

  useEffect(() => {
    if (data?.invoice) {
      document.title = `Faktura ${data.invoice.invoice_number}`
    }
  }, [data])

  if (loading) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-6 text-primary" />
          <p className="font-serif italic text-xl text-muted-foreground">Načítám fakturu…</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mb-4">
            Chyba
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl text-foreground mb-4 leading-tight">
            Faktura <span className="italic text-primary">nenalezena</span>
          </h1>
          <p className="text-muted-foreground">
            {error || "Faktura, kterou hledáte, neexistuje."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background py-10 sm:py-16">
      <div className="container max-w-5xl mx-auto px-4 sm:px-8">
        <header className="mb-8 sm:mb-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mb-3">
              Náhled faktury
            </p>
            <h1 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight">
              Faktura <span className="italic text-primary">{data.invoice.invoice_number}</span>
            </h1>
          </div>
          <Link href={`/api/invoices/download/${publicId}`} target="_blank">
            <Button size="lg" className="text-[11px] uppercase tracking-[0.22em] shadow-none">
              <Download className="mr-2 h-4 w-4" />
              Stáhnout PDF
            </Button>
          </Link>
        </header>

        <InvoicePreview
          invoice={data.invoice}
          items={data.items}
          companyDetails={data.companyDetails}
        />
      </div>
    </div>
  )
}
