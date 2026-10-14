-- Preserve every stat for the exact fixture and season. Zero-minute rows must not truncate played rosters.
-- No article content or source snapshot changes. Shared historical resolver still determines participation.
create or replace function private.article_entity_read(kind text, target_id text, target_season text) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare snapshot uuid; p jsonb; f jsonb; stats jsonb:='[]'; players jsonb:='[]'; fixtures jsonb:='[]'; results jsonb:='[]'; photos jsonb:='[]'; coverage jsonb:='[]';
begin
 if kind is null or kind not in ('player','match','summary','catalog') then raise exception 'Invalid entity kind' using errcode='22023'; end if;
 if kind='catalog' then
  if auth.uid() is null or not (private.has_permission('articles.create') or private.has_permission('articles.edit')) then raise insufficient_privilege; end if;
 elsif target_id is null or target_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$' or target_season is null or target_season !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Invalid entity identity' using errcode='22023'; end if;
 if not private.feature_access('news') then return null; end if;
 select id into snapshot from public.reference_imports where source='Google Sheets' order by created_at desc limit 1;
 if snapshot is null then return null; end if;
 if kind='catalog' then
  select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','name','season','position','club','startPrice','endPrice','selectedPct'])),'[]') into players from (select payload from public.players where import_id=snapshot order by id limit 2000)x;
  select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','season','round','date','time','home','away'])),'[]') into fixtures from (select payload from public.fixtures where import_id=snapshot order by id limit 1000)x;
  select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','season','round','date','home','away','homeScore','awayScore'])),'[]') into results from public.results where import_id=snapshot and replace(payload->>'season','-','/') in (select distinct replace(payload->>'season','-','/') from public.fixtures where import_id=snapshot);
  select coalesce(jsonb_agg(x),'[]') into coverage from (select payload->>'fixtureId' as id,payload->>'season' as season,count(*) filter(where coalesce(payload->>'minutes','0')::numeric>0) as records from public.player_match_stats where import_id=snapshot group by 1,2)x;
  return jsonb_build_object('snapshotId',snapshot,'players',players,'fixtures',fixtures,'results',results,'coverage',coverage);
 end if;
 if kind='player' then
  if (select count(*) from public.players where import_id=snapshot and payload->>'id'=target_id and replace(payload->>'season','-','/')=target_season)<>1 then return null; end if;
  select private.article_public_fields(payload,array['id','name','season','position','club','startPrice','endPrice','selectedPct']) into p from public.players where import_id=snapshot and payload->>'id'=target_id and replace(payload->>'season','-','/')=target_season;
  select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','playerId','playerName','season','round','fixtureId','matchStatus','status','minutes','goals','assists','optaBonus','cleanSheet','goalsConceded','saves','penaltiesSaved','penaltiesMissed','ownGoals','yellowCards','redCards','club','playerClub'])),'[]') into stats from (select payload from public.player_match_stats where import_id=snapshot and payload->>'playerId'=target_id and replace(payload->>'season','-','/')=target_season order by id limit 120)x;
  select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','season','round','date','time','home','away'])),'[]') into fixtures from (select payload from public.fixtures where import_id=snapshot and replace(payload->>'season','-','/')=target_season and (payload->>'id' in (select value->>'fixtureId' from jsonb_array_elements(stats)) or ((payload->>'home'=p->>'club' or payload->>'away'=p->>'club') and payload->>'date'>=current_date::text)) order by payload->>'date' limit 100)x;
  select coalesce(jsonb_agg(jsonb_build_object('player_key',player_key,'source_enabled',source_enabled,'source_status',source_status,'source_name',source_name,'source_url',case when source_enabled and source_status='approved' then source_url end,'source_thumbnail_url',case when source_enabled and source_status='approved' then source_thumbnail_url end,'override_enabled',override_enabled,'override_url',case when override_enabled then override_url end,'override_thumbnail_url',case when override_enabled then override_thumbnail_url end)),'[]') into photos from public.player_photos where player_key='studio:'||target_season||':'||target_id;
  return jsonb_build_object('snapshotId',snapshot,'player',p,'stats',stats,'fixtures',fixtures,'photos',photos);
 end if;
 if (select count(*) from public.fixtures where import_id=snapshot and payload->>'id'=target_id and replace(payload->>'season','-','/')=target_season)<>1 then return null; end if;
 select private.article_public_fields(payload,array['id','season','round','date','time','home','away']) into f from public.fixtures where import_id=snapshot and payload->>'id'=target_id and replace(payload->>'season','-','/')=target_season;
 select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','season','round','date','home','away','homeScore','awayScore'])),'[]') into results from public.results where import_id=snapshot and replace(payload->>'season','-','/')=target_season and (payload->>'round'=f->>'round' or payload->>'date'=f->>'date');
 if kind='match' then
  select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','playerId','playerName','season','round','fixtureId','matchStatus','status','minutes','goals','assists','optaBonus','cleanSheet','goalsConceded','saves','penaltiesSaved','penaltiesMissed','ownGoals','yellowCards','redCards','club','playerClub'])),'[]') into stats from (select payload from public.player_match_stats where import_id=snapshot and payload->>'fixtureId'=target_id and replace(payload->>'season','-','/')=target_season order by id)x;
  select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','name','season','position','club','startPrice','endPrice','selectedPct'])),'[]') into players from public.players where import_id=snapshot and replace(payload->>'season','-','/')=target_season and payload->>'id' in(select value->>'playerId' from jsonb_array_elements(stats));
 end if;
 return jsonb_build_object('snapshotId',snapshot,'fixture',f,'results',results,'stats',stats,'players',players);
end $$;
