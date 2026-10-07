-- Supabase Cron is the sole scheduler for this module. Local PGlite skips hosted extensions.
create function public.prominent_check_scheduler(supplied_token text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 return exists(select 1 from vault.decrypted_secrets where name='prominent_scheduler_token' and decrypted_secret=supplied_token);
end $$;
revoke all on function public.prominent_check_scheduler(text) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.prominent_check_scheduler(text) to service_role;
  grant usage on schema vault to service_role;
  grant select on vault.decrypted_secrets to service_role;
 end if;
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  if not exists(select 1 from vault.decrypted_secrets where name='prominent_scheduler_token') then
   perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'prominent_scheduler_token','Fantasy Studio scheduler only');
  end if;
  perform cron.schedule('fantasy-studio-prominents','*/30 * * * *', $cron$
   select net.http_post(url:='https://rzunbquzffdivlpuomjc.supabase.co/functions/v1/prominent-sync',
    headers:=jsonb_build_object('Content-Type','application/json','x-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='prominent_scheduler_token')),
    body:='{}'::jsonb,timeout_milliseconds:=100000);
  $cron$);
 end if;
end $$;
