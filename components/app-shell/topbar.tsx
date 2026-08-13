import type { ReactNode } from "react"

export function Topbar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-8">
      <p className="truncate pl-10 font-medium text-foreground lg:pl-0">{title}</p>
      {action}
    </div>
  )
}
