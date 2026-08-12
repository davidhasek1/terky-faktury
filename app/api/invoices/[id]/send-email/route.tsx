import { NextResponse, type NextRequest } from "next/server"

import { isServiceError } from "@/lib/services/errors"
import { sendInvoiceEmail } from "@/lib/services/invoice-email"
import { createServerServiceContext, serviceErrorStatus } from "@/lib/services/server-context"

/**
 * Odešle fakturu zákazníkovi e-mailem.
 *
 * Vlastní logika (kontrola e-mailu, odeslání přes Resend, razítko
 * `email_sent_at`) žije v servisní vrstvě, aby ji sdílelo UI i MCP nástroj
 * `send_invoice_email`.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const ctx = await createServerServiceContext()
    const result = await sendInvoiceEmail(ctx, id)

    return NextResponse.json({ success: true, sentAt: result.sentAt })
  } catch (error) {
    if (isServiceError(error)) {
      return NextResponse.json({ error: error.message }, { status: serviceErrorStatus(error.code) })
    }

    console.error("[send-email] Neošetřená chyba:", error)
    return NextResponse.json({ error: "Interní chyba serveru" }, { status: 500 })
  }
}
