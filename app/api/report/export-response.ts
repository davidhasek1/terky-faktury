import { NextResponse } from "next/server"

import { isServiceError } from "@/lib/services/errors"
import { getPeriodReport, type PeriodReport } from "@/lib/services/period-report"
import { createServerServiceContext, serviceErrorStatus } from "@/lib/services/server-context"
import { firstIssueMessage } from "@/lib/validation/common"
import { reportPeriodSchema } from "@/lib/validation/report"

/**
 * Společná obsluha CSV exportů výkazu. Za přihlášením (cookie session) —
 * cesta není v PUBLIC_PATH_PREFIXES a data se čtou pod RLS.
 */
export async function csvResponse(
  request: Request,
  filePrefix: string,
  render: (report: PeriodReport) => string,
): Promise<Response> {
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

    return new NextResponse(render(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filePrefix}-${from}-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (isServiceError(error)) {
      return NextResponse.json({ error: error.message }, { status: serviceErrorStatus(error.code) })
    }

    console.error("[report-csv] Nepodařilo se vytvořit export:", error)
    return NextResponse.json({ error: "Nepodařilo se vytvořit export" }, { status: 500 })
  }
}
