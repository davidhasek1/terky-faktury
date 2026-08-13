import { z } from "zod"

import { invoiceItemDescriptionHint } from "@/lib/invoice-items"
import { formatScaled, parseDecimal, toDecimal } from "@/lib/money"
import { baseUrl } from "@/lib/oauth/config"
import { getCustomer } from "@/lib/services/customers"
import { ServiceError } from "@/lib/services/errors"
import { sendInvoiceEmail } from "@/lib/services/invoice-email"
import { DEFAULT_TAX_RATE, defaultRetentionRate } from "@/lib/services/invoice-totals"
import {
  buildInvoiceDraft,
  createInvoice,
  deleteInvoice,
  getInvoice,
  getInvoiceStats,
  invoiceStatus,
  listInvoices,
  setInvoicePayment,
  updateInvoice,
} from "@/lib/services/invoices"
import { idempotencyKeySchema } from "@/lib/validation/common"
import { MAX_INVOICE_ITEMS, invoiceInputSchema } from "@/lib/validation/invoices"

import { defineTool } from "@/lib/mcp/define-tool"
import { withIdempotency } from "@/lib/mcp/idempotency"
import { safeText } from "@/lib/mcp/output"
import {
  amount,
  amountFields,
  presentInvoiceDetail,
  presentInvoiceSummary,
} from "@/lib/mcp/present"
import { CONFIRMATION_TOKEN_HINT, twoPhase } from "@/lib/mcp/two-phase"

/** Nástroje pro faktury: čtení, zápis a nevratné operace. */

const DEFAULT_DUE_DAYS = 14

const decimalString = z
  .union([z.string(), z.number()])
  .describe("Desetinné číslo, např. \"100\" nebo \"100.50\".")

const invoiceItemShape = z.object({
  description: z.string().trim().min(1).max(500).describe(invoiceItemDescriptionHint()),
  quantity: decimalString.describe("Množství, větší než nula. Výchozí 1."),
  unit_price: decimalString.describe("Cena za jednotku v EUR bez DPH."),
})

/**
 * Vstupní pole faktury. Všechno kromě zákazníka a položek je volitelné —
 * chybějící hodnoty doplní server stejně v obou fázích, takže model nemusí
 * mezi voláními nic přepisovat.
 */
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
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve tvaru RRRR-MM-DD")
    .optional()
    .describe("Datum vystavení. Výchozí dnešek."),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve tvaru RRRR-MM-DD")
    .optional()
    .describe("Datum splatnosti. Výchozí 14 dní od vystavení."),
  tax_rate: decimalString.optional().describe("Sazba DPH v %. Výchozí 21."),
  retention_rate: decimalString
    .optional()
    .describe("Retención v %. Výchozí podle typu zákazníka: 15 % pro podnikatele, jinak 0 %."),
  notes: z.string().trim().max(2000).nullish().describe("Poznámka na faktuře."),
  currency: z.literal("EUR").optional().describe("Aplikace umí pouze EUR."),
  confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
}

type InvoiceArgs = {
  customer_id: string
  items: { description: string; quantity: string | number; unit_price: string | number }[]
  issue_date?: string
  due_date?: string
  tax_rate?: string | number
  retention_rate?: string | number
  notes?: string | null
  currency?: "EUR"
  invoice_id?: string
}

/** Vstup doplněný o výchozí hodnoty. Musí vyjít stejně v obou fázích. */
interface ResolvedInvoice {
  customer_id: string
  issue_date: string
  due_date: string
  tax_rate: string
  retention_rate: string
  notes: string | null
  currency: "EUR"
  items: { description: string; quantity: string; unit_price: string }[]
}

