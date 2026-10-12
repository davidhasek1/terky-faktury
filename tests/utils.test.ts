import { describe, expect, it } from "vitest"

import { expenseCount, invoiceCount } from "@/lib/utils"

describe("české tvary počtu", () => {
  it("skloňuje podle počtu", () => {
    expect([0, 1, 2, 4, 5, 22].map(invoiceCount)).toEqual([
      "0 faktur",
      "1 faktura",
      "2 faktury",
      "4 faktury",
      "5 faktur",
      "22 faktur",
    ])
    expect(expenseCount(3)).toBe("3 náklady")
  })
})
