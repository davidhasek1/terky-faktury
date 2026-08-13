import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Vnitřní odsazení stránky uvnitř shellu. Šířku drží na jednom místě,
 * ať se stránky nerozjedou jedna od druhé.
 */
const WIDTHS = {
  /** Seznamy a dashboard. */
  wide: "max-w-6xl",
  /** Formuláře — musí se vejít popisný sloupec sekce vedle polí. */
  form: "max-w-5xl",
  /** Jednoúčelové obrazovky s jedním sloupcem textu. */
  narrow: "max-w-3xl",
} as const

export function PageShell({
  children,
  width = "wide",
}: {
  children: ReactNode
  width?: keyof typeof WIDTHS
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-8 sm:px-8 sm:py-10", WIDTHS[width])}>
      {children}
    </div>
  )
}
