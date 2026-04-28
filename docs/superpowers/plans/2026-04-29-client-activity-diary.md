# Client Activity Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-client activity diary at `/activities` so the operator can record cleaning, laundry, and apartment-service work and track paid/unpaid status.

**Architecture:** Two new Supabase tables (`activities`, `activity_services`) with RLS, a new top-level `/activities` Next.js section reusing the customers data, and a small set of feature components under `components/activities/` mirroring the existing `customers/` and `invoices/` folder structure.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (Postgres + Auth + RLS), Tailwind v4, shadcn/ui (Radix). pnpm. No test framework — verification is `pnpm typecheck` plus manual smoke.

---

## Notes for the implementing engineer

**Adaptations from the spec:**

1. The spec wrote "server actions" for the mutation layer but the same sentence said "mirrors `customer-actions.tsx` pattern". `customer-actions.tsx` and `invoice-actions.tsx` are **client components** that call `createClient()` from `@/lib/supabase/client` and let Postgres RLS enforce ownership. This plan follows the actual codebase pattern (client-side mutations) — not Next.js Server Actions. Behaviour is identical.
2. The spec wrote "react-hook-form + zod" but the existing `InvoiceForm` and `CustomerForm` use plain `useState` for fields and inline validation. This plan stays with the codebase pattern (`useState` + manual validation) for consistency. `zod` and `react-hook-form` are in `package.json` but unused.
3. The spec said `StatusPill` is "already in the codebase". It is a **local helper**, currently inlined in `app/invoices/page.tsx`. This plan inlines a similar helper inside the activity table file rather than extracting a shared component (matches the existing pattern; one small duplication is fine).

**General codebase conventions to follow:**

- Path alias `@/*` maps to repo root.
- Server components in `app/**/page.tsx` use `createClient()` from `@/lib/supabase/server` and `await` it.
- Client components for mutations use `createClient()` from `@/lib/supabase/client` (no await).
- After a mutation in a client island, call `router.refresh()` so the surrounding server component re-renders with fresh data.
- Toast notifications via `sonner` (`import { toast } from "sonner"`).
- Czech UI copy. No Spanish strings. No emojis.
- Existing `console.log("[v0] ...")` debug pattern — follow it for new mutations so failures are diagnosable.

**Per-task verification (in lieu of unit tests):**

- `pnpm typecheck` after every code change.
- Manual smoke at the end (full checklist in Task 11).

---

## File structure

| File                                                              | Status   | Responsibility                                                        |
| ----------------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| `scripts/011_create_activities.sql`                               | new      | Migration: enums, two tables, indexes, RLS policies                   |
| `lib/types.ts`                                                    | modify   | Add `ServiceType`, `ActivityStatus`, `ActivityService`, `Activity`    |
| `components/activities/service-labels.ts`                         | new      | `SERVICE_LABELS` Czech-label constant + `SERVICE_OPTIONS` array       |
| `components/activities/activity-form.tsx`                         | new      | Create + edit form (used by both new and edit pages)                  |
| `components/activities/activity-list-table.tsx`                   | new      | Server-rendered activities table on the diary page                    |
| `components/activities/activity-status-toggle.tsx`                | new      | Client island: clickable paid/unpaid pill                             |
| `components/activities/activity-row-actions.tsx`                  | new      | Client island: per-row 3-dot menu (Upravit / Smazat)                  |
| `components/activities/activity-status-filter.tsx`                | new      | Server-rendered three-link filter (Vše / Nezaplaceno / Zaplaceno)     |
| `app/activities/page.tsx`                                         | new      | Clients list + unpaid count per client                                |
| `app/activities/[clientId]/page.tsx`                              | new      | Diary page: customer header + filter + activities table               |
| `app/activities/[clientId]/new/page.tsx`                          | new      | Wraps `ActivityForm` in create mode                                   |
| `app/activities/[clientId]/[activityId]/edit/page.tsx`            | new      | Wraps `ActivityForm` in edit mode                                     |
| `components/layout/header.tsx`                                    | modify   | Add Aktivity nav link to `navItems` (used by both desktop and mobile) |

---

## Task 1: Database migration

