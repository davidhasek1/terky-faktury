import { percentOf, type Scaled } from "@/lib/money"

/**
 * Výpočet nákladu: ze základu a sazby IVA dopočte daň a celkovou částku.
 * Čistá funkce — sdílí ji živý náhled ve formuláři, uložení i MCP návrh,
 * takže všude vychází stejné haléře (centy).
 */

/** Výchozí sazba IVA ve formuláři nákladu (21 %) v setinách procenta. */
export const DEFAULT_EXPENSE_TAX_RATE: Scaled = 2100

/** Sazby IVA nabízené ve formuláři: obecná, snížená, supersnížená, osvobozeno. */
export const EXPENSE_TAX_RATES: Scaled[] = [2100, 1000, 400, 0]

export interface ExpenseTotals {
  taxAmount: Scaled
  total: Scaled
}

export function calculateExpenseTotals(input: { subtotal: Scaled; tax_rate: Scaled }): ExpenseTotals {
  const taxAmount = percentOf(input.subtotal, input.tax_rate)
  return { taxAmount, total: input.subtotal + taxAmount }
}
