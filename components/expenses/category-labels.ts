import type { ExpenseCategory } from "@/lib/types"

/** Popisky kategorií nákladů. Sdílí je formulář, výkaz, CSV i MCP. */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  material: "Materiál a čisticí prostředky",
  transport: "Doprava a pohonné hmoty",
  phone_internet: "Telefon a internet",
  equipment: "Vybavení",
  fees: "Služby a poplatky (gestor, banka)",
  insurance: "Pojištění",
  social_security: "Odvody (cuota autónomo)",
  other: "Ostatní",
}

export const EXPENSE_CATEGORY_OPTIONS = (
  Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][]
).map(([value, label]) => ({ value, label }))
