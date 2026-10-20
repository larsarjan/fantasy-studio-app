-- Additive block validation only; no content conversion or data updates.
-- Additive block validation only; no existing article rows are changed.
create or replace function private.validate_news_blocks() returns trigger
language plpgsql set search_path='' as $$
declare c jsonb:=new.content_blocks; b jsonb; i jsonb; images jsonb; ids text[]:='{}'; plain text:=''; e jsonb; prior_end integer; source_text text; linked_text text; publishing boolean:=new.status in ('published','scheduled');
begin
 if c is null then return new; end if;
 if c ? 'toc' and jsonb_typeof(c->'toc') is distinct from 'boolean' then raise exception 'Invalid contents setting' using errcode='23514'; end if;
 if c ? 'ignoredEntities' then
  if jsonb_typeof(c->'ignoredEntities') is distinct from 'array' or jsonb_array_length(c->'ignoredEntities')>500 then raise exception 'Invalid ignored suggestions' using errcode='23514'; end if;
  for e in select value from jsonb_array_elements(c->'ignoredEntities') loop if jsonb_typeof(e) is distinct from 'string' or length(e#>>'{}')>250 then raise exception 'Invalid ignored suggestion' using errcode='23514'; end if; end loop;
 end if;
 if jsonb_typeof(c)<>'object' or c->>'version' is distinct from '1' or jsonb_typeof(c->'blocks') is distinct from 'array' or octet_length(c::text)>250000 then
  raise exception 'Ongeldige blokinhoud of artikel te groot.' using errcode='23514';
 end if;
 if jsonb_array_length(c->'blocks')>80 then raise exception 'Maximaal 80 blokken.' using errcode='23514'; end if;
 for b in select value from jsonb_array_elements(c->'blocks') loop
  if jsonb_typeof(b)<>'object' or coalesce(b->>'id','')!~'^[a-zA-Z0-9_-]{1,80}$' or b->>'id'=any(ids) or coalesce(b->>'type','') not in ('paragraph','heading','image','imageCarousel','quote','list','match','divider','fiveAhead','playerAdvice','dreamTeam') then raise exception 'Ongeldig of dubbel blok.' using errcode='23514'; end if;
  ids:=array_append(ids,b->>'id');


  if b->>'type'='dreamTeam' then
   if coalesce(b->>'season','')!~'^20[0-9]{2}/20[0-9]{2}$' or coalesce(b->>'round','')!~'^[0-9]{1,2}$' or (b->>'round')::int not between 1 and 38 or coalesce(b->>'formation','') not in ('','3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1') then raise exception 'Ongeldige Dreamteam-instellingen.' using errcode='23514'; end if;
   if jsonb_typeof(b->'ownershipLimit') is distinct from 'null' then
    if jsonb_typeof(b->'ownershipLimit') is distinct from 'number' then raise exception 'Ongeldig ownershipfilter.' using errcode='23514'; end if;
    if (b->>'ownershipLimit')::numeric not between 0 and 100 then raise exception 'Ongeldig ownershipfilter.' using errcode='23514'; end if;
   end if;
   if jsonb_typeof(b->'xi') is distinct from 'array' or jsonb_typeof(b->'notable') is distinct from 'array' then raise exception 'Ongeldige selectie.' using errcode='23514'; end if;
   if jsonb_array_length(b->'xi')>11 or jsonb_array_length(b->'notable')>10 or (publishing and (jsonb_array_length(b->'xi')<>11 or jsonb_typeof(b->'star') is distinct from 'object' or jsonb_typeof(b->'snapshot') is distinct from 'object')) then raise exception 'Compleet Dreamteam vereist.' using errcode='23514'; end if;
   if jsonb_typeof(b->'differential') is distinct from 'array' then raise exception 'Ongeldige differentialselectie.' using errcode='23514'; end if;
   if jsonb_array_length(b->'differential') not in (0,11) or (jsonb_array_length(b->'differential')>0 and jsonb_typeof(b->'ownershipLimit')<>'number') then raise exception 'Ongeldig Differential XI.' using errcode='23514'; end if;
   if jsonb_array_length(b->'differential')=11 then
    if (select count(distinct p->>'id') from jsonb_array_elements(b->'differential') p)<>11 or (select count(*) from jsonb_array_elements(b->'differential') p where p->>'position'='keeper')<>1 or exists(select 1 from jsonb_array_elements(b->'differential') p group by p->>'club' having count(*)>3) then raise exception 'Ongeldig Differential XI.' using errcode='23514'; end if;
    select concat(count(*) filter(where p->>'position'='verdediger'),'-',count(*) filter(where p->>'position'='middenvelder'),'-',count(*) filter(where p->>'position'='aanvaller')) into source_text from jsonb_array_elements(b->'differential') p;
    if source_text not in ('3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1') or (coalesce(b->>'formation','')<>'' and b->>'formation'<>source_text) then raise exception 'Ongeldige differentialformatie.' using errcode='23514'; end if;
    for i in select value from jsonb_array_elements(b->'differential') loop
     if jsonb_typeof(i->'selectedPct') is distinct from 'number' then raise exception 'Ownership ontbreekt.' using errcode='23514'; end if;
     if (i->>'selectedPct')::numeric>(b->>'ownershipLimit')::numeric or (i->>'selectedPct')::numeric<0 then raise exception 'Ownership boven limiet.' using errcode='23514'; end if;
    end loop;
   end if;
   foreach source_text in array array['xi','notable'] loop
    if (select count(*) from jsonb_array_elements(b->source_text))<>(select count(distinct value->>'id') from jsonb_array_elements(b->source_text)) then raise exception 'Dubbele speler.' using errcode='23514'; end if;
   end loop;
   for i in select value from jsonb_array_elements((b->'xi')||(b->'notable')||(b->'differential')||(case when jsonb_typeof(b->'star')='object' then jsonb_build_array(b->'star') else '[]'::jsonb end)) loop
    if coalesce(i->>'id','')!~'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$' or jsonb_typeof(i->'name') is distinct from 'string' or jsonb_typeof(i->'club') is distinct from 'string' or i->>'season' is distinct from b->>'season' or coalesce(i->>'position','') not in ('keeper','verdediger','middenvelder','aanvaller') or jsonb_typeof(i->'fantasyPoints') is distinct from 'number' then raise exception 'Ongeldige Dreamteam-speler.' using errcode='23514'; end if;
   end loop;
   if jsonb_array_length(b->'xi')=11 then
    if (select count(*) from jsonb_array_elements(b->'xi') p where p->>'position'='keeper')<>1 or exists(select 1 from jsonb_array_elements(b->'xi') p group by p->>'club' having count(*)>3) then raise exception 'Ongeldig XI.' using errcode='23514'; end if;
    select concat(count(*) filter(where p->>'position'='verdediger'),'-',count(*) filter(where p->>'position'='middenvelder'),'-',count(*) filter(where p->>'position'='aanvaller')) into source_text from jsonb_array_elements(b->'xi') p;
    if source_text not in ('3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1') or (coalesce(b->>'formation','')<>'' and b->>'formation'<>source_text) then raise exception 'Ongeldige formatie.' using errcode='23514'; end if;
   end if;
   if jsonb_typeof(b->'snapshot')='object' then
    if b#>>'{snapshot,season}' is distinct from b->>'season' or b#>>'{snapshot,round}' is distinct from b->>'round' or b#>'{snapshot,ownershipLimit}' is distinct from b->'ownershipLimit' or b#>>'{snapshot,formation}' is distinct from b->>'formation' or coalesce(b#>>'{snapshot,preparedAt}','')='' then raise exception 'Verouderde Dreamteam-momentopname.' using errcode='23514'; end if;
   elsif jsonb_typeof(b->'snapshot') is distinct from 'null' then raise exception 'Ongeldige momentopname.' using errcode='23514'; end if;
   foreach source_text in array array['analyses','playerAnalyses'] loop
    if jsonb_typeof(b->source_text) is distinct from 'object' then raise exception 'Ongeldige analyse.' using errcode='23514'; end if;
    for i in select value from jsonb_each(b->source_text) loop if jsonb_typeof(i) is distinct from 'string' or length(i#>>'{}')>10000 then raise exception 'Ongeldige analyse.' using errcode='23514'; end if; end loop;
   end loop;
  end if;
  if b->>'type'='playerAdvice' then
   if coalesce(b->>'subtype','') not in ('purchase','differential','budget') or coalesce(b->>'season','')!~'^[0-9]{4}/[0-9]{4}$' or coalesce(b->>'startRound','')!~'^[0-9]{1,2}$' or (b->>'startRound')::integer not between 1 and 38 or coalesce(b->>'horizon','') not in ('1','3','5') then raise exception 'Ongeldige adviesinstellingen.' using errcode='23514'; end if;
   if jsonb_typeof(b->'selections') is distinct from 'array' then raise exception 'Ongeldige spelersselectie.' using errcode='23514'; end if;
   if jsonb_array_length(b->'selections')<>5 then raise exception 'Kies vijf opties.' using errcode='23514'; end if;
   if publishing and exists(select 1 from jsonb_array_elements(b->'selections') x where x='null'::jsonb) then raise exception 'Kies alle vijf spelers.' using errcode='23514'; end if;
   if (select count(*) from jsonb_array_elements(b->'selections') x where x<>'null'::jsonb)<>(select count(distinct x->>'id') from jsonb_array_elements(b->'selections') x where x<>'null'::jsonb) then raise exception 'Dubbele speler.' using errcode='23514'; end if;
   if publishing and (b->'snapshot' is null or b->'snapshot'='null') then raise exception 'Bereid kandidaten voor.' using errcode='23514'; end if;
   if b->'snapshot' is not null and b->'snapshot'<>'null' then
    if jsonb_typeof(b->'snapshot') is distinct from 'object' or b#>>'{snapshot,subtype}' is distinct from b->>'subtype' or b#>>'{snapshot,season}' is distinct from b->>'season' or b#>>'{snapshot,startRound}' is distinct from b->>'startRound' or b#>>'{snapshot,horizon}' is distinct from b->>'horizon' or jsonb_typeof(b#>'{snapshot,candidates}') is distinct from 'array' then raise exception 'Verouderde adviesinstellingen.' using errcode='23514'; end if;
    if jsonb_array_length(b#>'{snapshot,candidates}')>10 then raise exception 'Maximaal tien kandidaten.' using errcode='23514'; end if;
   end if;
   for i in select value from jsonb_array_elements((b->'selections')||coalesce(b#>'{snapshot,candidates}','[]'::jsonb)) where value<>'null'::jsonb loop
    if jsonb_typeof(i) is distinct from 'object' or coalesce(i->>'id','')!~'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$' or jsonb_typeof(i->'name') is distinct from 'string' or jsonb_typeof(i->'club') is distinct from 'string' or jsonb_typeof(i->'matches') is distinct from 'array' then raise exception 'Ongeldige spelerdata.' using errcode='23514'; end if;
    if jsonb_array_length(i->'matches')>15 then raise exception 'Te veel wedstrijden.' using errcode='23514'; end if;
    foreach source_text in array array['price','expectedPoints','formScore','ownership','score'] loop
     if jsonb_typeof(i->source_text) is distinct from 'number' and jsonb_typeof(i->source_text) is distinct from 'null' then raise exception 'Ongeldige spelerstatistiek.' using errcode='23514'; end if;
    end loop;
   end loop;
   foreach source_text in array array['analyses','risks'] loop
    if jsonb_typeof(b->source_text) is distinct from 'object' then raise exception 'Ongeldige redactionele tekst.' using errcode='23514'; end if;
    for i in select value from jsonb_each(b->source_text) loop if jsonb_typeof(i) is distinct from 'string' or length(i#>>'{}')>10000 then raise exception 'Ongeldige redactionele tekst.' using errcode='23514'; end if; end loop;
   end loop;
  end if;
  if b->>'type'='fiveAhead' then
   if coalesce(b->>'season','')!~'^[0-9]{4}/[0-9]{4}$' or coalesce(b->>'startRound','')!~'^[0-9]{1,2}$' or (b->>'startRound')::integer not between 1 and 38 or coalesce(b->>'category','') not in ('top3','europe','challengers','midfield','relegation','promoted') then raise exception 'Ongeldige 5 Vooruit-instellingen.' using errcode='23514'; end if;
   if publishing and (b->'snapshot' is null or b->'snapshot'='null') then raise exception 'Bereid de clubschema�s voor.' using errcode='23514'; end if;
   if b->'snapshot' is not null and b->'snapshot'<>'null' then
    if jsonb_typeof(b->'snapshot') is distinct from 'object' or b#>>'{snapshot,horizon}' is distinct from '5' or b#>>'{snapshot,season}' is distinct from b->>'season' or b#>>'{snapshot,startRound}' is distinct from b->>'startRound' or jsonb_typeof(b#>'{snapshot,clubs}') is distinct from 'object' then raise exception 'Ongeldige clubschema�s.' using errcode='23514'; end if;
    if (select count(*) from jsonb_object_keys(b#>'{snapshot,clubs}')) not between 3 and 18 then raise exception 'Ongeldig aantal clubs.' using errcode='23514'; end if;
    for i in select value from jsonb_each(b#>'{snapshot,clubs}') loop
     if jsonb_typeof(i->'matches') is distinct from 'array' or jsonb_typeof(i->'context') is distinct from 'array' then raise exception 'Ongeldige wedstrijdlijst.' using errcode='23514'; end if;
     if jsonb_array_length(i->'matches')>5 or (publishing and jsonb_array_length(i->'matches')<>5) or jsonb_array_length(i->'context')>30 then raise exception 'Vijf Eredivisiewedstrijden per club vereist.' using errcode='23514'; end if;
    end loop;
   end if;
   if b ? 'analyses' and jsonb_typeof(b->'analyses') is distinct from 'object' then raise exception 'Ongeldige clubteksten.' using errcode='23514'; end if;
  end if;
  if b ? 'layout' and (b->>'type' not in ('image','imageCarousel') or coalesce(b->>'layout','') not in ('normal','wide','left','right','data')) then raise exception 'Invalid media layout' using errcode='23514'; end if;
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
