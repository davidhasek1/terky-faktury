import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { Invoice, InvoiceItem, Customer } from "@/lib/types"
import { formatCurrency, formatDate } from "@/lib/utils"

interface InvoicePreviewProps {
  invoice: Invoice & { customer: Customer }
  items: InvoiceItem[]
  companyDetails?: {
    company_name: string
    nie?: string
    nif?: string
    street?: string
    city?: string
    postal_code?: string
    country?: string
    bank_account?: string
    iban?: string
  } | null
}

export function InvoicePreview({ invoice, items, companyDetails }: InvoicePreviewProps) {
  return (
    <Card className="print:shadow-none" id="invoice-preview">
      <CardContent className="p-8 md:p-12">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold mb-2">FACTURA</h1>
              <p className="text-lg text-muted-foreground">{invoice.invoice_number}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Fecha de emisión</p>
              <p className="font-medium">{formatDate(invoice.issue_date)}</p>
              <p className="text-sm text-muted-foreground mt-2">Fecha de vencimiento</p>
              <p className="font-medium">{formatDate(invoice.due_date)}</p>
            </div>
          </div>

          <Separator />

          {/* Customer Info */}
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-2">Proveedor</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">{companyDetails?.company_name || "Vaše firma"}</p>
                {companyDetails?.street && <p>{companyDetails.street}</p>}
                {(companyDetails?.postal_code || companyDetails?.city) && (
                  <p>
                    {companyDetails.postal_code} {companyDetails.city}
                  </p>
                )}
                {companyDetails?.country && <p>{companyDetails.country}</p>}
                {companyDetails?.nie && <p className="mt-2">NIE: {companyDetails.nie}</p>}
                {companyDetails?.nif && <p>NIF: {companyDetails.nif}</p>}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Cliente</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">{invoice.customer.name}</p>
                {invoice.customer.address && <p className="whitespace-pre-line">{invoice.customer.address}</p>}
                {invoice.customer.ico && <p className="mt-2">NIE: {invoice.customer.ico}</p>}
                {invoice.customer.dic && <p>NIF: {invoice.customer.dic}</p>}
                {invoice.customer.email && <p className="mt-2">{invoice.customer.email}</p>}
                {invoice.customer.phone && <p>{invoice.customer.phone}</p>}
              </div>
            </div>
          </div>

          <Separator />

          {/* Items Table */}
          <div>
            <h3 className="font-semibold mb-4">Artículos de la factura</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-medium">Descripción</th>
                    <th className="text-right p-3 font-medium">Cantidad</th>
                    <th className="text-right p-3 font-medium">Precio/ud</th>
                    <th className="text-right p-3 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id || index} className="border-t">
                      <td className="p-3">{item.description}</td>
                      <td className="text-right p-3">{item.quantity}</td>
                      <td className="text-right p-3">{formatCurrency(item.unit_price)}</td>
                      <td className="text-right p-3 font-medium">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full max-w-sm space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IVA ({invoice.tax_rate}%):</span>
                <span className="font-medium">{formatCurrency(invoice.tax_amount)}</span>
              </div>
              {invoice.retention_rate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Retención (-{invoice.retention_rate}%):</span>
                  <span className="font-medium text-destructive">-{formatCurrency(invoice.retention_amount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total a pagar:</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2">Notas</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.notes}</p>
              </div>
            </>
          )}

          {/* Payment Info */}
          <Separator />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Datos de pago:</p>
            {companyDetails?.iban && <p>IBAN: {companyDetails.iban}</p>}
            {companyDetails?.bank_account && <p>Número de cuenta: {companyDetails.bank_account}</p>}
            <p>Referencia: {invoice.invoice_number.replace(/\D/g, "")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
