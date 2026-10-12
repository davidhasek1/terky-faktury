import { generateExpensesReportPdf } from "@/lib/report-pdf"
import { getCompanyDetailsForInvoice } from "@/lib/services/invoices"

import { PDF, exportResponse } from "../export-response"

/** PDF přehled nákladů za období (`?from=RRRR-MM-DD&to=RRRR-MM-DD`). */
export function GET(request: Request) {
  return exportResponse(request, {
    filePrefix: "naklady",
    extension: "pdf",
    contentType: PDF,
    render: async (report, ctx) =>
      generateExpensesReportPdf(report, await getCompanyDetailsForInvoice(ctx, ctx.userId)),
  })
}
