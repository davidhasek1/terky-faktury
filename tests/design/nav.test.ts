import { describe, expect, it } from "vitest"
import { NAV_ITEMS, isActive } from "@/components/app-shell/nav-items"

describe("zvýraznění aktivní položky", () => {
  it("na přehledu zvýrazní jen přehled", () => {
    expect(isActive("/", "/")).toBe(true)
    expect(isActive("/", "/invoices")).toBe(false)
  })

  it("zvýrazní sekci i na podstránce", () => {
    expect(isActive("/invoices/new", "/invoices")).toBe(true)
    expect(isActive("/invoices/abc/edit", "/invoices")).toBe(true)
  })

  it("nezvýrazní přehled na podstránce", () => {
    expect(isActive("/invoices", "/")).toBe(false)
  })

  it("nesplete si sekce se shodným prefixem", () => {
    expect(isActive("/invoices-archive", "/invoices")).toBe(false)
  })
})

describe("navigace", () => {
  it("vede na všech šest sekcí", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/", "/invoices", "/customers", "/activities", "/company", "/connect",
    ])
  })
})
