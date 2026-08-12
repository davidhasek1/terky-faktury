import { NextResponse } from "next/server"

import { getPublicInvoice } from "@/lib/services/public-invoice"

/** Veřejná data faktury pro stránku `/invoices/download/[publicId]`. */
export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params
  const data = await getPublicInvoice(publicId)

  if (!data) {
    return NextResponse.json({ error: "Faktura nenalezena" }, { status: 404 })
  }

  return NextResponse.json(data)
}
