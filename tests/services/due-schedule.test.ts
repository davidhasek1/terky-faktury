import { describe, expect, it } from "vitest"
import { axisPosition, buildDueSchedule, groupByDay } from "@/lib/services/due-schedule"

const today = new Date("2026-08-13T10:30:00Z")
const inv = (due: string, paid: string | null = null) => ({ due_date: due, paid_date: paid })
const invT = (due: string, total: number, paid: string | null = null) => ({
  due_date: due,
  paid_date: paid,
  total,
})

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
    // Oba časy jsou na stejném kalendářním dni (13. srpna v místním čase)
    const morning = new Date(2026, 7, 13, 8, 0)
    const late = new Date(2026, 7, 13, 23, 30)
    expect(buildDueSchedule([inv("2026-08-13")], morning).due[0].daysFromToday).toBe(0)
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

  it("je agnostické k místnímu času — faktura splatná dnes je vždy due, nikdy overdue", () => {
    // new Date(2026, 7, 14, 0, 30) = 14 August 00:30 local time
    // V Prague = 2026-08-13T22:30:00Z, ale kalendář místního uživatele říká "dnes je 14. srpna"
    const localToday = new Date(2026, 7, 14, 0, 30)
    const s = buildDueSchedule([inv("2026-08-14")], localToday)
    expect(s.due[0].daysFromToday).toBe(0)
    expect(s.overdue).toEqual([])
  })

  it("je agnostické k místnímu času — včerejší splatnost je overdue i v brzké hodině", () => {
    const localToday = new Date(2026, 7, 14, 0, 30)
    const s = buildDueSchedule([inv("2026-08-13")], localToday)
    expect(s.overdue[0].daysFromToday).toBe(-1)
    expect(s.due).toEqual([])
  })

  it("rozlišuje hranici DUE_SOON_DAYS: 7 dní dopředu je due", () => {
    const s = buildDueSchedule([inv("2026-08-20")], today)
    expect(s.due.map((e) => e.daysFromToday)).toContain(7)
  })

  it("rozlišuje hranici DUE_SOON_DAYS: 8 dní dopředu je upcoming", () => {
    const s = buildDueSchedule([inv("2026-08-21")], today)
    expect(s.upcoming.map((e) => e.daysFromToday)).toContain(8)
  })
})

describe("groupByDay", () => {
  it("sloučí faktury se stejnou splatností do jedné skupiny", () => {
    const s = buildDueSchedule([invT("2026-08-15", 1000), invT("2026-08-15", 500)], today)
    const groups = groupByDay(s.due)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(2)
  })

  it("nechá faktury z různých dní oddělené", () => {
    const s = buildDueSchedule([invT("2026-08-15", 1000), invT("2026-08-16", 500)], today)
    const all = [...s.overdue, ...s.due, ...s.upcoming]
    expect(groupByDay(all)).toHaveLength(2)
  })

  it("vrátí skupiny v chronologickém pořadí", () => {
    const s = buildDueSchedule(
      [invT("2026-09-20", 100), invT("2026-07-30", 200), invT("2026-08-15", 300)],
      today,
    )
    const all = [...s.overdue, ...s.due, ...s.upcoming]
    expect(groupByDay(all).map((g) => g.daysFromToday)).toEqual([-14, 2, 38])
  })

  it("u prázdného vstupu nevrátí žádné skupiny", () => {
    expect(groupByDay([])).toEqual([])
  })

  it("sečte částku za den správně", () => {
    const s = buildDueSchedule([invT("2026-08-15", 1000), invT("2026-08-15", 2500)], today)
    expect(groupByDay(s.due)[0].total).toBe(3500)
  })

  it("zachová bucket skupiny", () => {
    const s = buildDueSchedule([invT("2026-07-30", 1000)], today)
    expect(groupByDay(s.overdue)[0].bucket).toBe("overdue")
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
