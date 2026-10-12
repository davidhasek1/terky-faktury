import Link from "next/link"

import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { DataTable, Dash, TableCell, TableHead } from "@/components/patterns/data-table"
import { formatScaled, toDecimal } from "@/lib/money"
import type { PeriodTotals, ReportInvoice } from "@/lib/services/period-report"
import { formatDate, invoiceCount } from "@/lib/utils"

/** Vystavené faktury za období s rozpadem na základ, IVA a retención. */
export function ReportInvoiceTable({
  invoices,
  totals,
}: {
  invoices: ReportInvoice[]
  totals: PeriodTotals["income"]
}) {
  return (
    <DataTable
      head={
        <>
          <TableHead>Číslo</TableHead>
          <TableHead>Vystaveno</TableHead>
          <TableHead>Zákazník</TableHead>
          <TableHead align="right">Základ</TableHead>
          <TableHead align="right">IVA</TableHead>
          <TableHead align="right">Retención</TableHead>
          <TableHead align="right">Celkem</TableHead>
          <TableHead>Stav</TableHead>
        </>
      }
    >
      {invoices.map((invoice) => (
        <tr key={invoice.id} className="border-b border-border/60">
          <TableCell className="font-ident whitespace-nowrap">
            <Link href={`/invoices/${invoice.id}/view`} className="hover:underline">
              {invoice.invoice_number}
            </Link>
          </TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">{formatDate(invoice.issue_date)}</TableCell>
          <TableCell>{invoice.customer_name ?? <Dash />}</TableCell>
          <TableCell align="right" className="tabular-nums">{formatScaled(invoice.subtotal)}</TableCell>
          <TableCell align="right" className="whitespace-nowrap tabular-nums">
            {formatScaled(invoice.tax)}
            <span className="block text-xs text-muted-foreground">{toDecimal(invoice.tax_rate)} %</span>
          </TableCell>
          <TableCell align="right" className="whitespace-nowrap tabular-nums">
            {invoice.retention === 0 ? (
              <Dash />
            ) : (
              <>
                −{formatScaled(invoice.retention)}
                <span className="block text-xs text-muted-foreground">{toDecimal(invoice.retention_rate)} %</span>
              </>
            )}
          </TableCell>
          <TableCell align="right" className="font-display font-semibold tabular-nums">
            {formatScaled(invoice.total)}
          </TableCell>
          <TableCell>
            <InvoiceStatusBadge status={invoice.status} />
          </TableCell>
        </tr>
      ))}
      <tr className="bg-muted/40">
        <TableCell className="font-medium">Celkem</TableCell>
        <TableCell className="text-muted-foreground">{invoiceCount(totals.count)}</TableCell>
        <TableCell>{null}</TableCell>
        <TableCell align="right" className="font-semibold tabular-nums">{formatScaled(totals.subtotal)}</TableCell>
        <TableCell align="right" className="font-semibold tabular-nums">{formatScaled(totals.tax)}</TableCell>
        <TableCell align="right" className="font-semibold tabular-nums">
          {totals.retention === 0 ? <Dash /> : `−${formatScaled(totals.retention)}`}
        </TableCell>
        <TableCell align="right" className="font-display font-semibold tabular-nums">
          {formatScaled(totals.total)}
        </TableCell>
        <TableCell>{null}</TableCell>
      </tr>
    </DataTable>
  )
}