function normalizeDecimal(value: string | number): string {
  return toDecimal(parseDecimal(value)).toFixed(2)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

async function resolveInvoice(
  ctx: Parameters<typeof getCustomer>[0] extends never ? never : import("@/lib/mcp/context").McpContext,
  args: InvoiceArgs,
): Promise<{ resolved: ResolvedInvoice; customerName: string | null; isBusiness: boolean }> {
  const customer = await getCustomer(ctx.service, args.customer_id)
  const issueDate = args.issue_date ?? today()

  return {
    customerName: safeText(customer.name, 200),
    isBusiness: customer.is_business ?? false,
    resolved: {
      customer_id: args.customer_id,
      issue_date: issueDate,
      due_date: args.due_date ?? addDays(issueDate, DEFAULT_DUE_DAYS),
      tax_rate: normalizeDecimal(args.tax_rate ?? amount(DEFAULT_TAX_RATE)),
      retention_rate: normalizeDecimal(
        args.retention_rate ?? amount(defaultRetentionRate(customer.is_business)),
      ),
      notes: args.notes?.trim() || null,
      currency: "EUR",
      items: args.items.map((item) => ({
        description: item.description.trim(),
        quantity: normalizeDecimal(item.quantity),
        unit_price: normalizeDecimal(item.unit_price),
      })),
    },
  }
}

function toServiceInput(resolved: ResolvedInvoice) {
  return invoiceInputSchema.parse(resolved)
}

export const listInvoicesTool = defineTool({
  name: "list_invoices",
  title: "Seznam faktur",
  description:
    "Vrátí faktury přihlášeného uživatele s možností filtrovat podle stavu, zákazníka a období. " +
    "Použij na dotazy typu „nezaplacené faktury po splatnosti“ nebo „faktury klienta X“. " +
    "Vrací nejvýše 50 záznamů, na další použij offset. Ve výsledku je i e-mail účtu — když je " +
    "seznam prázdný, uveď ho, ať uživatel pozná, že je konektor připojený k jinému účtu.",
  inputSchema: {
    status: z
      .enum(["all", "paid", "unpaid", "overdue"])
      .default("all")
      .describe("overdue = nezaplacené s datem splatnosti v minulosti."),
    customer_id: z.string().uuid().optional().describe("Omezení na jednoho zákazníka."),
    issued_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve tvaru RRRR-MM-DD").optional().describe("Vystaveno od."),
    issued_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve tvaru RRRR-MM-DD").optional().describe("Vystaveno do."),
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
        account: { email: ctx.accountEmail },
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
    "Použij na dotazy typu „kolik mi dluží“ nebo „jak jsem na tom letos“. Ve výsledku je i e-mail " +
    "účtu — když jsou počty nulové, uveď ho, ať uživatel pozná, že je konektor připojený jinam.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (_args, ctx) => {
    const stats = await getInvoiceStats(ctx.service)
    return {
      payload: {
        account: { email: ctx.accountEmail },
        counts: { total: stats.total, paid: stats.paid, unpaid: stats.unpaid, overdue: stats.overdue },
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

export const createInvoiceTool = defineTool({
  name: "create_invoice",
  title: "Vystavit fakturu",
  description:
    "Vystaví fakturu. Číslo přidělí systém. Probíhá na dva kroky: zavolej nejdřív BEZ " +
    "confirmation_token — spočítá se DPH, retención i celková částka a vrátí se návrh, ale nic " +
    "se neuloží. Ukaž návrh uživateli, a teprve po jeho souhlasu zavolej tentýž nástroj znovu " +
    "se stejnými argumenty a s tokenem z návrhu.",
  inputSchema: {
    ...invoiceFields,
    idempotency_key: idempotencyKeySchema
      .optional()
      .describe("Doporučeno: brání vystavení dvou stejných faktur při opakovaném volání."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const { resolved, customerName, isBusiness } = await resolveInvoice(ctx, args)
    const draft = await buildInvoiceDraft(ctx.service, toServiceInput(resolved))

    return twoPhase(ctx, {
      tool: "create_invoice",
      token: args.confirmation_token,
      params: resolved,
      status: "NÁVRH — faktura zatím NEBYLA vystavena",
      warnings: draft.customer.email ? [] : ["Zákazník nemá e-mail, fakturu mu nepůjde odeslat."],
      summary: {
        customer: { id: resolved.customer_id, name: customerName, is_business: isBusiness },
        issue_date: resolved.issue_date,
        due_date: resolved.due_date,
        currency: "EUR",
        payment_method: "Bankovní převod na účet uvedený na faktuře",
        tax_rate_percent: resolved.tax_rate,
        retention_rate_percent: resolved.retention_rate,
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
      },
      resourceType: "invoice",
      execute: async (confirmationId) => {
        const outcome = await withIdempotency(
          ctx,
          "create_invoice",
          args.idempotency_key,
          resolved,
          async () => ({
            invoice: presentInvoiceDetail(await createInvoice(ctx.service, toServiceInput(resolved))),
          }),
        )

        return {
          payload: { saved: true, ...outcome.payload, replayed: outcome.replayed },
          resourceType: "invoice",
          confirmationId,
          idempotencyKey: args.idempotency_key ?? null,
        }
      },
    })
  },
})

export const updateInvoiceTool = defineTool({
  name: "update_invoice",
  title: "Upravit fakturu",
  description:
    "Přepíše existující fakturu včetně všech položek. Dvoufázové: nejdřív bez confirmation_token " +
    "pro návrh, po souhlasu uživatele znovu se stejnými argumenty a s tokenem. Pokud už byla " +
    "faktura odeslána zákazníkovi, upozorni, že ji bude potřeba odeslat znovu.",
  inputSchema: {
    ...invoiceFields,
    invoice_id: z.string().uuid().describe("Identifikátor upravované faktury."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const existing = await getInvoice(ctx.service, args.invoice_id)
    const { resolved, customerName } = await resolveInvoice(ctx, args)
    const draft = await buildInvoiceDraft(ctx.service, toServiceInput(resolved))

    return twoPhase(ctx, {
      tool: "update_invoice",
      token: args.confirmation_token,
      params: { ...resolved, invoice_id: args.invoice_id },
      status: "NÁVRH — faktura zatím NEBYLA upravena",
      warnings: existing.email_sent_at
        ? ["Faktura už byla odeslána e-mailem. Po úpravě ji bude potřeba odeslat znovu."]
        : [],
      summary: {
        invoice_number: existing.invoice_number,
        customer: { id: resolved.customer_id, name: customerName },
        issue_date: resolved.issue_date,
        due_date: resolved.due_date,
        currency: "EUR",
        tax_rate_percent: resolved.tax_rate,
        retention_rate_percent: resolved.retention_rate,
        items: draft.items.map((item) => ({
          description: safeText(item.description, 500),
          quantity: amount(item.quantity),
          unit_price: amountFields(item.unit_price),
          total: amountFields(item.total),
        })),
        total: amountFields(draft.total),
        previous_total: amountFields(parseDecimal(existing.total)),
      },
      resourceType: "invoice",
      resourceId: args.invoice_id,
      execute: async (confirmationId) => {
        const invoice = await updateInvoice(ctx.service, args.invoice_id, toServiceInput(resolved))

        return {
          payload: { saved: true, invoice: presentInvoiceDetail(invoice) },
          resourceType: "invoice",
          resourceId: invoice.id,
          confirmationId,
        }
      },
    })
  },
})

export const setInvoicePaymentTool = defineTool({
  name: "set_invoice_payment",
  title: "Změnit stav platby faktury",
  description:
    "Označí fakturu jako zaplacenou (zadej paid_date) nebo platbu zruší (pošli paid_date: null). " +
    "Dvoufázové: nejdřív bez confirmation_token pro návrh, po souhlasu uživatele znovu s tokenem.",
  inputSchema: {
    invoice_id: z.string().uuid().describe("Identifikátor faktury."),
    paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve tvaru RRRR-MM-DD")
      .nullish()
      .describe("Datum úhrady. Vynech nebo pošli null pro zrušení platby."),
    confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const invoice = await getInvoice(ctx.service, args.invoice_id)
    const paidDate = args.paid_date ?? null
    const params = { invoice_id: args.invoice_id, paid_date: paidDate }

    const warnings: string[] = []
    if (paidDate && invoice.paid_date) {
      warnings.push(`Faktura je už označená jako zaplacená k ${invoice.paid_date}.`)
    }
    if (!paidDate && !invoice.paid_date) {
      warnings.push("Faktura není označená jako zaplacená, operace nic nezmění.")
    }

    return twoPhase(ctx, {
      tool: "set_invoice_payment",
      token: args.confirmation_token,
      params,
      status: paidDate
        ? "NÁVRH — faktura zatím NEBYLA označena jako zaplacená"
        : "NÁVRH — platba zatím NEBYLA zrušena",
      warnings,
      summary: {
        invoice_number: invoice.invoice_number,
        customer_name: safeText(invoice.customer?.name, 200),
        total: amountFields(parseDecimal(invoice.total)),
        current_status: invoiceStatus(invoice),
        new_paid_date: paidDate,
      },
      resourceType: "invoice",
      resourceId: invoice.id,
      execute: async (confirmationId) => {
        const updated = await setInvoicePayment(ctx.service, args.invoice_id, paidDate)

        return {
          payload: {
            saved: true,
            invoice_id: updated.id,
            invoice_number: updated.invoice_number,
            status: invoiceStatus(updated),
            paid_date: updated.paid_date ?? null,
          },
          resourceType: "invoice",
          resourceId: updated.id,
          confirmationId,
        }
      },
    })
  },
})

export const sendInvoiceEmailTool = defineTool({
  name: "send_invoice_email",
  title: "Odeslat fakturu e-mailem",
  description:
    "Odešle zákazníkovi e-mail s odkazem na fakturu. Operace je nevratná — odeslaný e-mail nelze " +
    "vzít zpět. Dvoufázové: nejdřív bez confirmation_token pro návrh s příjemcem, po souhlasu " +
    "uživatele znovu s tokenem. Vždy použij idempotency_key, ať zákazník nedostane fakturu dvakrát.",
  inputSchema: {
    invoice_id: z.string().uuid().describe("Identifikátor faktury."),
    confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
    idempotency_key: idempotencyKeySchema
      .optional()
      .describe("Doporučeno: opakované volání se stejným klíčem e-mail znovu nepošle."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  scope: "invoices:write",
  rateLimit: "email",
  handler: async (args, ctx) => {
    const invoice = await getInvoice(ctx.service, args.invoice_id)
    const recipient = invoice.customer?.email

    if (!recipient) {
      throw new ServiceError(
        "CUSTOMER_EMAIL_MISSING",
        "Zákazník nemá vyplněný e-mail, fakturu nelze odeslat.",
      )
    }

    const params = { invoice_id: args.invoice_id }

    return twoPhase(ctx, {
      tool: "send_invoice_email",
      token: args.confirmation_token,
      params,
      status: "NÁVRH — e-mail zatím NEBYL odeslán",
      warnings: invoice.email_sent_at
        ? [`Faktura už byla odeslána ${invoice.email_sent_at}. Odešle se znovu.`]
        : [],
      summary: {
        invoice_number: invoice.invoice_number,
        customer_name: safeText(invoice.customer?.name, 200),
        recipient,
        total: amountFields(parseDecimal(invoice.total)),
        due_date: invoice.due_date,
      },
      resourceType: "invoice",
      resourceId: invoice.id,
      execute: async (confirmationId) => {
        const outcome = await withIdempotency(
          ctx,
          "send_invoice_email",
          args.idempotency_key,
          params,
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
          payload: { saved: true, ...outcome.payload, replayed: outcome.replayed },
          resourceType: "invoice",
          resourceId: args.invoice_id,
          confirmationId,
          idempotencyKey: args.idempotency_key ?? null,
        }
      },
    })
  },
})

export const deleteInvoiceTool = defineTool({
  name: "delete_invoice",
  title: "Smazat fakturu",
  description:
    "Trvale smaže fakturu i její položky. Aplikace nemá archivaci ani koš, takže operace je " +
    "nevratná a veřejný odkaz na stažení přestane fungovat. Dvoufázové: nejdřív bez " +
    "confirmation_token pro návrh s upozorněními, po výslovném souhlasu uživatele znovu " +
    "s tokenem. Pokud uživatel jen nechce fakturu evidovat jako nezaplacenou, nabídni místo " +
    "mazání označení jako zaplacené.",
  inputSchema: {
    invoice_id: z.string().uuid().describe("Identifikátor faktury."),
    confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const invoice = await getInvoice(ctx.service, args.invoice_id)

    const warnings = ["Smazání je nevratné. Aplikace nemá archivaci ani koš."]
    if (invoice.email_sent_at) {
      warnings.push("Faktura už byla odeslána zákazníkovi — odkaz na stažení přestane fungovat.")
    }
    if (invoice.paid_date) warnings.push("Faktura je označená jako zaplacená.")

    return twoPhase(ctx, {
      tool: "delete_invoice",
      token: args.confirmation_token,
      params: { invoice_id: args.invoice_id },
      status: "NÁVRH — faktura zatím NEBYLA smazána",
      warnings,
      summary: {
        invoice_number: invoice.invoice_number,
        customer_name: safeText(invoice.customer?.name, 200),
        total: amountFields(parseDecimal(invoice.total)),
        status: invoiceStatus(invoice),
        issue_date: invoice.issue_date,
      },
      resourceType: "invoice",
      resourceId: invoice.id,
      execute: async (confirmationId) => {
        await deleteInvoice(ctx.service, args.invoice_id)

        return {
          payload: {
            saved: true,
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
  },
})
