-- The existing Vault-protected ESPN scheduler token is shared by collectors.
-- The edge function validates it server-side; browsers cannot call this job.
do $$begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  perform cron.schedule('fantasy-studio-prices','*/5 * * * *',$cron$
   select net.http_post(url:='https://rzunbquzffdivlpuomjc.supabase.co/functions/v1/price-sync',
    headers:=jsonb_build_object('Content-Type','application/json','x-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='prominent_scheduler_token')),
    body:='{}'::jsonb,timeout_milliseconds:=100000)
   where exists(select 1 from public.price_current);
  $cron$);
  perform cron.schedule('fantasy-studio-prices-retention','15 4 * * *','select public.price_retention()');
 end if;
end$$;
