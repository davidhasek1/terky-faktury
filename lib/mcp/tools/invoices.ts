import { z } from "zod"

import { baseUrl } from "@/lib/oauth/config"
import { invoiceItemDescriptionHint } from "@/lib/invoice-items"
import { formatScaled, parseDecimal, toDecimal } from "@/lib/money"
import { getCustomer } from "@/lib/services/customers"
import { ServiceError } from "@/lib/services/errors"
import { sendInvoiceEmail } from "@/lib/services/invoice-email"
import { defaultRetentionRate } from "@/lib/services/invoice-totals"
import {
  buildInvoiceDraft,
  createInvoice,
  deleteInvoice,
  getInvoice,
  getInvoiceStats,
  listInvoices,
  setInvoicePayment,
  updateInvoice,
} from "@/lib/services/invoices"
import { idempotencyKeySchema } from "@/lib/validation/common"
import { MAX_INVOICE_ITEMS, invoiceInputSchema } from "@/lib/validation/invoices"

import { consumeConfirmation, createConfirmation } from "@/lib/mcp/confirmations"
import { defineTool } from "@/lib/mcp/define-tool"
import { withIdempotency } from "@/lib/mcp/idempotency"
import { safeText } from "@/lib/mcp/output"
import {
  amount,
  amountFields,
  invoiceStatus,
  presentInvoiceDetail,
  presentInvoiceSummary,
} from "@/lib/mcp/present"

/** Nástroje pro faktury: čtení, příprava, zápis a nevratné operace. */

const DEFAULT_DUE_DAYS = 14

const decimalString = z
  .union([z.string(), z.number()])
  .describe("Desetinné číslo jako řetězec, např. \"100\" nebo \"100.50\".")

const invoiceItemShape = z.object({
  description: z.string().trim().min(1).max(500).describe(invoiceItemDescriptionHint()),
  quantity: decimalString.describe("Množství, větší než nula."),
  unit_price: decimalString.describe("Cena za jednotku v EUR bez DPH."),
})

const invoiceFields = {
  customer_id: z
    .string()
    .uuid()
    .describe("Identifikátor zákazníka. Získej ho přes search_customers, nikdy si ho nevymýšlej."),
  items: z
    .array(invoiceItemShape)
    .min(1)
    .max(MAX_INVOICE_ITEMS)
    .describe("Položky faktury. Alespoň jedna."),
  issue_date: z.string().describe("Datum vystavení ve tvaru RRRR-MM-DD."),
  due_date: z.string().describe("Datum splatnosti ve tvaru RRRR-MM-DD."),
  tax_rate: decimalString.describe("Sazba DPH v procentech, výchozí 21."),
  retention_rate: decimalString.describe(
    "Retención v procentech. Podnikajícím subjektům se sráží 15 %, ostatním 0 %.",
  ),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .describe("Poznámka na faktuře. Když žádná není, pošli null."),
  currency: z.literal("EUR").describe("Aplikace umí pouze EUR."),
}

type InvoiceArgs = {
  customer_id: string
  items: { description: string; quantity: string | number; unit_price: string | number }[]
  issue_date: string
  due_date: string
  tax_rate: string | number
  retention_rate: string | number
  notes?: string | null
  currency: "EUR"
  invoice_id?: string
}

/**
 * Kanonické parametry pro potvrzovací token. Čísla se normalizují na dvě
 * desetinná místa, takže "100" a "100.00" dají stejný otisk — a naopak
 * jakákoli skutečná změna částky potvrzení zneplatní.
 */
function confirmationPayload(args: InvoiceArgs) {
  return {
    invoice_id: args.invoice_id ?? null,
    customer_id: args.customer_id,
    issue_date: args.issue_date,
    due_date: args.due_date,
    tax_rate: normalizeDecimal(args.tax_rate),
    retention_rate: normalizeDecimal(args.retention_rate),
    notes: args.notes?.trim() || null,
    currency: args.currency,
    items: args.items.map((item) => ({
      description: item.description.trim(),
      quantity: normalizeDecimal(item.quantity),
      unit_price: normalizeDecimal(item.unit_price),
    })),
  }
}

