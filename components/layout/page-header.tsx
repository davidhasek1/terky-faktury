import type { ReactNode } from "react"

interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-12 sm:mb-16">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] font-semibold text-primary mb-4">
              <span className="inline-block size-1.5 rounded-full bg-highlight" aria-hidden="true" />
              {eyebrow}
            </p>
          )}
          <h1 className="font-serif font-bold text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-4 text-base text-muted-foreground max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
      </div>
    </header>
  )
}
