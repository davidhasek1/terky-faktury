import { fromDecimal, toDecimal, type Scaled } from "@/lib/money"
import type { CompanyDetails, Customer, Invoice, InvoiceItem } from "@/lib/types"
import type { InvoiceInput, InvoiceListFilters } from "@/lib/validation/invoices"

import type { ServiceContext } from "./context"
import { getCustomer } from "./customers"
import { ServiceError, toServiceError } from "./errors"
import { calculateInvoiceTotals, defaultRetentionRate } from "./invoice-totals"

/**
 * Faktury. Zapisuje se výhradně přes tyto funkce — číslo faktury přiděluje
 * databázový trigger (migrace 013), takže ho tady nikdy nenastavujeme.
 */

const INVOICE_COLUMNS = `
  id, invoice_number, customer_id, public_id, issue_date, due_date,
  tax_rate, retention_rate, retention_amount, subtotal, tax_amount, total,
  notes, paid_date, email_sent_at, user_id, created_at, updated_at
`

const INVOICE_WITH_CUSTOMER = `${INVOICE_COLUMNS}, customer:customers(*)`

export interface InvoiceWithCustomer extends Invoice {
  customer: Customer | null
}

export interface InvoiceDetail extends InvoiceWithCustomer {
  items: InvoiceItem[]
}

/** Řádky faktury převedené na částky v setinách pro další počítání. */
export interface InvoiceDraft {
  customer: Customer
  issue_date: string
  due_date: string
  tax_rate: Scaled
  retention_rate: Scaled
  notes: string | null
  items: { description: string; quantity: Scaled; unit_price: Scaled; total: Scaled }[]
  subtotal: Scaled
  tax_amount: Scaled
  retention_amount: Scaled
  total: Scaled
}

/**
 * Doplní odvozené hodnoty (retención podle typu zákazníka, součty) a ověří,
 * že zákazník patří přihlášenému uživateli. Nic nezapisuje — používá ji
 * `prepare_invoice` i samotné uložení, aby byl náhled a výsledek totožný.
 */
export async function buildInvoiceDraft(
  ctx: ServiceContext,
  input: InvoiceInput,
): Promise<InvoiceDraft> {
  const customer = await getCustomer(ctx, input.customer_id)

  const retentionRate = input.retention_rate ?? defaultRetentionRate(customer.is_business)
  const totals = calculateInvoiceTotals({
    items: input.items,
    tax_rate: input.tax_rate,
    retention_rate: retentionRate,
  })

  return {
    customer,
    issue_date: input.issue_date,
    due_date: input.due_date,
    tax_rate: input.tax_rate,
    retention_rate: retentionRate,
    notes: input.notes,
    items: input.items.map((item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: totals.lineTotals[index],
    })),
    subtotal: totals.subtotal,
    tax_amount: totals.taxAmount,
    retention_amount: totals.retentionAmount,
    total: totals.total,
  }
}

function draftToRow(draft: InvoiceDraft) {
  return {
    customer_id: draft.customer.id,
    issue_date: draft.issue_date,
    due_date: draft.due_date,
    tax_rate: toDecimal(draft.tax_rate),
    retention_rate: toDecimal(draft.retention_rate),
    retention_amount: toDecimal(draft.retention_amount),
    subtotal: toDecimal(draft.subtotal),
    tax_amount: toDecimal(draft.tax_amount),
    total: toDecimal(draft.total),
    notes: draft.notes,
  }
}

function draftItemRows(draft: InvoiceDraft, invoiceId: string) {
  return draft.items.map((item) => ({
    invoice_id: invoiceId,
    description: item.description,
    quantity: toDecimal(item.quantity),
    unit_price: toDecimal(item.unit_price),
    total: toDecimal(item.total),
  }))
}

export async function listInvoices(
  ctx: ServiceContext,
  filters: InvoiceListFilters,
): Promise<InvoiceWithCustomer[]> {
  let query = ctx.supabase
    .from("invoices")
    .select(INVOICE_WITH_CUSTOMER)
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1)

  if (filters.status === "paid") {
    query = query.not("paid_date", "is", null)
  } else if (filters.status === "unpaid") {
    query = query.is("paid_date", null)
  } else if (filters.status === "overdue") {
    query = query.is("paid_date", null).lt("due_date", today())
  }

  if (filters.customer_id) query = query.eq("customer_id", filters.customer_id)
  if (filters.issued_from) query = query.gte("issue_date", filters.issued_from)
  if (filters.issued_to) query = query.lte("issue_date", filters.issued_to)

  const { data, error } = await query.returns<InvoiceWithCustomer[]>()
  if (error) throw toServiceError(error, "Nepodařilo se načíst faktury")
  return data ?? []
}

export async function getInvoice(ctx: ServiceContext, invoiceId: string): Promise<InvoiceDetail> {
  const { data: invoice, error } = await ctx.supabase
    .from("invoices")
    .select(INVOICE_WITH_CUSTOMER)
    .eq("id", invoiceId)
    .maybeSingle<InvoiceWithCustomer>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst fakturu")
  if (!invoice) throw new ServiceError("INVOICE_NOT_FOUND", "Faktura nebyla nalezena.")

  return { ...invoice, items: await getInvoiceItems(ctx, invoiceId) }
}

export async function getInvoiceItems(
  ctx: ServiceContext,
  invoiceId: string,
): Promise<InvoiceItem[]> {
  const { data, error } = await ctx.supabase
    .from("invoice_items")
    .select("id, invoice_id, description, quantity, unit_price, total")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true })
    .returns<InvoiceItem[]>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst položky faktury")
  return data ?? []
}

