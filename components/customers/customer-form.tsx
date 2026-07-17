"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { SectionLabel } from "@/components/layout/section-label"
import { createClient } from "@/lib/supabase/client"
import type { Customer } from "@/lib/types"
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

    const supabase = createClient()

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error("Musíte být přihlášeni")
      }

      if (customer) {
        const { error } = await supabase.from("customers").update(formData).eq("id", customer.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("customers").insert([{ ...formData, user_id: user.id }])
        if (error) throw error
      }

      toast.success(customer ? "Zákazník byl úspěšně aktualizován" : "Zákazník byl úspěšně vytvořen")
      router.push("/customers")
      router.refresh()
    } catch (err) {
      console.error("[v0] Error saving customer:", err)
      toast.error(err instanceof Error ? err.message : "Nepodařilo se uložit zákazníka")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-12 sm:space-y-16">
      <section>
        <SectionLabel number="01" title="Identifikace" />
        <div className="grid gap-6 sm:gap-8">
          <Field
            id="name"
            label="Název"
            required
            value={formData.name}
            onChange={(v) => setFormData({ ...formData, name: v })}
          />
          <div className="grid md:grid-cols-2 gap-6">
            <Field
              id="ico"
              label="NIE"
              value={formData.ico}
              onChange={(v) => setFormData({ ...formData, ico: v })}
            />
            <Field
              id="dic"
              label="NIF"
              value={formData.dic}
              onChange={(v) => setFormData({ ...formData, dic: v })}
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Checkbox
              id="is_business"
              checked={formData.is_business}
              onCheckedChange={(checked) => setFormData({ ...formData, is_business: checked === true })}
            />
            <Label
              htmlFor="is_business"
              className="text-sm font-normal cursor-pointer text-foreground"
            >
              Podnikající subjekt
            </Label>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel number="02" title="Kontakt" />
        <div className="grid gap-6 sm:gap-8">
          <div className="grid md:grid-cols-2 gap-6">
            <Field
              id="email"
              label="Email"
              type="email"
              value={formData.email}
              onChange={(v) => setFormData({ ...formData, email: v })}
            />
            <Field
              id="phone"
              label="Telefon"
              type="tel"
              value={formData.phone}
              onChange={(v) => setFormData({ ...formData, phone: v })}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="address"
              className="text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground"
            >
              Adresa
            </Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-border">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isLoading}
          className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          Zrušit
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="text-[11px] uppercase tracking-[0.22em] shadow-none"
        >
          {isLoading ? "Ukládám…" : customer ? "Uložit změny" : "Vytvořit zákazníka"}
        </Button>
      </div>
    </form>
  )
}

function Field({
  id,
  label,
  required,
  value,
  onChange,
  type = "text",
}: {
  id: string
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className="text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground"
      >
        {label} {required && <span className="text-primary">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
