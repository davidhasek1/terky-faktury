/**
 * Popisek kroku v postupu. Číslo tu smí být jen tehdy, když pořadí něco
 * znamená — jako u nastavení konektoru. Na dashboardu a v seznamech ne.
 */
export function StepLabel({ number, title }: { number: string; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-ident text-[11px] text-primary-foreground tabular-nums">
        {number}
      </span>
      <span className="font-display text-base font-semibold text-foreground">{title}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}
