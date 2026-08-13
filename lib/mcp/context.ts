import type { SupabaseClient } from "@supabase/supabase-js"

import type { ServiceContext } from "@/lib/services/context"
import { ServiceError } from "@/lib/services/errors"

/**
 * Kontext jednoho MCP volání. Vzniká z ověřeného access tokenu, takže
 * `userId` ani `clientId` nikdy nepocházejí ze vstupu nástroje.
 */
export interface McpContext {
  userId: string
  clientId: string
  scope: string
  /** E-mail účtu, pod kterým se pracuje. `null`, když ho nejde zjistit. */
  accountEmail: string | null
  service: ServiceContext
}

export function createMcpContext(params: {
  userId: string
  clientId: string
  scope: string
  accountEmail: string | null
  supabase: SupabaseClient
}): McpContext {
  return {
    userId: params.userId,
    clientId: params.clientId,
    scope: params.scope,
    accountEmail: params.accountEmail,
    service: { supabase: params.supabase, userId: params.userId },
  }
}

/**
 * Volání databázové funkce. Jediné místo, kde přijímáme netypovanou odpověď
 * ze supabase-js — projekt nemá vygenerované typy schématu, takže si tvar
 * hlídají samotné funkce v migraci 014.
 */
export async function callRpc<T>(
  ctx: McpContext,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await ctx.service.supabase.rpc(fn, args)

  if (error) {
    console.error(`[mcp] Volání ${fn} selhalo:`, error.code ?? error.message)
    throw new ServiceError("DATABASE_ERROR", "Operaci se nepodařilo dokončit.")
  }

  return data as T
}