**Files:**
- Create: `scripts/011_create_activities.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Aktivity (deník služeb pro zákazníky) a jejich služby
-- Mirrors invoices + invoice_items pattern with RLS scoped to user_id.

create type service_type as enum ('cleaning', 'laundry', 'apartment_service');
create type activity_status as enum ('unpaid', 'paid');

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  activity_date date not null,
  status activity_status not null default 'unpaid',
  total_amount numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activity_services (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  service_type service_type not null,
  price numeric(10, 2) not null,
  note text
);

create index activities_user_customer_date_idx
  on activities (user_id, customer_id, activity_date desc);
create index activity_services_activity_idx
  on activity_services (activity_id);

alter table activities enable row level security;
alter table activity_services enable row level security;

create policy "activities_owner_all"
  on activities for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "activity_services_via_owner_all"
  on activity_services for all
  using (
    exists (
      select 1 from activities a
      where a.id = activity_id and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from activities a
      where a.id = activity_id and a.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration to Supabase**

Open the Supabase SQL editor for the project and run the contents of `scripts/011_create_activities.sql`. Confirm in the table editor that `activities` and `activity_services` exist with RLS enabled.

> **If applying via psql instead:** `psql "$SUPABASE_DB_URL" -f scripts/011_create_activities.sql`. Either path is fine — the file is the source of truth.

- [ ] **Step 3: Commit**

```bash
git add scripts/011_create_activities.sql
git commit -m "feat(db): add activities + activity_services tables with RLS"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Append the new types to `lib/types.ts`**

Append (do not replace existing exports):

```ts
export type ServiceType = "cleaning" | "laundry" | "apartment_service"
export type ActivityStatus = "unpaid" | "paid"

export interface ActivityService {
  id?: string
  activity_id?: string
  service_type: ServiceType
  price: number
  note?: string
}

export interface Activity {
  id: string
  user_id?: string
  customer_id: string
  activity_date: string
  status: ActivityStatus
  total_amount: number
  created_at: string
  updated_at: string
  customer?: Customer
  services?: ActivityService[]
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add Activity, ActivityService, ServiceType, ActivityStatus"
```

---

## Task 3: Service labels constant

**Files:**
- Create: `components/activities/service-labels.ts`

- [ ] **Step 1: Create the file**

```ts
import type { ServiceType } from "@/lib/types"

export const SERVICE_LABELS: Record<ServiceType, string> = {
  cleaning: "Úklid",
  laundry: "Praní",
  apartment_service: "Servis apartmánu",
}

export const SERVICE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: "cleaning", label: SERVICE_LABELS.cleaning },
  { value: "laundry", label: SERVICE_LABELS.laundry },
  { value: "apartment_service", label: SERVICE_LABELS.apartment_service },
]
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/activities/service-labels.ts
git commit -m "feat(activities): add Czech service labels constant"
```

---

## Task 4: Activity form (create + edit)

**Files:**
- Create: `components/activities/activity-form.tsx`

- [ ] **Step 1: Create the form component**

```tsx
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
        // Update parent
        const { error: updateError } = await supabase
          .from("activities")
          .update({
            activity_date: activityDate,
            total_amount: totalAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", activity.id)
        if (updateError) throw updateError

        // Replace services
        const { error: deleteError } = await supabase
          .from("activity_services")
          .delete()
          .eq("activity_id", activity.id)
        if (deleteError) throw deleteError

        activityId = activity.id
      } else {
        // Insert parent
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

      // Insert all service rows
      const { error: servicesError } = await supabase
        .from("activity_services")
        .insert(payloadServices.map((s) => ({ ...s, activity_id: activityId })))

      if (servicesError) {
        // Manual rollback on create: delete parent so we don't leave an orphan.
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
                <Label className={fieldLabel}>Služba</Label>
                <Select
                  value={row.service_type}
                  onValueChange={(value) =>
                    updateService(index, { service_type: value as ServiceType })
                  }
                >
                  <SelectTrigger className={inputBoxed}>
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
                <Label className={fieldLabel}>Cena (€)</Label>
                <Input
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
                <Label className={fieldLabel}>Poznámka (volitelné)</Label>
                <Textarea
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
          {isSaving ? "Ukládám..." : isEdit ? "Uložit změny" : "Vytvořit aktivitu"}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/activities/activity-form.tsx
git commit -m "feat(activities): add ActivityForm with dynamic service rows"
```

---

## Task 5: Activity status toggle (clickable pill)

