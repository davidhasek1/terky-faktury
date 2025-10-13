import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { generateInvoicePDF } from "@/lib/pdf-generator"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const supabase = await createClient()

  try {
    const [{ data: invoice, error: invoiceError }, { data: items }] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          `
        *,
        customer:customers(*)
      `,
        )
        .eq("id", id)
        .single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id),
    ])

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Faktura nenalezena" }, { status: 404 })
    }

    const pdfBuffer = await generateInvoicePDF(invoice, items || [])

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="faktura-${invoice.invoice_number}.pdf"`,
      },
    })
  } catch (error) {
    console.error("[v0] Error generating PDF:", error)
    return NextResponse.json({ error: "Nepodařilo se vygenerovat PDF" }, { status: 500 })
  }
}
