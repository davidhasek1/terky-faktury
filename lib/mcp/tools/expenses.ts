import { z } from "zod"

import { EXPENSE_CATEGORY_LABELS } from "@/components/expenses/category-labels"
import { fromDecimal, parseDecimal } from "@/lib/money"
import { calculateExpenseTotals } from "@/lib/services/expense-totals"
import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  updateExpense,
} from "@/lib/services/expenses"
import { getPeriodReport } from "@/lib/services/period-report"
import { periodLabel } from "@/lib/services/report-period"
import { idempotencyKeySchema } from "@/lib/validation/common"
import { EXPENSE_CATEGORIES, expenseInputSchema } from "@/lib/validation/expenses"
import { reportPeriodSchema } from "@/lib/validation/report"
import type { Expense } from "@/lib/types"

import { defineTool } from "@/lib/mcp/define-tool"
import { withIdempotency } from "@/lib/mcp/idempotency"
import { safeText } from "@/lib/mcp/output"
import { amount, amountFields, presentExpense } from "@/lib/mcp/present"
import { CONFIRMATION_TOKEN_HINT, twoPhase } from "@/lib/mcp/two-phase"

/** Nástroje pro náklady a výkaz za období (faktury + náklady + souhrn IVA). */

const categoryDescription = Object.entries(EXPENSE_CATEGORY_LABELS)
  .map(([value, label]) => `${value} = ${label}`)
  .join(", ")

const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve tvaru RRRR-MM-DD")

const expenseFieldShapes = {
  expense_date: dateArg.describe("Datum, kdy byl náklad zaplacen."),
  description: z.string().trim().min(1).max(500).describe("Co bylo pořízeno, např. „Čisticí prostředky“."),
  supplier: z.string().trim().max(200).nullish().describe("Dodavatel, např. „Mercadona“."),
  category: z.enum(EXPENSE_CATEGORIES).describe(categoryDescription),
  subtotal: z.union([z.string(), z.number()]).describe("Základ BEZ IVA v EUR, např. \"40\"."),
  tax_rate: z
    .union([z.string(), z.number()])
    .describe("Sazba IVA v procentech: 21, 10, 4 nebo 0. Když ji uživatel neuvede, zeptej se."),
  note: z.string().trim().max(2000).nullish().describe("Volitelná poznámka."),
}

type ExpenseArgs = {
  expense_date: string
  description: string
  supplier?: string | null
  category: (typeof EXPENSE_CATEGORIES)[number]
  subtotal: string | number
  tax_rate: string | number
  note?: string | null
}

function toServiceInput(args: ExpenseArgs) {
  return expenseInputSchema.parse(args)
}

function canonicalParams(args: ExpenseArgs, expenseId: string | null) {
  const input = toServiceInput(args)
  return {
    expense_id: expenseId,
    expense_date: input.expense_date,
    description: input.description,
    supplier: input.supplier,
    category: input.category,
    subtotal: amount(input.subtotal),
    tax_rate: amount(input.tax_rate),
    note: input.note,
  }
}

function expenseSummary(args: ExpenseArgs) {
  const input = toServiceInput(args)
  const totals = calculateExpenseTotals(input)

  return {
    expense_date: input.expense_date,
    description: safeText(input.description, 500),
    supplier: safeText(input.supplier, 200),
    category: input.category,
    category_label: EXPENSE_CATEGORY_LABELS[input.category],
    tax_rate_percent: amount(input.tax_rate),
    subtotal: amountFields(input.subtotal),
    tax_amount: amountFields(totals.taxAmount),
    total: amountFields(totals.total),
    note: safeText(input.note, 2000),
  }
}

/** Uložený náklad jako argumenty — základ pro částečnou úpravu. */
function argsFromExpense(expense: Expense): ExpenseArgs {
  return {
    expense_date: expense.expense_date,
    description: expense.description,
    supplier: expense.supplier ?? null,
    category: expense.category,
    subtotal: amount(fromDecimal(expense.subtotal)),
    tax_rate: amount(fromDecimal(expense.tax_rate)),
    note: expense.note ?? null,
  }
}

