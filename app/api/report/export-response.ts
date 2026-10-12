import { NextResponse } from "next/server"

import type { ServiceContext } from "@/lib/services/context"
import { isServiceError } from "@/lib/services/errors"
import { getPeriodReport, type PeriodReport } from "@/lib/services/period-report"
import { createServerServiceContext, serviceErrorStatus } from "@/lib/services/server-context"
import { firstIssueMessage } from "@/lib/validation/common"
import { reportPeriodSchema } from "@/lib/validation/report"

export interface ExportFormat {
  filePrefix: string
  extension: "csv" | "xlsx" | "pdf"
  contentType: string
  render: (
    report: PeriodReport,
    ctx: ServiceContext,
  ) => string | Uint8Array | Promise<string | Uint8Array>
}

export const CSV = "text/csv; charset=utf-8"
export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
export const PDF = "application/pdf"

/**
 * Společná obsluha exportů výkazu (CSV, Excel, PDF). Za přihlášením (cookie
 * session) — cesta není v PUBLIC_PATH_PREFIXES a data se čtou pod RLS.
 */
export async function exportResponse(request: Request, format: ExportFormat): Promise<Response> {
  const url = new URL(request.url)
  const parsed = reportPeriodSchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }

  try {
    const ctx = await createServerServiceContext()
    const report = await getPeriodReport(ctx, parsed.data)
    const { from, to } = parsed.data

    const body = await format.render(report, ctx)

    return new NextResponse(body as BodyInit, {
      headers: {
        "Content-Type": format.contentType,
        "Content-Disposition": `attachment; filename="${format.filePrefix}-${from}-${to}.${format.extension}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (isServiceError(error)) {
      return NextResponse.json({ error: error.message }, { status: serviceErrorStatus(error.code) })
    }

    console.error("[report-export] Nepodařilo se vytvořit export:", error)
    return NextResponse.json({ error: "Nepodařilo se vytvořit export" }, { status: 500 })
  }
}
