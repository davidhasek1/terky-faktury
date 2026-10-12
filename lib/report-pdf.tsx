import path from "node:path"

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import type { ComponentProps } from "react"

import { EXPENSE_CATEGORY_LABELS } from "@/components/expenses/category-labels"

import { formatScaled, toDecimal, type Scaled } from "./money"
import type { RateTotal } from "./services/expense-totals"
import type { PeriodReport } from "./services/period-report"
import { periodLabel } from "./services/report-period"
import type { CompanyDetails } from "./types"
import { expenseCount, invoiceCount } from "./utils"

/**
 * Přehledy za období jako PDF — tabulky pro člověka, které lze vytisknout
 * nebo poslat dál: vystavené faktury a náklady. Data i součty jsou z téhož
 * výkazu jako Excel a CSV.
 *
 * Vestavěná Helvetica umí jen WinAnsi, takže by rozbila č, ř, ě, ů. Proto
 * Inter (stejné písmo jako aplikace), přibalené v `lib/fonts`. Na Vercelu
 * je do funkcí dostane `outputFileTracingIncludes` v next.config.mjs.
 */

const FONT_DIR = path.join(process.cwd(), "lib", "fonts")

Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(FONT_DIR, "Inter-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Inter-SemiBold.ttf"), fontWeight: 600 },
  ],
})

// Dlouhá čísla a jména se jinak dělí po slabikách anglickými pravidly.
Font.registerHyphenationCallback((word) => [word])

interface Column {
  label: string
  width: string
  align?: "left" | "right"
}

/** Tabulka do PDF: řádky jsou už naformátované texty ve stejném pořadí jako sloupce. */
interface TableDocument {
  title: string
  emptyMessage: string
  columns: Column[]
  rows: { key: string; cells: string[] }[]
  totals: string[]
  rates?: { title: string; rows: RateTotal[] }
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 36,
    fontFamily: "Inter",
    fontSize: 9,
    color: "#1a1a1a",
  },
  company: { fontSize: 9, color: "#666" },
  title: { fontSize: 18, fontWeight: 600, marginTop: 4 },
  period: { fontSize: 10, color: "#444", marginTop: 2, marginBottom: 18 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 5 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    paddingBottom: 5,
    fontWeight: 600,
  },
  totalsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    paddingVertical: 6,
    fontWeight: 600,
  },
  cell: { paddingHorizontal: 3 },
  empty: { marginTop: 12, color: "#666" },
  ratesTitle: { marginTop: 22, marginBottom: 6, fontSize: 10, fontWeight: 600 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#888",
  },
})

function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return `${day}. ${month}. ${year}`
}

/** Pevná mezera, ať se „21 %“ nerozdělí na dva řádky. */
function percent(rate: Scaled): string {
  return `${toDecimal(rate)}\u00A0%`
}

function Row({
  columns,
  cells,
  style,
  fixed = false,
}: {
  columns: Column[]
  cells: string[]
  style: ComponentProps<typeof View>["style"]
  fixed?: boolean
}) {
  return (
    <View style={style} wrap={false} fixed={fixed}>
      {columns.map((column, index) => (
        <Text
          key={column.label || index}
          style={[styles.cell, { width: column.width, textAlign: column.align ?? "left" }]}
        >
          {cells[index]}
        </Text>
      ))}
    </View>
  )
}

const RATE_COLUMNS: Column[] = [
  { label: "Sazba", width: "20%" },
  { label: "Základ", width: "40%", align: "right" },
  { label: "IVA", width: "40%", align: "right" },
]

