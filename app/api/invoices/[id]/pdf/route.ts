import { NextResponse } from "next/server"

import { generateInvoicePDF } from "@/lib/pdf-generator"
import { isServiceError, ServiceError } from "@/lib/services/errors"
import { getCompanyDetailsForInvoice, getInvoice } from "@/lib/services/invoices"
import { createServerServiceContext, serviceErrorStatus } from "@/lib/services/server-context"

/** PDF faktury pro přihlášeného uživatele. Data načítá servisní vrstva (RLS). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const ctx = await createServerServiceContext()
    const invoice = await getInvoice(ctx, id)

    if (!invoice.customer) {
      throw new ServiceError("CUSTOMER_NOT_FOUND", "Faktura nemá přiřazeného zákazníka.")
    }

    const companyDetails = await getCompanyDetailsForInvoice(ctx, invoice.user_id ?? ctx.userId)
    const pdfBuffer = await generateInvoicePDF(
      { ...invoice, customer: invoice.customer },
      invoice.items,
      companyDetails,
    )

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="faktura-${invoice.invoice_number}.pdf"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch (error) {
    if (isServiceError(error)) {
      return NextResponse.json({ error: error.message }, { status: serviceErrorStatus(error.code) })
    }

    console.error("[invoice-pdf] Nepodařilo se vygenerovat PDF:", error)
    return NextResponse.json({ error: "Nepodařilo se vygenerovat PDF" }, { status: 500 })
  }
}
