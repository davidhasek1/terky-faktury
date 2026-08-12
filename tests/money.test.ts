import { describe, expect, it } from "vitest"

import { formatScaled, fromDecimal, parseDecimal, percentOf, toDecimal } from "@/lib/money"
import {
  BUSINESS_RETENTION_RATE,
  calculateInvoiceTotals,
  defaultRetentionRate,
} from "@/lib/services/invoice-totals"

describe("parseDecimal", () => {
  it("přijímá tečku i čárku a mezery mezi tisíci", () => {
    expect(parseDecimal("100")).toBe(10_000)
    expect(parseDecimal("100.50")).toBe(10_050)
    expect(parseDecimal("100,50")).toBe(10_050)
    expect(parseDecimal("1 234,56")).toBe(123_456)
  })

  it("odmítne nesmysly místo tichého nulování", () => {
    expect(() => parseDecimal("")).toThrow(RangeError)
    expect(() => parseDecimal("abc")).toThrow(RangeError)
    expect(() => parseDecimal("10.123")).toThrow(RangeError)
    expect(() => parseDecimal(Number.NaN)).toThrow(RangeError)
  })

  it("přežije číslo zatížené chybou plovoucí čárky", () => {
    expect(parseDecimal(0.1 + 0.2)).toBe(30)
  })
})

describe("výpočty v setinách", () => {
  it("nepodléhá chybě plovoucí desetinné čárky", () => {
    // 0.1 + 0.2 !== 0.3 v plovoucí aritmetice; v setinách ano.
    const totals = calculateInvoiceTotals({
      items: [
        { quantity: parseDecimal("1"), unit_price: parseDecimal("0.10") },
        { quantity: parseDecimal("1"), unit_price: parseDecimal("0.20") },
      ],
      tax_rate: 0,
      retention_rate: 0,
    })

    expect(totals.subtotal).toBe(30)
    expect(toDecimal(totals.subtotal)).toBe(0.3)
  })

  it("spočítá DPH a retención jako aplikace", () => {
    const totals = calculateInvoiceTotals({
      items: [{ quantity: parseDecimal("2"), unit_price: parseDecimal("50") }],
      tax_rate: parseDecimal("21"),
      retention_rate: parseDecimal("15"),
    })

    expect(totals.subtotal).toBe(10_000)
    expect(totals.taxAmount).toBe(2_100)
    expect(totals.retentionAmount).toBe(1_500)
    expect(totals.total).toBe(10_600)
  })

  it("zaokrouhluje procenta obchodně (půlka nahoru)", () => {
    // 0,05 € z 1 € při sazbě 5 % je přesně 5 centů, 4,5 centu → 5 centů.
    expect(percentOf(parseDecimal("0.90"), parseDecimal("5"))).toBe(5)
  })

  it("desetinné množství krát cena vyjde na celé centy", () => {
    const totals = calculateInvoiceTotals({
      items: [{ quantity: parseDecimal("1.5"), unit_price: parseDecimal("33.33") }],
      tax_rate: 0,
      retention_rate: 0,
    })

    expect(totals.subtotal).toBe(5_000)
  })
})

describe("výchozí retención", () => {
  it("podnikajícím subjektům 15 %, ostatním nula", () => {
    expect(defaultRetentionRate(true)).toBe(BUSINESS_RETENTION_RATE)
    expect(defaultRetentionRate(false)).toBe(0)
    expect(defaultRetentionRate(null)).toBe(0)
  })
})

describe("převody na hranici databáze", () => {
  it("čte a zapisuje DECIMAL(x,2) beze ztráty", () => {
    expect(fromDecimal(121)).toBe(12_100)
    expect(fromDecimal(null)).toBe(0)
    expect(toDecimal(12_100)).toBe(121)
  })

  it("formátuje v eurech", () => {
    expect(formatScaled(12_100)).toContain("121")
    expect(formatScaled(12_100)).toContain("€")
  })
})
