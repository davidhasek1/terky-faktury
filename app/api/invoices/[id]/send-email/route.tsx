import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"

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
      html: `
        <h2>Estimado/a cliente,</h2>
        <p>Le enviamos la factura número <strong>${invoice.invoice_number}</strong>.</p>
        <p><strong>Fecha de vencimiento:</strong> ${new Date(invoice.due_date).toLocaleDateString("es-ES")}</p>
        <br>
        <p><a href="${downloadUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Factura ${invoice.invoice_number}</a></p>
        <br>
        <p style="color: #666; font-size: 14px;">O copie este enlace en su navegador:<br>${downloadUrl}</p>
        <br>
        <p>Atentamente,<br>Su equipo</p>
      `,
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
