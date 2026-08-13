"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Save, Trash2, X } from "lucide-react"
import { SectionLabel } from "@/components/patterns/section-label"
import { FormActions, FormField } from "@/components/patterns/form-field"
import { formatScaled, parseDecimal, type Scaled } from "@/lib/money"
import { createActivity, updateActivity } from "@/lib/services/activities"
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import { activityInputSchema } from "@/lib/validation/activities"
import { firstIssueMessage } from "@/lib/validation/common"
import type { Activity, ActivityService, ServiceType } from "@/lib/types"
import { SERVICE_OPTIONS } from "./service-labels"
import { z } from "zod"
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


/** Rozepsané pole během psaní bereme jako nulu; ostrou kontrolu dělá zod při uložení. */
const parseScaled = (value: string): Scaled => {
  try {
    return parseDecimal(value)
  } catch {
    return 0
  }
}

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

  const total = services.reduce<Scaled>((sum, row) => sum + parseScaled(row.price), 0)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSaving(true)

    try {
      // Stejné schéma i stejné služby jako MCP nástroj prepare_activity.
      const input = activityInputSchema.parse({
        customer_id: customerId,
        activity_date: activityDate,
        services: services.map((row) => ({
          service_type: row.service_type,
          price: row.price,
          note: row.note,
        })),
      })

      const ctx = await createBrowserServiceContext()

      if (isEdit && activity) {
        await updateActivity(ctx, activity.id, input)
      } else {
        await createActivity(ctx, input)
      }

      toast.success(isEdit ? "Aktivita upravena" : "Aktivita vytvořena")
      router.push(`/activities/${customerId}`)
      router.refresh()
    } catch (err) {
      console.error("[activities] Nepodařilo se uložit aktivitu:", err)
      toast.error(
        err instanceof z.ZodError
          ? firstIssueMessage(err)
          : "Nepodařilo se uložit aktivitu: " +
              (err instanceof Error ? err.message : "Neznámá chyba"),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <section>
        <SectionLabel title="Detaily" />
        <FormField id="activity_date" label="Datum" required className="max-w-xs">
          <Input
            id="activity_date"
            type="date"
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            required
          />
        </FormField>
      </section>

      <section>
        <SectionLabel title="Služby" />
        <div className="space-y-4">
          {services.map((row, index) => (
            <div key={index} className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                {/* Číslo řádku není pořadí, jen orientace při editaci —
                    proto je tiché a ne zvýrazněná placka. */}
                <span className="font-ident text-xs text-muted-foreground tabular-nums">
                  {index + 1}.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeService(index)}
                  disabled={services.length === 1}
                  aria-label={`Odebrat ${index + 1}. službu`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
                <FormField id={`service-type-${index}`} label="Služba">
                  <Select
                    value={row.service_type}
                    onValueChange={(value) =>
                      updateService(index, { service_type: value as ServiceType })
                    }
                  >
                    <SelectTrigger id={`service-type-${index}`} className="w-full">
                      <SelectValue placeholder="Vyber službu" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField id={`service-price-${index}`} label="Cena (€)">
                  <Input
                    id={`service-price-${index}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={row.price}
                    onChange={(e) => updateService(index, { price: e.target.value })}
                    className="tabular-nums"
                  />
                </FormField>
              </div>

              <FormField
                id={`service-note-${index}`}
                label="Poznámka"
                hint="Volitelné. Objeví se v deníku u této služby."
                className="mt-4"
              >
                <Textarea
                  id={`service-note-${index}`}
                  rows={2}
                  maxLength={200}
                  placeholder="Krátká poznámka ke službě…"
                  value={row.note}
                  onChange={(e) => updateService(index, { note: e.target.value })}
                  className="resize-none"
                />
              </FormField>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addService} className="w-full border-dashed">
            <Plus />
            Přidat službu
          </Button>
        </div>

        <div className="mt-8 flex items-baseline justify-end gap-4 border-t border-border pt-6">
          <span className="text-sm text-muted-foreground">Celkem</span>
          <span className="font-display text-3xl font-semibold text-foreground tabular-nums">
            {formatScaled(total)}
          </span>
        </div>
      </section>

      <FormActions>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/activities/${customerId}`)}
          disabled={isSaving}
        >
          <X />
          Zrušit
        </Button>
        <Button type="submit" loading={isSaving}>
          {isEdit ? <Save /> : <Plus />}
          {isEdit ? "Uložit změny" : "Vytvořit aktivitu"}
        </Button>
      </FormActions>
    </form>
  )
}
