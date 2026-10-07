-- Fantasy Studio only; existing profiles stay private and roles server-owned.
alter table public.profiles add column favorite_club text check (length(favorite_club) <= 100);
grant update(display_name, favorite_club) on public.profiles to authenticated;
create policy own_profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create trigger touch_profile_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();
-- Preserve previously saved display names without overriding real profiles.
update public.profiles p set display_name = left(u.settings->>'displayName',80)
from public.user_preferences u where u.user_id=p.id and p.display_name=''
  and nullif(trim(u.settings->>'displayName'),'') is not null;
