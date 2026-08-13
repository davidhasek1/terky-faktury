import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"

import { ServiceError } from "@/lib/services/errors"

import { createServiceRoleClient } from "./service-role"

/**
 * Supabase klient pro požadavky bez cookies (MCP nad OAuth tokenem).
 *
 * Aplikace nikde nespoléhá na kontrolu vlastnictví v kódu — všechno drží RLS
 * (`auth.uid() = user_id`). Aby to platilo i pro MCP, vyžádáme si od Supabase
 * **skutečný access token** daného uživatele a pošleme ho v hlavičce. Databáze
 * pak vidí přesně stejnou identitu jako při práci v prohlížeči.
 *
 * Token se získává přes Auth Admin API: `generateLink` vyrobí jednorázový
 * `hashed_token` (e-mail se **neodesílá**, endpoint jen generuje) a `verifyOtp`
 * ho vymění za session. Vlastní podepisování tokenu tu záměrně není — projekt
 * je na asymetrických podpisových klíčích a jejich privátní půlku Supabase ven
 * nevydává. Legacy HS256 secret by fungoval, ale je ve stavu „previously used"
 * a Supabase sám doporučuje ho revokovat, takže by nám integrace jednou tiše
 * odešla.
 *
 * Vědomě NEpoužíváme service-role klienta pro čtení dat: ten by RLS obešel
 * a jediná chybějící podmínka v dotazu by odkryla data jiného uživatele.
 *
 * `userId` musí vždy pocházet z ověřeného access tokenu, nikdy ze vstupu
 * nástroje.
 */

interface CachedSession {
  accessToken: string
  /** Epocha v sekundách, kdy token vyprší. */
  expiresAt: number
  /** E-mail účtu. Drží se s tokenem, protože ho stejně čteme při jeho vydání. */
  email: string
}

/**
 * Tokeny držíme jen v paměti procesu, ne v databázi — krátkodobé přihlašovací
 * údaje nemá smysl ukládat na disk. Na serverless běhu to znamená, že si každá
 * studená instance vyžádá vlastní token; při hodinové platnosti je to zanedbatelné.
 */
const sessionCache = new Map<string, CachedSession>()

/** Obnovujeme s rezervou, ať token nevyprší uprostřed probíhajícího volání. */
const EXPIRY_MARGIN_SECONDS = 60

export async function createUserScopedClient(userId: string): Promise<SupabaseClient> {
  const { accessToken } = await sessionFor(userId)

  return createAnonClient({ Authorization: `Bearer ${accessToken}` })
}

/**
 * E-mail účtu, pod kterým MCP jede. Bere se ze stejné cache jako token, takže
 * navíc nic nestojí. Nástroje ho vracejí ve výsledku, aby bylo z konverzace
 * poznat, čí data se zrovna čtou — bez toho vypadá „nemáš žádné faktury"
 * u špatně připojeného konektoru úplně stejně jako prázdný účet.
 */
export async function getAccountEmail(userId: string): Promise<string | null> {
  try {
    return (await sessionFor(userId)).email
  } catch (error) {
    console.error("[user-scoped] Nepodařilo se zjistit e-mail účtu:", error)
    return null
  }
}

/** Vyprázdní cache. Určeno pro testy. */
export function resetUserTokenCache(): void {
  sessionCache.clear()
}

async function sessionFor(userId: string): Promise<CachedSession> {
  const now = Math.floor(Date.now() / 1000)
  const cached = sessionCache.get(userId)

  if (cached && cached.expiresAt - EXPIRY_MARGIN_SECONDS > now) {
    return cached
  }

  const minted = await mintAccessToken(userId)
  sessionCache.set(userId, minted)
  return minted
}

async function mintAccessToken(userId: string): Promise<CachedSession> {
  const admin = createServiceRoleClient()

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)

  if (userError || !userData?.user) {
    console.error("[user-scoped] Uživatel nenalezen:", userError?.message)
    throw new ServiceError("UNAUTHENTICATED", "Účet už neexistuje. Připoj aplikaci znovu.")
  }

  const email = userData.user.email
  if (!email) {
    throw new ServiceError(
      "UNAUTHENTICATED",
      "Účet nemá e-mailovou adresu, takže ho přes MCP nelze použít.",
    )
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })

  const hashedToken = link?.properties?.hashed_token
  if (linkError || !hashedToken) {
    console.error("[user-scoped] generateLink selhal:", linkError?.message)
    throw new ServiceError("INTERNAL_ERROR", "Nepodařilo se ověřit identitu u Supabase.")
  }

  const { data: verified, error: verifyError } = await createAnonClient().auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  })

  const session = verified?.session
  if (verifyError || !session) {
    console.error("[user-scoped] verifyOtp selhal:", verifyError?.message)
    throw new ServiceError("INTERNAL_ERROR", "Nepodařilo se ověřit identitu u Supabase.")
  }

  return {
    accessToken: session.access_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    email,
  }
}

function createAnonClient(headers?: Record<string, string>): SupabaseClient {
  return createSupabaseClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      ...(headers ? { global: { headers } } : {}),
    },
  )
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Chybí proměnná prostředí ${name}`)
  return value
}
