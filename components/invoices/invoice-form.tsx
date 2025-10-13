"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { Customer, Invoice, InvoiceItem } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"

interface InvoiceFormProps {
  customers: Customer[]
  invoice?: Invoice
  existingItems?: InvoiceItem[]
}

export function InvoiceForm({ customers, invoice, existingItems = [] }: InvoiceFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    invoice_number: invoice?.invoice_number || `F${new Date().getFullYear()}${String(Date.now()).slice(-6)}`,
    customer_id: invoice?.customer_id || undefined,
    issue_date: invoice?.issue_date || new Date().toISOString().split("T")[0],
    due_date: invoice?.due_date || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    tax_rate: invoice?.tax_rate || 21,
    retention_rate: invoice?.retention_rate || 0,
    notes: invoice?.notes || "",
  })

  const [items, setItems] = useState<InvoiceItem[]>(
    existingItems.length > 0 ? existingItems : [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
  )

  const calculateItemTotal = (quantity: number, unitPrice: number) => {
    return quantity * unitPrice
  }

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0)
  }

  const calculateTax = () => {
    return (calculateSubtotal() * formData.tax_rate) / 100
  }

  const calculateRetention = () => {
    return (calculateSubtotal() * formData.retention_rate) / 100
  }

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax() - calculateRetention()
  }

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_price: 0, total: 0 }])
  }

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }

    if (field === "quantity" || field === "unit_price") {
      newItems[index].total = calculateItemTotal(Number(newItems[index].quantity), Number(newItems[index].unit_price))
    }

    setItems(newItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!formData.customer_id) {
      setError("Musíte vybrat zákazníka")
      setIsLoading(false)
      return
    }

    const supabase = createClient()

    try {
      console.log("[v0] Saving invoice with data:", formData)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error("Musíte být přihlášeni")
      }

      const subtotal = calculateSubtotal()
      const taxAmount = calculateTax()
      const retentionAmount = calculateRetention()
      const total = calculateTotal()

      const invoiceData = {
        ...formData,
        subtotal,
        tax_amount: taxAmount,
        retention_amount: retentionAmount,
        total,
        user_id: user.id, // Add user_id for RLS
      }

      let invoiceId = invoice?.id

      if (invoice) {
        // Update existing invoice
        const { error: invoiceError } = await supabase.from("invoices").update(invoiceData).eq("id", invoice.id)

        if (invoiceError) throw invoiceError

        // Delete old items
        const { error: deleteError } = await supabase.from("invoice_items").delete().eq("invoice_id", invoice.id)

        if (deleteError) throw deleteError
      } else {
        // Create new invoice
        const { data: newInvoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert([invoiceData])
          .select()
          .single()

        if (invoiceError) throw invoiceError
        invoiceId = newInvoice.id
      }

      // Insert items
      const itemsData = items.map((item) => ({
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
      }))

      const { error: itemsError } = await supabase.from("invoice_items").insert(itemsData)

      if (itemsError) throw itemsError

      router.push("/invoices")
      router.refresh()
    } catch (err) {
      console.error("[v0] Error saving invoice:", err)
      setError(err instanceof Error ? err.message : "Nepodařilo se uložit fakturu")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invoice_number">
            Číslo faktury <span className="text-destructive">*</span>
          </Label>
          <Input
            id="invoice_number"
            required
            value={formData.invoice_number}
            onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer_id">
            Zákazník <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.customer_id}
            onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
            required
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="issue_date">
            Datum vystavení <span className="text-destructive">*</span>
          </Label>
          <Input
            id="issue_date"
            type="date"
            required
            value={formData.issue_date}
            onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="due_date">
            Datum splatnosti <span className="text-destructive">*</span>
          </Label>
          <Input
            id="due_date"
            type="date"
            required
            value={formData.due_date}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tax_rate">
            Sazba DPH (%) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tax_rate"
            type="number"
            step="0.01"
            required
            value={formData.tax_rate}
            onChange={(e) => {
              const value = e.target.value
              setFormData({ ...formData, tax_rate: value === "" ? 0 : Number.parseFloat(value) })
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="retention_rate">Retención (%)</Label>
          <Input
            id="retention_rate"
            type="number"
            step="0.01"
            value={formData.retention_rate}
            onChange={(e) => {
              const value = e.target.value
              setFormData({ ...formData, retention_rate: value === "" ? 0 : Number.parseFloat(value) })
            }}
          />
          <p className="text-xs text-muted-foreground">Obvykle 15% pro španělské faktury</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Položky faktury</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="mr-2 h-4 w-4" />
              Přidat položku
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="grid gap-4 md:grid-cols-12 items-end p-4 border rounded-lg">
              <div className="md:col-span-5 space-y-2">
                <Label htmlFor={`description-${index}`}>Popis</Label>
                <Input
                  id={`description-${index}`}
                  required
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor={`quantity-${index}`}>Množství</Label>
                <Input
                  id={`quantity-${index}`}
                  type="number"
                  step="0.01"
                  required
                  value={item.quantity}
                  onChange={(e) => {
                    const value = e.target.value
                    updateItem(index, "quantity", value === "" ? 0 : Number.parseFloat(value))
                  }}
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor={`unit_price-${index}`}>Cena/ks</Label>
                <Input
                  id={`unit_price-${index}`}
                  type="number"
                  step="0.01"
                  required
                  value={item.unit_price}
                  onChange={(e) => {
                    const value = e.target.value
                    updateItem(index, "unit_price", value === "" ? 0 : Number.parseFloat(value))
                  }}
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label>Celkem</Label>
                <div className="h-10 flex items-center font-medium">{formatCurrency(item.total)}</div>
              </div>

              <div className="md:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 max-w-sm ml-auto">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Mezisoučet:</span>
              <span className="font-medium">{formatCurrency(calculateSubtotal())}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">DPH ({formData.tax_rate}%):</span>
              <span className="font-medium">{formatCurrency(calculateTax())}</span>
            </div>
            {formData.retention_rate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Retención (-{formData.retention_rate}%):</span>
                <span className="font-medium text-destructive">-{formatCurrency(calculateRetention())}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Celkem:</span>
              <span>{formatCurrency(calculateTotal())}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="notes">Poznámky</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Ukládám..." : invoice ? "Uložit změny" : "Vytvořit fakturu"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
          Zrušit
        </Button>
      </div>
    </form>
  )
}
