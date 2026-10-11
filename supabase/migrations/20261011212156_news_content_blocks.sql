-- Optional, versioned editorial content. Legacy body and all existing policies remain intact.
alter table public.news_articles add column content_blocks jsonb;
grant insert(content_blocks),update(content_blocks) on public.news_articles to authenticated;

create function private.validate_news_blocks() returns trigger
language plpgsql set search_path='' as $$
declare c jsonb:=new.content_blocks; b jsonb; i jsonb; images jsonb; ids text[]:='{}'; plain text:=''; publishing boolean:=new.status in ('published','scheduled');
begin
 if c is null then return new; end if;
 if jsonb_typeof(c)<>'object' or c->>'version' is distinct from '1' or jsonb_typeof(c->'blocks') is distinct from 'array' or octet_length(c::text)>250000 then
  raise exception 'Ongeldige blokinhoud of artikel te groot.' using errcode='23514';
 end if;
 if jsonb_array_length(c->'blocks')>80 then raise exception 'Maximaal 80 blokken.' using errcode='23514'; end if;
 for b in select value from jsonb_array_elements(c->'blocks') loop
  if jsonb_typeof(b)<>'object' or coalesce(b->>'id','')!~'^[a-zA-Z0-9_-]{1,80}$' or b->>'id'=any(ids) or coalesce(b->>'type','') not in ('paragraph','heading','image','imageCarousel','quote','list') then raise exception 'Ongeldig of dubbel blok.' using errcode='23514'; end if;
  ids:=array_append(ids,b->>'id');
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
revoke all on function private.validate_news_blocks() from public,anon,authenticated;
create trigger validate_news_content_blocks before insert or update on public.news_articles for each row execute function private.validate_news_blocks();

-- Includes references in private drafts too. This privileged lookup exposes only a boolean,
-- and retains the existing identity/permission checks; no content is exposed by it.
create or replace function private.news_image_unreferenced(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
  and (private.has_permission('articles.create') or private.has_permission('articles.edit'))
  and not exists (
   select 1 from public.news_articles a where
    right(split_part(a.image_url,'?',1),length(object_name)+length('/news-images/'))='/news-images/'||object_name
    or exists (select 1 from jsonb_path_query(coalesce(a.content_blocks,'{}'::jsonb),'$.blocks[*].**.url') u(url)
     where right(split_part(u.url#>>'{}','?',1),length(object_name)+length('/news-images/'))='/news-images/'||object_name)
  )
$$;
revoke all on function private.news_image_unreferenced(text) from public,anon;
grant execute on function private.news_image_unreferenced(text) to authenticated;
comment on column public.news_articles.content_blocks is 'Optional {version:1,blocks:[...]} content; null renders the preserved legacy body.';
