import { multiplyScaled, percentOf, sumScaled, type Scaled } from "@/lib/money"

/**
 * Výpočet faktury. Čistá funkce bez závislosti na databázi — používá ji
 * živý náhled ve formuláři, servisní vrstva při ukládání i MCP nástroj
 * `prepare_invoice`, takže uživatel v ChatGPT vidí přesně ta čísla,
 * která se pak uloží.
 */

/** Výchozí sazba DPH ve formuláři (21 %) v setinách procenta. */
export const DEFAULT_TAX_RATE: Scaled = 2100

/** Retención pro podnikající subjekty (15 %). */
export const BUSINESS_RETENTION_RATE: Scaled = 1500

export interface InvoiceTotalsInput {
  items: readonly { quantity: Scaled; unit_price: Scaled }[]
  tax_rate: Scaled
  retention_rate: Scaled
}

export interface InvoiceTotals {
  lineTotals: Scaled[]
  subtotal: Scaled
  taxAmount: Scaled
  retentionAmount: Scaled
  total: Scaled
}

export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const lineTotals = input.items.map((item) => multiplyScaled(item.quantity, item.unit_price))
  const subtotal = sumScaled(lineTotals)
  const taxAmount = percentOf(subtotal, input.tax_rate)
  const retentionAmount = percentOf(subtotal, input.retention_rate)

  return {
    lineTotals,
    subtotal,
    taxAmount,
    retentionAmount,
    total: subtotal + taxAmount - retentionAmount,
  }
}

/**
 * Pravidlo z formuláře: podnikajícím subjektům se sráží retención 15 %,
 * ostatním nic. Platí jen když sazbu nezadá uživatel výslovně.
 */
export function defaultRetentionRate(isBusiness: boolean | null | undefined): Scaled {
  return isBusiness ? BUSINESS_RETENTION_RATE : 0
}
