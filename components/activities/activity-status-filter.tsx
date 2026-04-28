import Link from "next/link"
import { cn } from "@/lib/utils"

interface ActivityStatusFilterProps {
  customerId: string
  current: "all" | "unpaid" | "paid"
}

const OPTIONS: { value: "all" | "unpaid" | "paid"; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "unpaid", label: "Nezaplaceno" },
  { value: "paid", label: "Zaplaceno" },
]

export function ActivityStatusFilter({ customerId, current }: ActivityStatusFilterProps) {
  return (
    <div className="flex items-center gap-2">
      {OPTIONS.map((opt) => {
        const href =
          opt.value === "all"
            ? `/activities/${customerId}`
            : `/activities/${customerId}?status=${opt.value}`
        const isActive = current === opt.value
        return (
          <Link
            key={opt.value}
            href={href}
            className={cn(
              "px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-medium border border-border transition-colors",
              isActive
                ? "bg-foreground text-background border-foreground"
                : "text-muted-foreground hover:text-foreground hover:border-foreground/40",
            )}
          >
            {opt.label}
          </Link>
        )
      })}
    </div>
  )
}