export const listExpensesTool = defineTool({
  name: "list_expenses",
  title: "Seznam nákladů",
  description:
    "Vrátí náklady (výdaje podnikání) s možností filtrovat podle období a kategorie, " +
    "nejnovější první. Pro součty za období raději použij get_period_report.",
  inputSchema: {
    date_from: dateArg.optional().describe("Od data (včetně)."),
    date_to: dateArg.optional().describe("Do data (včetně)."),
    category: z.enum(EXPENSE_CATEGORIES).optional().describe(categoryDescription),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).max(10_000).default(0),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const expenses = await listExpenses(ctx.service, args)

    return {
      payload: {
        account: { email: ctx.accountEmail },
        expenses: expenses.map(presentExpense),
        count: expenses.length,
        has_more: expenses.length === args.limit,
        next_offset: args.offset + expenses.length,
      },
      resourceType: "expense",
    }
  },
})

export const getExpenseTool = defineTool({
  name: "get_expense",
  title: "Detail nákladu",
  description: "Vrátí jeden náklad včetně základu, IVA a poznámky.",
  inputSchema: { expense_id: z.string().uuid().describe("Identifikátor nákladu.") },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const expense = await getExpense(ctx.service, args.expense_id)
    return {
      payload: { expense: presentExpense(expense) },
      resourceType: "expense",
      resourceId: expense.id,
    }
  },
})

/** Ochrana proti obří odpovědi u ročního výkazu; souhrn se počítá vždy ze všeho. */
const REPORT_ROW_LIMIT = 200

