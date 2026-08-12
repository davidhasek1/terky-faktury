"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import { upsertCompanyDetails } from "@/lib/services/company"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SectionLabel } from "@/components/layout/section-label"
import { toast } from "sonner"
import type { CompanyDetails } from "@/lib/types"

interface CompanyFormProps {
  companyDetails: CompanyDetails | null
}

export function CompanyForm({ companyDetails }: CompanyFormProps) {
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
    bank_name: companyDetails?.bank_name || "",
    bank_account: companyDetails?.bank_account || "",
    iban: companyDetails?.iban || "",
    swift_bic: companyDetails?.swift_bic || "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!formData.company_name.trim()) {
        toast.error("Název firmy je povinný")
        setLoading(false)
        return
      }

      await upsertCompanyDetails(await createBrowserServiceContext(), formData)

      toast.success(
        companyDetails ? "Údaje byly úspěšně aktualizovány" : "Údaje byly úspěšně uloženy",
      )
      router.refresh()
    } catch (error) {
      console.error("[company] Nepodařilo se uložit firemní údaje:", error)
      toast.error("Nepodařilo se uložit údaje")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-12 sm:space-y-16">
      <section>
        <SectionLabel number="01" title="Základní údaje" />
        <div className="grid gap-6 sm:gap-8">
          <Field
            id="company_name"
            label="Název firmy"
            required
            value={formData.company_name}
            onChange={(v) => setFormData({ ...formData, company_name: v })}
          />
          <div className="grid md:grid-cols-2 gap-6">
            <Field
              id="nie"
              label="NIE"
              value={formData.nie}
              onChange={(v) => setFormData({ ...formData, nie: v })}
            />
            <Field
              id="nif"
              label="NIF"
              value={formData.nif}
              onChange={(v) => setFormData({ ...formData, nif: v })}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionLabel number="02" title="Adresa" />
        <div className="grid gap-6 sm:gap-8">
          <Field
            id="street"
            label="Ulice a číslo"
            value={formData.street}
            onChange={(v) => setFormData({ ...formData, street: v })}
          />
          <div className="grid md:grid-cols-3 gap-6">
            <Field
              id="city"
              label="Město"
              value={formData.city}
              onChange={(v) => setFormData({ ...formData, city: v })}
            />
            <Field
              id="postal_code"
              label="PSČ"
              value={formData.postal_code}
              onChange={(v) => setFormData({ ...formData, postal_code: v })}
            />
            <Field
              id="country"
              label="Země"
              value={formData.country}
              onChange={(v) => setFormData({ ...formData, country: v })}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionLabel number="03" title="Kontakt" />
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
            value={formData.phone}
            onChange={(v) => setFormData({ ...formData, phone: v })}
          />
        </div>
      </section>

      <section>
        <SectionLabel number="04" title="Platební údaje" />
        <div className="grid gap-6 sm:gap-8">
          <Field
            id="bank_name"
            label="Název banky"
            value={formData.bank_name}
            onChange={(v) => setFormData({ ...formData, bank_name: v })}
          />
          <Field
            id="bank_account"
            label="Číslo účtu"
            value={formData.bank_account}
            onChange={(v) => setFormData({ ...formData, bank_account: v })}
          />
          <div className="grid md:grid-cols-2 gap-6">
            <Field
              id="iban"
              label="IBAN"
              value={formData.iban}
              onChange={(v) => setFormData({ ...formData, iban: v })}
            />
            <Field
              id="swift_bic"
              label="SWIFT/BIC"
              value={formData.swift_bic}
              onChange={(v) => setFormData({ ...formData, swift_bic: v })}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-border">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={loading}
          className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          Zrušit
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="text-[11px] uppercase tracking-[0.22em] shadow-none"
        >
          {loading ? "Ukládám…" : "Uložit údaje"}
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
