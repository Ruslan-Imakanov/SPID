-- Ужесточение доступа к служебным функциям (по рекомендациям Supabase Security Advisor).

-- Триггерная функция не должна вызываться через API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Проверки ролей нужны только вошедшим пользователям (в политиках RLS).
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;

-- Политики таблиц — только для вошедших пользователей; анонимный доступ закрыт полностью.
alter policy profiles_select on public.profiles to authenticated;
alter policy profiles_update_admin on public.profiles to authenticated;
alter policy vehicles_select on public.vehicles to authenticated;
alter policy vehicles_admin_insert on public.vehicles to authenticated;
alter policy vehicles_admin_update on public.vehicles to authenticated;
alter policy vehicles_admin_delete on public.vehicles to authenticated;
alter policy events_select on public.events to authenticated;
alter policy events_insert_own on public.events to authenticated;
alter policy events_admin_update on public.events to authenticated;
alter policy events_admin_delete on public.events to authenticated;
