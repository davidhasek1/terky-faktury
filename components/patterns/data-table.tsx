import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function TableHead({
  children,
  align,
}: {
  children: ReactNode
  align?: "right"
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  )
}

export function TableCell({
  children,
  align,
  className,
}: {
  children: ReactNode
  align?: "right"
  className?: string
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-sm text-foreground",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  )
}

/** Prázdná hodnota v tabulce. */
export function Dash() {
  return <span className="text-muted-foreground/40">—</span>
}
