import type { ReactNode } from "react"

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
      {icon && <div className="mb-4 flex justify-center text-muted-foreground">{icon}</div>}
      <p className="font-display text-lg font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}
