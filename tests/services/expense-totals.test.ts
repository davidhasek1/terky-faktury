import { describe, expect, it } from "vitest"

import { calculateExpenseTotals } from "@/lib/services/expense-totals"

describe("calculateExpenseTotals", () => {
  it("dopočte IVA a celkem z jedné položky", () => {
    expect(calculateExpenseTotals({ items: [{ subtotal: 4000, tax_rate: 2100 }] })).toMatchObject({
      subtotal: 4000,
      taxAmount: 840,
      total: 4840,
    })
  })

  it("sečte účtenku s více sazbami a rozepíše ji po sazbách", () => {
    // Mercadona: potraviny 10 %, drogerie 21 %, a ještě jedna položka za 21 %.
    const totals = calculateExpenseTotals({
      items: [
        { subtotal: 2350, tax_rate: 1000 },
        { subtotal: 1200, tax_rate: 2100 },
        { subtotal: 800, tax_rate: 2100 },
      ],
    })

    expect(totals.items.map((item) => item.taxAmount)).toEqual([235, 252, 168])
    expect(totals).toMatchObject({ subtotal: 4350, taxAmount: 655, total: 5005 })
    expect(totals.byRate).toEqual([
      { taxRate: 2100, subtotal: 2000, taxAmount: 420 },
      { taxRate: 1000, subtotal: 2350, taxAmount: 235 },
    ])
  })

  it("zaokrouhluje IVA po položkách, ne až ze součtu", () => {
    // 2 × 0,05 € při 10 %: po položkách 0,01 + 0,01 = 0,02 €; ze součtu by vyšlo 0,01 €.
    const totals = calculateExpenseTotals({
      items: [
        { subtotal: 5, tax_rate: 1000 },
        { subtotal: 5, tax_rate: 1000 },
      ],
    })
    expect(totals.taxAmount).toBe(2)
  })

  it("při sazbě 0 je celkem rovno základu", () => {
    expect(calculateExpenseTotals({ items: [{ subtotal: 29400, tax_rate: 0 }] })).toMatchObject({
      taxAmount: 0,
      total: 29400,
    })
  })
})
