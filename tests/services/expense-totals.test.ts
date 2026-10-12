import { describe, expect, it } from "vitest"

import { calculateExpenseTotals } from "@/lib/services/expense-totals"

describe("calculateExpenseTotals", () => {
  it("dopočte IVA a celkem ze základu", () => {
    expect(calculateExpenseTotals({ subtotal: 4000, tax_rate: 2100 })).toEqual({
      taxAmount: 840,
      total: 4840,
    })
  })

  it("zaokrouhlí IVA na centy obchodně", () => {
    // 10,05 € × 21 % = 2,1105 € → 2,11 €
    expect(calculateExpenseTotals({ subtotal: 1005, tax_rate: 2100 }).taxAmount).toBe(211)
    // 0,50 € × 10 % = 0,05 €
    expect(calculateExpenseTotals({ subtotal: 50, tax_rate: 1000 }).taxAmount).toBe(5)
  })

  it("při sazbě 0 je celkem rovno základu", () => {
    expect(calculateExpenseTotals({ subtotal: 29400, tax_rate: 0 })).toEqual({
      taxAmount: 0,
      total: 29400,
    })
  })
})
