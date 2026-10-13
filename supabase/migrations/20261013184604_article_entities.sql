-- Optional entity references only. No UPDATE/DELETE of existing article rows.
create function private.article_public_fields(value jsonb, fields text[]) returns jsonb language sql immutable set search_path='' as $$ select coalesce(jsonb_object_agg(key,v),'{}') from jsonb_each(value) x(key,v) where key=any(fields) $$;
revoke all on function private.article_public_fields(jsonb,text[]) from public,anon,authenticated;

create function private.article_entity_read(kind text, target_id text, target_season text) returns jsonb
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
  select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','playerId','playerName','season','round','fixtureId','matchStatus','status','minutes','goals','assists','optaBonus','cleanSheet','goalsConceded','saves','penaltiesSaved','penaltiesMissed','ownGoals','yellowCards','redCards','club','playerClub'])),'[]') into stats from (select payload from public.player_match_stats where import_id=snapshot and payload->>'fixtureId'=target_id and replace(payload->>'season','-','/')=target_season order by id limit 60)x;
  select coalesce(jsonb_agg(private.article_public_fields(payload,array['id','name','season','position','club','startPrice','endPrice','selectedPct'])),'[]') into players from public.players where import_id=snapshot and replace(payload->>'season','-','/')=target_season and payload->>'id' in(select value->>'playerId' from jsonb_array_elements(stats));
 end if;
 return jsonb_build_object('snapshotId',snapshot,'fixture',f,'results',results,'stats',stats,'players',players);
end $$;
revoke all on function private.article_entity_read(text,text,text) from public;
grant execute on function private.article_entity_read(text,text,text) to anon,authenticated;
create function public.article_entity_data(kind text,target_id text default null,target_season text default null) returns jsonb language sql stable security invoker set search_path='' as $$ select private.article_entity_read(kind,target_id,target_season) $$;
revoke all on function public.article_entity_data(text,text,text) from public;
grant execute on function public.article_entity_data(text,text,text) to anon,authenticated;

