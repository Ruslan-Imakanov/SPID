-- Руководитель закрывает забытую смену за водителя.
alter table public.events add column closed_by uuid references public.profiles (id) on delete set null;

-- Руководитель может добавить запись от имени водителя
create policy events_admin_insert on public.events for insert to authenticated
  with check (public.is_admin());

-- Закрытие смены руководителем не рассылает уведомление «вернулся»:
-- в notify_trip() добавлено условие `or new.closed_by is not null` в самом начале (см. 005).
