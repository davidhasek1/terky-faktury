"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Save, X } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { FormActions, FormField, FormRow, FormSection, FormShell } from "@/components/patterns/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatScaled, fromDecimal, parseDecimal, toDecimal, type Scaled } from "@/lib/money"
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import {
  DEFAULT_EXPENSE_TAX_RATE,
  EXPENSE_TAX_RATES,
  calculateExpenseTotals,
} from "@/lib/services/expense-totals"
import { createExpense, updateExpense } from "@/lib/services/expenses"
import { localToday, periodContaining } from "@/lib/services/report-period"
import { firstIssueMessage } from "@/lib/validation/common"
import { expenseInputSchema } from "@/lib/validation/expenses"
import type { Expense, ExpenseCategory } from "@/lib/types"

import { EXPENSE_CATEGORY_OPTIONS } from "./category-labels"

/** Rozepsané pole během psaní bereme jako nulu; ostrou kontrolu dělá zod při uložení. */
const parseScaled = (value: string): Scaled => {
  try {
    return parseDecimal(value)
  } catch {
    return 0
  }
}

const rateValue = (scaled: Scaled) => String(toDecimal(scaled))

export function ExpenseForm({ expense }: { expense?: Expense }) {
  const router = useRouter()
  const isEdit = !!expense
  const [isSaving, setIsSaving] = useState(false)
  const [expenseDate, setExpenseDate] = useState(expense?.expense_date ?? localToday())
  const [description, setDescription] = useState(expense?.description ?? "")
  const [supplier, setSupplier] = useState(expense?.supplier ?? "")
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "material")
  const [subtotal, setSubtotal] = useState(expense ? String(expense.subtotal) : "")
  const [taxRate, setTaxRate] = useState(
    rateValue(expense ? fromDecimal(expense.tax_rate) : DEFAULT_EXPENSE_TAX_RATE),
  )
  const [note, setNote] = useState(expense?.note ?? "")

  // Sazba mimo nabídku (např. zadaná přes ChatGPT) musí jít uložit beze změny.
  const rateOptions = EXPENSE_TAX_RATES.map(rateValue)
  if (!rateOptions.includes(taxRate)) rateOptions.push(taxRate)

  const totals = calculateExpenseTotals({
    subtotal: parseScaled(subtotal),
    tax_rate: parseScaled(taxRate),
  })

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSaving(true)

    try {
      // Stejné schéma i stejná služba jako MCP nástroj create_expense.
      const input = expenseInputSchema.parse({
        expense_date: expenseDate,
        description,
        supplier,
        category,
        subtotal,
        tax_rate: taxRate,
        note,
      })

      const ctx = await createBrowserServiceContext()
      if (isEdit && expense) {
        await updateExpense(ctx, expense.id, input)
      } else {
        await createExpense(ctx, input)
      }

      toast.success(isEdit ? "Náklad upraven" : "Náklad uložen")
      // Vrátíme se na měsíc, do kterého náklad patří, ať je hned vidět.
      const month = periodContaining("month", input.expense_date)
      router.push(`/expenses?from=${month.from}&to=${month.to}`)
      router.refresh()
    } catch (err) {
      console.error("[expenses] Nepodařilo se uložit náklad:", err)
      toast.error(
        err instanceof z.ZodError
          ? firstIssueMessage(err)
          : "Nepodařilo se uložit náklad: " + (err instanceof Error ? err.message : "Neznámá chyba"),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormShell>
        <FormSection title="Náklad" hint="Co, kdy a od koho.">
          <FormRow>
            <FormField id="expense_date" label="Datum" required>
              <Input
                id="expense_date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
              />
            </FormField>
            <FormField id="category" label="Kategorie" required>
              <Select value={category} onValueChange={(value) => setCategory(value as ExpenseCategory)}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </FormRow>

          <FormField id="description" label="Popis" required>
            <Input
              id="description"
              value={description}
              maxLength={500}
              placeholder="Např. čisticí prostředky, benzín, telefon…"
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </FormField>

          <FormField id="supplier" label="Dodavatel" hint="Volitelné.">
            <Input
              id="supplier"
              value={supplier}
              maxLength={200}
              placeholder="Např. Mercadona"
              onChange={(e) => setSupplier(e.target.value)}
            />
          </FormField>

          <FormField id="note" label="Poznámka" hint="Volitelné. Např. číslo účtenky.">
            <Textarea
              id="note"
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="resize-none"
            />
          </FormField>
        </FormSection>

        <FormSection title="Částka" hint="Základ bez IVA a sazba z účtenky. IVA a celkem se dopočítají.">
          <FormRow>
            <FormField id="subtotal" label="Základ bez IVA (€)" required>
              <Input
                id="subtotal"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)}
                className="tabular-nums"
                required
              />
            </FormField>
            <FormField id="tax_rate" label="Sazba IVA">
              <Select value={taxRate} onValueChange={setTaxRate}>
                <SelectTrigger id="tax_rate" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rateOptions.map((rate) => (
                    <SelectItem key={rate} value={rate}>
                      {rate} %
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </FormRow>

          <dl className="space-y-2 border-t border-border pt-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="tabular-nums text-foreground">{formatScaled(totals.taxAmount)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Celkem</dt>
              <dd className="font-display text-3xl font-semibold text-foreground tabular-nums">
                {formatScaled(totals.total)}
              </dd>
            </div>
          </dl>
        </FormSection>

        <FormActions>
          <Button type="button" variant="ghost" onClick={() => router.push("/expenses")} disabled={isSaving}>
            <X />
            Zrušit
          </Button>
          <Button type="submit" loading={isSaving}>
            {isEdit ? <Save /> : <Plus />}
            {isEdit ? "Uložit změny" : "Uložit náklad"}
          </Button>
        </FormActions>
      </FormShell>
    </form>
  )
}

