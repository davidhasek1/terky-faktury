import { Button, Heading, Link, Text } from "@react-email/components"
import * as React from "react"
import { BrandShell } from "./_layout"

// E-mail s fakturou pro zákazníka. Obsah zůstává ve španělštině.
export interface InvoiceEmailProps {
  invoiceNumber: string
  dueDate: string // ISO
  downloadUrl: string
}

export default function InvoiceEmail({
  invoiceNumber,
  dueDate,
  downloadUrl,
}: InvoiceEmailProps) {
  const due = new Date(dueDate).toLocaleDateString("es-ES")

  return (
    <BrandShell lang="es" preview={`Factura ${invoiceNumber}`}>
      <Text className="m-0 mb-[10px] text-[11px] font-bold uppercase tracking-[2px] text-violet">
        <span className="text-orange">&#9679;</span>&nbsp; Nueva factura
      </Text>
      <Heading
        as="h1"
        className="m-0 mb-[20px] text-[28px] font-bold leading-[1.2] text-ink"
      >
        Factura {invoiceNumber}
      </Heading>
      <Text className="m-0 mb-[8px] text-[16px] leading-[1.6] text-soft">
        Estimado/a cliente,
      </Text>
      <Text className="m-0 mb-[28px] text-[16px] leading-[1.6] text-soft">
        le enviamos la factura número{" "}
        <strong className="text-ink">{invoiceNumber}</strong>. Fecha de
        vencimiento: <strong className="text-ink">{due}</strong>.
      </Text>
      <Button
        href={downloadUrl}
        className="box-border rounded-full bg-violet px-[30px] py-[14px] text-[15px] font-semibold text-white no-underline"
      >
        Ver factura
      </Button>
      <Text className="m-0 mt-[28px] text-[13px] leading-[1.6] text-muted">
        Si el botón no funciona, copie este enlace en su navegador:
        <br />
        <Link href={downloadUrl} className="break-all text-violet">
          {downloadUrl}
        </Link>
      </Text>
    </BrandShell>
  )
}

InvoiceEmail.PreviewProps = {
  invoiceNumber: "2026-101",
  dueDate: "2026-08-01",
  downloadUrl: "https://example.com/invoices/download/abc123",
} satisfies InvoiceEmailProps

export { InvoiceEmail }
