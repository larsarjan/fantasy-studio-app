-- Include atomic publication time in the reported duration.
create or replace function public.reference_sync_finish(run_id uuid, outcome text, datasets jsonb default null, fingerprint text default null, failure text default null, elapsed_ms integer default null) returns jsonb
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
 update public.reference_sync_runs set status=outcome,finished_at=clock_timestamp(),import_id=imported,counts=snapshot.counts,error_message=left(failure,500),duration_ms=greatest(coalesce(elapsed_ms,0),ceil(extract(epoch from clock_timestamp()-run.started_at)*1000)::integer) where id=run_id;
 return jsonb_build_object('id',snapshot.id,'created_at',snapshot.created_at,'counts',snapshot.counts,'status',outcome);
end $$;
revoke all on function public.reference_sync_finish(uuid,text,jsonb,text,text,integer) from public,anon,authenticated;
grant execute on function public.reference_sync_finish(uuid,text,jsonb,text,text,integer) to service_role;

