import type { InvoiceStatus } from "@/lib/services/invoices"
import { cn } from "@/lib/utils"

/**
 * Stav faktury v seznamu.
 *
 * Barvy jdou z teplotní škály v token systému, ne z Tailwind palety — stejná
 * škála pohání i časovou osu splatnosti, takže „po splatnosti" má všude
 * v aplikaci jeden odstín.
 */

const STYLES: Record<InvoiceStatus, { label: string; badge: string; dot: string }> = {
  paid: {
    label: "Zaplaceno",
    badge: "bg-status-settled-bg text-status-settled-fg ring-status-settled-line/30",
    dot: "bg-status-settled-line",
  },
  unpaid: {
    label: "Nezaplaceno",
    badge: "bg-status-due-bg text-status-due-fg ring-status-due-line/30",
    dot: "bg-status-due-line",
  },
  overdue: {
    label: "Po splatnosti",
    badge: "bg-status-overdue-bg text-status-overdue-fg ring-status-overdue-line/40",
    dot: "bg-status-overdue-line",
  },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const style = STYLES[status]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 ring-1 ring-inset",
        "text-[11px] font-medium",
        style.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
      {style.label}
    </span>
  )
}
