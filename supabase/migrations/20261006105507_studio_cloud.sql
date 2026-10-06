-- Fantasy Studio only. Never apply to AFTRAP Control.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
revoke all on public.profiles from anon;
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));

create function private.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id);
  return new;
end $$;
revoke all on function private.create_profile() from public, anon, authenticated;
create trigger create_studio_profile after insert on auth.users for each row execute function private.create_profile();

create function private.is_editor() returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','editor'))
$$;
revoke all on function private.is_editor() from public, anon;
grant execute on function private.is_editor() to authenticated;

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
revoke all on function private.touch_updated_at() from public, anon;

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 32000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (length(name) between 1 and 100),
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 2000000),
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 32000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,slug), unique(id,user_id)
);
-- Version snapshots intentionally preserve a coherent historical team/strategy.
create table public.team_versions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null, user_id uuid not null,
  version integer not null, state jsonb not null, settings jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(team_id,user_id) references public.fantasy_teams(id,user_id) on delete cascade,
  unique(team_id,version)
);
create index team_versions_owner_idx on public.team_versions(user_id);
create table public.transfer_editorial (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('transfer','club','local')),
  key text not null check (length(key) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 32000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(user_id,kind,key)
);
do $$ declare t text; begin
  foreach t in array array['user_preferences','fantasy_teams','team_versions','transfer_editorial'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('create policy owner_read on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',t);
    execute format('create policy owner_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))',t);
    if t <> 'team_versions' then execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t); end if;
  end loop;
end $$;

create function public.save_fantasy_team(team_slug text, team_name text, team_state jsonb, manager_settings jsonb, expected_version integer)
returns public.fantasy_teams language plpgsql security invoker set search_path = '' as $$
declare saved public.fantasy_teams;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || team_slug,0));
  select * into saved from public.fantasy_teams where user_id = auth.uid() and slug = team_slug for update;
  if coalesce(saved.version,0) <> expected_version then raise exception 'Version conflict' using errcode = 'P0001'; end if;
  if saved.id is null then
    insert into public.fantasy_teams(user_id,slug,name,state,settings) values(auth.uid(),team_slug,team_name,team_state,manager_settings) returning * into saved;
  else
    update public.fantasy_teams set name=team_name,state=team_state,settings=manager_settings,version=version+1 where id=saved.id returning * into saved;
  end if;
  insert into public.team_versions(team_id,user_id,version,state,settings) values(saved.id,auth.uid(),saved.version,saved.state,saved.settings);
  return saved;
end $$;
revoke all on function public.save_fantasy_team(text,text,jsonb,jsonb,integer) from public,anon;
grant execute on function public.save_fantasy_team(text,text,jsonb,jsonb,integer) to authenticated;

-- One row per source entity, separate datasets; extended source fields retained in
-- payload to preserve the existing scoring model without lossy transformations.
create table public.reference_imports (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references public.profiles(id) on delete set null,
  source text not null default 'Google Sheets',
  counts jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index reference_imports_owner_idx on public.reference_imports(imported_by);
alter table public.reference_imports enable row level security;
grant select,insert on public.reference_imports to authenticated;
create policy authenticated_reference_read on public.reference_imports for select to authenticated using ((select auth.uid()) is not null);
create policy editor_reference_insert on public.reference_imports for insert to authenticated with check ((select private.is_editor()) and imported_by=(select auth.uid()));
do $$ declare t text; begin
  foreach t in array array['players','historical_players','fixtures','european_fixtures','team_ratings','results','player_metadata','player_match_stats','elite_player_stats','elite_transfers','elite_sync_control','chip_usage','elite_formations','elite_club_exposure','transfer_deadline','transfer_club_overview'] loop
    execute format('create table public.%I (id text primary key, import_id uuid not null references public.reference_imports(id), payload jsonb not null check(jsonb_typeof(payload) = ''object''), season text generated always as (payload->>''season'') stored, created_at timestamptz not null default now(), updated_at timestamptz not null default now())',t);
    execute format('create index on public.%I(import_id)',t);
    execute format('create index on public.%I(season)',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('create policy reference_read on public.%I for select to authenticated using ((select auth.uid()) is not null)',t);
    execute format('create policy editor_insert on public.%I for insert to authenticated with check ((select private.is_editor()))',t);
    execute format('create policy editor_update on public.%I for update to authenticated using ((select private.is_editor())) with check ((select private.is_editor()))',t);
    execute format('create policy editor_delete on public.%I for delete to authenticated using ((select private.is_editor()))',t);
  end loop;
end $$;

create function public.publish_reference_data(datasets jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare imported uuid; dataset record; allowed text[] := array['players','historical_players','fixtures','european_fixtures','team_ratings','results','player_metadata','player_match_stats','elite_player_stats','elite_transfers','elite_sync_control','chip_usage','elite_formations','elite_club_exposure','transfer_deadline','transfer_club_overview'];
begin
  if not private.is_editor() then raise insufficient_privilege; end if;
  if jsonb_typeof(datasets) <> 'object' or coalesce(jsonb_array_length(datasets->'players'),0)=0 or coalesce(jsonb_array_length(datasets->'fixtures'),0)=0 then raise exception 'Incomplete reference import'; end if;
  perform pg_advisory_xact_lock(812473);
  insert into public.reference_imports(imported_by,counts) values(auth.uid(),(select jsonb_object_agg(key,jsonb_array_length(value)) from jsonb_each(datasets))) returning id into imported;
  for dataset in select * from jsonb_each(datasets) loop
    if not dataset.key=any(allowed) or jsonb_typeof(dataset.value)<>'array' then raise exception 'Invalid dataset'; end if;
    execute format('delete from public.%I',dataset.key);
    execute format('insert into public.%I(id,import_id,payload) select ordinality::text,$1,value from jsonb_array_elements($2) with ordinality',dataset.key) using imported,dataset.value;
  end loop;
  return imported;
end $$;
revoke all on function public.publish_reference_data(jsonb) from public,anon;
grant execute on function public.publish_reference_data(jsonb) to authenticated;

create function public.save_transfer_editorial(records jsonb) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if jsonb_typeof(records)<>'array' or jsonb_array_length(records)>2000 then raise exception 'Invalid editorial data'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || 'editorial',0));
  delete from public.transfer_editorial where user_id=auth.uid();
  insert into public.transfer_editorial(user_id,kind,key,payload)
    select auth.uid(),r->>'kind',r->>'key',r->'payload' from jsonb_array_elements(records) r;
end $$;
revoke all on function public.save_transfer_editorial(jsonb) from public,anon;
grant execute on function public.save_transfer_editorial(jsonb) to authenticated;
