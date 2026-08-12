import type { InvoiceStatus } from "@/lib/services/invoices"
import { cn } from "@/lib/utils"

/**
 * Stav faktury v seznamu.
 *
 * Dřív to byl jen barevný text s tečkou, který v tabulce plné stejně drobného
 * písma zanikal — a „po splatnosti" mělo brand fialovou, tedy stejnou barvu
 * jako odkazy a tlačítka, takže se to nečetlo jako výstraha. Teď má štítek
 * podbarvení a rámeček a barvy sedí na souhrnné karty nad tabulkou.
 */

const STYLES: Record<InvoiceStatus, { label: string; badge: string; dot: string }> = {
  paid: {
    label: "Zaplaceno",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/25",
    dot: "bg-emerald-500",
  },
  unpaid: {
    label: "Nezaplaceno",
    badge: "bg-amber-50 text-amber-800 ring-amber-600/25",
    dot: "bg-amber-500",
  },
  overdue: {
    label: "Po splatnosti",
    badge: "bg-rose-100 text-rose-900 ring-rose-600/35",
    dot: "bg-rose-600",
  },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const style = STYLES[status]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 ring-1 ring-inset",
        "text-[10px] uppercase tracking-[0.14em] font-semibold",
        style.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
      {style.label}
    </span>
  )
}
