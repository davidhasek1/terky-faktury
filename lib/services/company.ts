import type { CompanyDetails } from "@/lib/types"

import type { ServiceContext } from "./context"
import { toServiceError } from "./errors"

/**
 * Firemní údaje vystavovatele. Jeden záznam na uživatele (UNIQUE user_id).
 * Zápis je dostupný jen z UI — přes MCP je profil záměrně pouze ke čtení,
 * protože mění fakturační identitu na všech budoucích dokladech.
 */

export type CompanyDetailsInput = Omit<
  CompanyDetails,
  "id" | "user_id" | "created_at" | "updated_at"
>

export async function getCompanyDetails(ctx: ServiceContext): Promise<CompanyDetails | null> {
  const { data, error } = await ctx.supabase
    .from("company_details")
    .select("*")
    .eq("user_id", ctx.userId)
    .maybeSingle<CompanyDetails>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst firemní údaje")
  return data
}

export async function upsertCompanyDetails(
  ctx: ServiceContext,
  input: CompanyDetailsInput,
): Promise<CompanyDetails> {
  const { data, error } = await ctx.supabase
    .from("company_details")
    .upsert({ ...input, user_id: ctx.userId }, { onConflict: "user_id" })
    .select("*")
    .single<CompanyDetails>()

  if (error) throw toServiceError(error, "Nepodařilo se uložit firemní údaje")
  return data
}
