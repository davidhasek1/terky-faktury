import { createClient } from "@/lib/supabase/client"

import type { ServiceContext } from "./context"
import { ServiceError } from "./errors"

/**
 * Kontext servisní vrstvy pro klientské komponenty.
 *
 * Formuláře díky tomu volají stejné funkce jako MCP nástroje a serverové
 * routy — business logika (výpočty, pořadí zápisů, kompenzace) existuje
 * v celé aplikaci jen jednou.
 */
export async function createBrowserServiceContext(): Promise<ServiceContext> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new ServiceError("UNAUTHENTICATED", "Musíte být přihlášeni")
  }

  return { supabase, userId: user.id }
}
