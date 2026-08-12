import { Resend } from "resend"

import InvoiceEmail from "@/emails/invoice-email"

import type { ServiceContext } from "./context"
import { ServiceError } from "./errors"
import { getInvoice } from "./invoices"

/**
 * Odeslání faktury e-mailem.
 *
 * Modul je určen jen pro server (Resend klient a serverové proměnné
 * prostředí) — z klientských komponent ho neimportuj, volej API routu
 * `/api/invoices/[id]/send-email`.
 *
 * Resend klient se vytváří až uvnitř funkce; v modulovém scope by `next build`
 * spadl při sběru dat, když `RESEND_API_KEY` v build čase chybí.
 */

export interface SendInvoiceEmailResult {
  invoiceId: string
  invoiceNumber: string
  recipient: string
  downloadUrl: string
  sentAt: string
}

export async function sendInvoiceEmail(
  ctx: ServiceContext,
  invoiceId: string,
): Promise<SendInvoiceEmailResult> {
  const apiKey = requireEnv("RESEND_API_KEY")
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL")
  const senderEmail = requireEnv("SENDER_EMAIL")
  const senderName = process.env.SENDER_NAME || "Faktury"

  const invoice = await getInvoice(ctx, invoiceId)
  const recipient = invoice.customer?.email

  if (!recipient) {
    throw new ServiceError(
      "CUSTOMER_EMAIL_MISSING",
      "Zákazník nemá vyplněný e-mail, fakturu nelze odeslat.",
    )
  }

  const downloadUrl = `${siteUrl.replace(/\/$/, "")}/invoices/download/${invoice.public_id}`

  const { error: emailError } = await new Resend(apiKey).emails.send({
    from: `${senderName} <${senderEmail}>`,
    to: [recipient],
    subject: `Factura ${invoice.invoice_number}`,
    react: InvoiceEmail({
      invoiceNumber: invoice.invoice_number,
      dueDate: invoice.due_date,
      downloadUrl,
    }),
  })

  if (emailError) {
    console.error("[invoice-email] Resend odmítl odeslání:", emailError.message)
    throw new ServiceError("EMAIL_SEND_FAILED", "Nepodařilo se odeslat e-mail s fakturou.")
  }

  const sentAt = new Date().toISOString()
  const { error: updateError } = await ctx.supabase
    .from("invoices")
    .update({ email_sent_at: sentAt })
    .eq("id", invoiceId)

  if (updateError) {
    // E-mail už odešel — chybu zaznamenáme, ale operaci nepovažujeme za
    // neúspěšnou, jinak by opakování poslalo zákazníkovi fakturu dvakrát.
    console.error("[invoice-email] Nepodařilo se zapsat email_sent_at:", updateError.message)
  }

  return {
    invoiceId,
    invoiceNumber: invoice.invoice_number,
    recipient,
    downloadUrl,
    sentAt,
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`[invoice-email] Chybí proměnná prostředí ${name}`)
    throw new ServiceError(
      "INTERNAL_ERROR",
      "Odesílání e-mailů není nakonfigurováno. Kontaktujte správce aplikace.",
    )
  }
  return value
}
