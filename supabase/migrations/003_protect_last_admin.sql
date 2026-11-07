-- Нельзя снять права (или отключить) последнего руководителя — иначе парком некому будет управлять.
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'Нельзя снять права с последнего руководителя';
  end if;
  return new;
end;
$$;

create trigger protect_last_admin
  before update of role on public.profiles
  for each row execute function public.protect_last_admin();

revoke execute on function public.protect_last_admin() from public, anon, authenticated;
