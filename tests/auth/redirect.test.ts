import { afterEach, describe, expect, it } from "vitest"

import { authRedirectBase, authRedirectUrl } from "@/lib/auth/redirect"

const original = process.env.NEXT_PUBLIC_SITE_URL

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = original
})

describe("authRedirectBase", () => {
  it("bere origin z NEXT_PUBLIC_SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://invoice.tgpropertycare.com"
    expect(authRedirectBase()).toBe("https://invoice.tgpropertycare.com")
  })

  it("useká koncové lomítko, aby nevznikl dvojitý oddělovač", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://invoice.tgpropertycare.com/"
    expect(authRedirectUrl("/auth/reset-password")).toBe(
      "https://invoice.tgpropertycare.com/auth/reset-password",
    )
  })
})

describe("authRedirectUrl", () => {
  it("skládá odkaz na obnovu hesla na produkčním originu", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://invoice.tgpropertycare.com"
    expect(authRedirectUrl("/auth/reset-password")).toBe(
      "https://invoice.tgpropertycare.com/auth/reset-password",
    )
  })

  it("bez cesty vrací samotný origin (potvrzení registrace)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://invoice.tgpropertycare.com"
    expect(authRedirectUrl()).toBe("https://invoice.tgpropertycare.com")
  })

  it("doplní chybějící lomítko na začátku cesty", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://invoice.tgpropertycare.com"
    expect(authRedirectUrl("auth/reset-password")).toBe(
      "https://invoice.tgpropertycare.com/auth/reset-password",
    )
  })

  it("nikdy nesáhne po localhostu, když je origin nastavený", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://invoice.tgpropertycare.com"
    expect(authRedirectUrl("/auth/reset-password")).not.toContain("localhost")
  })
})
