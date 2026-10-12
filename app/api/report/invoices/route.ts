import { invoicesCsv } from "@/lib/services/report-csv"

import { csvResponse } from "../csv-response"

/** CSV vystavených faktur za období (`?from=RRRR-MM-DD&to=RRRR-MM-DD`). */
export function GET(request: Request) {
  return csvResponse(request, "faktury", invoicesCsv)
}
