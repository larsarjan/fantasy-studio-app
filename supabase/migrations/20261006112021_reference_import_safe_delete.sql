create or replace function public.publish_reference_data(datasets jsonb) returns uuid language plpgsql security invoker set search_path = '' set statement_timeout = '30s' as $$
declare imported uuid; dataset record; allowed text[] := array['players','historical_players','fixtures','european_fixtures','team_ratings','results','player_metadata','player_match_stats','elite_player_stats','elite_transfers','elite_sync_control','chip_usage','elite_formations','elite_club_exposure','transfer_deadline','transfer_club_overview'];
begin
  if not private.is_editor() then raise insufficient_privilege; end if;
  if jsonb_typeof(datasets) <> 'object' or coalesce(jsonb_array_length(datasets->'players'),0)=0 or coalesce(jsonb_array_length(datasets->'fixtures'),0)=0 then raise exception 'Incomplete reference import'; end if;
  perform pg_advisory_xact_lock(812473);
  insert into public.reference_imports(imported_by,counts) values(auth.uid(),(select jsonb_object_agg(key,jsonb_array_length(value)) from jsonb_each(datasets))) returning id into imported;
  for dataset in select * from jsonb_each(datasets) loop
    if not dataset.key=any(allowed) or jsonb_typeof(dataset.value)<>'array' then raise exception 'Invalid dataset'; end if;
    execute format('delete from public.%I where import_id is not null',dataset.key);
    execute format('insert into public.%I(id,import_id,payload) select ordinality::text,$1,value from jsonb_array_elements($2) with ordinality',dataset.key) using imported,dataset.value;
  end loop;
  return imported;
end $$;
