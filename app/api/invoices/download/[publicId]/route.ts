import { NextResponse, type NextRequest } from "next/server"

import { generateInvoicePDF } from "@/lib/pdf-generator"
import { getPublicInvoice } from "@/lib/services/public-invoice"

/** Veřejné stažení PDF faktury podle neuhodnutelného `public_id`. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params

  try {
    const data = await getPublicInvoice(publicId)

    if (!data || !data.invoice.customer) {
      return NextResponse.json({ error: "Faktura nenalezena" }, { status: 404 })
    }

    const pdfBuffer = await generateInvoicePDF(
      { ...data.invoice, customer: data.invoice.customer },
      data.items,
      data.companyDetails,
    )

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="faktura-${data.invoice.invoice_number}.pdf"`,
      },
    })
  } catch (error) {
    console.error("[public-download] Nepodařilo se vygenerovat PDF:", error)
    return NextResponse.json({ error: "Nepodařilo se vygenerovat PDF" }, { status: 500 })
  }
}
