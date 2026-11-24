-- Исправление записей: водитель правит свои записи в течение 3 суток, все правки сохраняются в журнале.
alter table public.events add column edited_at timestamptz;

create table public.event_edits (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  edited_by uuid references public.profiles (id) on delete set null,
  edited_at timestamptz not null default now(),
  old_values jsonb not null,
  new_values jsonb not null
);
create index event_edits_event on public.event_edits (event_id, edited_at);

alter table public.event_edits enable row level security;
create policy event_edits_select on public.event_edits for select to authenticated
  using (public.is_admin() or edited_by = auth.uid());

-- Любое изменение пробега / литров / суммы / вида топлива / полного бака записывается в журнал правок.
create or replace function public.log_event_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.odometer, old.liters, old.amount, old.fuel, old.full_tank) is distinct from (new.odometer, new.liters, new.amount, new.fuel, new.full_tank) then
    insert into public.event_edits (event_id, edited_by, old_values, new_values)
    values (
      new.id, auth.uid(),
      jsonb_build_object('odometer', old.odometer, 'liters', old.liters, 'amount', old.amount, 'fuel', old.fuel, 'full_tank', old.full_tank),
      jsonb_build_object('odometer', new.odometer, 'liters', new.liters, 'amount', new.amount, 'fuel', new.fuel, 'full_tank', new.full_tank)
    );
    new.edited_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.log_event_edit() from public, anon, authenticated;

create trigger events_log_edit before update on public.events
  for each row execute function public.log_event_edit();

-- Водитель исправляет СВОЮ запись не позже чем через 3 суток; остальные поля записи изменить нельзя.
create or replace function public.driver_fix_event(
  p_event uuid,
  p_odometer integer,
  p_liters numeric default null,
  p_amount numeric default null,
  p_full_tank boolean default null,
  p_fuel text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or e.driver_id <> auth.uid() or not public.is_active_user() then
    raise exception 'Запись не найдена';
  end if;
  if e.closed_by is not null then
    raise exception 'Эту запись закрыл руководитель, её исправляет только руководитель';
  end if;
  if e.occurred_at < now() - interval '3 days' then
    raise exception 'Исправлять можно в течение 3 суток. Обратитесь к руководителю';
  end if;
  if p_odometer is null or p_odometer < 0 or p_odometer >= 10000000 then
    raise exception 'Неверный пробег';
  end if;
  if e.type = 'refuel' then
    if p_liters is null or p_liters <= 0 or p_liters >= 1000 or p_amount is null or p_amount < 0 or p_full_tank is null then
      raise exception 'Проверьте литры и сумму';
    end if;
    update public.events set odometer = p_odometer, liters = p_liters, amount = p_amount, full_tank = p_full_tank,
      fuel = coalesce(p_fuel, fuel) where id = p_event;
  else
    update public.events set odometer = p_odometer where id = p_event;
  end if;
end;
$$;
revoke all on function public.driver_fix_event(uuid, integer, numeric, numeric, boolean, text) from public, anon;
grant execute on function public.driver_fix_event(uuid, integer, numeric, numeric, boolean, text) to authenticated;
