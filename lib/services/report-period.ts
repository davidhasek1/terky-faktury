import { reportPeriodSchema, type ReportPeriod } from "@/lib/validation/report"

/**
 * Období výkazu. Čistá logika nad řetězci RRRR-MM-DD — žádné časové zóny,
 * protože DB drží `issue_date` i `expense_date` jako DATE.
 */

export type PeriodPreset = "month" | "quarter" | "year" | "custom"

const MONTHS = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
]

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number)
  return { year, month, day }
}

function monthRange(year: number, firstMonth: number, months: number): ReportPeriod {
  const lastMonth = firstMonth + months - 1
  return {
    from: `${year}-${pad(firstMonth)}-01`,
    to: `${year}-${pad(lastMonth)}-${pad(lastDayOfMonth(year, lastMonth))}`,
  }
}

/** Měsíc, čtvrtletí nebo rok, do kterého patří `date`. */
export function periodContaining(preset: Exclude<PeriodPreset, "custom">, date: string): ReportPeriod {
  const { year, month } = parts(date)
  if (preset === "month") return monthRange(year, month, 1)
  if (preset === "quarter") return monthRange(year, Math.floor((month - 1) / 3) * 3 + 1, 3)
  return monthRange(year, 1, 12)
}

/** Pozná, jestli období přesně odpovídá měsíci, čtvrtletí nebo roku. */
export function detectPreset(period: ReportPeriod): PeriodPreset {
  for (const preset of ["month", "quarter", "year"] as const) {
    const candidate = periodContaining(preset, period.from)
    if (candidate.from === period.from && candidate.to === period.to) return preset
  }
  return "custom"
}

/** Předchozí (-1) nebo další (+1) období stejného typu. */
export function shiftPeriod(period: ReportPeriod, direction: -1 | 1): ReportPeriod {
  const preset = detectPreset(period)
  if (preset === "custom") return period

  const { year, month } = parts(period.from)
  const step = preset === "month" ? 1 : preset === "quarter" ? 3 : 12
  const shifted = new Date(Date.UTC(year, month - 1 + direction * step, 1))
  const anchor = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-01`
  return periodContaining(preset, anchor)
}

/**
 * Období z URL. Chybějící nebo neplatné parametry znamenají aktuální
 * čtvrtletí — výkaz se nejčastěji otevírá kvůli čtvrtletnímu přiznání.
 */
export function resolvePeriod(
  params: { from?: string; to?: string },
  today: string,
): { period: ReportPeriod; valid: boolean } {
  if (!params.from && !params.to) return { period: periodContaining("quarter", today), valid: true }

  const parsed = reportPeriodSchema.safeParse(params)
  return parsed.success
    ? { period: parsed.data, valid: true }
    : { period: periodContaining("quarter", today), valid: false }
}

function formatDay(date: string): string {
  const { year, month, day } = parts(date)
  return `${day}. ${month}. ${year}`
}

/** Lidský popis období: „3. čtvrtletí 2026", „září 2026", „2026"… */
export function periodLabel(period: ReportPeriod): string {
  const { year, month } = parts(period.from)
  switch (detectPreset(period)) {
    case "month":
      return `${MONTHS[month - 1]} ${year}`
    case "quarter":
      return `${Math.floor((month - 1) / 3) + 1}. čtvrtletí ${year}`
    case "year":
      return String(year)
    default:
      return `${formatDay(period.from)} – ${formatDay(period.to)}`
  }
}

/** Dnešní datum v místním čase jako RRRR-MM-DD. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
