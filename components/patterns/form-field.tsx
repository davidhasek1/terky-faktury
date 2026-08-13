import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * Jedno pole formuláře: popisek, ovládací prvek, nápověda nebo chyba.
 *
 * Je to obal, ne komponenta, která si vlastní `Input` — díky tomu zvládne
 * stejně dobře textarea, select i skupinu přepínačů, aniž by pro každý typ
 * potřebovala zvláštní větev. Ovládací prvek si dodá volající.
 *
 * Nahrazuje čtyři varianty téhož, které si formuláře držely samy.
 */
export function FormField({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  /** Musí sedět na `id` ovládacího prvku, jinak popisek nikam neukazuje. */
  id: string
  label: string
  required?: boolean
  /** Krátká nápověda pod polem. Vysvětluje, ne prodává. */
  hint?: ReactNode
  /** Chyba nahrazuje nápovědu — obojí naráz jen soutěží o pozornost. */
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={cn("space-y-2", className)} data-slot="form-field">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>

      {/* Ovládací prvek si `aria-describedby` a `aria-invalid` nastaví sám —
          tady jen říkáme, na jaké id se má odkázat. */}
      <div data-describedby={describedBy}>{children}</div>

      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Řádek s dvěma poli vedle sebe od tabletu nahoru. Na mobilu pod sebou.
 * Existuje proto, že `grid md:grid-cols-2 gap-6` bylo rozepsané v každém
 * formuláři zvlášť.
 */
export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 md:grid-cols-2">{children}</div>
}

/**
 * Spodní lišta formuláře. Primární akce vpravo, zrušení vedle ní —
 * pořadí odpovídá tomu, jak čte oko, a je stejné ve všech formulářích.
 */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
      {children}
    </div>
  )
}
