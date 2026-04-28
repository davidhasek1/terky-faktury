"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2 } from "lucide-react"
import { SectionLabel } from "@/components/layout/section-label"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/utils"
import type { Activity, ActivityService, ServiceType } from "@/lib/types"
import { SERVICE_OPTIONS } from "./service-labels"
import { toast } from "sonner"

interface ActivityFormProps {
  customerId: string
  activity?: Activity
  existingServices?: ActivityService[]
}

type ServiceRow = {
  service_type: ServiceType | ""
  price: string
  note: string
}

const getLocalDate = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const inputBare =
  "border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary text-base bg-transparent"
const inputBoxed =
  "border border-border rounded-md focus-visible:ring-1 focus-visible:ring-primary text-base bg-card"
const fieldLabel =
  "text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground"

export function ActivityForm({ customerId, activity, existingServices = [] }: ActivityFormProps) {
  const router = useRouter()
  const isEdit = !!activity
  const [isSaving, setIsSaving] = useState(false)
  const [activityDate, setActivityDate] = useState<string>(
    activity?.activity_date ?? getLocalDate(),
  )
  const [services, setServices] = useState<ServiceRow[]>(
    existingServices.length > 0
      ? existingServices.map((s) => ({
          service_type: s.service_type,
          price: String(s.price),
          note: s.note ?? "",
        }))
      : [{ service_type: "", price: "", note: "" }],
  )

  const addService = () =>
    setServices((rows) => [...rows, { service_type: "", price: "", note: "" }])

  const removeService = (index: number) =>
    setServices((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)))

  const updateService = (index: number, patch: Partial<ServiceRow>) =>
    setServices((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const total = services.reduce((sum, row) => {
    const n = Number.parseFloat(row.price)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)

  const validate = (): string | null => {
    if (!activityDate) return "Datum je povinné"
    if (services.length === 0) return "Musíte přidat alespoň jednu službu"
    for (const row of services) {
      if (!row.service_type) return "Vyberte typ služby u všech řádků"
      const price = Number.parseFloat(row.price)
      if (!Number.isFinite(price) || price < 0) return "Cena musí být nezáporné číslo"
      if (row.note.length > 200) return "Poznámka může mít maximálně 200 znaků"
    }
    return null
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const errorMessage = validate()
    if (errorMessage) {
      toast.error(errorMessage)
      return
    }

    setIsSaving(true)
    const supabase = createClient()
    const payloadServices = services.map((row) => ({
      service_type: row.service_type as ServiceType,
      price: Number.parseFloat(row.price),
      note: row.note.trim() === "" ? null : row.note.trim(),
    }))
    const totalAmount = payloadServices.reduce((sum, s) => sum + s.price, 0)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Nepřihlášený uživatel")

      let activityId: string

      if (isEdit && activity) {
        const { error: updateError } = await supabase
          .from("activities")
          .update({
            activity_date: activityDate,
            total_amount: totalAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", activity.id)
        if (updateError) throw updateError

        const { error: deleteError } = await supabase
          .from("activity_services")
          .delete()
          .eq("activity_id", activity.id)
        if (deleteError) throw deleteError

        activityId = activity.id
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("activities")
          .insert({
            user_id: user.id,
            customer_id: customerId,
            activity_date: activityDate,
            status: "unpaid",
            total_amount: totalAmount,
          })
          .select("id")
          .single()
        if (insertError || !inserted) throw insertError ?? new Error("Vložení selhalo")
        activityId = inserted.id
      }

      const { error: servicesError } = await supabase
        .from("activity_services")
        .insert(payloadServices.map((s) => ({ ...s, activity_id: activityId })))

      if (servicesError) {
        if (!isEdit) {
          await supabase.from("activities").delete().eq("id", activityId)
        }
        throw servicesError
      }

      toast.success(isEdit ? "Aktivita upravena" : "Aktivita vytvořena")
      router.push(`/activities/${customerId}`)
      router.refresh()
    } catch (err) {
      console.error("[v0] Error saving activity:", err)
      toast.error(
        "Nepodařilo se uložit aktivitu: " +
          (err instanceof Error ? err.message : "Neznámá chyba"),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-12">
      <section>
        <SectionLabel number="01" title="Datum" />
        <div className="max-w-xs">
          <Label htmlFor="activity_date" className={fieldLabel}>
            Datum
          </Label>
          <Input
            id="activity_date"
            type="date"
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            className={inputBare}
            required
          />
        </div>
      </section>

      <section>
        <SectionLabel number="02" title="Služby" />
        <div className="space-y-6">
          {services.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 md:grid-cols-[1fr_180px_2fr_auto] gap-4 items-end border-b border-border/60 pb-6"
            >
              <div>
                <Label htmlFor={`service-type-${index}`} className={fieldLabel}>
                  Služba
                </Label>
                <Select
                  value={row.service_type}
                  onValueChange={(value) =>
                    updateService(index, { service_type: value as ServiceType })
                  }
                >
                  <SelectTrigger id={`service-type-${index}`} className={inputBoxed}>
                    <SelectValue placeholder="Vyberte" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={`service-price-${index}`} className={fieldLabel}>
                  Cena (€)
                </Label>
                <Input
                  id={`service-price-${index}`}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={row.price}
                  onChange={(e) => updateService(index, { price: e.target.value })}
                  className={inputBoxed}
                />
              </div>
              <div>
                <Label htmlFor={`service-note-${index}`} className={fieldLabel}>
                  Poznámka (volitelné)
                </Label>
                <Textarea
                  id={`service-note-${index}`}
                  rows={1}
                  maxLength={200}
                  value={row.note}
                  onChange={(e) => updateService(index, { note: e.target.value })}
                  className={inputBoxed}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeService(index)}
                disabled={services.length === 1}
                aria-label="Odebrat službu"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addService}
            className="text-[11px] uppercase tracking-[0.22em]"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Přidat službu
          </Button>
        </div>

        <div className="mt-8 flex justify-end items-baseline gap-4">
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Celkem
          </span>
          <span className="font-serif text-3xl text-foreground tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/activities/${customerId}`)}
          disabled={isSaving}
          className="text-[11px] uppercase tracking-[0.22em]"
        >
          Zrušit
        </Button>
        <Button
          type="submit"
          disabled={isSaving}
          className="text-[11px] uppercase tracking-[0.22em]"
        >
          {isSaving ? "Ukládám…" : isEdit ? "Uložit změny" : "Vytvořit aktivitu"}
        </Button>
      </div>
    </form>
  )
}
