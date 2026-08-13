import Link from "next/link"

import { axisPosition, buildDueSchedule, groupByDay } from "@/lib/services/due-schedule"
import type { DueBucket } from "@/lib/services/due-schedule"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

export interface TimelineInvoice {
  id: string
  invoice_number: string
  total: number
  due_date: string
  paid_date: string | null
  customer?: { name: string } | null
}

const MARK: Record<DueBucket, string> = {
  overdue: "bg-status-overdue-line",
  due: "bg-status-due-line",
  upcoming: "bg-status-upcoming-line",
}

/** Čitelná dvojice pozadí/text pro značku, která nese číslo (víc faktur v jednom dni). */
const GROUP_MARK: Record<DueBucket, string> = {
  overdue: "bg-status-overdue-bg text-status-overdue-fg",
  due: "bg-status-due-bg text-status-due-fg",
  upcoming: "bg-status-upcoming-bg text-status-upcoming-fg",
}

const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Po splatnosti",
  due: "Tento týden",
  upcoming: "Později",
}

/** Skloňuje "faktura" podle počtu (1 / 2–4 / 0 a 5+). */
function invoiceCountLabel(count: number): string {
  if (count === 1) return "faktura"
  if (count >= 2 && count <= 4) return "faktury"
  return "faktur"
}

/**
 * Časová osa splatnosti.
 *
 * V tomhle dómenu je vzdálenost od dneška jediná skutečná posloupnost, takže
 * strukturu nese ona — ne číslované sekce. Vlevo od značky DNES je po
 * splatnosti, vpravo to, co teprve přijde.
 *
 * Na úzkých obrazovkách se osa nezmenšuje, ale mění na tři sloupce. Vodorovné
 * scrollování by z ní udělalo hádanku.
 */
export function DueTimeline({
  invoices,
  today,
}: {
  invoices: TimelineInvoice[]
  today: Date
}) {
  const schedule = buildDueSchedule(invoices, today)
  const all = [...schedule.overdue, ...schedule.due, ...schedule.upcoming]
  const groups = groupByDay(all)

  if (all.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
        <p className="font-display text-lg font-semibold text-foreground">
          Nikdo ti nic nedluží.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Všechny vystavené faktury jsou zaplacené.
        </p>
      </div>
    )
  }

  const todayPos = axisPosition(0, schedule.span)

  return (
    <section aria-label="Časová osa splatnosti" className="rounded-lg border border-border bg-card">
      {/* Osa — od tabletu nahoru */}
      <div className="hidden px-6 pb-4 pt-6 sm:block">
        <div className="relative h-24">
          <div className="absolute inset-x-0 top-12 h-px bg-border" aria-hidden="true" />

          <div
            className="absolute top-6 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${todayPos * 100}%` }}
          >
            <span className="font-ident text-[10px] text-muted-foreground">DNES</span>
            <span className="mt-1 h-12 w-px bg-foreground/40" aria-hidden="true" />
          </div>

          {groups.map((group) => {
            const left = `${axisPosition(group.daysFromToday, schedule.span) * 100}%`

            if (group.items.length === 1) {
              const item = group.items[0]
              return (
                <Link
                  key={group.daysFromToday}
                  href={`/invoices/${item.id}/view`}
                  style={{ left }}
                  aria-label={`Faktura ${item.invoice_number}, ${formatCurrency(item.total)}, splatnost ${formatDate(item.due_date)}`}
                  className="group absolute top-12 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn("block size-3 rounded-full ring-2 ring-card", MARK[group.bucket])} />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background group-hover:block group-focus-visible:block"
                  >
                    {item.invoice_number} · {formatCurrency(item.total)} · {formatDate(item.due_date)}
                  </span>
                </Link>
              )
            }

            // Víc faktur se stejnou splatností nemá jeden jednoznačný cíl, kam
            // odkaz vést — místo výmyslu na cíl je značka jen nositelka
            // detailu v tooltipu. Není to tlačítko: nic se po kliknutí ani
            // Enteru nestane, takže nemá smysl tvářit se, že je aktivní.
            // tabIndex ji přesto nechává dosažitelnou klávesnicí, aby šel
            // tooltip zobrazit i bez myši.
            return (
              <span
                key={group.daysFromToday}
                tabIndex={0}
                style={{ left }}
                aria-label={`${group.items.length} ${invoiceCountLabel(group.items.length)}, celkem ${formatCurrency(group.total)}, splatnost ${formatDate(group.items[0].due_date)}`}
                className="group absolute top-12 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold leading-none tabular-nums ring-2 ring-card",
                    GROUP_MARK[group.bucket],
                  )}
                >
                  {group.items.length}
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 flex-col items-center gap-0.5 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background group-hover:flex group-focus-visible:flex"
                >
                  <span>{group.items.map((item) => item.invoice_number).join(", ")}</span>
                  <span className="text-background/70">
                    {group.items.length} {invoiceCountLabel(group.items.length)} ·{" "}
                    {formatCurrency(group.total)} · {formatDate(group.items[0].due_date)}
                  </span>
                </span>
              </span>
            )
          })}
        </div>
      </div>

      {/* Sbalené sloupce — mobil i legenda na širokých */}
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border sm:border-t">
        {(["overdue", "due", "upcoming"] as const).map((bucket) => {
          const entries = schedule[bucket]
          const sum = entries.reduce((acc, e) => acc + e.item.total, 0)
          return (
            <div key={bucket} className="px-4 py-4">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", MARK[bucket])} aria-hidden="true" />
                {BUCKET_LABEL[bucket]}
              </span>
              <p className="mt-1.5 font-display text-xl font-semibold tabular-nums text-foreground">
                {formatCurrency(sum)}
              </p>
              <p className="text-xs text-muted-foreground">
                {entries.length} {invoiceCountLabel(entries.length)}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
