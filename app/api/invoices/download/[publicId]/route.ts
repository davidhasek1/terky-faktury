import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateInvoicePDF } from "@/lib/pdf-generator"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await params
    const supabase = await createClient()

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        `
        *,
        customer:customers(*)
      `,
      )
      .eq("public_id", publicId)
      .single()

    if (invoiceError || !invoice) {
      console.error("Invoice not found:", invoiceError)
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    const [{ data: items, error: itemsError }, { data: companyDetails }] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id),
      supabase.from("company_details").select("*").eq("user_id", invoice.user_id).maybeSingle(),
    ])

    if (itemsError) {
      console.error("Error fetching items:", itemsError)
      return NextResponse.json({ error: "Error al cargar los artículos de la factura" }, { status: 500 })
    }

    const pdfBuffer = await generateInvoicePDF(invoice, items || [], companyDetails)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="factura-${invoice.invoice_number}.pdf"`,
      },
    })
  } catch (error) {
    console.error("Error in download route:", error)
    return NextResponse.json(
      { error: "Error interno del servidor: " + (error instanceof Error ? error.message : "Error desconocido") },
      { status: 500 },
    )
  }
}
