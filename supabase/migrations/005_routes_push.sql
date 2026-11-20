-- Маршруты по регионам и push-уведомления о выезде и возвращении.

-- ───────────────────────── Регионы ─────────────────────────
create table public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.regions enable row level security;
create policy regions_select on public.regions for select to authenticated using (public.is_active_user());
create policy regions_admin_insert on public.regions for insert to authenticated with check (public.is_admin());
create policy regions_admin_update on public.regions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy regions_admin_delete on public.regions for delete to authenticated using (public.is_admin());

insert into public.regions (name, sort) values
  ('Алматы (город)', 1),
  ('Алматинская область', 2),
  ('Астана', 3),
  ('Шымкент', 4),
  ('Караганда', 5),
  ('Другой регион', 99);

-- Регион рейса хранится в записях смены (начало и конец).
alter table public.events add column region_id uuid references public.regions (id) on delete set null;
create index events_region on public.events (region_id);

-- ───────────────────────── Push ─────────────────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());
create policy push_update_own on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_delete_own on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Служебные ключи (VAPID, секрет триггера): доступны только серверу (service role), через API не читаются.
create table public.push_config (
  key text primary key,
  value text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

insert into public.push_config (key, value) values ('trigger_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

-- ───────────────────────── Триггер: смена началась / закончилась ─────────────────────────
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_trip()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  secret text;
  plate text;
  driver text;
  region text;
  km integer;
begin
  if new.type not in ('shift_start', 'shift_end') then
    return new;
  end if;

  select value into secret from public.push_config where key = 'trigger_secret';
  select v.plate into plate from public.vehicles v where v.id = new.vehicle_id;
  select p.full_name into driver from public.profiles p where p.id = new.driver_id;
  select r.name into region from public.regions r where r.id = new.region_id;

  if new.type = 'shift_end' then
    select new.odometer - s.odometer into km
      from public.events s
     where s.driver_id = new.driver_id and s.vehicle_id = new.vehicle_id and s.type = 'shift_start' and s.occurred_at <= new.occurred_at
     order by s.occurred_at desc limit 1;
    if region is null then
      select r.name into region from public.events s join public.regions r on r.id = s.region_id
       where s.driver_id = new.driver_id and s.vehicle_id = new.vehicle_id and s.type = 'shift_start' and s.occurred_at <= new.occurred_at
       order by s.occurred_at desc limit 1;
    end if;
  end if;

  perform net.http_post(
    url := 'https://ibtyjfcskmapdlmsouix.supabase.co/functions/v1/notify-trip',
    body := jsonb_build_object(
      'type', new.type,
      'event_id', new.id,
      'driver_id', new.driver_id,
      'driver', coalesce(driver, ''),
      'plate', coalesce(plate, ''),
      'region', coalesce(region, ''),
      'km', km,
      'odometer', new.odometer
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trigger-secret', coalesce(secret, '')),
    timeout_milliseconds := 8000
  );
  return new;
exception when others then
  -- Уведомление не должно мешать записи смены
  return new;
end;
$$;

revoke execute on function public.notify_trip() from public, anon, authenticated;

create trigger events_notify_trip
  after insert on public.events
  for each row execute function public.notify_trip();
