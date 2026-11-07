-- Страховые полисы: срок действия по каждому водителю и/или машине.
-- ОГПО ВТС в Казахстане оформляется на машину (с перечнем водителей или без ограничения),
-- поэтому полис можно привязать к водителю, к машине или к обоим.
create table public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.profiles (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  kind text not null default 'ogpo' check (kind in ('ogpo', 'kasko', 'other')),
  company text not null default '',         -- страховая компания
  number text not null default '',          -- номер полиса
  starts_on date,
  ends_on date not null,                    -- последний день действия
  cost numeric(12, 2) check (cost >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint insurance_owner check (driver_id is not null or vehicle_id is not null),
  constraint insurance_dates check (starts_on is null or starts_on <= ends_on)
);

create index insurance_driver on public.insurance_policies (driver_id);
create index insurance_vehicle on public.insurance_policies (vehicle_id);
create index insurance_ends on public.insurance_policies (ends_on);

alter table public.insurance_policies enable row level security;

-- Руководитель видит и меняет всё; водитель видит свои полисы и полисы закреплённой за ним машины.
create policy insurance_select on public.insurance_policies for select to authenticated
  using (
    public.is_admin()
    or driver_id = auth.uid()
    or exists (select 1 from public.vehicles v where v.id = vehicle_id and v.assigned_driver = auth.uid())
  );
create policy insurance_admin_insert on public.insurance_policies for insert to authenticated
  with check (public.is_admin());
create policy insurance_admin_update on public.insurance_policies for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy insurance_admin_delete on public.insurance_policies for delete to authenticated
  using (public.is_admin());
