import { toDecimal } from "@/lib/money"
import type { Expense } from "@/lib/types"
import type { ExpenseInput, ExpenseListFilters } from "@/lib/validation/expenses"

import type { ServiceContext } from "./context"
import { ServiceError, toServiceError } from "./errors"
import { calculateExpenseTotals } from "./expense-totals"

/** Náklady podnikání — co, kdy a za kolik uživatelka zaplatila. */

const EXPENSE_COLUMNS =
  "id, user_id, expense_date, description, supplier, category, subtotal, tax_rate, tax_amount, total, note, created_at, updated_at"

export async function listExpenses(
  ctx: ServiceContext,
  filters: ExpenseListFilters = {},
): Promise<Expense[]> {
  let query = ctx.supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("user_id", ctx.userId)
    .order("expense_date", { ascending: false })

  if (filters.date_from) query = query.gte("expense_date", filters.date_from)
  if (filters.date_to) query = query.lte("expense_date", filters.date_to)
  if (filters.category) query = query.eq("category", filters.category)
  if (filters.limit !== undefined) {
    const offset = filters.offset ?? 0
    query = query.range(offset, offset + filters.limit - 1)
  }

  const { data, error } = await query.returns<Expense[]>()
  if (error) throw toServiceError(error, "Nepodařilo se načíst náklady")
  return data ?? []
}

export async function getExpense(ctx: ServiceContext, expenseId: string): Promise<Expense> {
  const { data, error } = await ctx.supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("id", expenseId)
    .maybeSingle<Expense>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst náklad")
  if (!data) throw new ServiceError("EXPENSE_NOT_FOUND", "Náklad nebyl nalezen.")
  return data
}

export async function createExpense(ctx: ServiceContext, input: ExpenseInput): Promise<Expense> {
  const { data, error } = await ctx.supabase
    .from("expenses")
    .insert({ user_id: ctx.userId, ...expenseRow(input) })
    .select(EXPENSE_COLUMNS)
    .single<Expense>()

  if (error) throw toServiceError(error, "Nepodařilo se uložit náklad")
  return data
}

export async function updateExpense(
  ctx: ServiceContext,
  expenseId: string,
  input: ExpenseInput,
): Promise<Expense> {
  const { data, error } = await ctx.supabase
    .from("expenses")
    .update({ ...expenseRow(input), updated_at: new Date().toISOString() })
    .eq("id", expenseId)
    .select(EXPENSE_COLUMNS)
    .maybeSingle<Expense>()

  if (error) throw toServiceError(error, "Nepodařilo se uložit náklad")
  if (!data) throw new ServiceError("EXPENSE_NOT_FOUND", "Náklad nebyl nalezen.")
  return data
}

export async function deleteExpense(ctx: ServiceContext, expenseId: string): Promise<void> {
  const { error } = await ctx.supabase.from("expenses").delete().eq("id", expenseId)
  if (error) throw toServiceError(error, "Nepodařilo se smazat náklad")
}

/** DB řádek z validovaného vstupu; IVA a celkem se vždy dopočítají tady. */
function expenseRow(input: ExpenseInput) {
  const totals = calculateExpenseTotals(input)
  return {
    expense_date: input.expense_date,
    description: input.description,
    supplier: input.supplier,
    category: input.category,
    subtotal: toDecimal(input.subtotal),
    tax_rate: toDecimal(input.tax_rate),
    tax_amount: toDecimal(totals.taxAmount),
    total: toDecimal(totals.total),
    note: input.note,
  }
}
