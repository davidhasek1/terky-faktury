import { reportXlsx } from "@/lib/services/report-xlsx"

import { XLSX, exportResponse } from "../export-response"

/** Výkaz za období jako sešit Excelu (`?from=RRRR-MM-DD&to=RRRR-MM-DD`). */
export function GET(request: Request) {
  return exportResponse(request, { filePrefix: "vykaz", extension: "xlsx", contentType: XLSX, render: reportXlsx })
}
