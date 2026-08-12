import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Kontext jednoho volání servisní vrstvy.
 *
 * `supabase` je vždy klient vázaný na konkrétního uživatele (prohlížečový
 * klient, serverový klient z cookies, nebo klient MCP vrstvy s podepsaným
 * uživatelským JWT). Autorizaci proto řeší RLS v databázi, ne tento kód —
 * `userId` slouží k vyplnění `user_id` u zápisů a k auditu.
 *
 * Do `userId` nikdy nedávej hodnotu, která přišla ze vstupu nástroje nebo
 * z formuláře. Vždy musí pocházet z ověřené identity.
 */
export interface ServiceContext {
  supabase: SupabaseClient
  userId: string
}
