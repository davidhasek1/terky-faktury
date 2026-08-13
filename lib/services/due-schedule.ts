/**
 * Čistá logika časové osy splatnosti.
 *
 * Splatnost je datum, ne okamžik — proto se obě strany srovnávají na půlnoc
 * UTC. Bez toho by faktura splatná dnes večer vycházela jako „po splatnosti"
 * podle toho, kolik je hodin.
 */

export type DueBucket = "overdue" | "due" | "upcoming"

/** Kolik dní dopředu ještě spadá do „brzy". */
const DUE_SOON_DAYS = 7

const MS_PER_DAY = 86_400_000

export interface ScheduledInvoice<T> {
  item: T
  bucket: DueBucket
  daysFromToday: number
}

export interface DueSchedule<T> {
  overdue: ScheduledInvoice<T>[]
  due: ScheduledInvoice<T>[]
  upcoming: ScheduledInvoice<T>[]
  span: { min: number; max: number }
}

function midnightUtc(value: Date | string): number {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function bucketFor(days: number): DueBucket {
  if (days < 0) return "overdue"
  return days <= DUE_SOON_DAYS ? "due" : "upcoming"
}

export function buildDueSchedule<
  T extends { due_date: string; paid_date: string | null },
>(invoices: readonly T[], today: Date): DueSchedule<T> {
  const anchor = midnightUtc(today)

  const scheduled = invoices
    .filter((item) => !item.paid_date)
    .map((item) => {
      const days = Math.round((midnightUtc(item.due_date) - anchor) / MS_PER_DAY)
      return { item, bucket: bucketFor(days), daysFromToday: days }
    })
    .sort((a, b) => a.daysFromToday - b.daysFromToday)

  const days = scheduled.map((e) => e.daysFromToday)

  return {
    overdue: scheduled.filter((e) => e.bucket === "overdue"),
    due: scheduled.filter((e) => e.bucket === "due"),
    upcoming: scheduled.filter((e) => e.bucket === "upcoming"),
    span: {
      min: days.length ? Math.min(...days) : 0,
      max: days.length ? Math.max(...days) : 0,
    },
  }
}

export function axisPosition(
  daysFromToday: number,
  span: { min: number; max: number },
): number {
  const range = span.max - span.min
  if (range === 0) return 0.5
  return (daysFromToday - span.min) / range
}
