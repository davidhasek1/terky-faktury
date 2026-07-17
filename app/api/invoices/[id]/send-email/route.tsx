import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"
import InvoiceEmail from "@/emails/invoice-email"

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set")
      return NextResponse.json(
        { error: "RESEND_API_KEY není nastavený. Přidejte ho do environment variables." },
        { status: 500 },
      )
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    if (!process.env.NEXT_PUBLIC_SITE_URL) {
      console.error("NEXT_PUBLIC_SITE_URL is not set")
      return NextResponse.json(
        { error: "NEXT_PUBLIC_SITE_URL není nastavený. Přidejte ho do environment variables." },
        { status: 500 },
      )
    }

    if (!process.env.SENDER_EMAIL) {
      console.error("SENDER_EMAIL is not set")
      return NextResponse.json(
        { error: "SENDER_EMAIL není nastavený. Přidejte ho do environment variables." },
        { status: 500 },
      )
    }

    const senderName = process.env.SENDER_NAME || "Faktury"
    const fromAddress = `${senderName} <${process.env.SENDER_EMAIL}>`

    const supabase = await createClient()

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
      console.error("Invoice not found:", invoiceError)
      return NextResponse.json({ error: "Faktura nenalezena" }, { status: 404 })
    }

    if (!invoice.customer?.email) {
      return NextResponse.json({ error: "Zákazník nemá vyplněný email" }, { status: 400 })
    }

    const downloadUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invoices/download/${invoice.public_id}`

    const { error: emailError } = await resend.emails.send({
      from: fromAddress,
      to: [invoice.customer.email],
      subject: `Factura ${invoice.invoice_number}`,
      react: InvoiceEmail({
        invoiceNumber: invoice.invoice_number,
        dueDate: invoice.due_date,
        downloadUrl,
      }),
    })

    if (emailError) {
      console.error("Error sending email:", emailError)
      return NextResponse.json({ error: "Nepodařilo se odeslat email: " + emailError.message }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", id)

    if (updateError) {
      console.error("Error updating email_sent_at:", updateError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in send-email route:", error)
    return NextResponse.json(
      { error: "Interní chyba serveru: " + (error instanceof Error ? error.message : "Neznámá chyba") },
      { status: 500 },
    )
  }
}
