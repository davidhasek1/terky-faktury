import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Supabase klient se service-role klíčem — **obchází RLS**.
 *
 * Používej jen tam, kde žádná uživatelská identita neexistuje a dotaz je sám
 * o sobě úzce omezený:
 *
 *  - veřejné stažení faktury podle `public_id` (filtr na konkrétní token),
 *  - úložiště OAuth klientů, kódů a refresh tokenů (běží před přihlášením).
 *
 * Nikdy ho nepoužívej pro MCP nástroje ani pro nic, co se řídí přihlášeným
 * uživatelem — na to je `createUserScopedClient`.
 */
export function createServiceRoleClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY")
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
