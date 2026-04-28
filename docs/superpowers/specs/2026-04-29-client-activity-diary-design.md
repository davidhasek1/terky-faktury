# Client Activity Diary — Design

Date: 2026-04-29
Status: approved (pre-implementation)

## Goal

Add a per-client activity diary so the operator can record cleaning, laundry, and apartment-service work performed for each client and track which activities are paid. The feature is independent of the existing invoicing flow — no link between activities and invoices.

## User flow

1. Operator clicks the new top-level **Aktivity** nav item.
2. `/activities` shows the existing customers list, each row annotated with an unpaid-activity count.
3. Operator clicks a client → `/activities/[clientId]` (the client's diary page) showing customer info, a status filter (Vše / Nezaplaceno / Zaplaceno), and a chronological table of activities.
4. Operator clicks **Nová aktivita** → form to record date and one-or-more services (each with price and optional note).
5. After submit, the new activity appears in the table with status **Nezaplaceno** by default.
6. Operator can toggle status inline, or open the row's 3-dot menu to edit or delete.

## Routes

| Route                                         | Purpose                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `/activities`                                 | Customers list with unpaid-activity count per client                 |
| `/activities/[clientId]`                      | Client diary page (customer header + filter + activities table)      |
| `/activities/[clientId]/new`                  | Create activity form                                                 |
| `/activities/[clientId]/[activityId]/edit`    | Edit activity form                                                   |

The Aktivity nav link is added next to existing Zákazníci/Faktury links in `components/layout/header.tsx` (and the matching mobile nav).

## Data model

### Migration: `scripts/011_create_activities.sql`

```sql
create type service_type as enum ('cleaning', 'laundry', 'apartment_service');
create type activity_status as enum ('unpaid', 'paid');

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  activity_date date not null,
  status activity_status not null default 'unpaid',
  total_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activity_services (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  service_type service_type not null,
  price numeric(10,2) not null,
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
  using (exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()))
  with check (exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()));
```

Mirrors the `invoices` + `invoice_items` pattern already in the codebase.

### Types added to `lib/types.ts`

```ts
export type ServiceType = 'cleaning' | 'laundry' | 'apartment_service'
export type ActivityStatus = 'unpaid' | 'paid'

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

`total_amount` is the sum of `services[].price`, computed by the server action on create/edit and stored, so the list page doesn't have to aggregate at render time.

### Czech labels for service types

| `service_type`        | Czech label         |
| --------------------- | ------------------- |
| `cleaning`            | Úklid               |
| `laundry`             | Praní               |
| `apartment_service`   | Servis apartmánu    |

Centralised in a single `SERVICE_LABELS` constant in `components/activities/service-labels.ts`.

## Components

New folder `components/activities/`:

- **`activity-form.tsx`** — react-hook-form + zod, mirrors the existing invoice form conventions.
  - Date picker, defaults to today, editable.
  - Dynamic list of "service rows": service-type select, price input (EUR, ≥ 0), optional note (≤ 200 chars). Add/remove row buttons. Minimum one row required.
  - Live total below the list.
  - No status field on the form — defaults to `unpaid` on create; on edit, the existing status value is preserved.
- **`activity-list-table.tsx`** — table on the client diary page using the editorial hairline-row style. Columns: Datum, Popis (services decomposed: `Úklid €30 — kuchyň + koupelna · Praní €10 · Servis apartmánu €15`), Celkem, Status (toggleable `StatusPill`), per-row 3-dot menu (Upravit / Smazat).
- **`activity-status-filter.tsx`** — three-state filter (Vše / Nezaplaceno / Zaplaceno) wired via `?status=` query param. Values: `unpaid`, `paid`, or absent (= all). Anything else falls back to "all".
- **`activity-actions.ts`** — server actions: `createActivity`, `updateActivity`, `deleteActivity`, `setActivityStatus`. Each runs through `lib/supabase/server.ts` so RLS enforces ownership.

Reused existing primitives: `PageHeader`, `SectionLabel`, `StatusPill`, the underline input style, hairline dividers.

The `/activities` clients list reuses the same Supabase customers query as `/customers/page.tsx`, then runs one additional grouped query for unpaid activity counts and merges results in memory.

## Data flow

### `/activities` (clients list)
1. Server component fetches customers (same as `/customers`).
2. Side query: `select customer_id, count(*) from activities where user_id = auth.uid() and status = 'unpaid' group by customer_id`.
3. Merge into `{customer, unpaidCount}` rows; render with link to `/activities/[customer.id]`.

### `/activities/[clientId]`
1. Server component fetches the customer (RLS enforces ownership; `notFound()` if missing).
2. Fetches activities filtered by `?status=` query param (default: all), ordered by `activity_date desc, created_at desc`, joining services: `select *, services:activity_services(*) from activities ...`.
3. Renders customer header, status filter, and table.

### Create
1. Form submits to `createActivity({customer_id, activity_date, services})`.
2. Server action zod-validates, computes `total_amount`, inserts `activities` row, bulk-inserts `activity_services` rows. If service insert fails, parent row is deleted (manual rollback — Supabase JS doesn't expose transactions directly).
3. `revalidatePath('/activities/[clientId]')`, redirect to it.

### Edit
1. Same form pre-filled.
2. Server action: delete existing `activity_services` for the activity, re-insert from form, recompute `total_amount`, update `activities.updated_at`.

### Toggle status
1. Click on the `StatusPill` calls `setActivityStatus(id, newStatus)`.
2. Server action updates only the `status` column. Total is untouched.
3. Optimistic UI update; revalidate page on success.

### Delete
1. Confirm dialog → `deleteActivity(id)`.
2. FK cascade removes service rows. Revalidate page.

## Validation (zod)

- `activity_date`: required, valid date.
- `services`: array, length ≥ 1.
- `services[].service_type`: enum of the three types.
- `services[].price`: required, number ≥ 0.
- `services[].note`: optional string, max length 200.

## Errors and edge cases

- **Customer not owned / not found** on `/activities/[clientId]` → RLS returns nothing → `notFound()`.
- **Activity not found** on edit/delete/toggle → server action returns `{error}`; UI shows Czech message ("Aktivita nenalezena").
- **Concurrent status toggle** — last write wins; status is independent of services so no amount corruption risk.
- **Customer deletion** — `on delete cascade` removes their activities and services automatically. Existing customer delete flow remains unchanged.
- **Zero services submitted** — zod blocks; server action validates again as defence-in-depth.
- **Stale `total_amount`** — recomputed on create and edit. Status toggles never touch it. Edits delete-and-reinsert all services, ensuring the stored total matches the rows.
- **Service row order** — preserved as inserted; v1 doesn't support manual reordering. A `position int` column can be added later if needed.
- **Public/anonymous access** — none. The diary is private. `middleware.ts` does not need new public-prefix exceptions.

## Verification

Repository has no test framework configured. Verification:

1. Apply `scripts/011_create_activities.sql` to Supabase.
2. `pnpm typecheck` clean.
3. Manual smoke checklist:
   - Create activity with all 3 service types + mixed notes; total = sum.
   - Toggle status; reflected in list and in `/activities` unpaid count.
   - Edit: remove a service, change a price; total recomputes.
   - Delete: row removed, services cascaded.
   - `?status=unpaid` and `?status=paid` filter correctly.
   - RLS: a second user cannot see the first user's activities.
   - Cascading delete of a customer removes their activities and service rows.

## Out of scope (v1)

- Aggregate stats on the client diary page (intentionally — table with statuses is sufficient).
- Global "all activities across all clients" view.
- Linking activities to invoices.
- Manual reordering of service rows within an activity.
- Per-activity overall note field (per-service notes only).
- Quantities for services (price-only model).
- Public download / sharing routes for activities.
