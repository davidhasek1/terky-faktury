import { type NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { generateInvoicePDF } from "@/lib/pdf-generator"

export async function GET(request: NextRequest, { params }: { params: { publicId: string } }) {
  try {
    console.log("[v0] Starting PDF download for publicId:", params.publicId)

    const { publicId } = params

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

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
      console.error("[v0] Invoice not found:", invoiceError)
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    console.log("[v0] Invoice found:", invoice.invoice_number)

    const [{ data: items, error: itemsError }, { data: companyDetails }] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id),
      supabase.from("company_details").select("*").eq("user_id", invoice.user_id).maybeSingle(),
    ])

    if (itemsError) {
      console.error("[v0] Error fetching items:", itemsError)
      return NextResponse.json({ error: "Error al cargar los artículos de la factura" }, { status: 500 })
    }

    console.log("[v0] Items found:", items?.length || 0)

    const pdfBuffer = await generateInvoicePDF(invoice, items || [], companyDetails)

    console.log("[v0] PDF generated successfully")

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="factura-${invoice.invoice_number}.pdf"`,
      },
    })
  } catch (error) {
    console.error("[v0] Error in download route:", error)
    return NextResponse.json(
      { error: "Error interno del servidor: " + (error instanceof Error ? error.message : "Error desconocido") },
      { status: 500 },
    )
  }
}
