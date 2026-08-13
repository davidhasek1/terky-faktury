"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { SectionLabel } from "@/components/patterns/section-label"
import { FormActions, FormField, FormRow } from "@/components/patterns/form-field"
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import { createCustomer, updateCustomer } from "@/lib/services/customers"
import { customerInputSchema } from "@/lib/validation/customers"
import { firstIssueMessage } from "@/lib/validation/common"
import type { Customer } from "@/lib/types"
import { z } from "zod"
import { toast } from "sonner"

interface CustomerFormProps {
  customer?: Customer
}

export function CustomerForm({ customer }: CustomerFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    address: customer?.address || "",
    ico: customer?.ico || "",
    dic: customer?.dic || "",
    is_business: customer?.is_business || false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const input = customerInputSchema.parse(formData)
      const ctx = await createBrowserServiceContext()

      if (customer) {
        await updateCustomer(ctx, customer.id, input)
      } else {
        await createCustomer(ctx, input)
      }

      toast.success(customer ? "Zákazník byl úspěšně aktualizován" : "Zákazník byl úspěšně vytvořen")
      router.push("/customers")
      router.refresh()
    } catch (err) {
      console.error("[customers] Nepodařilo se uložit zákazníka:", err)
      toast.error(
        err instanceof z.ZodError
          ? firstIssueMessage(err)
          : err instanceof Error
            ? err.message
            : "Nepodařilo se uložit zákazníka",
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <section>
        <SectionLabel title="Identifikace" />
        <div className="grid gap-5">
          <FormField id="name" label="Název" required>
            <Input
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </FormField>

          <FormRow>
            <FormField id="ico" label="IČO">
              <Input
                id="ico"
                inputMode="numeric"
                value={formData.ico}
                onChange={(e) => setFormData({ ...formData, ico: e.target.value })}
              />
            </FormField>
            <FormField id="dic" label="DIČ">
              <Input
                id="dic"
                value={formData.dic}
                onChange={(e) => setFormData({ ...formData, dic: e.target.value })}
              />
            </FormField>
          </FormRow>

          <label
            htmlFor="is_business"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
          >
            <Checkbox
              id="is_business"
              checked={formData.is_business}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_business: checked === true })
              }
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                Podnikající subjekt
              </span>
              <span className="block text-sm text-muted-foreground">
                Fakturám tohoto zákazníka se předvyplní srážka 15 %.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section>
        <SectionLabel title="Kontakt" />
        <div className="grid gap-5">
          <FormRow>
            <FormField id="email" label="Email">
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </FormField>
            <FormField id="phone" label="Telefon">
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </FormField>
          </FormRow>

          <FormField
            id="address"
            label="Adresa"
            hint="Objeví se na faktuře jako adresa odběratele."
          >
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
              className="resize-none"
            />
          </FormField>
        </div>
      </section>

      <FormActions>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isLoading}>
          <X />
          Zrušit
        </Button>
        <Button type="submit" loading={isLoading}>
          {customer ? <Save /> : <Plus />}
          {customer ? "Uložit změny" : "Vytvořit zákazníka"}
        </Button>
      </FormActions>
    </form>
  )
}
