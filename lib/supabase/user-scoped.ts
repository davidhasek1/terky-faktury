import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"
import { SignJWT } from "jose"

/**
 * Supabase klient pro požadavky bez cookies (MCP nad OAuth tokenem).
 *
 * Aplikace nikde nespoléhá na kontrolu vlastnictví v kódu — všechno drží RLS
 * (`auth.uid() = user_id`). Aby to platilo i pro MCP, podepíšeme si vlastní
 * krátkodobý Supabase JWT pro daného uživatele a pošleme ho v hlavičce.
 * Databáze pak vidí přesně stejnou identitu jako při práci v prohlížeči.
 *
 * Vědomě NEpoužíváme service-role klíč: ten by RLS obešel a jediná chybějící
 * podmínka v dotazu by odkryla data jiného uživatele.
 *
 * `userId` musí vždy pocházet z ověřeného access tokenu, nikdy ze vstupu
 * nástroje.
 */

/** Platnost podepsaného tokenu. Stačí na jeden požadavek. */
const TOKEN_LIFETIME_SECONDS = 120

export async function createUserScopedClient(userId: string): Promise<SupabaseClient> {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const jwtSecret = requireEnv("SUPABASE_JWT_SECRET")

  const now = Math.floor(Date.now() / 1000)
  const accessToken = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuer(`${supabaseUrl.replace(/\/$/, "")}/auth/v1`)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_LIFETIME_SECONDS)
    .sign(new TextEncoder().encode(jwtSecret))

  return createSupabaseClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Chybí proměnná prostředí ${name}`)
  return value
}
