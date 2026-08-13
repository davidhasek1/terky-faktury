"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import { upsertCompanyDetails } from "@/lib/services/company"
import { Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  FormActions,
  FormField,
  FormRow,
  FormSection,
  FormShell,
} from "@/components/patterns/form-field"
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

  const field = (key: keyof typeof formData) => ({
    id: key,
    value: formData[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormData({ ...formData, [key]: e.target.value }),
  })

  return (
    <form onSubmit={handleSubmit}>
      <FormShell>
      <FormSection title="Základní údaje" hint="Jméno firmy a daňová čísla v hlavičce faktury.">
          <FormField id="company_name" label="Název firmy" required>
            <Input {...field("company_name")} required />
          </FormField>
          <FormRow>
            <FormField id="nie" label="NIE">
              <Input {...field("nie")} inputMode="numeric" />
            </FormField>
            <FormField id="nif" label="NIF">
              <Input {...field("nif")} />
            </FormField>
          </FormRow>
      </FormSection>

      <FormSection title="Adresa" hint="Sídlo vystavovatele, jak se objeví na faktuře.">
          <FormField id="street" label="Ulice a číslo">
            <Input {...field("street")} />
          </FormField>
          <div className="grid gap-5 md:grid-cols-3">
            <FormField id="city" label="Město">
              <Input {...field("city")} />
            </FormField>
            <FormField id="postal_code" label="PSČ">
              <Input {...field("postal_code")} inputMode="numeric" />
            </FormField>
            <FormField id="country" label="Země">
              <Input {...field("country")} />
            </FormField>
          </div>
      </FormSection>

      <FormSection title="Kontakt" hint="Kde tě zákazníci zastihnou, když se něco zvrtne.">
        <FormRow>
          <FormField id="email" label="Email">
            <Input {...field("email")} type="email" />
          </FormField>
          <FormField id="phone" label="Telefon">
            <Input {...field("phone")} type="tel" />
          </FormField>
        </FormRow>
      </FormSection>

      <FormSection title="Platební údaje" hint="Účet, na který ti mají zákazníci posílat peníze.">
          <FormField id="bank_name" label="Název banky">
            <Input {...field("bank_name")} />
          </FormField>
          <FormField
            id="bank_account"
            label="Číslo účtu"
            hint="Objeví se na faktuře jako účet pro platbu."
          >
            <Input {...field("bank_account")} />
          </FormField>
          <FormRow>
            <FormField id="iban" label="IBAN">
              <Input {...field("iban")} className="font-ident" />
            </FormField>
            <FormField id="swift_bic" label="SWIFT/BIC">
              <Input {...field("swift_bic")} className="font-ident" />
            </FormField>
          </FormRow>
      </FormSection>

      <FormActions>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={loading}>
          <X />
          Zrušit
        </Button>
        <Button type="submit" loading={loading}>
          <Save />
          Uložit údaje
        </Button>
      </FormActions>
      </FormShell>
    </form>
  )
}
