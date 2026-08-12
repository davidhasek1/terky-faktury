import type { Customer } from "@/lib/types"
import type { CustomerInput } from "@/lib/validation/customers"

import type { ServiceContext } from "./context"
import { ServiceError, toServiceError } from "./errors"

/**
 * Zákazníci. Jediné místo, kde se do tabulky `customers` zapisuje —
 * volají ji formuláře v UI i MCP nástroje.
 */

const CUSTOMER_COLUMNS = "id, name, email, phone, address, ico, dic, is_business, user_id, created_at"

/**
 * PostgREST skládá filtr `or=(...)` z řetězce, takže čárky, závorky a
 * zástupné znaky ve vyhledávaném výrazu musí pryč — jinak by se dal filtr
 * rozšířit o cizí podmínky.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()*%\\"']/g, " ").trim()
}

export async function searchCustomers(
  ctx: ServiceContext,
  params: { query: string; limit: number; offset: number },
): Promise<Customer[]> {
  const term = sanitizeSearchTerm(params.query)
  if (term === "") return []

  const pattern = `%${term}%`
  const { data, error } = await ctx.supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .or(`name.ilike.${pattern},email.ilike.${pattern},ico.ilike.${pattern},dic.ilike.${pattern}`)
    .order("name", { ascending: true })
    .range(params.offset, params.offset + params.limit - 1)
    .returns<Customer[]>()

  if (error) throw toServiceError(error, "Nepodařilo se vyhledat zákazníky")
  return data ?? []
}

export async function getCustomer(ctx: ServiceContext, customerId: string): Promise<Customer> {
  const { data, error } = await ctx.supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .eq("id", customerId)
    .maybeSingle<Customer>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst zákazníka")
  if (!data) throw new ServiceError("CUSTOMER_NOT_FOUND", "Zákazník nebyl nalezen.")
  return data
}

export async function createCustomer(
  ctx: ServiceContext,
  input: CustomerInput,
): Promise<Customer> {
  const { data, error } = await ctx.supabase
    .from("customers")
    .insert([{ ...input, user_id: ctx.userId }])
    .select(CUSTOMER_COLUMNS)
    .single<Customer>()

  if (error) throw toServiceError(error, "Nepodařilo se vytvořit zákazníka")
  return data
}

export async function updateCustomer(
  ctx: ServiceContext,
  customerId: string,
  input: CustomerInput,
): Promise<Customer> {
  const { data, error } = await ctx.supabase
    .from("customers")
    .update(input)
    .eq("id", customerId)
    .select(CUSTOMER_COLUMNS)
    .maybeSingle<Customer>()

  if (error) throw toServiceError(error, "Nepodařilo se uložit zákazníka")
  if (!data) throw new ServiceError("CUSTOMER_NOT_FOUND", "Zákazník nebyl nalezen.")
  return data
}

/**
 * Smazání zákazníka kaskádou odstraní i všechny jeho faktury a aktivity.
 * Proto je dostupné jen z UI (s potvrzovacím dialogem) a záměrně není
 * vystaveno jako MCP nástroj.
 */
export async function deleteCustomer(ctx: ServiceContext, customerId: string): Promise<void> {
  const { error } = await ctx.supabase.from("customers").delete().eq("id", customerId)
  if (error) throw toServiceError(error, "Nepodařilo se smazat zákazníka")
}

/** Počet faktur zákazníka — rozlišující údaj při nejednoznačném vyhledávání. */
export async function countInvoicesByCustomer(
  ctx: ServiceContext,
  customerIds: readonly string[],
): Promise<Map<string, number>> {
  if (customerIds.length === 0) return new Map()

  const { data, error } = await ctx.supabase
    .from("invoices")
    .select("customer_id")
    .in("customer_id", [...customerIds])
    .returns<{ customer_id: string }[]>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst počty faktur")

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1)
  }
  return counts
}
