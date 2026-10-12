import { percentOf, sumScaled, type Scaled } from "@/lib/money"

/**
 * Výpočet dokladu nákladu. Čistá funkce — sdílí ji živý náhled ve formuláři,
 * uložení i MCP návrh, takže všude vychází stejné centy.
 *
 * IVA se počítá po položkách a sčítá, stejně jako na účtence: Mercadona
 * vytiskne základ a IVA zvlášť pro 10 % a 21 % a ty se pak sčítají.
 */

/** Výchozí sazba IVA nové položky (21 %) v setinách procenta. */
export const DEFAULT_EXPENSE_TAX_RATE: Scaled = 2100

/** Sazby IVA nabízené ve formuláři: obecná, snížená, supersnížená, osvobozeno. */
export const EXPENSE_TAX_RATES: Scaled[] = [2100, 1000, 400, 0]

export interface ExpenseItemTotals {
  subtotal: Scaled
  taxRate: Scaled
  taxAmount: Scaled
  total: Scaled
}

export interface RateTotal {
  taxRate: Scaled
  subtotal: Scaled
  taxAmount: Scaled
}

export interface ExpenseTotals {
  items: ExpenseItemTotals[]
  subtotal: Scaled
  taxAmount: Scaled
  total: Scaled
  /** Základ a IVA za každou použitou sazbu, od nejvyšší. */
  byRate: RateTotal[]
}

export function calculateExpenseTotals(input: {
  items: readonly { subtotal: Scaled; tax_rate: Scaled }[]
}): ExpenseTotals {
  const items = input.items.map((item): ExpenseItemTotals => {
    const taxAmount = percentOf(item.subtotal, item.tax_rate)
    return { subtotal: item.subtotal, taxRate: item.tax_rate, taxAmount, total: item.subtotal + taxAmount }
  })

  return {
    items,
    subtotal: sumScaled(items.map((item) => item.subtotal)),
    taxAmount: sumScaled(items.map((item) => item.taxAmount)),
    total: sumScaled(items.map((item) => item.total)),
    byRate: groupByRate(items),
  }
}

/** Sečte základ a IVA podle sazby. Sdílí ho doklad i výkaz za období. */
export function groupByRate(
  rows: readonly { taxRate: Scaled; subtotal: Scaled; taxAmount: Scaled }[],
): RateTotal[] {
  const byRate = new Map<Scaled, RateTotal>()
  for (const row of rows) {
    const bucket = byRate.get(row.taxRate) ?? { taxRate: row.taxRate, subtotal: 0, taxAmount: 0 }
    bucket.subtotal += row.subtotal
    bucket.taxAmount += row.taxAmount
    byRate.set(row.taxRate, bucket)
  }
  return [...byRate.values()].sort((a, b) => b.taxRate - a.taxRate)
}
