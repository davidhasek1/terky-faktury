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
