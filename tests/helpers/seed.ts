import type { FakeDatabase, Row } from "./fake-supabase"

/** Naplnění testovací databáze. Vrací id, aby se na ně dalo v testu odkázat. */

export function seedCustomer(
  db: FakeDatabase,
  userId: string,
  overrides: Partial<Row> = {},
): string {
  const id = crypto.randomUUID()
  db.customers.push({
    id,
    user_id: userId,
    name: "Novák s.r.o.",
    email: "faktury@novak.test",
    phone: null,
    address: "Hlavní 1\nPraha",
    ico: null,
    dic: null,
    is_business: false,
    created_at: new Date().toISOString(),
    ...overrides,
  })
  return id
}

export function seedInvoice(
  db: FakeDatabase,
  userId: string,
  customerId: string,
  overrides: Partial<Row> = {},
): string {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.invoices.push({
    id,
    user_id: userId,
    customer_id: customerId,
    invoice_number: `2026-${String(db.invoices.length + 1).padStart(3, "0")}`,
    public_id: crypto.randomUUID(),
    issue_date: "2026-01-10",
    due_date: "2026-01-24",
    tax_rate: 21,
    retention_rate: 0,
    retention_amount: 0,
    subtotal: 100,
    tax_amount: 21,
    total: 121,
    notes: null,
    paid_date: null,
    email_sent_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  })

  db.invoice_items.push({
    id: crypto.randomUUID(),
    invoice_id: id,
    description: "Úklid apartmánu",
    quantity: 1,
    unit_price: 100,
    total: 100,
    created_at: now,
  })

  return id
}

export function seedActivity(
  db: FakeDatabase,
  userId: string,
  customerId: string,
  overrides: Partial<Row> = {},
): string {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.activities.push({
    id,
    user_id: userId,
    customer_id: customerId,
    activity_date: "2026-02-01",
    status: "unpaid",
    total_amount: 25,
    created_at: now,
    updated_at: now,
    ...overrides,
  })

  db.activity_services.push({
    id: crypto.randomUUID(),
    activity_id: id,
    service_type: "cleaning",
    price: 25,
    note: null,
  })

  return id
}
