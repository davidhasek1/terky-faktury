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
  labelAction,
  required,
  hint,
  error,
  children,
  className,
}: {
  /** Musí sedět na `id` ovládacího prvku, jinak popisek nikam neukazuje. */
  id: string
  label: string
  /**
   * Drobná akce na řádku popisku, zarovnaná doprava — třeba odkaz
   * „Zapomněla jsi?" u hesla. Bez ní se popisek chová jako dřív.
   */
  labelAction?: ReactNode
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
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {required && (
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        {labelAction}
      </div>

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
 * Tělo formuláře — jedna karta na ploše stránky.
 *
 * Dřív pole ležela přímo na pozadí a sekce byly jen text s vlasovou linkou,
 * takže se to nečetlo jako formulář, ale jako volný seznam políček. Karta
 * z nich dělá jeden předmět: doklad, který se vyplňuje.
 */
export function FormShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">{children}</div>
  )
}

/**
 * Sekce formuláře: název a vysvětlení ve sloupci vlevo, pole vpravo.
 *
 * Levý sloupec se při scrollování drží, takže i u dvanáctipoložkových
 * firemních údajů je pořád vidět, ve které části formuláře jsi. Na mobilu
 * se rozvržení překlopí pod sebe.
 *
 * Vysvětlení patří sem, ne pod titulek stránky — týká se těchhle polí,
 * ne celé obrazovky.
 */
export function FormSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-6 border-b border-border px-5 py-6 sm:px-6 sm:py-7 md:grid-cols-[220px_1fr] md:gap-10">
      <div className="md:sticky md:top-20 md:self-start">
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      <div className="grid gap-5">{children}</div>
    </section>
  )
}

/**
 * Spodní lišta formuláře. Primární akce vpravo, zrušení vedle ní —
 * pořadí odpovídá tomu, jak čte oko, a je stejné ve všech formulářích.
 *
 * Drží se u spodního okraje, dokud formulář nedoscrolluješ na konec. U
 * dlouhých formulářů to ušetří cestu dolů a zpátky nahoru.
 */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 rounded-b-lg border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:px-6">
      {children}
    </div>
  )
}
