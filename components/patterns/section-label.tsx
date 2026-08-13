/**
 * Popisek sekce formuláře — bez čísla. Pořadí sekcí ve formuláři (Detaily,
 * Položky, Souhrn…) nic neznamená, dělí je jen vizuálně. Srovnej se
 * `StepLabel`, který si číslo nechává tam, kde jde o skutečný postup.
 */
export function SectionLabel({ title }: { title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="font-display text-base font-semibold text-foreground">{title}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}
