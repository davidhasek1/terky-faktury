import { z } from "zod"

import { amountSchema, dateSchema, paginationSchema, percentSchema, textSchema } from "./common"

/** Hodnoty musí sedět na enum `expense_category` z migrace 017. */
export const EXPENSE_CATEGORIES = [
  "material",
  "transport",
  "phone_internet",
  "equipment",
  "fees",
  "insurance",
  "social_security",
  "other",
] as const

export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES, {
  error: "Neznámá kategorie nákladu",
})

/** Volitelný text: prázdný řetězec i chybějící hodnota se uloží jako null. */
function optionalText(max: number, label: string) {
  return textSchema(max, label)
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
}

export const MAX_EXPENSE_ITEMS = 20

/** Položka dokladu: základ bez IVA a sazba. IVA a celkem se dopočítají. */
export const expenseItemInputSchema = z.object({
  subtotal: amountSchema,
  tax_rate: percentSchema,
})

export const expenseInputSchema = z.object({
  expense_date: dateSchema,
  description: textSchema(500, "Popis").pipe(z.string().min(1, "Vyplň popis nákladu")),
  supplier: optionalText(200, "Dodavatel"),
  category: expenseCategorySchema.default("other"),
  items: z
    .array(expenseItemInputSchema)
    .min(1, "Náklad musí mít alespoň jednu položku")
    .max(MAX_EXPENSE_ITEMS, `Náklad může mít nejvýše ${MAX_EXPENSE_ITEMS} položek`),
  note: optionalText(2000, "Poznámka"),
})

export type ExpenseInput = z.infer<typeof expenseInputSchema>

export const expenseListSchema = paginationSchema.extend({
  date_from: dateSchema.optional(),
  date_to: dateSchema.optional(),
  category: expenseCategorySchema.optional(),
})

export interface ExpenseListFilters {
  date_from?: string
  date_to?: string
  category?: (typeof EXPENSE_CATEGORIES)[number]
  /** Bez limitu vrátí všechno v rozsahu — používá výkaz za období. */
  limit?: number
  offset?: number
}
