import { z } from "zod"

import { OAUTH_SCOPES } from "@/lib/oauth/config"
import { base64UrlEncode, sha256Base64Url } from "@/lib/oauth/crypto"
import type { ServiceContext } from "@/lib/services/context"
import { ServiceError, toServiceError } from "@/lib/services/errors"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

/**
 * Osobní přístupové tokeny pro MCP klienty, kteří neumí OAuth
 * (Claude Desktop, MCP Inspector, skripty).
 *
 * Token je neprůhledný náhodný řetězec; v databázi je jen jeho SHA-256, takže
 * ani přístup do databáze původní hodnotu neodhalí. Uživatel ho vidí jedinkrát
 * při vytvoření.
 */

/** Prefix odlišuje osobní token od OAuth JWT už na první pohled. */
export const PERSONAL_TOKEN_PREFIX = "tfm_"

export const TOKEN_TTL_DAYS = [30, 90, 365] as const

export const personalTokenInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Zadejte název tokenu")
    .max(60, "Název může mít nejvýše 60 znaků"),
  scope: z.enum(["invoices:read", "invoices:read invoices:write"]).default("invoices:read"),
  ttl_days: z
    .number()
    .int()
    .refine((value) => (TOKEN_TTL_DAYS as readonly number[]).includes(value), "Neplatná platnost"),
})

export type PersonalTokenInput = z.infer<typeof personalTokenInputSchema>

export interface PersonalTokenSummary {
  id: string
  name: string
  token_hint: string
  scope: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface CreatedPersonalToken extends PersonalTokenSummary {
  /** Otevřená podoba tokenu. Vrací se jedinkrát a nikam se neukládá. */
  token: string
}

export interface PersonalTokenIdentity {
  userId: string
  tokenId: string
  scope: string
}

/**
 * Projekt nemá vygenerované typy schématu, takže odpověď z `rpc` přichází
 * netypovaná. Tvar hlídají samotné funkce v migraci 016.
 */
function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

/** 256 bitů entropie — token nejde uhodnout ani vygenerovat hrubou silou. */
function generateToken(): string {
  return `${PERSONAL_TOKEN_PREFIX}${base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))}`
}

export async function createPersonalToken(
  ctx: ServiceContext,
  input: PersonalTokenInput,
): Promise<CreatedPersonalToken> {
  const token = generateToken()

  const { data, error } = await ctx.supabase.rpc("mcp_create_personal_token", {
    p_name: input.name,
    p_token_hash: await sha256Base64Url(token),
    p_token_hint: token.slice(-4),
    p_scope: input.scope,
    p_ttl_days: input.ttl_days,
  })

  if (error) {
    // 54000 = program_limit_exceeded, tj. překročený počet platných tokenů.
    if (error.code === "54000" || error.message?.includes("maxima")) {
      throw new ServiceError(
        "CONFLICT",
        "Máte maximální počet platných tokenů (10). Nejdřív některý odvolejte.",
      )
    }
    throw toServiceError(error, "Nepodařilo se vytvořit token")
  }

  const created = asRows<PersonalTokenSummary>(data)[0]
  if (!created) throw new ServiceError("INTERNAL_ERROR", "Nepodařilo se vytvořit token")

  return { ...created, token }
}

export async function listPersonalTokens(ctx: ServiceContext): Promise<PersonalTokenSummary[]> {
  const { data, error } = await ctx.supabase.rpc("mcp_list_personal_tokens")

  if (error) throw toServiceError(error, "Nepodařilo se načíst tokeny")
  return asRows<PersonalTokenSummary>(data)
}

export async function revokePersonalToken(ctx: ServiceContext, tokenId: string): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("mcp_revoke_personal_token", { p_id: tokenId })

  if (error) throw toServiceError(error, "Nepodařilo se odvolat token")
  if (data !== true) {
    throw new ServiceError("CONFLICT", "Token neexistuje nebo už byl odvolaný.")
  }
}

/** Jak dlouho se čeká, než se znovu zapíše čas posledního použití. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000

/**
 * Ověří osobní token při MCP volání. Vrací `null` pro neznámý, odvolaný
 * i vypršelý token — volající ty případy nemá rozlišovat.
 *
 * Běží pod service-role klientem, protože v okamžiku ověření ještě neexistuje
 * žádná identita. Dotaz je přišpendlený na jeden konkrétní otisk tokenu.
 */
export async function verifyPersonalToken(token: string): Promise<PersonalTokenIdentity | null> {
  if (!token.startsWith(PERSONAL_TOKEN_PREFIX)) return null

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from("mcp_personal_tokens")
    .select("id, user_id, scope, expires_at, revoked_at, last_used_at")
    .eq("token_hash", await sha256Base64Url(token))
    .maybeSingle<{
      id: string
      user_id: string
      scope: string
      expires_at: string
      revoked_at: string | null
      last_used_at: string | null
    }>()

  if (error) {
    console.error("[mcp] Ověření osobního tokenu selhalo:", error.code ?? error.message)
    return null
  }

  if (!data || data.revoked_at) return null
  if (new Date(data.expires_at).getTime() <= Date.now()) return null

  await stampLastUsed(supabase, data.id, data.last_used_at)

  return { userId: data.user_id, tokenId: data.id, scope: normalizeStoredScope(data.scope) }
}

async function stampLastUsed(
  supabase: ReturnType<typeof createServiceRoleClient>,
  tokenId: string,
  lastUsedAt: string | null,
): Promise<void> {
  const recent =
    lastUsedAt !== null && Date.now() - new Date(lastUsedAt).getTime() < LAST_USED_THROTTLE_MS

  if (recent) return

  const { error } = await supabase
    .from("mcp_personal_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenId)

  if (error) {
    // Údaj je jen informativní; kvůli němu volání neshazujeme.
    console.error("[mcp] Nepodařilo se zapsat poslední použití tokenu:", error.code)
  }
}

/**
 * Zahodí rozsahy, které server mezitím přestal znát. Když nezbude nic, vrací
 * prázdno — nikdy ne výchozí rozsah, aby se z neznámé hodnoty nestala plná práva.
 */
function normalizeStoredScope(scope: string): string {
  return scope
    .split(/\s+/)
    .filter((value) => (OAUTH_SCOPES as readonly string[]).includes(value))
    .join(" ")
}