function normalizeDecimal(value: string | number): string {
  return toDecimal(parseDecimal(value)).toFixed(2)
}

function toServiceInput(args: InvoiceArgs) {
  return invoiceInputSchema.parse({
    customer_id: args.customer_id,
    issue_date: args.issue_date,
    due_date: args.due_date,
    tax_rate: args.tax_rate,
    retention_rate: args.retention_rate,
    notes: args.notes,
    currency: args.currency,
    items: args.items,
  })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

export const listInvoicesTool = defineTool({
  name: "list_invoices",
  title: "Seznam faktur",
  description:
    "Vrátí faktury přihlášeného uživatele s možností filtrovat podle stavu, zákazníka a období. " +
    "Použij na dotazy typu „nezaplacené faktury po splatnosti“ nebo „faktury klienta X“. " +
    "Vrací nejvýše 50 záznamů, na další použij offset.",
  inputSchema: {
    status: z
      .enum(["all", "paid", "unpaid", "overdue"])
      .default("all")
      .describe("overdue = nezaplacené s datem splatnosti v minulosti."),
    customer_id: z.string().uuid().optional().describe("Omezení na jednoho zákazníka."),
    issued_from: z.string().optional().describe("Vystaveno od (RRRR-MM-DD)."),
    issued_to: z.string().optional().describe("Vystaveno do (RRRR-MM-DD)."),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).max(10_000).default(0),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const invoices = await listInvoices(ctx.service, args)
    return {
      payload: {
        invoices: invoices.map(presentInvoiceSummary),
        count: invoices.length,
        has_more: invoices.length === args.limit,
        next_offset: args.offset + invoices.length,
      },
      resourceType: "invoice",
    }
  },
})

export const getInvoiceTool = defineTool({
  name: "get_invoice",
  title: "Detail faktury",
  description: "Vrátí jednu fakturu včetně položek, sazeb a součtů.",
  inputSchema: { invoice_id: z.string().uuid().describe("Identifikátor faktury.") },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const invoice = await getInvoice(ctx.service, args.invoice_id)
    return {
      payload: { invoice: presentInvoiceDetail(invoice) },
      resourceType: "invoice",
      resourceId: invoice.id,
    }
  },
})

export const getInvoiceSummaryTool = defineTool({
  name: "get_invoice_summary",
  title: "Souhrn fakturace",
  description:
    "Vrátí agregovaný přehled: počty a částky celkem, zaplacené, nezaplacené a po splatnosti. " +
    "Použij na dotazy typu „kolik mi dluží“ nebo „jak jsem na tom letos“.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (_args, ctx) => {
    const stats = await getInvoiceStats(ctx.service)
    return {
      payload: {
        counts: {
          total: stats.total,
          paid: stats.paid,
          unpaid: stats.unpaid,
          overdue: stats.overdue,
        },
        amounts: {
          total: amountFields(stats.totalAmount),
          paid: amountFields(stats.paidAmount),
          unpaid: amountFields(stats.unpaidAmount),
          overdue: amountFields(stats.overdueAmount),
        },
      },
      resourceType: "invoice",
    }
  },
})

export const getInvoiceDownloadLinkTool = defineTool({
  name: "get_invoice_download_link",
  title: "Odkaz na PDF faktury",
  description:
    "Vrátí veřejný odkaz na stažení PDF faktury — stejný, jaký dostane zákazník e-mailem. " +
    "Odkaz je nezveřejněný, ale kdokoli s ním fakturu uvidí, takže ho sdílej jen s uživatelem. " +
    "Samotné PDF nástroj nevrací.",
  inputSchema: { invoice_id: z.string().uuid().describe("Identifikátor faktury.") },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const invoice = await getInvoice(ctx.service, args.invoice_id)
    return {
      payload: {
        invoice_number: invoice.invoice_number,
        download_url: `${baseUrl()}/invoices/download/${invoice.public_id}`,
        warning: "Odkaz je veřejný — komukoli, kdo ho zná, zpřístupní celou fakturu.",
      },
      resourceType: "invoice",
      resourceId: invoice.id,
    }
  },
})