**Files:**
- Create: `components/activities/activity-status-toggle.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { ActivityStatus } from "@/lib/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ActivityStatusToggleProps {
  activityId: string
  status: ActivityStatus
}

export function ActivityStatusToggle({ activityId, status }: ActivityStatusToggleProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  // Optimistic local state so the pill flips immediately on click.
  const [optimisticStatus, setOptimisticStatus] = useState<ActivityStatus>(status)

  const handleClick = async () => {
    if (isPending) return
    const next: ActivityStatus = optimisticStatus === "paid" ? "unpaid" : "paid"
    setOptimisticStatus(next)
    setIsPending(true)
    const supabase = createClient()
    try {
      const { error } = await supabase
        .from("activities")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", activityId)
      if (error) throw error
      router.refresh()
    } catch (err) {
      // Roll back optimistic update.
      setOptimisticStatus(optimisticStatus)
      console.error("[v0] Error toggling activity status:", err)
      toast.error("Nepodařilo se změnit stav aktivity")
    } finally {
      setIsPending(false)
    }
  }

  const isPaid = optimisticStatus === "paid"

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium transition-opacity",
        isPaid ? "text-emerald-700" : "text-muted-foreground",
        isPending && "opacity-60",
      )}
      aria-label={isPaid ? "Označit jako nezaplacené" : "Označit jako zaplacené"}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isPaid ? "bg-emerald-500" : "bg-muted-foreground/60",
        )}
        aria-hidden="true"
      />
      {isPaid ? "Zaplaceno" : "Nezaplaceno"}
    </button>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/activities/activity-status-toggle.tsx
git commit -m "feat(activities): add ActivityStatusToggle with optimistic update"
```

---

## Task 6: Activity row actions (3-dot menu)

**Files:**
- Create: `components/activities/activity-row-actions.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface ActivityRowActionsProps {
  customerId: string
  activityId: string
}

export function ActivityRowActions({ customerId, activityId }: ActivityRowActionsProps) {
  const router = useRouter()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    const supabase = createClient()
    try {
      // FK on activity_services has on delete cascade — services go automatically.
      const { error } = await supabase.from("activities").delete().eq("id", activityId)
      if (error) throw error
      toast.success("Aktivita smazána")
      setShowDeleteDialog(false)
      router.refresh()
    } catch (err) {
      console.error("[v0] Error deleting activity:", err)
      toast.error("Nepodařilo se smazat aktivitu")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Otevřít menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/activities/${customerId}/${activityId}/edit`)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Upravit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Smazat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opravdu chcete smazat aktivitu?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce je nevratná. Aktivita a všechny její služby budou trvale smazány.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Mažu..." : "Smazat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/activities/activity-row-actions.tsx
git commit -m "feat(activities): add ActivityRowActions 3-dot menu"
```

---

## Task 7: Status filter (Vše / Nezaplaceno / Zaplaceno)

**Files:**
- Create: `components/activities/activity-status-filter.tsx`

- [ ] **Step 1: Create the component**

```tsx
import Link from "next/link"
import { cn } from "@/lib/utils"

interface ActivityStatusFilterProps {
  customerId: string
  current: "all" | "unpaid" | "paid"
}

const OPTIONS: { value: "all" | "unpaid" | "paid"; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "unpaid", label: "Nezaplaceno" },
  { value: "paid", label: "Zaplaceno" },
]

