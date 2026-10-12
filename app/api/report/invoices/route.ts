import { invoicesCsv } from "@/lib/services/report-csv"

import { CSV, exportResponse } from "../export-response"

/** CSV vystavených faktur za období (`?from=RRRR-MM-DD&to=RRRR-MM-DD`). */
export function GET(request: Request) {
  return exportResponse(request, { filePrefix: "faktury", extension: "csv", contentType: CSV, render: invoicesCsv })
}
