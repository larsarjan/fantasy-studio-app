-- Server-owned lease and bounded operational history. No user football data changes.
alter table public.reference_imports add column if not exists source_hash text;
create table public.reference_sync_runs (
 id uuid primary key default gen_random_uuid(),
 started_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '5 minutes',
 finished_at timestamptz,
 status text not null default 'running' check(status in ('running','success','unchanged','error')),
 trigger_kind text not null check(trigger_kind in ('manual','scheduled')),
 actor_id uuid references auth.users(id) on delete set null,
 base_import_id uuid references public.reference_imports(id),
 import_id uuid references public.reference_imports(id),
 counts jsonb,
 error_message text,
 duration_ms integer
);
create unique index reference_sync_one_running on public.reference_sync_runs(status) where status='running';
create index reference_sync_runs_started on public.reference_sync_runs(started_at desc);
alter table public.reference_sync_runs enable row level security;
revoke all on public.reference_sync_runs from public,anon,authenticated;
grant select on public.reference_sync_runs to authenticated;
create policy reference_sync_status_read on public.reference_sync_runs for select to authenticated using ((select private.has_permission('sync.view')) or (select private.has_permission('data.view')));
grant all on public.reference_sync_runs to service_role;

create function public.reference_sync_claim(trigger_kind text, actor_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run public.reference_sync_runs; latest public.reference_imports;
begin
 perform pg_advisory_xact_lock(812473);
 update public.reference_sync_runs set status='error',finished_at=now(),error_message='Synchronisatie verlopen; vorige snapshot behouden.' where status='running' and expires_at<=now();
 if exists(select 1 from public.reference_sync_runs where status='running') then return null; end if;
 select * into latest from public.reference_imports where source='Google Sheets' order by created_at desc limit 1;
 insert into public.reference_sync_runs(trigger_kind,actor_id,base_import_id) values(trigger_kind,actor_id,latest.id) returning * into run;
 delete from public.reference_sync_runs where started_at<now()-interval '30 days' and status<>'running';
 return jsonb_build_object('id',run.id,'base_import_id',latest.id,'counts',latest.counts,'source_hash',latest.source_hash);
end $$;
revoke all on function public.reference_sync_claim(text,uuid) from public,anon,authenticated;
grant execute on function public.reference_sync_claim(text,uuid) to service_role;

-- One publication implementation, one transaction, the same advisory lock as before.
create function private.publish_reference_snapshot(datasets jsonb, actor uuid, fingerprint text default null) returns uuid
language plpgsql security invoker set search_path='' set statement_timeout='60s' as $$
declare imported uuid; dataset record; previous jsonb;
 allowed text[] := array['players','historical_players','fixtures','european_fixtures','team_ratings','results','player_metadata','player_match_stats','elite_player_stats','elite_transfers','elite_sync_control','chip_usage','elite_formations','elite_club_exposure','transfer_deadline','transfer_club_overview'];
 table_name text; row_count integer;
begin
 perform pg_advisory_xact_lock(812473);
 if jsonb_typeof(datasets) is distinct from 'object' or (select count(*) from jsonb_object_keys(datasets))<>cardinality(allowed) then raise exception 'Incomplete reference import'; end if;
 select counts into previous from public.reference_imports where source='Google Sheets' order by created_at desc limit 1;
 foreach table_name in array allowed loop
  if jsonb_typeof(datasets->table_name) is distinct from 'array' then raise exception 'Missing dataset: %',table_name; end if;
  row_count:=jsonb_array_length(datasets->table_name);
  if table_name=any(array['players','fixtures','results','team_ratings']) and row_count=0 then raise exception 'Empty required dataset: %',table_name; end if;
  if coalesce((previous->>table_name)::int,0)>0 and (row_count=0 or row_count<(previous->>table_name)::int*0.8) then raise exception 'Suspicious dataset decrease: %',table_name; end if;
 end loop;
 insert into public.reference_imports(imported_by,counts,source_hash) values(actor,(select jsonb_object_agg(key,jsonb_array_length(value)) from jsonb_each(datasets)),fingerprint) returning id into imported;
 for dataset in select * from jsonb_each(datasets) loop
  execute format('delete from public.%I where import_id is not null',dataset.key);
  execute format('insert into public.%I(id,import_id,payload) select ordinality::text,$1,value from jsonb_array_elements($2) with ordinality',dataset.key) using imported,dataset.value;
 end loop;
 return imported;
end $$;
revoke all on function private.publish_reference_snapshot(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function private.publish_reference_snapshot(jsonb,uuid,text) to service_role;
grant usage on schema private to service_role;
grant select,insert on public.reference_imports to service_role;
grant select,insert,delete on public.players,public.historical_players,public.fixtures,public.european_fixtures,public.team_ratings,public.results,public.player_metadata,public.player_match_stats,public.elite_player_stats,public.elite_transfers,public.elite_sync_control,public.chip_usage,public.elite_formations,public.elite_club_exposure,public.transfer_deadline,public.transfer_club_overview to service_role;

create or replace function public.publish_reference_data(datasets jsonb) returns uuid
language plpgsql security invoker set search_path='' set statement_timeout='60s' as $$
begin
 if not (private.has_permission('data.correct') and private.has_permission('sync.run')) then raise insufficient_privilege; end if;
 raise exception 'Gebruik de centrale serverimport; herlaad Admin Data.';
end $$;

create function public.reference_sync_finish(run_id uuid, outcome text, datasets jsonb default null, fingerprint text default null, failure text default null, elapsed_ms integer default null) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='60s' as $$
declare run public.reference_sync_runs; imported uuid; latest uuid; snapshot public.reference_imports;
begin
 perform pg_advisory_xact_lock(812473);
 select * into run from public.reference_sync_runs where id=run_id for update;
 if run.id is null or run.status<>'running' or run.expires_at<=now() then raise exception 'Sync lease is niet meer geldig.'; end if;
 if outcome not in ('success','unchanged','error') then raise exception 'Invalid outcome'; end if;
 select id into latest from public.reference_imports where source='Google Sheets' order by created_at desc limit 1;
 if outcome<>'error' and latest is distinct from run.base_import_id then raise exception 'Cloudsnapshot changed during sync'; end if;
 if outcome='success' then
  if fingerprint is null or fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid fingerprint'; end if;
  imported:=private.publish_reference_snapshot(datasets,run.actor_id,fingerprint);
 elsif outcome='unchanged' then
  if not exists(select 1 from public.reference_imports where id=latest and source_hash=fingerprint) then raise exception 'Fingerprint mismatch'; end if;
  imported:=latest;
 end if;
 select * into snapshot from public.reference_imports where id=imported;
 update public.reference_sync_runs set status=outcome,finished_at=now(),import_id=imported,counts=snapshot.counts,error_message=left(failure,500),duration_ms=elapsed_ms where id=run_id;
 return jsonb_build_object('id',snapshot.id,'created_at',snapshot.created_at,'counts',snapshot.counts,'status',outcome);
end $$;
revoke all on function public.reference_sync_finish(uuid,text,jsonb,text,text,integer) from public,anon,authenticated;
grant execute on function public.reference_sync_finish(uuid,text,jsonb,text,text,integer) to service_role;

create function public.reference_check_scheduler(supplied_token text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 return length(supplied_token) between 32 and 200 and exists(select 1 from vault.decrypted_secrets where name='reference_scheduler_token' and decrypted_secret=supplied_token);
end $$;
revoke all on function public.reference_check_scheduler(text) from public,anon,authenticated;
grant execute on function public.reference_check_scheduler(text) to service_role;
-- Register disabled; release verification explicitly activates this one job.
-- Existing prices/prominents jobs are neither replaced nor altered.
do $$ declare job bigint; begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  if not exists(select 1 from vault.decrypted_secrets where name='reference_scheduler_token') then
   perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'reference_scheduler_token','Fantasy Studio reference sync only');
  end if;
  grant usage on schema vault to service_role;
  grant select on vault.decrypted_secrets to service_role;
  select cron.schedule('fantasy-studio-reference','7,37 * * * *',$cron$
   select net.http_post(url:='https://fantasyvoetbaltalk.nl/api/reference-sync',
    headers:=jsonb_build_object('Content-Type','application/json','x-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='reference_scheduler_token')),
    body:='{}'::jsonb,timeout_milliseconds:=240000);
  $cron$) into job;
  perform cron.alter_job(job,active:=false);
 end if;
end $$;
