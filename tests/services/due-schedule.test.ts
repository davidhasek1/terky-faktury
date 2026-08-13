import { describe, expect, it } from "vitest"
import { axisPosition, buildDueSchedule } from "@/lib/services/due-schedule"

const today = new Date("2026-08-13T10:30:00Z")
const inv = (due: string, paid: string | null = null) => ({ due_date: due, paid_date: paid })

describe("buildDueSchedule", () => {
  it("rozřadí faktury podle vzdálenosti od dneška", () => {
    const s = buildDueSchedule(
      [inv("2026-07-30"), inv("2026-08-15"), inv("2026-09-20")],
      today,
    )
    expect(s.overdue.map((e) => e.daysFromToday)).toEqual([-14])
    expect(s.due.map((e) => e.daysFromToday)).toEqual([2])
    expect(s.upcoming.map((e) => e.daysFromToday)).toEqual([38])
  })

  it("počítá dnešek jako nula, ne jako po splatnosti", () => {
    const s = buildDueSchedule([inv("2026-08-13")], today)
    expect(s.overdue).toEqual([])
    expect(s.due[0].daysFromToday).toBe(0)
  })

  it("ignoruje denní dobu — splatnost je datum, ne okamžik", () => {
    const late = new Date("2026-08-13T23:59:00Z")
    expect(buildDueSchedule([inv("2026-08-13")], late).due[0].daysFromToday).toBe(0)
  })

  it("zaplacené faktury na osu nepatří", () => {
    const s = buildDueSchedule([inv("2026-07-01", "2026-07-05")], today)
    expect(s.overdue).toEqual([])
    expect(s.due).toEqual([])
    expect(s.upcoming).toEqual([])
  })

  it("řadí od nejstarší splatnosti", () => {
    const s = buildDueSchedule([inv("2026-07-30"), inv("2026-07-01")], today)
    expect(s.overdue.map((e) => e.daysFromToday)).toEqual([-43, -14])
  })

  it("hlásí rozpětí osy", () => {
    const s = buildDueSchedule([inv("2026-07-30"), inv("2026-09-20")], today)
    expect(s.span).toEqual({ min: -14, max: 38 })
  })

  it("u prázdného vstupu vrátí rozpětí kolem dneška", () => {
    expect(buildDueSchedule([], today).span).toEqual({ min: 0, max: 0 })
  })
})

describe("axisPosition", () => {
  it("mapuje rozpětí na 0..1", () => {
    expect(axisPosition(-10, { min: -10, max: 10 })).toBe(0)
    expect(axisPosition(0, { min: -10, max: 10 })).toBe(0.5)
    expect(axisPosition(10, { min: -10, max: 10 })).toBe(1)
  })

  it("při nulovém rozpětí staví doprostřed místo dělení nulou", () => {
    expect(axisPosition(0, { min: 0, max: 0 })).toBe(0.5)
  })
})
