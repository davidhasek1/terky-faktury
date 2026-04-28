interface SectionLabelProps {
  number: string
  title: string
}

export function SectionLabel({ number, title }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-4 mb-6 sm:mb-8">
      <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-medium tabular-nums">
        {number}
      </span>
      <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground" aria-hidden="true">
        —
      </span>
      <span className="font-serif italic text-xl sm:text-2xl text-foreground">{title}</span>
      <span className="flex-1 h-px bg-border" aria-hidden="true" />
    </div>
  )
}
