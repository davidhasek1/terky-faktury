/**
 * Čistá logika časové osy splatnosti.
 *
 * Splatnost je datum, ne okamžik — proto se obě strany srovnávají na půlnoc
 * v místním čase uživatele. Bez toho by faktura splatná dnes večer vycházela
 * jako „po splatnosti" podle toho, kolik je hodin.
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

/**
 * Konvertuj okamžik (Date) na den v místním čase uživatele.
 * Používáme lokální gettery (getFullYear, getMonth, getDate) abychom dostali
 * kalendářní den na kterém uživatel skutečně je.
 */
function dateKeyFromInstant(today: Date): number {
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
}

/**
 * Konvertuj holý datum ve stringu (YYYY-MM-DD, bez timezone, z Postgres) na den.
 * Parsujeme string direktně proto že Postgres `date` typ nemá timezone.
 */
function dateKeyFromString(dateStr: string): number {
  const [year, month, date] = dateStr.split("-").map(Number)
  return Date.UTC(year, month - 1, date)
}

function bucketFor(days: number): DueBucket {
  if (days < 0) return "overdue"
  return days <= DUE_SOON_DAYS ? "due" : "upcoming"
}

export function buildDueSchedule<
  T extends { due_date: string; paid_date: string | null },
>(invoices: readonly T[], today: Date): DueSchedule<T> {
  const anchor = dateKeyFromInstant(today)

  const scheduled = invoices
    .filter((item) => !item.paid_date)
    .map((item) => {
      const days = Math.round((dateKeyFromString(item.due_date) - anchor) / MS_PER_DAY)
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
