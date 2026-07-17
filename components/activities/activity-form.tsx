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

const fieldLabel =
  "text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground"

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
        <SectionLabel number="01" title="Detaily" />
        <div className="max-w-xs space-y-2">
          <Label htmlFor="activity_date" className={fieldLabel}>
            Datum
          </Label>
          <Input
            id="activity_date"
            type="date"
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            required
          />
        </div>
      </section>

      <section>
        <SectionLabel number="02" title="Služby" />
        <div className="space-y-4">
          {services.map((row, index) => (
            <div
              key={index}
              className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-[0_4px_28px_-12px_rgba(27,23,49,0.15)]"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-[11px] font-semibold tabular-nums">
                  {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeService(index)}
                  disabled={services.length === 1}
                  aria-label="Odebrat službu"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
                <div className="space-y-2">
                  <Label htmlFor={`service-type-${index}`} className={fieldLabel}>
                    Služba
                  </Label>
                  <Select
                    value={row.service_type}
                    onValueChange={(value) =>
                      updateService(index, { service_type: value as ServiceType })
                    }
                  >
                    <SelectTrigger id={`service-type-${index}`}>
                      <SelectValue placeholder="Vyberte službu" />
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
                <div className="space-y-2">
                  <Label htmlFor={`service-price-${index}`} className={fieldLabel}>
                    Cena (€)
                  </Label>
                  <Input
                    id={`service-price-${index}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={row.price}
                    onChange={(e) => updateService(index, { price: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label htmlFor={`service-note-${index}`} className={fieldLabel}>
                  Poznámka (volitelné)
                </Label>
                <Textarea
                  id={`service-note-${index}`}
                  rows={2}
                  maxLength={200}
                  placeholder="Krátká poznámka ke službě…"
                  value={row.note}
                  onChange={(e) => updateService(index, { note: e.target.value })}
                  className="resize-none"
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addService}
            className="w-full border-dashed text-[11px] uppercase tracking-[0.22em]"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Přidat službu
          </Button>
        </div>

        <div className="mt-8 flex items-baseline justify-end gap-4 border-t border-border pt-6">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Celkem
          </span>
          <span className="font-serif font-bold text-3xl text-foreground tabular-nums">
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
