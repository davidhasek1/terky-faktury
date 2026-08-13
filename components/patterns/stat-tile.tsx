import { cn } from "@/lib/utils"

const TONE = {
  neutral: "text-foreground",
  overdue: "text-status-overdue-fg",
  due: "text-status-due-fg",
  upcoming: "text-status-upcoming-fg",
  settled: "text-status-settled-fg",
} as const

export type StatTone = keyof typeof TONE

export function StatTile({
  label,
  value,
  meta,
  tone = "neutral",
}: {
  label: string
  value: string
  meta?: string
  tone?: StatTone
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-display text-2xl font-semibold tabular-nums",
          TONE[tone],
        )}
      >
        {value}
      </p>
      {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
    </div>
  )
}
