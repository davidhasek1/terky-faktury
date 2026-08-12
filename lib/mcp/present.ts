import { formatScaled, fromDecimal, toDecimal, type Scaled } from "@/lib/money"
import type { ActivityService, Customer, InvoiceItem } from "@/lib/types"
import type { ActivityWithCustomer } from "@/lib/services/activities"
import { invoiceStatus, type InvoiceDetail, type InvoiceWithCustomer } from "@/lib/services/invoices"

import { maskEmail, safeText } from "./output"

/**
 * Převod doménových objektů na výstup nástroje.
 *
 * Pravidla:
 *  - vracíme jen pole, která model k výsledku potřebuje, ne celé DB řádky,
 *  - částky jako řetězec s dvěma desetinnými místy (JSON `number` by u peněz
 *    otevřel dveře chybám plovoucí desetinné čárky),
 *  - texty z databáze projdou `safeText`, protože jde o neověřený vstup.
 */

export const CURRENCY = "EUR"

/** "1234.56" — stabilní strojový tvar bez oddělovačů tisíců. */
export function amount(scaled: Scaled): string {
  return toDecimal(scaled).toFixed(2)
}

function amountFields(scaled: Scaled) {
  return { amount: amount(scaled), currency: CURRENCY, formatted: formatScaled(scaled) }
}

/** Kandidát z vyhledávání — dost údajů na rozlišení, ale bez zbytečné expozice. */
export function presentCustomerCandidate(customer: Customer, invoiceCount: number) {
  return {
    id: customer.id,
    name: safeText(customer.name, 200),
    email_masked: maskEmail(customer.email),
    city: safeText(customer.address?.split("\n").pop(), 80),
    is_business: customer.is_business ?? false,
    invoice_count: invoiceCount,
  }
}

export function presentCustomer(customer: Customer) {
  return {
    id: customer.id,
    name: safeText(customer.name, 200),
    email: safeText(customer.email, 254),
    phone: safeText(customer.phone, 40),
    address: safeText(customer.address, 500),
    nie: safeText(customer.ico, 40),
    nif: safeText(customer.dic, 40),
    is_business: customer.is_business ?? false,
    created_at: customer.created_at,
  }
}

export function presentInvoiceSummary(invoice: InvoiceWithCustomer) {
  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    customer_id: invoice.customer_id,
    customer_name: safeText(invoice.customer?.name, 200),
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    status: invoiceStatus(invoice),
    paid_date: invoice.paid_date ?? null,
    email_sent_at: invoice.email_sent_at ?? null,
    total: amountFields(fromDecimal(invoice.total)),
  }
}

export function presentInvoiceItem(item: InvoiceItem) {
  return {
    description: safeText(item.description, 500),
    quantity: amount(fromDecimal(item.quantity)),
    unit_price: amountFields(fromDecimal(item.unit_price)),
    total: amountFields(fromDecimal(item.total)),
  }
}

export function presentInvoiceDetail(invoice: InvoiceDetail) {
  return {
    ...presentInvoiceSummary(invoice),
    tax_rate_percent: amount(fromDecimal(invoice.tax_rate)),
    retention_rate_percent: amount(fromDecimal(invoice.retention_rate)),
    subtotal: amountFields(fromDecimal(invoice.subtotal)),
    tax_amount: amountFields(fromDecimal(invoice.tax_amount)),
    retention_amount: amountFields(fromDecimal(invoice.retention_amount)),
    notes: safeText(invoice.notes, 2000),
    items: invoice.items.map(presentInvoiceItem),
  }
}

export function presentActivity(activity: ActivityWithCustomer, services: ActivityService[]) {
  return {
    id: activity.id,
    customer_id: activity.customer_id,
    customer_name: safeText(activity.customer?.name, 200),
    activity_date: activity.activity_date,
    status: activity.status,
    total: amountFields(fromDecimal(activity.total_amount)),
    services: services.map((service) => ({
      service_type: service.service_type,
      price: amountFields(fromDecimal(service.price)),
      note: safeText(service.note, 200),
    })),
  }
}

export { amountFields, invoiceStatus }