export async function createInvoice(
  ctx: ServiceContext,
  input: InvoiceInput,
): Promise<InvoiceDetail> {
  const draft = await buildInvoiceDraft(ctx, input)

  const { data: invoice, error: invoiceError } = await ctx.supabase
    .from("invoices")
    .insert([{ ...draftToRow(draft), user_id: ctx.userId }])
    .select(INVOICE_COLUMNS)
    .single<Invoice>()

  if (invoiceError) throw toServiceError(invoiceError, "Nepodařilo se vytvořit fakturu")

  const { error: itemsError } = await ctx.supabase
    .from("invoice_items")
    .insert(draftItemRows(draft, invoice.id))

  if (itemsError) {
    // Faktura bez položek by byla rozbitý doklad — vrátíme stav zpět.
    await ctx.supabase.from("invoices").delete().eq("id", invoice.id)
    throw toServiceError(itemsError, "Nepodařilo se uložit položky faktury")
  }

  return { ...invoice, customer: draft.customer, items: await getInvoiceItems(ctx, invoice.id) }
}

export async function updateInvoice(
  ctx: ServiceContext,
  invoiceId: string,
  input: InvoiceInput,
): Promise<InvoiceDetail> {
  // Ověří existenci i vlastnictví přes RLS dřív, než cokoli přepíšeme.
  await getInvoice(ctx, invoiceId)
  const draft = await buildInvoiceDraft(ctx, input)

  const { data: invoice, error: updateError } = await ctx.supabase
    .from("invoices")
    .update(draftToRow(draft))
    .eq("id", invoiceId)
    .select(INVOICE_COLUMNS)
    .maybeSingle<Invoice>()

  if (updateError) throw toServiceError(updateError, "Nepodařilo se uložit fakturu")
  if (!invoice) throw new ServiceError("INVOICE_NOT_FOUND", "Faktura nebyla nalezena.")

  const { error: deleteError } = await ctx.supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoiceId)

  if (deleteError) throw toServiceError(deleteError, "Nepodařilo se aktualizovat položky faktury")

  const { error: itemsError } = await ctx.supabase
    .from("invoice_items")
    .insert(draftItemRows(draft, invoiceId))

  if (itemsError) throw toServiceError(itemsError, "Nepodařilo se uložit položky faktury")

  return { ...invoice, customer: draft.customer, items: await getInvoiceItems(ctx, invoiceId) }
}

export async function setInvoicePayment(
  ctx: ServiceContext,
  invoiceId: string,
  paidDate: string | null,
): Promise<Invoice> {
  const { data, error } = await ctx.supabase
    .from("invoices")
    .update({ paid_date: paidDate })
    .eq("id", invoiceId)
    .select(INVOICE_COLUMNS)
    .maybeSingle<Invoice>()

  if (error) throw toServiceError(error, "Nepodařilo se změnit stav platby")
  if (!data) throw new ServiceError("INVOICE_NOT_FOUND", "Faktura nebyla nalezena.")
  return data
}

/**
 * Trvale smaže fakturu i její položky. Aplikace nemá archivaci ani soft
 * delete, takže operace je nevratná — volající ji musí nechat potvrdit.
 */
export async function deleteInvoice(ctx: ServiceContext, invoiceId: string): Promise<void> {
  const { error: itemsError } = await ctx.supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoiceId)

  if (itemsError) throw toServiceError(itemsError, "Nepodařilo se smazat položky faktury")

  const { error } = await ctx.supabase.from("invoices").delete().eq("id", invoiceId)
  if (error) throw toServiceError(error, "Nepodařilo se smazat fakturu")
}

export interface InvoiceStats {
  total: number
  paid: number
  unpaid: number
  overdue: number
  totalAmount: Scaled
  paidAmount: Scaled
  unpaidAmount: Scaled
  overdueAmount: Scaled
}

export async function getInvoiceStats(ctx: ServiceContext): Promise<InvoiceStats> {
  const { data, error } = await ctx.supabase
    .from("invoices")
    .select("total, paid_date, due_date")
    .eq("user_id", ctx.userId)
    .returns<{ total: number; paid_date: string | null; due_date: string }[]>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst souhrn faktur")

  const rows = data ?? []
  const reference = today()
  const stats: InvoiceStats = {
    total: rows.length,
    paid: 0,
    unpaid: 0,
    overdue: 0,
    totalAmount: 0,
    paidAmount: 0,
    unpaidAmount: 0,
    overdueAmount: 0,
  }

  for (const row of rows) {
    const amount = fromDecimal(row.total)
    stats.totalAmount += amount

    if (row.paid_date) {
      stats.paid += 1
      stats.paidAmount += amount
      continue
    }

    stats.unpaid += 1
    stats.unpaidAmount += amount

    if (row.due_date < reference) {
      stats.overdue += 1
      stats.overdueAmount += amount
    }
  }

  return stats
}

/** Firemní údaje vystavovatele faktury (potřeba pro PDF a náhled). */
export async function getCompanyDetailsForInvoice(
  ctx: ServiceContext,
  ownerUserId: string,
): Promise<CompanyDetails | null> {
  const { data, error } = await ctx.supabase
    .from("company_details")
    .select("*")
    .eq("user_id", ownerUserId)
    .maybeSingle<CompanyDetails>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst firemní údaje")
  return data
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
