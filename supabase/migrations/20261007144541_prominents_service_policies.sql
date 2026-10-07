-- Explicit service policies also document private tables' intended access.
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  create policy collector_only on private.prominent_raw_snapshots for all to service_role using(true) with check(true);
  create policy collector_only on private.prominent_sync_lock for all to service_role using(true) with check(true);
 end if;
 if to_regnamespace('net') is not null then
  revoke execute on all functions in schema net from public,anon,authenticated;
  revoke usage on schema net from public,anon,authenticated;
 end if;
end $$;
