-- Public photo metadata only; source sync and human overrides have separate columns.
create table public.player_photos (
  player_key text primary key check (player_key ~ '^(studio|espn):[0-9]{4}/[0-9]{4}:[A-Za-z0-9_-]+$'),
  source_name text,
  source_url text check (source_url is null or source_url ~ '^https://[^[:space:]]+$'),
  source_thumbnail_url text check (source_thumbnail_url is null or source_thumbnail_url ~ '^https://[^[:space:]]+$'),
  source_status text not null default 'unverified' check (source_status in ('unverified','approved','broken','disabled')),
  source_enabled boolean not null default false,
  override_url text check (override_url is null or override_url ~ '^https://[^[:space:]]+$'),
  override_thumbnail_url text check (override_thumbnail_url is null or override_thumbnail_url ~ '^https://[^[:space:]]+$'),
  override_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.player_photos enable row level security;
revoke all on public.player_photos from anon, authenticated;
grant select on public.player_photos to anon, authenticated;
grant insert, update, delete on public.player_photos to authenticated;
grant all on public.player_photos to service_role;
create policy photo_read on public.player_photos for select to anon,authenticated using (true);
create policy photo_admin_write on public.player_photos for all to authenticated
  using (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'))
  with check (exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));
create function private.player_photo_updated() returns trigger language plpgsql set search_path='' as $$
begin
  if (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then new.updated_at=now();
  else new.updated_at=old.updated_at; end if;
  return new;
end $$;
revoke all on function private.player_photo_updated() from public;
create trigger player_photo_updated before update on public.player_photos for each row execute function private.player_photo_updated();
