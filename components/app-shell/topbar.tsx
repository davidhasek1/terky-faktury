import type { ReactNode } from "react"

export function Topbar({
  title,
  action,
  asHeading = false,
}: {
  title: string
  action?: ReactNode
  /**
   * Vykreslí titulek jako `<h1>`. Zapíná se na stránkách, které nemají
   * `PageHeader` — typicky formuláře, kde by se jinak nadpis objevil na
   * obrazovce dvakrát pod sebou. Jinde je titulek jen navigační chrome
   * a `<h1>` patří `PageHeader`u, aby na stránce zůstal jediný.
   */
  asHeading?: boolean
}) {
  const Title = asHeading ? "h1" : "p"

  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-8">
      <Title className="truncate pl-10 font-medium text-foreground lg:pl-0">{title}</Title>
      {action}
    </div>
  )
}
