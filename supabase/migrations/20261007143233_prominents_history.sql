-- Additive public ESPN data, separate from private Studio selections.
create table public.prominents (
 id uuid primary key default gen_random_uuid(), espn_entry_id integer unique not null check(espn_entry_id>0),
 public_name text not null, fantasy_manager_name text not null default '', fantasy_team_name text not null default '',
 curated boolean not null default false, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.prominent_groups (
 prominent_id uuid not null references public.prominents(id),
 group_type text not null check(group_type in ('CONTENT_CREATOR','ESPN','FVT_SUBLEAGUE')),
 source_type text not null check(source_type in ('league','curated','manual')),
 source_league_id integer, manual_override boolean not null default false, active boolean not null default true,
 created_at timestamptz not null default now(), primary key(prominent_id,group_type)
);
create index prominent_groups_type_idx on public.prominent_groups(group_type,active,prominent_id);
create table public.prominent_bootstrap (
 season text primary key check(season ~ '^\d{4}-\d{4}$'), events jsonb not null, players jsonb not null, teams jsonb not null,
 element_types jsonb not null, chips jsonb not null, game_settings jsonb not null, game_config jsonb not null default '{}',
 chip_labels jsonb not null default '{"wildcard":"Wildcard","frush":"Aanvalluh!","2capt":"2capt","rich":"rich"}',
 fetched_at timestamptz not null default now()
);
create table public.prominent_round_snapshots (
 id uuid primary key default gen_random_uuid(), prominent_id uuid not null references public.prominents(id),
 season text not null references public.prominent_bootstrap(season), event integer not null check(event between 1 and 99),
 fetched_at timestamptz not null default now(), active_chip text, event_points integer not null, total_points integer not null,
 event_rank integer, overall_rank integer, percentile_rank numeric, overall_rank_percentage numeric,
 bank integer not null check(bank>=0), team_value integer not null check(team_value>=0),
 event_transfers integer not null check(event_transfers>=0), event_transfers_cost integer not null check(event_transfers_cost>=0),
 points_on_bench integer not null, fantasy_team_name text not null, groups text[] not null,
 automatic_subs jsonb not null default '[]', historical_metadata_source text not null default 'bootstrap_at_fetch',
 sync_status text not null default 'complete' check(sync_status='complete'),
 unique(prominent_id,season,event)
);
create index prominent_round_lookup_idx on public.prominent_round_snapshots(season,event,total_points desc);
create index prominent_round_groups_idx on public.prominent_round_snapshots using gin(groups);
create table public.prominent_round_picks (
 snapshot_id uuid not null references public.prominent_round_snapshots(id), element_id integer not null,
 squad_position integer not null check(squad_position between 1 and 15), multiplier integer not null check(multiplier between 0 and 10),
 is_captain boolean not null, is_vice_captain boolean not null, element_type integer not null check(element_type between 1 and 4),
 player_name text not null, web_name text not null, club_name text not null, club_id integer not null, price_at_fetch integer not null,
 primary key(snapshot_id,element_id), unique(snapshot_id,squad_position), check(not (is_captain and is_vice_captain))
);
create table private.prominent_raw_snapshots (
 snapshot_id uuid primary key references public.prominent_round_snapshots(id), raw_json jsonb not null
);
create table public.prominent_sync_runs (
 id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(), finished_at timestamptz,
 season text, event integer, status text not null default 'running' check(status in ('running','complete','partial','error')),
 processed integer not null default 0, errors integer not null default 0, pending integer not null default 0,
 source_counts jsonb not null default '{}', source_warnings jsonb not null default '[]', trigger_type text not null
);
create table public.prominent_sync_jobs (
 prominent_id uuid not null references public.prominents(id), season text not null, event integer not null,
 status text not null default 'pending' check(status in ('pending','complete','error','unavailable')),
 attempts integer not null default 0, next_retry_at timestamptz not null default now(), last_error text,
 updated_at timestamptz not null default now(), primary key(prominent_id,season,event)
);
create index prominent_jobs_retry_idx on public.prominent_sync_jobs(status,next_retry_at);
create table private.prominent_sync_lock (id integer primary key check(id=1), owner uuid, expires_at timestamptz);
insert into private.prominent_sync_lock(id) values(1);
alter table private.prominent_sync_lock enable row level security;
alter table private.prominent_raw_snapshots enable row level security;
do $$ declare t text; begin
 foreach t in array array['prominents','prominent_groups','prominent_bootstrap','prominent_round_snapshots','prominent_round_picks'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select on public.%I to anon,authenticated',t);
  execute format('create policy public_read on public.%I for select to anon,authenticated using(true)',t);
 end loop;
 foreach t in array array['prominent_sync_runs','prominent_sync_jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy admin_read on public.%I for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role=''admin''))',t);
 end loop;
end $$;
-- Local tests do not have Supabase's service role. Live grants are explicit.
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant usage on schema private to service_role;
 grant all on public.prominents,public.prominent_groups,public.prominent_bootstrap,public.prominent_round_snapshots,public.prominent_round_picks,public.prominent_sync_runs,public.prominent_sync_jobs,private.prominent_raw_snapshots,private.prominent_sync_lock to service_role;
 grant select on public.profiles to service_role;
end if; end $$;
create function private.prominent_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Historical prominent snapshots are immutable' using errcode='55000'; end $$;
revoke all on function private.prominent_immutable() from public,anon,authenticated;
create trigger immutable_snapshot before update or delete on public.prominent_round_snapshots for each row execute function private.prominent_immutable();
create trigger immutable_pick before update or delete on public.prominent_round_picks for each row execute function private.prominent_immutable();
create trigger immutable_raw before update or delete on private.prominent_raw_snapshots for each row execute function private.prominent_immutable();
create function public.prominent_acquire_lock(lock_owner uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare acquired integer;
begin
 update private.prominent_sync_lock set owner=lock_owner,expires_at=now()+interval '3 minutes' where id=1 and (expires_at is null or expires_at<now());
 get diagnostics acquired=row_count; return acquired=1;
end $$;
create function public.prominent_release_lock(lock_owner uuid) returns void language sql security invoker set search_path='' as $$
 update private.prominent_sync_lock set expires_at=null,owner=null where id=1 and owner=lock_owner
$$;
create function public.prominent_save_snapshot(manager_id uuid, snapshot jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare sid uuid; p jsonb;
begin
 if jsonb_array_length(snapshot->'picks')<>15
 or (select count(distinct (x->>'element_id')::int) from jsonb_array_elements(snapshot->'picks') x)<>15
 or (select count(distinct (x->>'squad_position')::int) from jsonb_array_elements(snapshot->'picks') x)<>15
 or (select count(*) from jsonb_array_elements(snapshot->'picks') x where (x->>'is_captain')::boolean)<>1
 or (select count(*) from jsonb_array_elements(snapshot->'picks') x where (x->>'is_vice_captain')::boolean)<>1 then raise exception 'Invalid squad'; end if;
 insert into public.prominent_round_snapshots(prominent_id,season,event,active_chip,event_points,total_points,event_rank,overall_rank,percentile_rank,overall_rank_percentage,bank,team_value,event_transfers,event_transfers_cost,points_on_bench,fantasy_team_name,groups,automatic_subs)
 values(manager_id,snapshot->>'season',(snapshot->>'event')::int,snapshot->>'active_chip',(snapshot->>'event_points')::int,(snapshot->>'total_points')::int,(snapshot->>'event_rank')::int,(snapshot->>'overall_rank')::int,(snapshot->>'percentile_rank')::numeric,(snapshot->>'overall_rank_percentage')::numeric,(snapshot->>'bank')::int,(snapshot->>'team_value')::int,(snapshot->>'event_transfers')::int,(snapshot->>'event_transfers_cost')::int,(snapshot->>'points_on_bench')::int,snapshot->>'fantasy_team_name',array(select jsonb_array_elements_text(snapshot->'groups')),coalesce(snapshot->'automatic_subs','[]'))
 on conflict(prominent_id,season,event) do nothing returning id into sid;
 if sid is null then select id into sid from public.prominent_round_snapshots where prominent_id=manager_id and season=snapshot->>'season' and event=(snapshot->>'event')::int; return sid; end if;
 for p in select * from jsonb_array_elements(snapshot->'picks') loop
 insert into public.prominent_round_picks values(sid,(p->>'element_id')::int,(p->>'squad_position')::int,(p->>'multiplier')::int,(p->>'is_captain')::boolean,(p->>'is_vice_captain')::boolean,(p->>'element_type')::int,p->>'player_name',p->>'web_name',p->>'club_name',(p->>'club_id')::int,(p->>'price_at_fetch')::int);
 end loop;
 insert into private.prominent_raw_snapshots values(sid,snapshot->'raw_json');
 return sid;
end $$;
revoke all on function public.prominent_save_snapshot(uuid,jsonb), public.prominent_acquire_lock(uuid), public.prominent_release_lock(uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.prominent_save_snapshot(uuid,jsonb), public.prominent_acquire_lock(uuid),public.prominent_release_lock(uuid) to service_role;
end if; end $$;
