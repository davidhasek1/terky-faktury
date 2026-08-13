import type { ActivityStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Stav aktivity v seznamu — jen ke čtení.
 *
 * Dřív to bylo klikací, ale vypadalo to jako popisek: drobný verzálkový text
 * s tečkou, k nerozeznání od okolních hodnot. Nic nenapovídalo, že se s tím
 * dá hnout. Přepnutí se proto přesunulo do menu na konci řádku, kde už sedí
 * Upravit a Smazat — a kde ho faktury mají taky.
 *
 * Barvy jdou z teplotní škály, stejně jako u `InvoiceStatusBadge`, takže
 * „zaplaceno" má v celé aplikaci jeden odstín.
 */
const STYLES: Record<ActivityStatus, { label: string; badge: string; dot: string }> = {
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
}

export function ActivityStatusBadge({ status }: { status: ActivityStatus }) {
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
