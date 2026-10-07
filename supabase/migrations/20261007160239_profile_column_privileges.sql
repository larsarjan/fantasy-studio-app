-- Hosted projects can grant ALL to authenticated through default privileges.
-- A column grant alone does not revoke that table-level UPDATE permission.
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name,favorite_club) on public.profiles to authenticated;