export function ActivityStatusFilter({ customerId, current }: ActivityStatusFilterProps) {
  return (
    <div className="flex items-center gap-2">
      {OPTIONS.map((opt) => {
        const href =
          opt.value === "all"
            ? `/activities/${customerId}`
            : `/activities/${customerId}?status=${opt.value}`
        const isActive = current === opt.value
        return (
          <Link
            key={opt.value}
            href={href}
            className={cn(
              "px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-medium border border-border transition-colors",
              isActive
                ? "bg-foreground text-background border-foreground"
                : "text-muted-foreground hover:text-foreground hover:border-foreground/40",
            )}
          >
            {opt.label}
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/activities/activity-status-filter.tsx
git commit -m "feat(activities): add ActivityStatusFilter (Link-based)"
```

---

## Task 8: Activity list table

**Files:**
- Create: `components/activities/activity-list-table.tsx`

This is a server component (no `"use client"`). It receives already-fetched activities and renders the table; client-only bits (`ActivityStatusToggle`, `ActivityRowActions`) are nested as islands.

- [ ] **Step 1: Create the table**

```tsx
import type { Activity } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"
import { SERVICE_LABELS } from "./service-labels"
import { ActivityStatusToggle } from "./activity-status-toggle"
import { ActivityRowActions } from "./activity-row-actions"

interface ActivityListTableProps {
  customerId: string
  activities: Activity[]
}

export function ActivityListTable({ customerId, activities }: ActivityListTableProps) {
  if (activities.length === 0) {
    return (
      <div className="border border-border bg-card px-6 py-20 text-center">
        <p className="font-serif italic text-2xl text-muted-foreground mb-4">Zatím prázdno.</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
          Pro tohoto zákazníka zatím není zaznamenaná žádná aktivita.
        </p>
      </div>
    )
  }

  return (
    <div className="border border-border bg-card overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <Th>Datum</Th>
            <Th>Popis</Th>
            <Th align="right">Celkem</Th>
            <Th>Stav</Th>
            <Th align="right">Akce</Th>
          </tr>
        </thead>
        <tbody>
          {activities.map((activity, idx) => (
            <tr
              key={activity.id}
              className={idx !== activities.length - 1 ? "border-b border-border/60" : ""}
            >
              <Td>
                <span className="font-serif text-base text-foreground tabular-nums">
                  {formatDate(activity.activity_date)}
                </span>
              </Td>
              <Td>
                <ServiceBreakdown services={activity.services ?? []} />
              </Td>
              <Td align="right" className="font-serif text-lg tabular-nums">
                {formatCurrency(activity.total_amount)}
              </Td>
              <Td>
                <ActivityStatusToggle activityId={activity.id} status={activity.status} />
              </Td>
              <Td align="right">
                <ActivityRowActions customerId={customerId} activityId={activity.id} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ServiceBreakdown({ services }: { services: NonNullable<Activity["services"]> }) {
  if (services.length === 0) {
    return <span className="text-muted-foreground/60">—</span>
  }
  return (
    <div className="flex flex-col gap-1">
      {services.map((s) => (
        <div key={s.id ?? `${s.service_type}-${s.price}`} className="text-sm text-foreground">
          <span className="font-medium">{SERVICE_LABELS[s.service_type]}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="tabular-nums">{formatCurrency(Number(s.price))}</span>
          {s.note && (
            <>
              <span className="text-muted-foreground"> — </span>
              <span className="italic text-muted-foreground">{s.note}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function formatDate(iso: string) {
  // Supabase returns YYYY-MM-DD for date columns; format as DD. MM. YYYY (cs-CZ).
  const [y, m, d] = iso.split("-")
  return `${Number(d)}. ${Number(m)}. ${y}`
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={
        "text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground py-4 px-5 " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align,
  className = "",
}: {
  children: React.ReactNode
  align?: "right"
  className?: string
}) {
  return (
    <td
      className={
        "py-5 px-5 text-sm text-foreground " +
        (align === "right" ? "text-right " : "") +
        className
      }
    >
      {children}
    </td>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/activities/activity-list-table.tsx
git commit -m "feat(activities): add ActivityListTable server component"
```

---

## Task 9: `/activities` page (clients list with unpaid count)

**Files:**
- Create: `app/activities/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import { ArrowUpRight } from "lucide-react"

export default async function ActivitiesIndexPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const [customersResult, unpaidResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase
      .from("activities")
      .select("customer_id")
      .eq("user_id", user.id)
      .eq("status", "unpaid"),
  ])

  if (customersResult.error) {
    console.error("[v0] Error fetching customers:", customersResult.error)
  }
  if (unpaidResult.error) {
    console.error("[v0] Error fetching unpaid activities:", unpaidResult.error)
  }

  const customers = customersResult.data ?? []
  const unpaidRows = unpaidResult.data ?? []
  const unpaidCountByCustomer = new Map<string, number>()
  for (const row of unpaidRows) {
    unpaidCountByCustomer.set(
      row.customer_id,
      (unpaidCountByCustomer.get(row.customer_id) ?? 0) + 1,
    )
  }

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-6xl">
      <PageHeader
        eyebrow="Deník služeb"
        title={
          <>
            Aktivity <span className="italic text-primary">u klientů</span>
          </>
        }
        description="Vyberte klienta pro zobrazení deníku odvedené práce a stavu plateb."
      />

      {customers.length === 0 ? (
        <div className="border border-border bg-card px-6 py-20 text-center">
          <p className="font-serif italic text-2xl text-muted-foreground mb-6">
            Žádní zákazníci.
          </p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Nejprve přidejte zákazníka v sekci Zákazníci, pak se sem můžete vrátit.
          </p>
        </div>
      ) : (
        <ul className="border border-border bg-card divide-y divide-border/60">
          {customers.map((customer) => {
            const unpaid = unpaidCountByCustomer.get(customer.id) ?? 0
            return (
              <li key={customer.id}>
                <Link
                  href={`/activities/${customer.id}`}
                  className="group flex items-center justify-between gap-4 px-6 py-5 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-serif text-xl text-foreground truncate">
                      {customer.name}
                    </p>
                    {customer.email && (
                      <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {unpaid > 0 ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase tracking-[0.18em] font-medium"
                      >
                        {unpaid} nezaplaceno
                      </Badge>
                    ) : (
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                        Bez nezaplacených
                      </span>
                    )}
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/activities/page.tsx
git commit -m "feat(activities): add /activities clients list page"
```

---

## Task 10: `/activities/[clientId]` diary page

**Files:**
- Create: `app/activities/[clientId]/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus, Pencil } from "lucide-react"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { ActivityListTable } from "@/components/activities/activity-list-table"
import { ActivityStatusFilter } from "@/components/activities/activity-status-filter"
import type { Activity } from "@/lib/types"

interface PageProps {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ status?: string }>
}

export default async function ClientDiaryPage(context: PageProps) {
  const { clientId } = await context.params
  const { status: rawStatus } = await context.searchParams
  const statusFilter: "all" | "unpaid" | "paid" =
    rawStatus === "unpaid" || rawStatus === "paid" ? rawStatus : "all"

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single()

  if (customerError || !customer) {
    notFound()
  }

  let query = supabase
    .from("activities")
    .select("*, services:activity_services(*)")
    .eq("user_id", user.id)
    .eq("customer_id", clientId)
    .order("activity_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter)
  }

  const { data: activitiesData, error: activitiesError } = await query
  if (activitiesError) {
    console.error("[v0] Error fetching activities:", activitiesError)
  }

  const activities = (activitiesData ?? []) as Activity[]

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-6xl">
      <PageHeader
        eyebrow="Deník klienta"
        title={
          <>
            {customer.name}
          </>
        }
        description={
          [customer.email, customer.phone, customer.address].filter(Boolean).join(" · ") ||
          undefined
        }
        actions={
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="outline"
              className="text-[11px] uppercase tracking-[0.22em] shadow-none"
            >
              <Link href={`/customers/${clientId}/edit`}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Upravit klienta
              </Link>
            </Button>
            <Button
              asChild
              className="text-[11px] uppercase tracking-[0.22em] shadow-none"
            >
              <Link href={`/activities/${clientId}/new`}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Nová aktivita
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex items-center justify-between gap-4">
        <ActivityStatusFilter customerId={clientId} current={statusFilter} />
      </div>

      <ActivityListTable customerId={clientId} activities={activities} />
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/activities/[clientId]/page.tsx
git commit -m "feat(activities): add client diary page with filter and table"
```

---

## Task 11: `/activities/[clientId]/new` page

**Files:**
- Create: `app/activities/[clientId]/new/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { ActivityForm } from "@/components/activities/activity-form"

interface PageProps {
  params: Promise<{ clientId: string }>
}

export default async function NewActivityPage(context: PageProps) {
  const { clientId } = await context.params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single()

  if (error || !customer) {
    notFound()
  }

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-4xl">
      <PageHeader
        eyebrow="Nová aktivita"
        title={
          <>
            {customer.name}
          </>
        }
        description="Zaznamenejte odvedené služby pro tohoto klienta."
      />
      <ActivityForm customerId={clientId} />
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/activities/[clientId]/new/page.tsx
git commit -m "feat(activities): add new-activity page"
```

---

## Task 12: `/activities/[clientId]/[activityId]/edit` page

**Files:**
- Create: `app/activities/[clientId]/[activityId]/edit/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { ActivityForm } from "@/components/activities/activity-form"
import type { Activity, ActivityService } from "@/lib/types"

interface PageProps {
  params: Promise<{ clientId: string; activityId: string }>
}

export default async function EditActivityPage(context: PageProps) {
  const { clientId, activityId } = await context.params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single()

  if (customerError || !customer) {
    notFound()
  }

  const { data: activityData, error: activityError } = await supabase
    .from("activities")
    .select("*, services:activity_services(*)")
    .eq("id", activityId)
    .eq("customer_id", clientId)
    .eq("user_id", user.id)
    .single()

  if (activityError || !activityData) {
    notFound()
  }

  const activity = activityData as Activity
  const existingServices: ActivityService[] = activity.services ?? []

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-4xl">
      <PageHeader
        eyebrow="Upravit aktivitu"
        title={
          <>
            {customer.name}
          </>
        }
        description="Upravte zaznamenané služby a datum aktivity."
      />
      <ActivityForm
        customerId={clientId}
        activity={activity}
        existingServices={existingServices}
      />
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/activities/\[clientId\]/\[activityId\]/edit/page.tsx
git commit -m "feat(activities): add edit-activity page"
```

---

## Task 13: Add "Aktivity" to header navigation

**Files:**
- Modify: `components/layout/header.tsx`

- [ ] **Step 1: Update the `navItems` array**

Find the `navItems` array (currently four entries: Přehled, Zákazníci, Faktury, Moje údaje) and add an "Aktivity" entry between Zákazníci and Faktury.

Replace this block:

```tsx
  const navItems = [
    { href: "/", label: "Přehled", icon: Home },
    { href: "/customers", label: "Zákazníci", icon: Users },
    { href: "/invoices", label: "Faktury", icon: FileText },
    { href: "/company", label: "Moje údaje", icon: Building2 },
  ]
```

With:

```tsx
  const navItems = [
    { href: "/", label: "Přehled", icon: Home },
    { href: "/customers", label: "Zákazníci", icon: Users },
    { href: "/activities", label: "Aktivity", icon: ClipboardList },
    { href: "/invoices", label: "Faktury", icon: FileText },
    { href: "/company", label: "Moje údaje", icon: Building2 },
  ]
```

- [ ] **Step 2: Add `ClipboardList` to the lucide-react import**

Find the existing `lucide-react` import and add `ClipboardList`. Replace:

```tsx
import { LogOut, Home, Users, FileText, Building2, Menu, User } from "lucide-react"
```

With:

```tsx
import { LogOut, Home, Users, FileText, Building2, Menu, User, ClipboardList } from "lucide-react"
```

- [ ] **Step 3: Update the desktop nav active rule for nested paths**

The current desktop nav uses `pathname === item.href`. That fails to highlight Aktivity when on `/activities/[clientId]`. Make it match the path or any of its children.

Replace this line in the desktop nav `map`:

```tsx
            const isActive = pathname === item.href
```

With:

```tsx
            const isActive =
              item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")
```

Apply the same replacement in the mobile nav `map` (the block inside `SheetContent`).

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/layout/header.tsx
git commit -m "feat(layout): add Aktivity nav link with nested-path active state"
```

---

## Task 14: End-to-end smoke test

**Files:** none

This task is verification only. Run through it manually before declaring the feature done.

- [ ] **Step 1: Build and start the dev server**

```bash
pnpm typecheck
pnpm dev
```

Open http://localhost:3000 and log in.

- [ ] **Step 2: Smoke checklist (in this order)**

  1. Top nav shows **Aktivity** between Zákazníci and Faktury. Click it → `/activities` loads.
  2. The clients list contains your existing customers, sorted by name. Each row shows "Bez nezaplacených" (no activities yet).
  3. Click a client → `/activities/[clientId]` loads with the customer name in the page header. The empty state reads "Pro tohoto zákazníka zatím není zaznamenaná žádná aktivita."
  4. Click **Nová aktivita**. Date defaults to today. Select Úklid + price 30 + note "kuchyň". Click **Přidat službu**, select Praní + price 10 (no note). Total below shows €40.
  5. Submit. You're redirected back to the diary page. The new row shows: today's date, "Úklid · €30 — kuchyň" + "Praní · €10", celkem €40, status **Nezaplaceno**, 3-dot menu.
  6. Go back to `/activities`. The client's row now shows the badge "1 nezaplaceno".
  7. Click the **Nezaplaceno** pill in the diary table → it flips to **Zaplaceno** (emerald). Refresh the page → the change persists.
  8. Go back to `/activities` — badge is gone (no unpaid activities).
  9. Filter by `?status=unpaid` (click the **Nezaplaceno** filter on the diary page) — table is empty. Click **Zaplaceno** — the activity reappears. Click **Vše** — also visible.
 10. Open the row's 3-dot menu → **Upravit**. The form is pre-filled with two services. Remove the laundry row, change úklid price to 35, save. Diary table now shows celkem €35 with only the úklid row.
 11. Open the row's 3-dot menu → **Smazat** → confirm. The row disappears.
 12. RLS sanity check (optional): in another browser, sign in as a different user and visit `/activities/<clientIdFromFirstUser>`. Expected: 404 (not found).

- [ ] **Step 3: Final commit (if any tweaks were needed during smoke)**

If smoke uncovered a fix, commit it. Otherwise this step is a no-op.

```bash
git status
# commit any incidental fixes here
```

---

## Self-review

**1. Spec coverage:**

| Spec section                                | Implementing task |
| ------------------------------------------- | ----------------- |
| User flow                                   | Tasks 9–13 + 14   |
| Routes table                                | Tasks 9, 10, 11, 12 |
| Migration `scripts/011_create_activities.sql` | Task 1            |
| Types in `lib/types.ts`                     | Task 2            |
| Czech labels constant                       | Task 3            |
| `activity-form.tsx`                         | Task 4            |
| `activity-list-table.tsx`                   | Task 8            |
| `activity-status-filter.tsx`                | Task 7            |
| Mutation layer (create/update/delete/setStatus) | Tasks 4, 5, 6 |
| `/activities` clients list with unpaid count | Task 9            |
| `/activities/[clientId]` diary page         | Task 10           |
| Validation rules (date, ≥1 service, price ≥ 0, note ≤ 200) | Task 4 |
| Errors / `notFound()` on missing customer   | Tasks 10, 11, 12  |
| Status toggle does not touch `total_amount` | Task 5            |
| Edit replaces services and recomputes total | Task 4            |
| Cascading delete via FK                     | Tasks 1, 6        |
| No public/anon access (no middleware change) | n/a — covered by not adding middleware exceptions |
| Verification (`pnpm typecheck` + smoke)     | Tasks 1–13 + 14   |
| Out-of-scope items (no aggregate stats etc.) | Honored — not implemented |

No spec sections lack a task.

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later" anywhere. Every code step has full code. Validation messages are concrete Czech strings. The cn helper, formatCurrency, sonner toast, Supabase clients, and shadcn/ui components are all referenced by their actual import paths.

**3. Type consistency check:**
- `ServiceType`, `ActivityStatus`, `Activity`, `ActivityService` defined in Task 2 and used uniformly in Tasks 4, 5, 6, 8, 10, 12.
- `SERVICE_LABELS` (Task 3) matched by usage in Task 8.
- `SERVICE_OPTIONS` (Task 3) matched by usage in Task 4.
- `ActivityStatusToggle({ activityId, status })` props in Task 5 match the call site in Task 8.
- `ActivityRowActions({ customerId, activityId })` props in Task 6 match the call site in Task 8.
- `ActivityStatusFilter({ customerId, current })` props in Task 7 match the call site in Task 10. `current` value `"all" | "unpaid" | "paid"` is the same union used in Task 10's `statusFilter`.
- `ActivityForm({ customerId, activity?, existingServices? })` props in Task 4 match call sites in Tasks 11 and 12.
- Form field array uses `service_type: ServiceType | ""` with empty-string sentinel, narrowed in `validate()` and `payloadServices` map. Consistent.
- Migration column names (`activity_date`, `customer_id`, `user_id`, `status`, `total_amount`, `service_type`, `price`, `note`) match TypeScript field names exactly.

No inconsistencies.

---

## Out of scope (matches spec)

- Aggregate stats on the diary page.
- Global activity view across all clients.
- Linking activities to invoices.
- Manual reordering of service rows.
- Per-activity overall note.
- Service quantities.
- Public / anonymous access routes for activities.
