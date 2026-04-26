import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { Invoice, InvoiceItem, Customer, CompanyDetails } from "./types"

// Styly pro PDF
const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  title: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
  },
  invoiceNumber: {
    fontSize: 12,
    marginBottom: 20,
  },
  dateLabel: {
    fontSize: 9,
    color: "#666",
  },
  dateValue: {
    fontSize: 10,
    marginBottom: 5,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    marginVertical: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  infoColumn: {
    flex: 1,
  },
  text: {
    fontSize: 10,
    marginBottom: 3,
  },
  textBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  table: {
    marginTop: 20,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 5,
    marginBottom: 10,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  colDescription: {
    width: "50%",
  },
  colQuantity: {
    width: "15%",
    textAlign: "right",
  },
  colPrice: {
    width: "17.5%",
    textAlign: "right",
  },
  colTotal: {
    width: "17.5%",
    textAlign: "right",
  },
  totalsSection: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 200,
    marginBottom: 5,
  },
  totalRowRetention: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 200,
    marginBottom: 5,
    color: "#dc2626",
  },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 200,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#000",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
  },
  notes: {
    marginTop: 30,
    padding: 10,
    backgroundColor: "#f5f5f5",
  },
  paymentInfo: {
    marginTop: 30,
    padding: 10,
    backgroundColor: "#f9f9f9",
  },
})

// Helper funkce pro formátování měny
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

// Helper funkce pro formátování data
const formatDate = (date: string) => {
  return new Intl.DateTimeFormat("es-ES").format(new Date(date))
}

// PDF komponenta
export const InvoicePDF = ({
  invoice,
  items,
  companyDetails,
}: {
  invoice: Invoice & { customer: Customer }
  items: InvoiceItem[]
  companyDetails?: CompanyDetails | null
}) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>FACTURA</Text>
          <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.dateLabel}>Fecha de emisión:</Text>
          <Text style={styles.dateValue}>{formatDate(invoice.issue_date)}</Text>
          <Text style={styles.dateLabel}>Fecha de vencimiento:</Text>
          <Text style={styles.dateValue}>{formatDate(invoice.due_date)}</Text>
        </View>
      </View>

      <View style={styles.separator} />

      {/* Supplier and Customer Info */}
      <View style={styles.infoRow}>
        <View style={styles.infoColumn}>
          <Text style={styles.sectionTitle}>Proveedor</Text>
          <Text style={styles.text}>{companyDetails?.company_name || "Vaše firma"}</Text>
          {companyDetails?.street && <Text style={styles.text}>{companyDetails.street}</Text>}
          {(companyDetails?.postal_code || companyDetails?.city) && (
            <Text style={styles.text}>
              {companyDetails.postal_code} {companyDetails.city}
            </Text>
          )}
          {companyDetails?.country && <Text style={styles.text}>{companyDetails.country}</Text>}
          {companyDetails?.nie && <Text style={styles.text}>NIE: {companyDetails.nie}</Text>}
          {companyDetails?.nif && <Text style={styles.text}>NIF: {companyDetails.nif}</Text>}
        </View>
        <View style={styles.infoColumn}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <Text style={styles.text}>{invoice.customer.name}</Text>
          {invoice.customer.address &&
            invoice.customer.address.split("\n").map((line, i) => (
              <Text key={i} style={styles.text}>
                {line}
              </Text>
            ))}
          {invoice.customer.ico && <Text style={styles.text}>NIE: {invoice.customer.ico}</Text>}
          {invoice.customer.dic && <Text style={styles.text}>NIF: {invoice.customer.dic}</Text>}
        </View>
      </View>

      {/* Items Table */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Artículos de la factura</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Descripción</Text>
            <Text style={styles.colQuantity}>Cantidad</Text>
            <Text style={styles.colPrice}>Precio/ud</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQuantity}>{item.quantity}</Text>
              <Text style={styles.colPrice}>{formatCurrency(item.unit_price)}</Text>
              <Text style={styles.colTotal}>{formatCurrency(item.total)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalRow}>
          <Text>Subtotal:</Text>
          <Text>{formatCurrency(invoice.subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text>IVA ({invoice.tax_rate}%):</Text>
          <Text>{formatCurrency(invoice.tax_amount)}</Text>
        </View>
        {invoice.retention_rate > 0 && (
          <View style={styles.totalRowRetention}>
            <Text>Retención (-{invoice.retention_rate}%):</Text>
            <Text>-{formatCurrency(invoice.retention_amount)}</Text>
          </View>
        )}
        <View style={styles.totalRowFinal}>
          <Text>Total a pagar:</Text>
          <Text>{formatCurrency(invoice.total)}</Text>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes && (
        <View style={styles.notes}>
          <Text style={styles.textBold}>Notas:</Text>
          <Text style={styles.text}>{invoice.notes}</Text>
        </View>
      )}

      {/* Payment Info */}
      <View style={styles.paymentInfo}>
        <Text style={styles.textBold}>Datos de pago:</Text>
        <Text style={styles.text}>Forma de pago: Transferencia bancaria</Text>
        {companyDetails?.bank_name && <Text style={styles.text}>Banco: {companyDetails.bank_name}</Text>}
        {companyDetails?.iban && <Text style={styles.text}>IBAN: {companyDetails.iban}</Text>}
        {companyDetails?.bank_account && (
          <Text style={styles.text}>Número de cuenta: {companyDetails.bank_account}</Text>
        )}
        {companyDetails?.swift_bic && <Text style={styles.text}>SWIFT/BIC: {companyDetails.swift_bic}</Text>}
        <Text style={styles.text}>Referencia: {invoice.invoice_number.replace(/\D/g, "")}</Text>
      </View>
    </Page>
  </Document>
)

export async function generateInvoicePDF(
  invoice: Invoice & { customer: Customer },
  items: InvoiceItem[],
  companyDetails?: CompanyDetails | null,
): Promise<Buffer> {
  const ReactPDF = await import("@react-pdf/renderer")
  const pdfDoc = ReactPDF.pdf(<InvoicePDF invoice={invoice} items={items} companyDetails={companyDetails} />)
  const stream = (await pdfDoc.toBuffer()) as unknown as NodeJS.ReadableStream
  const chunks: Uint8Array[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk as Buffer))
  }
  return Buffer.concat(chunks)
}
