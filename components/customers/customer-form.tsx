"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import type { Customer } from "@/lib/types"

interface CustomerFormProps {
  customer?: Customer
}

export function CustomerForm({ customer }: CustomerFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    address: customer?.address || "",
    ico: customer?.ico || "",
    dic: customer?.dic || "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error("Musíte být přihlášeni")
      }

      if (customer) {
        // Update existing customer
        const { error } = await supabase.from("customers").update(formData).eq("id", customer.id)

        if (error) throw error
      } else {
        // Create new customer with user_id
        const { error } = await supabase.from("customers").insert([{ ...formData, user_id: user.id }])

        if (error) throw error
      }

      router.push("/customers")
      router.refresh()
    } catch (err) {
      console.error("[v0] Error saving customer:", err)
      setError(err instanceof Error ? err.message : "Nepodařilo se uložit zákazníka")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">
          Název <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Telefon</Label>
        <Input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Adresa</Label>
        <Textarea
          id="address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ico">NIE</Label>
          <Input id="ico" value={formData.ico} onChange={(e) => setFormData({ ...formData, ico: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dic">NIF</Label>
          <Input id="dic" value={formData.dic} onChange={(e) => setFormData({ ...formData, dic: e.target.value })} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Ukládám..." : customer ? "Uložit změny" : "Vytvořit zákazníka"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
          Zrušit
        </Button>
      </div>
    </form>
  )
}
