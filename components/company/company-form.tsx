"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import type { CompanyDetails } from "@/lib/types"

interface CompanyFormProps {
  companyDetails: CompanyDetails | null
  userId: string
}

export function CompanyForm({ companyDetails, userId }: CompanyFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    company_name: companyDetails?.company_name || "",
    nie: companyDetails?.nie || "",
    nif: companyDetails?.nif || "",
    street: companyDetails?.street || "",
    city: companyDetails?.city || "",
    postal_code: companyDetails?.postal_code || "",
    country: companyDetails?.country || "España",
    email: companyDetails?.email || "",
    phone: companyDetails?.phone || "",
    bank_account: companyDetails?.bank_account || "",
    iban: companyDetails?.iban || "",
    swift_bic: companyDetails?.swift_bic || "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()

      // Validate required fields
      if (!formData.company_name.trim()) {
        toast.error("Název firmy je povinný")
        setLoading(false)
        return
      }

      const dataToSave = {
        ...formData,
        user_id: userId,
      }

      if (companyDetails) {
        // Update existing
        const { error } = await supabase.from("company_details").update(dataToSave).eq("id", companyDetails.id)

        if (error) throw error
        toast.success("Údaje byly úspěšně aktualizovány")
      } else {
        // Insert new
        const { error } = await supabase.from("company_details").insert(dataToSave)

        if (error) throw error
        toast.success("Údaje byly úspěšně uloženy")
      }

      router.refresh()
    } catch (error) {
      console.error("Error saving company details:", error)
      toast.error("Nepodařilo se uložit údaje")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Základní údaje</CardTitle>
            <CardDescription>Název a identifikační údaje vaší firmy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="company_name">
                Název firmy <span className="text-destructive">*</span>
              </Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                required
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nie">NIE</Label>
                <Input
                  id="nie"
                  value={formData.nie}
                  onChange={(e) => setFormData({ ...formData, nie: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="nif">NIF</Label>
                <Input
                  id="nif"
                  value={formData.nif}
                  onChange={(e) => setFormData({ ...formData, nif: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle>Adresa</CardTitle>
            <CardDescription>Sídlo vaší firmy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="street">Ulice a číslo</Label>
              <Input
                id="street"
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">Město</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="postal_code">PSČ</Label>
                <Input
                  id="postal_code"
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="country">Země</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Kontaktní údaje</CardTitle>
            <CardDescription>Email a telefon pro komunikaci</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Information */}
        <Card>
          <CardHeader>
            <CardTitle>Platební údaje</CardTitle>
            <CardDescription>Bankovní účet pro příjem plateb</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="bank_account">Číslo účtu</Label>
              <Input
                id="bank_account"
                value={formData.bank_account}
                onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="iban">IBAN</Label>
                <Input
                  id="iban"
                  value={formData.iban}
                  onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="swift_bic">SWIFT/BIC</Label>
                <Input
                  id="swift_bic"
                  value={formData.swift_bic}
                  onChange={(e) => setFormData({ ...formData, swift_bic: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
            Zrušit
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Ukládám..." : "Uložit údaje"}
          </Button>
        </div>
      </div>
    </form>
  )
}