function TablePdf({
  doc,
  report,
  company,
}: {
  doc: TableDocument
  report: PeriodReport
  company: CompanyDetails | null
}) {
  const label = periodLabel(report.period)
  const range = `${formatDay(report.period.from)} – ${formatDay(report.period.to)}`

  return (
    <Document title={`${doc.title} – ${label}`} author={company?.company_name}>
      <Page size="A4" style={styles.page}>
        {company?.company_name && <Text style={styles.company}>{company.company_name}</Text>}
        <Text style={styles.title}>{doc.title}</Text>
        <Text style={styles.period}>
          {label} ({range})
        </Text>

        {/* `fixed` zopakuje záhlaví tabulky na každé další stránce. */}
        <Row fixed columns={doc.columns} style={styles.headerRow} cells={doc.columns.map((c) => c.label)} />

        {doc.rows.length === 0 ? (
          <Text style={styles.empty}>{doc.emptyMessage}</Text>
        ) : (
          doc.rows.map((row) => <Row key={row.key} columns={doc.columns} style={styles.row} cells={row.cells} />)
        )}

        <Row columns={doc.columns} style={styles.totalsRow} cells={doc.totals} />

        {doc.rates && doc.rates.rows.length > 0 && (
          <View wrap={false} style={{ width: "50%" }}>
            <Text style={styles.ratesTitle}>{doc.rates.title}</Text>
            <Row columns={RATE_COLUMNS} style={styles.headerRow} cells={RATE_COLUMNS.map((c) => c.label)} />
            {doc.rates.rows.map((rate) => (
              <Row
                key={rate.taxRate}
                columns={RATE_COLUMNS}
                style={styles.row}
                cells={[percent(rate.taxRate), formatScaled(rate.subtotal), formatScaled(rate.taxAmount)]}
              />
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>
            {doc.title} · {label}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Strana ${pageNumber} z ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

async function render(doc: TableDocument, report: PeriodReport, company: CompanyDetails | null) {
  return new Uint8Array(await renderToBuffer(<TablePdf doc={doc} report={report} company={company} />))
}

/** Faktury: číslo, datum vystavení, zákazník, základ, IVA, retención, celkem. */
export function generateInvoicesReportPdf(report: PeriodReport, company: CompanyDetails | null) {
  const { income } = report.totals
  const retention = (value: Scaled) => (value === 0 ? "—" : `−${formatScaled(value)}`)

  return render(
    {
      title: "Vystavené faktury",
      emptyMessage: "V tomto období nebyla vystavena žádná faktura.",
      columns: [
        { label: "Číslo faktury", width: "13%" },
        { label: "Vystaveno", width: "13%" },
        { label: "Zákazník", width: "26%" },
        { label: "Základ", width: "12%", align: "right" },
        { label: "IVA", width: "11%", align: "right" },
        { label: "Retención", width: "12%", align: "right" },
        { label: "Celkem", width: "13%", align: "right" },
      ],
      rows: report.invoices.map((invoice) => ({
        key: invoice.id,
        cells: [
          invoice.invoice_number,
          formatDay(invoice.issue_date),
          invoice.customer_name ?? "—",
          formatScaled(invoice.subtotal),
          formatScaled(invoice.tax),
          retention(invoice.retention),
          formatScaled(invoice.total),
        ],
      })),
      totals: [
        "Celkem",
        invoiceCount(income.count),
        "",
        formatScaled(income.subtotal),
        formatScaled(income.tax),
        retention(income.retention),
        formatScaled(income.total),
      ],
    },
    report,
    company,
  )
}

/** Náklady: jeden řádek za doklad, sazby IVA vypsané; pod tabulkou rozpad po sazbách. */
export function generateExpensesReportPdf(report: PeriodReport, company: CompanyDetails | null) {
  const { expenses } = report.totals

  return render(
    {
      title: "Náklady",
      emptyMessage: "V tomto období nejsou žádné náklady.",
      columns: [
        { label: "Datum", width: "11%" },
        { label: "Popis", width: "20%" },
        { label: "Dodavatel", width: "13%" },
        { label: "Kategorie", width: "15%" },
        { label: "Sazby IVA", width: "12%", align: "right" },
        { label: "Základ", width: "10%", align: "right" },
        { label: "IVA", width: "9%", align: "right" },
        { label: "Celkem", width: "10%", align: "right" },
      ],
      rows: report.expenses.map((expense) => ({
        key: expense.id,
        cells: [
          formatDay(expense.expense_date),
          expense.description,
          expense.supplier ?? "—",
          EXPENSE_CATEGORY_LABELS[expense.category],
          [...new Set(expense.items.map((item) => item.tax_rate))]
            .sort((a, b) => a - b)
            .map(percent)
            .join(", "),
          formatScaled(expense.subtotal),
          formatScaled(expense.tax),
          formatScaled(expense.total),
        ],
      })),
      totals: [
        "Celkem",
        expenseCount(expenses.count),
        "",
        "",
        "",
        formatScaled(expenses.subtotal),
        formatScaled(expenses.tax),
        formatScaled(expenses.total),
      ],
      rates: { title: "IVA z nákladů podle sazby", rows: expenses.byRate },
    },
    report,
    company,
  )
}