export const getPeriodReportTool = defineTool({
  name: "get_period_report",
  title: "Výkaz za období",
  description:
    "Výkaz za období pro přehled a podklad k přiznání IVA/IRPF: vystavené faktury (podle data " +
    "vystavení, i nezaplacené) s rozpadem na základ, IVA a retención, náklady s rozpadem na " +
    "základ a IVA, a souhrn — IVA vybraná, IVA z nákladů, IVA k odvodu (záporná = nárok na " +
    "vrácení), retención celkem a zisk (příjmy bez IVA − náklady bez IVA). Čtvrtletí jsou " +
    "leden–březen, duben–červen, červenec–září a říjen–prosinec.",
  inputSchema: {
    from: dateArg.describe("Začátek období (včetně), např. 2026-07-01."),
    to: dateArg.describe("Konec období (včetně), např. 2026-09-30."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const period = reportPeriodSchema.parse(args)
    const report = await getPeriodReport(ctx.service, period)
    const { totals } = report

    return {
      payload: {
        account: { email: ctx.accountEmail },
        period: { ...period, label: periodLabel(period) },
        totals: {
          income: {
            invoice_count: totals.income.count,
            subtotal: amountFields(totals.income.subtotal),
            vat: amountFields(totals.income.tax),
            retention: amountFields(totals.income.retention),
            total: amountFields(totals.income.total),
          },
          expenses: {
            expense_count: totals.expenses.count,
            subtotal: amountFields(totals.expenses.subtotal),
            vat: amountFields(totals.expenses.tax),
            total: amountFields(totals.expenses.total),
          },
          vat_balance: amountFields(totals.vatBalance),
          profit: amountFields(totals.profit),
          expenses_by_category: totals.expensesByCategory.map((bucket) => ({
            category: bucket.category,
            category_label: EXPENSE_CATEGORY_LABELS[bucket.category],
            count: bucket.count,
            subtotal: amountFields(bucket.subtotal),
            vat: amountFields(bucket.tax),
            total: amountFields(bucket.total),
          })),
        },
        invoices: report.invoices.slice(0, REPORT_ROW_LIMIT).map((invoice) => ({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          issue_date: invoice.issue_date,
          customer_name: safeText(invoice.customer_name, 200),
          status: invoice.status,
          subtotal: amountFields(invoice.subtotal),
          vat: amountFields(invoice.tax),
          retention: amountFields(invoice.retention),
          total: amountFields(invoice.total),
        })),
        invoices_truncated: report.invoices.length > REPORT_ROW_LIMIT,
        expenses: report.expenses.slice(0, REPORT_ROW_LIMIT).map((expense) => ({
          id: expense.id,
          expense_date: expense.expense_date,
          description: safeText(expense.description, 500),
          category: expense.category,
          subtotal: amountFields(expense.subtotal),
          vat: amountFields(expense.tax),
          total: amountFields(expense.total),
        })),
        expenses_truncated: report.expenses.length > REPORT_ROW_LIMIT,
      },
      resourceType: "report",
    }
  },
})

export const createExpenseTool = defineTool({
  name: "create_expense",
  title: "Zapsat náklad",
  description:
    "Zaeviduje náklad. IVA a celkem se dopočtou ze základu a sazby. Dvoufázové: nejdřív " +
    "zavolej BEZ confirmation_token pro návrh, ukaž ho uživateli a po souhlasu zavolej znovu " +
    "se stejnými argumenty a s tokenem. Když má uživatel jen částku s IVA, přepočti základ " +
    "(částka / (1 + sazba)) a v návrhu mu to ukaž.",
  inputSchema: {
    ...expenseFieldShapes,
    category: expenseFieldShapes.category.default("other"),
    confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
    idempotency_key: idempotencyKeySchema
      .optional()
      .describe("Volitelný klíč proti dvojímu zápisu při opakovaném volání."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const params = canonicalParams(args, null)

    return twoPhase(ctx, {
      tool: "create_expense",
      token: args.confirmation_token,
      params,
      status: "NÁVRH — náklad zatím NEBYL zapsán",
      summary: expenseSummary(args),
      resourceType: "expense",
      execute: async (confirmationId) => {
        const outcome = await withIdempotency(
          ctx,
          "create_expense",
          args.idempotency_key,
          params,
          async () => {
            const expense = await createExpense(ctx.service, toServiceInput(args))
            return { expense: presentExpense(expense) }
          },
        )

        return {
          payload: { saved: true, ...outcome.payload, replayed: outcome.replayed },
          resourceType: "expense",
          confirmationId,
          idempotencyKey: args.idempotency_key ?? null,
        }
      },
    })
  },
})

export const updateExpenseTool = defineTool({
  name: "update_expense",
  title: "Upravit náklad",
  description:
    "Upraví náklad. Neuvedená pole zůstávají, jak jsou — pošli jen to, co se mění. IVA a celkem " +
    "se dopočtou znovu. Dvoufázové: nejdřív bez confirmation_token pro návrh, po souhlasu " +
    "uživatele znovu se stejnými argumenty a s tokenem.",
  inputSchema: {
    expense_id: z.string().uuid().describe("Identifikátor upravovaného nákladu."),
    expense_date: expenseFieldShapes.expense_date.optional(),
    description: expenseFieldShapes.description.optional(),
    supplier: expenseFieldShapes.supplier,
    category: expenseFieldShapes.category.optional(),
    subtotal: expenseFieldShapes.subtotal.optional(),
    tax_rate: expenseFieldShapes.tax_rate.optional(),
    note: expenseFieldShapes.note,
    confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const current = await getExpense(ctx.service, args.expense_id)
    const { expense_id: expenseId, confirmation_token: token, ...changes } = args
    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    ) as Partial<ExpenseArgs>
    const resolved: ExpenseArgs = { ...argsFromExpense(current), ...defined }

    return twoPhase(ctx, {
      tool: "update_expense",
      token,
      params: canonicalParams(resolved, expenseId),
      status: "NÁVRH — náklad zatím NEBYL upraven",
      summary: expenseSummary(resolved),
      resourceType: "expense",
      resourceId: expenseId,
      execute: async (confirmationId) => {
        const expense = await updateExpense(ctx.service, expenseId, toServiceInput(resolved))

        return {
          payload: { saved: true, expense: presentExpense(expense) },
          resourceType: "expense",
          resourceId: expense.id,
          confirmationId,
        }
      },
    })
  },
})

export const deleteExpenseTool = defineTool({
  name: "delete_expense",
  title: "Smazat náklad",
  description:
    "Trvale smaže náklad. Aplikace nemá koš, operace je nevratná. Dvoufázové: nejdřív bez " +
    "confirmation_token pro návrh, po výslovném souhlasu uživatele znovu s tokenem.",
  inputSchema: {
    expense_id: z.string().uuid().describe("Identifikátor nákladu."),
    confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const expense = await getExpense(ctx.service, args.expense_id)

    return twoPhase(ctx, {
      tool: "delete_expense",
      token: args.confirmation_token,
      params: { expense_id: args.expense_id },
      status: "NÁVRH — náklad zatím NEBYL smazán",
      warnings: ["Smazání je nevratné. Aplikace nemá archivaci ani koš."],
      summary: {
        expense_date: expense.expense_date,
        description: safeText(expense.description, 500),
        total: amountFields(parseDecimal(expense.total)),
      },
      resourceType: "expense",
      resourceId: expense.id,
      execute: async (confirmationId) => {
        await deleteExpense(ctx.service, args.expense_id)

        return {
          payload: {
            saved: true,
            deleted: true,
            expense_id: args.expense_id,
            total: amount(fromDecimal(expense.total)),
          },
          resourceType: "expense",
          resourceId: args.expense_id,
          confirmationId,
        }
      },
    })
  },
})
