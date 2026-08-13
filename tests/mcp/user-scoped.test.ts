import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Získávání uživatelského Supabase tokenu pro MCP.
 *
 * Testuje se skutečná posloupnost volání Auth Admin API; nahrazuje se jen
 * samotné SDK, aby testy nepotřebovaly Supabase projekt.
 */

const shared = vi.hoisted(() => ({
  getUserById: vi.fn(),
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
  createdClients: [] as { options: Record<string, unknown> }[],
}))

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    auth: { admin: { getUserById: shared.getUserById, generateLink: shared.generateLink } },
  }),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: Record<string, unknown>) => {
    shared.createdClients.push({ options })
    return { auth: { verifyOtp: shared.verifyOtp } }
  },
}))

import { createUserScopedClient, resetUserTokenCache } from "@/lib/supabase/user-scoped"

const USER = "11111111-1111-4111-8111-111111111111"

function sessionExpiringIn(seconds: number, accessToken = "supabase-access-token") {
  return {
    data: {
      session: {
        access_token: accessToken,
        expires_in: seconds,
        expires_at: Math.floor(Date.now() / 1000) + seconds,
      },
    },
    error: null,
  }
}

function authHeaderOfLastClient(): string | undefined {
  const last = shared.createdClients.at(-1)
  const global = last?.options.global as { headers?: Record<string, string> } | undefined
  return global?.headers?.Authorization
}

beforeEach(() => {
  resetUserTokenCache()
  shared.createdClients.length = 0
  shared.getUserById.mockReset().mockResolvedValue({
    data: { user: { id: USER, email: "terka@example.test" } },
    error: null,
  })
  shared.generateLink.mockReset().mockResolvedValue({
    data: { properties: { hashed_token: "hashed-token" } },
    error: null,
  })
  shared.verifyOtp.mockReset().mockResolvedValue(sessionExpiringIn(3600))
})

describe("createUserScopedClient", () => {
  it("vymění identitu uživatele za skutečný Supabase token", async () => {
    await createUserScopedClient(USER)

    expect(shared.getUserById).toHaveBeenCalledWith(USER)
    expect(shared.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "terka@example.test",
    })
    expect(shared.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hashed-token",
      type: "magiclink",
    })
    expect(authHeaderOfLastClient()).toBe("Bearer supabase-access-token")
  })

  it("nevytváří klienta se service-role klíčem — token patří uživateli", async () => {
    await createUserScopedClient(USER)

    // Kdyby se sem vloudil service-role klíč, RLS by přestala platit.
    expect(authHeaderOfLastClient()).not.toContain("service")
  })

  it("platný token použije znovu místo dalšího volání auth API", async () => {
    await createUserScopedClient(USER)
    await createUserScopedClient(USER)
    await createUserScopedClient(USER)

    expect(shared.generateLink).toHaveBeenCalledTimes(1)
  })

  it("token před koncem platnosti obnoví", async () => {
    shared.verifyOtp.mockResolvedValueOnce(sessionExpiringIn(30, "skoro-vyprsely"))
    await createUserScopedClient(USER)

    shared.verifyOtp.mockResolvedValueOnce(sessionExpiringIn(3600, "cerstvy"))
    await createUserScopedClient(USER)

    expect(shared.generateLink).toHaveBeenCalledTimes(2)
    expect(authHeaderOfLastClient()).toBe("Bearer cerstvy")
  })

  it("tokeny dvou uživatelů se nemíchají", async () => {
    const other = "22222222-2222-4222-8222-222222222222"

    shared.verifyOtp.mockResolvedValueOnce(sessionExpiringIn(3600, "token-prvniho"))
    await createUserScopedClient(USER)
    expect(authHeaderOfLastClient()).toBe("Bearer token-prvniho")

    shared.verifyOtp.mockResolvedValueOnce(sessionExpiringIn(3600, "token-druheho"))
    await createUserScopedClient(other)
    expect(authHeaderOfLastClient()).toBe("Bearer token-druheho")

    // A první uživatel dostane pořád ten svůj.
    await createUserScopedClient(USER)
    expect(authHeaderOfLastClient()).toBe("Bearer token-prvniho")
  })

  it("smazaný účet skončí srozumitelnou chybou", async () => {
    shared.getUserById.mockResolvedValue({ data: { user: null }, error: { message: "not found" } })

    await expect(createUserScopedClient(USER)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    })
  })

  it("účet bez e-mailu skončí srozumitelnou chybou", async () => {
    shared.getUserById.mockResolvedValue({
      data: { user: { id: USER, email: null } },
      error: null,
    })

    await expect(createUserScopedClient(USER)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    })
  })

  it("selhání Supabase neprosákne interním detailem", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    shared.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: "otp_expired: token has expired or is invalid" },
    })

    await expect(createUserScopedClient(USER)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Nepodařilo se ověřit identitu u Supabase.",
    })
    spy.mockRestore()
  })
})
