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
          throw new Error("Factura no encontrada")
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        console.error("Error fetching invoice:", err)
        setError(err instanceof Error ? err.message : "Error al cargar la factura")
      } finally {
        setLoading(false)
      }
    }

    fetchInvoice()
  }, [publicId])

  useEffect(() => {
    if (data?.invoice) {
      document.title = `Factura ${data.invoice.invoice_number}`
    }
  }, [data])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Cargando factura...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Factura no encontrada</h1>
          <p className="text-muted-foreground">{error || "La factura que buscas no existe"}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Factura {data.invoice.invoice_number}</h1>
            <p className="text-muted-foreground">Vista previa de la factura</p>
          </div>
          <Link href={`/api/invoices/download/${publicId}`} target="_blank">
            <Button size="lg">
              <Download className="mr-2 h-5 w-5" />
              Descargar PDF
            </Button>
          </Link>
        </div>

        <InvoicePreview invoice={data.invoice} items={data.items} companyDetails={data.companyDetails} />
      </div>
    </div>
  )
}
