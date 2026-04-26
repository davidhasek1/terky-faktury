import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { generateInvoicePDF } from "@/lib/pdf-generator"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  try {
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
      return NextResponse.json({ error: "Faktura nenalezena" }, { status: 404 })
    }

    const [{ data: items }, { data: companyDetails }] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", id),
      supabase.from("company_details").select("*").eq("user_id", invoice.user_id).maybeSingle(),
    ])

    const pdfBuffer = await generateInvoicePDF(invoice, items || [], companyDetails)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="faktura-${invoice.invoice_number}.pdf"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch (error) {
    console.error("Error generating PDF:", error)
    return NextResponse.json({ error: "Nepodařilo se vygenerovat PDF" }, { status: 500 })
  }
}
