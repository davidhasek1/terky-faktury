import { expensesCsv } from "@/lib/services/report-csv"

import { CSV, exportResponse } from "../export-response"

/** CSV nákladů za období (`?from=RRRR-MM-DD&to=RRRR-MM-DD`). */
export function GET(request: Request) {
  return exportResponse(request, { filePrefix: "naklady", extension: "csv", contentType: CSV, render: expensesCsv })
}
