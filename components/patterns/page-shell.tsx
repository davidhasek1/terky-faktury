import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Vnitřní odsazení stránky uvnitř shellu. Šířku drží na jednom místě,
 * ať se stránky nerozjedou jedna od druhé.
 */
export function PageShell({
  children,
  width = "wide",
}: {
  children: ReactNode
  width?: "narrow" | "wide"
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-8 sm:px-8 sm:py-10",
        width === "wide" ? "max-w-6xl" : "max-w-3xl",
      )}
    >
      {children}
    </div>
  )
}
