interface SectionLabelProps {
  number: string
  title: string
}

export function SectionLabel({ number, title }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-3 mb-6 sm:mb-8">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-semibold tabular-nums">
        {number}
      </span>
      <span className="font-serif font-semibold text-lg sm:text-xl text-foreground">{title}</span>
      <span className="flex-1 h-px bg-border" aria-hidden="true" />
    </div>
  )
}
