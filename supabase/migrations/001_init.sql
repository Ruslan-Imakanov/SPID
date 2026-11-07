-- СПИД: учёт пробега и топлива автопарка
-- Схема: профили пользователей, машины, события (смены и заправки), хранилище фото.

-- ───────────────────────── Профили ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  -- pending — ждёт подтверждения; driver — водитель; admin — руководитель; blocked — отключён
  role text not null default 'pending' check (role in ('pending', 'driver', 'admin', 'blocked')),
  created_at timestamptz not null default now()
);

-- Профиль создаётся автоматически при регистрации.
-- Первый зарегистрированный пользователь становится администратором.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Вспомогательные функции для RLS (security definer, чтобы не было рекурсии политик)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('driver', 'admin'));
$$;

-- ───────────────────────── Машины ─────────────────────────
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique,
  model text not null default '',          -- «ГАЗель Next», «ГАЗель (старая)», «JAC N140»
  body text not null default 'standard' check (body in ('standard', '6m', 'other')),
  fuels text[] not null check (fuels <@ array['petrol', 'lpg', 'diesel']::text[] and cardinality(fuels) > 0),
  assigned_driver uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ───────────────────────── События ─────────────────────────
-- shift_start / shift_end — начало и конец смены; refuel — заправка.
-- id генерируется на телефоне, поэтому повторная отправка из офлайн-очереди не создаёт дублей.
create table public.events (
  id uuid primary key,
  vehicle_id uuid not null references public.vehicles (id),
  driver_id uuid not null references public.profiles (id),
  type text not null check (type in ('shift_start', 'shift_end', 'refuel')),
  odometer integer not null check (odometer >= 0 and odometer < 10000000),
  occurred_at timestamptz not null,
  fuel text check (fuel in ('petrol', 'lpg', 'diesel')),
  liters numeric(7, 2) check (liters > 0 and liters < 1000),
  amount numeric(12, 2) check (amount >= 0),
  full_tank boolean,
  odometer_photo text,
  receipt_photo text,
  comment text not null default '',
  created_at timestamptz not null default now(),
  constraint refuel_fields check (
    (type = 'refuel' and fuel is not null and liters is not null and full_tank is not null)
    or (type <> 'refuel' and fuel is null and liters is null)
  )
);

create index events_vehicle_time on public.events (vehicle_id, occurred_at);
create index events_driver_time on public.events (driver_id, occurred_at);

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.events enable row level security;

-- Профили: каждый видит свой, админ видит и меняет всех.
-- Активные водители видят имена коллег (для отображения в журнале нужны только админу,
-- но водитель видит, кто последним ездил на машине).
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_active_user());
create policy profiles_update_admin on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- Машины: читают активные пользователи, меняет только админ.
create policy vehicles_select on public.vehicles for select
  using (public.is_active_user());
create policy vehicles_admin_insert on public.vehicles for insert
  with check (public.is_admin());
create policy vehicles_admin_update on public.vehicles for update
  using (public.is_admin()) with check (public.is_admin());
create policy vehicles_admin_delete on public.vehicles for delete
  using (public.is_admin());

-- События: водитель добавляет только от своего имени; читать могут активные пользователи
-- (водителю нужен последний пробег машины для проверки ввода); править и удалять — только админ.
create policy events_select on public.events for select
  using (public.is_active_user());
create policy events_insert_own on public.events for insert
  with check (public.is_active_user() and driver_id = auth.uid());
create policy events_admin_update on public.events for update
  using (public.is_admin()) with check (public.is_admin());
create policy events_admin_delete on public.events for delete
  using (public.is_admin());

-- ───────────────────────── Фото ─────────────────────────
-- Приватный бакет. Путь файла: <id пользователя>/<id события>-odo.jpg | -receipt.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );
create policy photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

-- ───────────────────────── Сброс пароля водителя ─────────────────────────
-- Руководитель задаёт водителю новый пароль (у водителей нет настоящей почты для восстановления).
create or replace function public.admin_set_password(target uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Только руководитель может менять пароли';
  end if;
  if length(new_password) < 6 then
    raise exception 'Пароль должен быть не короче 6 символов';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target;
end;
$$;

revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;

-- ───────────────────────── Начальные данные ─────────────────────────
insert into public.vehicles (plate, model, body, fuels) values
  ('150AIB', 'ГАЗель Next',      '6m',       array['petrol']),
  ('630ALZ', 'ГАЗель Next',      'standard', array['petrol', 'lpg']),
  ('482AKC', 'ГАЗель (старая)',  'standard', array['petrol', 'lpg']),
  ('837ALT', 'ГАЗель Next',      'standard', array['petrol']),
  ('686AHL', 'ГАЗель Next',      'standard', array['petrol']),
  ('712AJK', 'JAC N140',         'other',    array['diesel']),
  ('435ALZ', 'ГАЗель Next',      'standard', array['petrol']),
  ('895AGP', 'ГАЗель Next',      '6m',       array['petrol']),
  ('937ARI', 'ГАЗель Next',      '6m',       array['petrol']),
  ('356ALT', 'ГАЗель Next',      'standard', array['petrol']);
