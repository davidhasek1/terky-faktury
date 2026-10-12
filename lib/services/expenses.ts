import { toDecimal } from "@/lib/money"
import type { Expense, ExpenseItem } from "@/lib/types"
import type { ExpenseInput, ExpenseListFilters } from "@/lib/validation/expenses"

import type { ServiceContext } from "./context"
import { ServiceError, toServiceError } from "./errors"
import { calculateExpenseTotals } from "./expense-totals"

/**
 * Náklady podnikání — doklad (co, kdy, od koho) a jeho položky po sazbách IVA.
 * Doklad drží součty položek, aby výkaz za období nemusel sčítat položky.
 */

const EXPENSE_COLUMNS =
  "id, user_id, expense_date, description, supplier, category, subtotal, tax_amount, total, note, created_at, updated_at"

const ITEM_COLUMNS = "id, expense_id, position, subtotal, tax_rate, tax_amount, total"

type ExpenseRow = Omit<Expense, "items">

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

  const { data, error } = await query.returns<ExpenseRow[]>()
  if (error) throw toServiceError(error, "Nepodařilo se načíst náklady")
  return withItems(ctx, data ?? [])
}

export async function getExpense(ctx: ServiceContext, expenseId: string): Promise<Expense> {
  const { data, error } = await ctx.supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("id", expenseId)
    .maybeSingle<ExpenseRow>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst náklad")
  if (!data) throw new ServiceError("EXPENSE_NOT_FOUND", "Náklad nebyl nalezen.")
  const [expense] = await withItems(ctx, [data])
  return expense
}

export async function createExpense(ctx: ServiceContext, input: ExpenseInput): Promise<Expense> {
  const totals = calculateExpenseTotals(input)
  const { data: expense, error } = await ctx.supabase
    .from("expenses")
    .insert({ user_id: ctx.userId, ...expenseRow(input, totals) })
    .select(EXPENSE_COLUMNS)
    .single<ExpenseRow>()

  if (error) throw toServiceError(error, "Nepodařilo se uložit náklad")

  const { error: itemsError } = await ctx.supabase
    .from("expense_items")
    .insert(itemRows(expense.id, totals))

  if (itemsError) {
    // Doklad bez položek by ve výkazu nesouhlasil s rozpadem po sazbách.
    await ctx.supabase.from("expenses").delete().eq("id", expense.id)
    throw toServiceError(itemsError, "Nepodařilo se uložit položky nákladu")
  }

  return getExpense(ctx, expense.id)
}

export async function updateExpense(
  ctx: ServiceContext,
  expenseId: string,
  input: ExpenseInput,
): Promise<Expense> {
  const totals = calculateExpenseTotals(input)
  const { data, error } = await ctx.supabase
    .from("expenses")
    .update({ ...expenseRow(input, totals), updated_at: new Date().toISOString() })
    .eq("id", expenseId)
    .select(EXPENSE_COLUMNS)
    .maybeSingle<ExpenseRow>()

  if (error) throw toServiceError(error, "Nepodařilo se uložit náklad")
  if (!data) throw new ServiceError("EXPENSE_NOT_FOUND", "Náklad nebyl nalezen.")

  const { error: deleteError } = await ctx.supabase
    .from("expense_items")
    .delete()
    .eq("expense_id", expenseId)

  if (deleteError) throw toServiceError(deleteError, "Nepodařilo se aktualizovat položky nákladu")

  const { error: insertError } = await ctx.supabase
    .from("expense_items")
    .insert(itemRows(expenseId, totals))

  if (insertError) throw toServiceError(insertError, "Nepodařilo se uložit položky nákladu")

  return getExpense(ctx, expenseId)
}

export async function deleteExpense(ctx: ServiceContext, expenseId: string): Promise<void> {
  // Položky smaže kaskáda v databázi.
  const { error } = await ctx.supabase.from("expenses").delete().eq("id", expenseId)
  if (error) throw toServiceError(error, "Nepodařilo se smazat náklad")
}

/** Dotáhne položky k dokladům jedním dotazem. */
async function withItems(ctx: ServiceContext, rows: ExpenseRow[]): Promise<Expense[]> {
  if (rows.length === 0) return []

  const { data, error } = await ctx.supabase
    .from("expense_items")
    .select(ITEM_COLUMNS)
    .in(
      "expense_id",
      rows.map((row) => row.id),
    )
    .order("position", { ascending: true })
    .returns<ExpenseItem[]>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst položky nákladů")

  const byExpense = new Map<string, ExpenseItem[]>()
  for (const item of data ?? []) {
    const list = byExpense.get(String(item.expense_id)) ?? []
    list.push(item)
    byExpense.set(String(item.expense_id), list)
  }

  return rows.map((row) => ({
    ...row,
    items: (byExpense.get(row.id) ?? []).sort((a, b) => a.position - b.position),
  }))
}

/** Hlavička dokladu: součty se vždy dopočítají tady, nikdy nepřichází ze vstupu. */
function expenseRow(input: ExpenseInput, totals: ReturnType<typeof calculateExpenseTotals>) {
  return {
    expense_date: input.expense_date,
    description: input.description,
    supplier: input.supplier,
    category: input.category,
    subtotal: toDecimal(totals.subtotal),
    tax_amount: toDecimal(totals.taxAmount),
    total: toDecimal(totals.total),
    note: input.note,
  }
}

function itemRows(expenseId: string, totals: ReturnType<typeof calculateExpenseTotals>) {
  return totals.items.map((item, position) => ({
    expense_id: expenseId,
    position,
    subtotal: toDecimal(item.subtotal),
    tax_rate: toDecimal(item.taxRate),
    tax_amount: toDecimal(item.taxAmount),
    total: toDecimal(item.total),
  }))
}
