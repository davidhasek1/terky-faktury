import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    console.log("[v0] Starting send-email route for invoice:", params.id)

    const { id } = params

    if (!process.env.RESEND_API_KEY) {
      console.error("[v0] RESEND_API_KEY is not set")
      return NextResponse.json(
        { error: "RESEND_API_KEY není nastavený. Přidejte ho do environment variables." },
        { status: 500 },
      )
    }

    console.log("[v0] RESEND_API_KEY is set")

    const supabase = await createClient()

    console.log("[v0] Fetching invoice from database")
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

    console.log("[v0] Invoice data:", invoice)

    if (invoiceError || !invoice) {
      console.error("[v0] Invoice not found:", invoiceError)
      return NextResponse.json({ error: "Faktura nenalezena" }, { status: 404 })
    }

    if (!invoice.customer?.email) {
      console.error("[v0] Customer email not found")
      return NextResponse.json({ error: "Zákazník nemá vyplněný email" }, { status: 400 })
    }

    const downloadUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/invoices/download/${invoice.public_id}`
    console.log("[v0] Download URL:", downloadUrl)

    console.log("[v0] Sending email to:", invoice.customer.email)
    const { error: emailError } = await resend.emails.send({
      from: "Facturas <onboarding@resend.dev>",
      to: [invoice.customer.email],
      subject: `Factura ${invoice.invoice_number}`,
      html: `
        <h2>Estimado/a cliente,</h2>
        <p>Le enviamos la factura número <strong>${invoice.invoice_number}</strong>.</p>
        <p><strong>Fecha de vencimiento:</strong> ${new Date(invoice.due_date).toLocaleDateString("es-ES")}</p>
        <p><strong>Importe total:</strong> ${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(invoice.total)}</p>
        <br>
        <p><a href="${downloadUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Descargar factura (PDF)</a></p>
        <br>
        <p style="color: #666; font-size: 14px;">O copie este enlace en su navegador:<br>${downloadUrl}</p>
        <br>
        <p>Atentamente,<br>Su equipo</p>
      `,
    })

    if (emailError) {
      console.error("[v0] Error sending email:", emailError)
      return NextResponse.json({ error: "Nepodařilo se odeslat email: " + emailError.message }, { status: 500 })
    }

    console.log("[v0] Email sent successfully")
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in send-email route:", error)
    return NextResponse.json(
      { error: "Interní chyba serveru: " + (error instanceof Error ? error.message : "Neznámá chyba") },
      { status: 500 },
    )
  }
}
