import { generateInvoicesReportPdf } from "@/lib/report-pdf"
import { getCompanyDetailsForInvoice } from "@/lib/services/invoices"

import { PDF, exportResponse } from "../export-response"

/** PDF přehled vystavených faktur za období (`?from=RRRR-MM-DD&to=RRRR-MM-DD`). */
export function GET(request: Request) {
  return exportResponse(request, {
    filePrefix: "faktury",
    extension: "pdf",
    contentType: PDF,
    render: async (report, ctx) =>
      generateInvoicesReportPdf(report, await getCompanyDetailsForInvoice(ctx, ctx.userId)),
  })
}