export const prepareInvoiceTool = defineTool({
  name: "prepare_invoice",
  title: "Připravit fakturu",
  description:
    "Spočítá fakturu (mezisoučet, DPH, retención, celkem) a vrátí souhrn s potvrzovacím tokenem. " +
    "Nic neukládá. Chybějící datum vystavení doplní na dnešek, splatnost na 14 dní, sazbu DPH na " +
    "21 % a retención podle typu zákazníka. Souhrn ukaž uživateli, vyžádej si výslovný souhlas " +
    "a pak zavolej create_invoice (nebo update_invoice) s argumenty z pole execute_arguments.",
  inputSchema: {
    customer_id: invoiceFields.customer_id,
    items: invoiceFields.items,
    issue_date: z.string().optional().describe("Datum vystavení. Výchozí dnešek."),
    due_date: z.string().optional().describe("Datum splatnosti. Výchozí 14 dní od vystavení."),
    tax_rate: decimalString.optional().describe("Sazba DPH v %. Výchozí 21."),
    retention_rate: decimalString
      .optional()
      .describe("Retención v %. Výchozí podle typu zákazníka (15 % pro podnikatele)."),
    notes: invoiceFields.notes,
    currency: z.literal("EUR").default("EUR").describe("Aplikace umí pouze EUR."),
    invoice_id: z.string().uuid().optional().describe("Vyplň jen při úpravě existující faktury."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const customer = await getCustomer(ctx.service, args.customer_id)
    const issueDate = args.issue_date ?? today()

    const resolved: InvoiceArgs = {
      invoice_id: args.invoice_id,
      customer_id: args.customer_id,
      items: args.items,
      issue_date: issueDate,
      due_date: args.due_date ?? addDays(issueDate, DEFAULT_DUE_DAYS),
      tax_rate: args.tax_rate ?? "21",
      retention_rate:
        args.retention_rate ?? amount(defaultRetentionRate(customer.is_business)),
      notes: args.notes,
      currency: args.currency,
    }

    const existing = args.invoice_id ? await getInvoice(ctx.service, args.invoice_id) : null
    const draft = await buildInvoiceDraft(ctx.service, toServiceInput(resolved))
    const payload = confirmationPayload(resolved)

    const summary = {
      mode: args.invoice_id ? "update" : "create",
      customer: { id: customer.id, name: safeText(customer.name, 200), is_business: customer.is_business ?? false },
      issue_date: resolved.issue_date,
      due_date: resolved.due_date,
      currency: "EUR",
      payment_method: "Bankovní převod na účet uvedený na faktuře",
      tax_rate_percent: normalizeDecimal(resolved.tax_rate),
      retention_rate_percent: normalizeDecimal(resolved.retention_rate),
      items: draft.items.map((item) => ({
        description: safeText(item.description, 500),
        quantity: amount(item.quantity),
        unit_price: amountFields(item.unit_price),
        total: amountFields(item.total),
      })),
      subtotal: amountFields(draft.subtotal),
      tax_amount: amountFields(draft.tax_amount),
      retention_amount: amountFields(draft.retention_amount),
      total: amountFields(draft.total),
      notes: safeText(draft.notes, 2000),
    }

    const warnings: string[] = []
    if (!customer.email) warnings.push("Zákazník nemá e-mail, fakturu mu nepůjde odeslat.")
    if (existing?.email_sent_at) {
      warnings.push("Faktura už byla odeslána e-mailem. Po úpravě ji bude potřeba odeslat znovu.")
    }

    const confirmation = await createConfirmation(ctx, "prepare_invoice", payload, summary)

    return {
      payload: {
        summary,
        warnings,
        confirmation_token: confirmation.token,
        expires_at: confirmation.expiresAt,
        execute_arguments: payload,
        next_step:
          "Ukaž uživateli celý souhrn (zákazník, částka, měna, položky, sazby, data) a vyžádej si " +
          `souhlas. Po potvrzení zavolej ${args.invoice_id ? "update_invoice" : "create_invoice"} ` +
          "s hodnotami z execute_arguments a s confirmation_token.",
      },
      resourceType: "invoice",
      resourceId: args.invoice_id ?? null,
    }
  },
})

export const createInvoiceTool = defineTool({
  name: "create_invoice",
  title: "Vystavit fakturu",
  description:
    "Vystaví novou fakturu. Číslo přidělí systém. Vyžaduje potvrzovací token z prepare_invoice " +
    "se shodnými parametry — volej až po výslovném souhlasu uživatele.",
  inputSchema: {
    ...invoiceFields,
    confirmation_token: z.string().min(1).describe("Token z prepare_invoice."),
    idempotency_key: idempotencyKeySchema
      .optional()
      .describe("Doporučeno: brání vystavení dvou stejných faktur při opakovaném volání."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const payload = confirmationPayload(args)
    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_invoice",
      args.confirmation_token,
      payload,
    )

    const outcome = await withIdempotency(
      ctx,
      "create_invoice",
      args.idempotency_key,
      payload,
      async () => {
        const invoice = await createInvoice(ctx.service, toServiceInput(args))
        return { invoice: presentInvoiceDetail(invoice) }
      },
    )

    return {
      payload: { ...outcome.payload, replayed: outcome.replayed },
      resourceType: "invoice",
      resourceId: readInvoiceId(outcome.payload.invoice),
      confirmationId,
      idempotencyKey: args.idempotency_key ?? null,
    }
  },
})

export const updateInvoiceTool = defineTool({
  name: "update_invoice",
  title: "Upravit fakturu",
  description:
    "Přepíše existující fakturu včetně všech položek. Vyžaduje potvrzovací token z prepare_invoice " +
    "se shodnými parametry (a se stejným invoice_id). Pokud už byla faktura odeslána zákazníkovi, " +
    "upozorni uživatele, že ji bude potřeba odeslat znovu.",
  inputSchema: {
    ...invoiceFields,
    invoice_id: z.string().uuid().describe("Identifikátor upravované faktury."),
    confirmation_token: z.string().min(1).describe("Token z prepare_invoice."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const payload = confirmationPayload(args)
    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_invoice",
      args.confirmation_token,
      payload,
    )

    const invoice = await updateInvoice(ctx.service, args.invoice_id, toServiceInput(args))

    return {
      payload: { invoice: presentInvoiceDetail(invoice) },
      resourceType: "invoice",
      resourceId: invoice.id,
      confirmationId,
    }
  },
})

const invoiceActionSchema = z.enum(["mark_paid", "unmark_paid", "send_email", "delete"])

type InvoiceAction = z.infer<typeof invoiceActionSchema>

function actionPayload(args: { invoice_id: string; action: InvoiceAction; paid_date?: string }) {
  return {
    invoice_id: args.invoice_id,
    action: args.action,
    paid_date: args.action === "mark_paid" ? (args.paid_date ?? today()) : null,
  }
}

export const prepareInvoiceActionTool = defineTool({
  name: "prepare_invoice_action",
  title: "Připravit operaci s fakturou",
  description:
    "Připraví operaci nad existující fakturou (označení jako zaplacené, zrušení platby, odeslání " +
    "e-mailem, smazání) a vrátí souhrn, upozornění a potvrzovací token. Nic nemění. " +
    "Souhrn ukaž uživateli, vyžádej si výslovný souhlas a teprve pak zavolej příslušný " +
    "zapisující nástroj se stejnými parametry a tímto tokenem.",
  inputSchema: {
    invoice_id: z.string().uuid().describe("Identifikátor faktury."),
    action: invoiceActionSchema.describe(
      "mark_paid = označit jako zaplacenou, unmark_paid = zrušit platbu, " +
        "send_email = odeslat zákazníkovi, delete = trvale smazat.",
    ),
    paid_date: z
      .string()
      .optional()
      .describe("Datum úhrady pro mark_paid (RRRR-MM-DD). Výchozí dnešek."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const invoice = await getInvoice(ctx.service, args.invoice_id)
    const payload = actionPayload(args)
    const warnings: string[] = []

    if (args.action === "send_email") {
      if (!invoice.customer?.email) {
        throw new ServiceError(
          "CUSTOMER_EMAIL_MISSING",
          "Zákazník nemá vyplněný e-mail, fakturu nelze odeslat.",
        )
      }
      if (invoice.email_sent_at) {
        warnings.push(`Faktura už byla odeslána ${invoice.email_sent_at}. Odešle se znovu.`)
      }
    }

    if (args.action === "delete") {
      warnings.push("Smazání je nevratné. Aplikace nemá archivaci ani koš.")
      if (invoice.email_sent_at) {
        warnings.push("Faktura už byla odeslána zákazníkovi — odkaz na stažení přestane fungovat.")
      }
      if (invoice.paid_date) warnings.push("Faktura je označená jako zaplacená.")
    }

    if (args.action === "mark_paid" && invoice.paid_date) {
      warnings.push(`Faktura je už označená jako zaplacená k ${invoice.paid_date}.`)
    }

    if (args.action === "unmark_paid" && !invoice.paid_date) {
      warnings.push("Faktura není označená jako zaplacená, operace nic nezmění.")
    }

    const confirmation = await createConfirmation(ctx, "prepare_invoice_action", payload, {
      action: args.action,
      invoice_number: invoice.invoice_number,
    })

    return {
      payload: {
        action: args.action,
        summary: {
          invoice_number: invoice.invoice_number,
          customer_name: safeText(invoice.customer?.name, 200),
          total: amountFields(parseDecimal(invoice.total)),
          status: invoiceStatus(invoice),
          due_date: invoice.due_date,
          recipient: args.action === "send_email" ? invoice.customer?.email : undefined,
          paid_date: payload.paid_date,
        },
        warnings,
        confirmation_token: confirmation.token,
        expires_at: confirmation.expiresAt,
        execute_arguments: payload,
        next_step: `Ukaž souhrn a upozornění uživateli. Po jeho výslovném souhlasu zavolej ${
          args.action === "delete"
            ? "delete_invoice"
            : args.action === "send_email"
              ? "send_invoice_email"
              : "set_invoice_payment"
        } s hodnotami z execute_arguments a s confirmation_token.`,
      },
      resourceType: "invoice",
      resourceId: invoice.id,
    }
  },
})

export const setInvoicePaymentTool = defineTool({
  name: "set_invoice_payment",
  title: "Změnit stav platby faktury",
  description:
    "Označí fakturu jako zaplacenou nebo platbu zruší. Vyžaduje potvrzovací token " +
    "z prepare_invoice_action se shodnými parametry.",
  inputSchema: {
    invoice_id: z.string().uuid(),
    action: z.enum(["mark_paid", "unmark_paid"]),
    paid_date: z.string().nullable().describe("Datum úhrady u mark_paid, jinak null."),
    confirmation_token: z.string().min(1).describe("Token z prepare_invoice_action."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const payload = {
      invoice_id: args.invoice_id,
      action: args.action,
      paid_date: args.action === "mark_paid" ? args.paid_date : null,
    }

    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_invoice_action",
      args.confirmation_token,
      payload,
    )

    if (args.action === "mark_paid" && !payload.paid_date) {
      throw new ServiceError("VALIDATION_ERROR", "Chybí datum úhrady.")
    }

    const invoice = await setInvoicePayment(ctx.service, args.invoice_id, payload.paid_date)

    return {
      payload: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        status: invoiceStatus(invoice),
        paid_date: invoice.paid_date ?? null,
      },
      resourceType: "invoice",
      resourceId: invoice.id,
      confirmationId,
    }
  },
})

export const sendInvoiceEmailTool = defineTool({
  name: "send_invoice_email",
  title: "Odeslat fakturu e-mailem",
  description:
    "Odešle zákazníkovi e-mail s odkazem na fakturu a zapíše čas odeslání. Operace je nevratná — " +
    "odeslaný e-mail nelze vzít zpět. Vyžaduje potvrzovací token z prepare_invoice_action " +
    "se shodnými parametry. Vždy použij idempotency_key, ať zákazník nedostane fakturu dvakrát.",
  inputSchema: {
    invoice_id: z.string().uuid(),
    action: z.literal("send_email"),
    paid_date: z.null().describe("Vždy null; pole je součástí potvrzených parametrů."),
    confirmation_token: z.string().min(1).describe("Token z prepare_invoice_action."),
    idempotency_key: idempotencyKeySchema
      .optional()
      .describe("Doporučeno: opakované volání se stejným klíčem e-mail znovu nepošle."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  scope: "invoices:write",
  rateLimit: "email",
  handler: async (args, ctx) => {
    const payload = { invoice_id: args.invoice_id, action: args.action, paid_date: null }
    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_invoice_action",
      args.confirmation_token,
      payload,
    )

    const outcome = await withIdempotency(
      ctx,
      "send_invoice_email",
      args.idempotency_key,
      payload,
      async () => {
        const result = await sendInvoiceEmail(ctx.service, args.invoice_id)
        return {
          invoice_id: result.invoiceId,
          invoice_number: result.invoiceNumber,
          recipient: result.recipient,
          sent_at: result.sentAt,
        }
      },
    )

    return {
      payload: { ...outcome.payload, replayed: outcome.replayed },
      resourceType: "invoice",
      resourceId: args.invoice_id,
      confirmationId,
      idempotencyKey: args.idempotency_key ?? null,
    }
  },
})

export const deleteInvoiceTool = defineTool({
  name: "delete_invoice",
  title: "Smazat fakturu",
  description:
    "Trvale smaže fakturu i její položky. Aplikace nemá archivaci ani koš, takže operace je " +
    "nevratná a veřejný odkaz na stažení přestane fungovat. Vyžaduje potvrzovací token " +
    "z prepare_invoice_action se shodnými parametry. Pokud uživatel jen nechce fakturu evidovat " +
    "jako nezaplacenou, nabídni místo mazání označení jako zaplacené.",
  inputSchema: {
    invoice_id: z.string().uuid(),
    action: z.literal("delete"),
    paid_date: z.null().describe("Vždy null; pole je součástí potvrzených parametrů."),
    confirmation_token: z.string().min(1).describe("Token z prepare_invoice_action."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const payload = { invoice_id: args.invoice_id, action: args.action, paid_date: null }
    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_invoice_action",
      args.confirmation_token,
      payload,
    )

    const invoice = await getInvoice(ctx.service, args.invoice_id)
    await deleteInvoice(ctx.service, args.invoice_id)

    return {
      payload: {
        deleted: true,
        invoice_id: args.invoice_id,
        invoice_number: invoice.invoice_number,
        total: formatScaled(parseDecimal(invoice.total)),
      },
      resourceType: "invoice",
      resourceId: args.invoice_id,
      confirmationId,
    }
  },
})

function readInvoiceId(value: unknown): string | null {
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === "string") return id
  }
  return null
}
