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

export interface SeedExpenseItem {
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
}

/**
 * Doklad nákladu s položkami. Bez `items` dostane jednu položku 40 € + 21 %.
 * Součty dokladu se dopočtou z položek, jako to dělá servisní vrstva.
 */
export function seedExpense(
  db: FakeDatabase,
  userId: string,
  overrides: Partial<Row> = {},
  items: SeedExpenseItem[] = [{ subtotal: 40, tax_rate: 21, tax_amount: 8.4, total: 48.4 }],
): string {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const sum = (key: keyof SeedExpenseItem) =>
    Math.round(items.reduce((total, item) => total + item[key] * 100, 0)) / 100

  db.expenses.push({
    id,
    user_id: userId,
    expense_date: "2026-02-15",
    description: "Čisticí prostředky",
    supplier: "Mercadona",
    category: "material",
    subtotal: sum("subtotal"),
    tax_amount: sum("tax_amount"),
    total: sum("total"),
    note: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  })

  items.forEach((item, position) => {
    db.expense_items.push({ id: crypto.randomUUID(), expense_id: id, position, ...item })
  })

  return id
}
