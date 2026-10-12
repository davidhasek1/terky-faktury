import { describe, expect, it } from "vitest"

import {
  detectPreset,
  periodContaining,
  periodLabel,
  resolvePeriod,
  shiftPeriod,
} from "@/lib/services/report-period"

describe("periodContaining", () => {
  it("najde měsíc včetně posledního dne", () => {
    expect(periodContaining("month", "2026-09-17")).toEqual({ from: "2026-09-01", to: "2026-09-30" })
  })

  it("zná přestupný únor", () => {
    expect(periodContaining("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" })
    expect(periodContaining("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" })
  })

  it("najde čtvrtletí", () => {
    expect(periodContaining("quarter", "2026-10-12")).toEqual({ from: "2026-10-01", to: "2026-12-31" })
    expect(periodContaining("quarter", "2026-03-31")).toEqual({ from: "2026-01-01", to: "2026-03-31" })
  })

  it("najde rok", () => {
    expect(periodContaining("year", "2026-06-01")).toEqual({ from: "2026-01-01", to: "2026-12-31" })
  })
})

describe("shiftPeriod", () => {
  it("posune čtvrtletí přes přelom roku", () => {
    expect(shiftPeriod({ from: "2026-01-01", to: "2026-03-31" }, -1)).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    })
    expect(shiftPeriod({ from: "2026-10-01", to: "2026-12-31" }, 1)).toEqual({
      from: "2027-01-01",
      to: "2027-03-31",
    })
  })

  it("posune měsíc z ledna do prosince", () => {
    expect(shiftPeriod({ from: "2026-01-01", to: "2026-01-31" }, -1)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    })
  })

  it("vlastní období nechá být", () => {
    const custom = { from: "2026-01-05", to: "2026-02-10" }
    expect(shiftPeriod(custom, 1)).toEqual(custom)
  })
})

describe("detectPreset a periodLabel", () => {
  it("pozná typ období a pojmenuje ho", () => {
    expect(detectPreset({ from: "2026-07-01", to: "2026-09-30" })).toBe("quarter")
    expect(periodLabel({ from: "2026-07-01", to: "2026-09-30" })).toBe("3. čtvrtletí 2026")
    expect(periodLabel({ from: "2026-09-01", to: "2026-09-30" })).toBe("září 2026")
    expect(periodLabel({ from: "2026-01-01", to: "2026-12-31" })).toBe("2026")
    expect(periodLabel({ from: "2026-01-05", to: "2026-02-10" })).toBe("5. 1. 2026 – 10. 2. 2026")
  })
})

describe("resolvePeriod", () => {
  it("bez parametrů vrátí aktuální čtvrtletí", () => {
    expect(resolvePeriod({}, "2026-10-12")).toEqual({
      period: { from: "2026-10-01", to: "2026-12-31" },
      valid: true,
    })
  })

  it("převezme platné období z URL", () => {
    expect(resolvePeriod({ from: "2026-01-05", to: "2026-02-10" }, "2026-10-12").period).toEqual({
      from: "2026-01-05",
      to: "2026-02-10",
    })
  })

  it("odmítne obrácené nebo neexistující období", () => {
    expect(resolvePeriod({ from: "2026-05-01", to: "2026-04-01" }, "2026-10-12").valid).toBe(false)
    expect(resolvePeriod({ from: "2026-02-30", to: "2026-03-01" }, "2026-10-12").valid).toBe(false)
    expect(resolvePeriod({ from: "2026-02-01" }, "2026-10-12").valid).toBe(false)
  })
})