create or replace function private.validate_news_blocks() returns trigger
language plpgsql set search_path='' as $$
declare c jsonb:=new.content_blocks; b jsonb; i jsonb; images jsonb; ids text[]:='{}'; plain text:=''; e jsonb; prior_end integer; source_text text; linked_text text; publishing boolean:=new.status in ('published','scheduled');
begin
 if c is null then return new; end if;
 if c ? 'ignoredEntities' then
  if jsonb_typeof(c->'ignoredEntities') is distinct from 'array' or jsonb_array_length(c->'ignoredEntities')>500 then raise exception 'Invalid ignored suggestions' using errcode='23514'; end if;
  for e in select value from jsonb_array_elements(c->'ignoredEntities') loop if jsonb_typeof(e) is distinct from 'string' or length(e#>>'{}')>250 then raise exception 'Invalid ignored suggestion' using errcode='23514'; end if; end loop;
 end if;
 if jsonb_typeof(c)<>'object' or c->>'version' is distinct from '1' or jsonb_typeof(c->'blocks') is distinct from 'array' or octet_length(c::text)>250000 then
  raise exception 'Ongeldige blokinhoud of artikel te groot.' using errcode='23514';
 end if;
 if jsonb_array_length(c->'blocks')>80 then raise exception 'Maximaal 80 blokken.' using errcode='23514'; end if;
 for b in select value from jsonb_array_elements(c->'blocks') loop
  if jsonb_typeof(b)<>'object' or coalesce(b->>'id','')!~'^[a-zA-Z0-9_-]{1,80}$' or b->>'id'=any(ids) or coalesce(b->>'type','') not in ('paragraph','heading','image','imageCarousel','quote','list','match') then raise exception 'Ongeldig of dubbel blok.' using errcode='23514'; end if;
  ids:=array_append(ids,b->>'id');
  if b ? 'players' then
   if b->>'type' not in ('paragraph','heading','quote','list') or jsonb_typeof(b->'players') is distinct from 'array' or jsonb_array_length(b->'players')>100 then raise exception 'Invalid player links' using errcode='23514'; end if;
   source_text:=case when b->>'type'='list' then (select string_agg(value,E'\n' order by n) from jsonb_array_elements_text(b->'items') with ordinality x(value,n)) else b->>'text' end;
   prior_end:=0;
   for e in select value from jsonb_array_elements(b->'players') order by (value->>'start')::numeric loop
    if jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'playerId','') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$' or coalesce(e->>'season','') !~ '^[0-9]{4}/[0-9]{4}$' or coalesce(e->>'start','') !~ '^[0-9]{1,6}$' or coalesce(e->>'end','') !~ '^[0-9]{1,6}$' or jsonb_typeof(e->'text') is distinct from 'string' then raise exception 'Invalid player identity/range' using errcode='23514'; end if;
    if (e->>'end')::int<=(e->>'start')::int or length(e->>'text')=0 or length(e->>'text')>30000 then raise exception 'Invalid player range' using errcode='23514'; end if;
    if jsonb_typeof(e->'start')<>'number' or jsonb_typeof(e->'end')<>'number' or (e->>'start')::int<prior_end then raise exception 'Overlapping player links' using errcode='23514'; end if;
    -- JavaScript offsets are UTF-16, while PostgreSQL counts Unicode code points.
    select case when min(pos-units)=(e->>'start')::int and max(pos)=(e->>'end')::int then string_agg(ch,'' order by n) end into linked_text
    from (select ch,n,units,sum(units) over(order by n) pos from (select ch,n,case when ascii(ch)>65535 then 2 else 1 end units from regexp_split_to_table(source_text,'') with ordinality x(ch,n)) chars) positioned
    where pos>(e->>'start')::int and pos<=(e->>'end')::int;
    if linked_text is distinct from e->>'text' then raise exception 'Player link does not match text' using errcode='23514'; end if;
    prior_end:=(e->>'end')::int;
   end loop;
  end if;
  if b->>'type'='match' then
   if coalesce(b->>'fixtureId','') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$' or coalesce(b->>'season','') !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Invalid fixture identity' using errcode='23514'; end if;
   foreach source_text in array array['collapsedByDefault','showTopScorer','showLegend','showSubstitutes','playerLinks'] loop
    if jsonb_typeof(b->source_text) is distinct from 'boolean' then raise exception 'Invalid match option' using errcode='23514'; end if;
   end loop;
  end if;
  if b->>'type' in ('paragraph','heading','quote') then
   if jsonb_typeof(b->'text') is distinct from 'string' or length(b->>'text')>30000 then raise exception 'Ongeldige bloktekst.' using errcode='23514'; end if;
   plain:=plain||' '||(b->>'text');
  end if;
  if b->>'type'='heading' and coalesce(b->>'level','') not in ('2','3') then raise exception 'Gebruik H2 of H3.' using errcode='23514'; end if;
  if b->>'type'='list' then
   if jsonb_typeof(b->'items') is distinct from 'array' or jsonb_typeof(b->'ordered') is distinct from 'boolean' then raise exception 'Ongeldige lijst.' using errcode='23514'; end if;
   for i in select value from jsonb_array_elements(b->'items') loop
    if jsonb_typeof(i)<>'string' then raise exception 'Ongeldig lijstitem.' using errcode='23514'; end if;
    plain:=plain||' '||(i#>>'{}');
   end loop;
  end if;
  if b->>'type' in ('image','imageCarousel') then
   if coalesce(b->>'size','') not in ('small','medium','large','full') or (b->>'type'='imageCarousel' and b->>'size'='small') then raise exception 'Ongeldig beeldformaat.' using errcode='23514'; end if;
   if b->>'type'='image' then
    if coalesce(b->>'align','center') not in ('left','center','right') then raise exception 'Ongeldige uitlijning.' using errcode='23514'; end if;
    images:=jsonb_build_array(b);
   else images:=b->'images'; end if;
   if jsonb_typeof(images) is distinct from 'array' then raise exception 'Ongeldige afbeeldingen.' using errcode='23514'; end if;
   if jsonb_array_length(images)>12 or (publishing and b->>'type'='imageCarousel' and jsonb_array_length(images)<2) then raise exception 'Een carrousel heeft 2 tot 12 afbeeldingen nodig voor publicatie.' using errcode='23514'; end if;
   for i in select value from jsonb_array_elements(images) loop
    if jsonb_typeof(i) is distinct from 'object' or jsonb_typeof(i->'url') is distinct from 'string' or jsonb_typeof(i->'alt') is distinct from 'string' then raise exception 'Ongeldige afbeelding.' using errcode='23514'; end if;
    if coalesce(i->>'url','')<>'' and (i->>'url'!~'^https://[a-zA-Z0-9.-]+(:[0-9]+)?/' or i->>'url'~'[[:space:]<>"\\]') then raise exception 'Ongeldige afbeeldings-URL.' using errcode='23514'; end if;
    if publishing and (coalesce(i->>'url','')='' or (coalesce(i->>'decorative','false')<>'true' and length(btrim(coalesce(i->>'alt','')))=0)) then raise exception 'Afbeelding en alt-tekst zijn verplicht; markeer decoratief expliciet.' using errcode='23514'; end if;
   end loop;
  end if;
 end loop;
 if publishing and length(btrim(plain))<20 then raise exception 'Vul minimaal 20 tekens artikeltekst in.' using errcode='23514'; end if;
 return new;
end $$;
