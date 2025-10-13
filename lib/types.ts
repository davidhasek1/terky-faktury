export interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  ico?: string
  dic?: string
  user_id?: string // Added user_id for RLS
  created_at: string
}

export interface InvoiceItem {
  id?: string
  invoice_id?: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id: string
  invoice_number: string
  customer_id: string
  public_id: string
  issue_date: string
  due_date: string
  tax_rate: number
  retention_rate: number
  retention_amount: number
  subtotal: number
  tax_amount: number
  total: number
  notes?: string
  paid_date?: string
  user_id?: string // Added user_id for RLS
  created_at: string
  updated_at: string
  customer?: Customer
  items?: InvoiceItem[]
}
