-- FVT only: public discussion and editorial content; private Studio data stays private.
create table public.forum_categories (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(btrim(name)) between 2 and 80),
 description text not null default '' check(length(description)<=300), position integer not null default 0,
 created_at timestamptz not null default now()
);
create table public.forum_topics (
 id uuid primary key default gen_random_uuid(), category_id uuid not null references public.forum_categories(id),
 user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 author_name text not null default '', title text not null check(length(btrim(title)) between 3 and 160),
 body text not null check(length(btrim(body)) between 3 and 12000),
 pinned boolean not null default false, closed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 last_activity_at timestamptz not null default now()
);
create index forum_topics_category_activity on public.forum_topics(category_id,last_activity_at desc);
create index forum_topics_owner on public.forum_topics(user_id);
create index forum_topics_activity on public.forum_topics(pinned desc,last_activity_at desc);
create table public.forum_posts (
 id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.forum_topics(id) on delete cascade,
 user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 author_name text not null default '', body text not null check(length(btrim(body)) between 1 and 12000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index forum_posts_topic_time on public.forum_posts(topic_id,created_at);
create index forum_posts_owner on public.forum_posts(user_id);
create table public.news_categories (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(btrim(name)) between 2 and 80),
 created_at timestamptz not null default now()
);
create table public.news_articles (
 id uuid primary key default gen_random_uuid(), category_id uuid references public.news_categories(id),
 author_id uuid not null default auth.uid() references public.profiles(id), author_name text not null default '',
 title text not null check(length(btrim(title)) between 3 and 180), slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=180),
 intro text not null default '' check(length(intro)<=600), body text not null default '' check(length(body)<=80000),
 image_url text not null default '' check(image_url='' or (image_url ~ '^https://' and length(image_url)<=2000)),
 image_alt text not null default '' check(length(image_alt)<=250), tags text[] not null default '{}' check(cardinality(tags)<=12 and length(tags::text)<=1000),
 status text not null default 'draft' check(status in ('draft','published')), published_at timestamptz,
 related_player_ids text[] not null default '{}' check(cardinality(related_player_ids)<=20),
 related_fixture_ids text[] not null default '{}' check(cardinality(related_fixture_ids)<=20),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status='draft' or (published_at is not null and length(btrim(body))>=20 and length(btrim(intro))>=10))
);
create index news_articles_publication on public.news_articles(status,published_at desc);
create index news_articles_category on public.news_articles(category_id);
create index news_articles_author on public.news_articles(author_id);

-- Server-enforced write limits survive deletions and serialize concurrent requests.
create table private.forum_write_limits(user_id uuid primary key references public.profiles(id) on delete cascade, window_start timestamptz not null, writes integer not null, last_write timestamptz not null);
alter table private.forum_write_limits enable row level security;
revoke all on private.forum_write_limits from public,anon,authenticated;
create function private.prepare_forum_write() returns trigger language plpgsql security definer set search_path='' as $$
declare stamp timestamptz := clock_timestamp(); lim private.forum_write_limits; actor uuid := auth.uid();
begin
 if actor is null then raise insufficient_privilege; end if;
 if tg_op='INSERT' then
  if new.user_id<>actor then raise insufficient_privilege; end if;
  insert into private.forum_write_limits values(actor,stamp,0,stamp-interval '3 seconds') on conflict do nothing;
  select * into lim from private.forum_write_limits where user_id=actor for update;
  if stamp-lim.last_write<interval '2 seconds' then raise exception 'Wacht twee seconden voordat je weer plaatst.' using errcode='P0001'; end if;
  if stamp-lim.window_start<interval '1 hour' and lim.writes>=60 then raise exception 'Maximaal 60 berichten per uur. Probeer het later opnieuw.' using errcode='P0001'; end if;
  update private.forum_write_limits set writes=case when stamp-lim.window_start>=interval '1 hour' then 1 else writes+1 end,window_start=case when stamp-lim.window_start>=interval '1 hour' then stamp else window_start end,last_write=stamp where user_id=actor;
  select coalesce(nullif(btrim(display_name),''),'FVT-lid') into new.author_name from public.profiles where id=actor;
  new.created_at=stamp;
 end if;
 if tg_table_name='forum_posts' then
  if exists(select 1 from public.forum_topics where id=new.topic_id and closed) and not private.is_editor() then raise exception 'Dit topic is gesloten.'; end if;
 end if;
 new.updated_at=stamp;
 return new;
end $$;
revoke all on function private.prepare_forum_write() from public,anon,authenticated;
create trigger prepare_forum_topic before insert or update of title,body,category_id on public.forum_topics for each row execute function private.prepare_forum_write();
create trigger prepare_forum_post before insert or update of body on public.forum_posts for each row execute function private.prepare_forum_write();
create function private.forum_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 update public.forum_topics set last_activity_at=clock_timestamp() where id=new.topic_id;
 return new;
end $$;
revoke all on function private.forum_activity() from public,anon,authenticated;
create trigger forum_activity after insert on public.forum_posts for each row execute function private.forum_activity();
create function private.content_author_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_editor() then raise insufficient_privilege; end if;
 select coalesce(nullif(btrim(display_name),''),'FVT-redactie') into new.author_name from public.profiles where id=new.author_id;
 if new.author_name is null then raise exception 'Onbekende auteur'; end if;
 new.updated_at=clock_timestamp();
 return new;
end $$;
revoke all on function private.content_author_name() from public,anon,authenticated;
create trigger content_author before insert or update on public.news_articles for each row execute function private.content_author_name();
create function private.refresh_content_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is distinct from new.id then return new; end if;
 update public.forum_topics set author_name=coalesce(nullif(btrim(new.display_name),''),'FVT-lid') where user_id=new.id;
 update public.forum_posts set author_name=coalesce(nullif(btrim(new.display_name),''),'FVT-lid') where user_id=new.id;
 return new;
end $$;
revoke all on function private.refresh_content_name() from public,anon,authenticated;
create trigger refresh_content_name after update of display_name on public.profiles for each row execute function private.refresh_content_name();

do $$ declare t text; begin
 foreach t in array array['forum_categories','forum_topics','forum_posts','news_categories','news_articles'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to anon,authenticated',t);
 end loop;
 foreach t in array array['forum_categories','news_categories'] loop
  execute format('create policy public_read on public.%I for select to anon,authenticated using(true)',t);
  execute format('grant insert,update,delete on public.%I to authenticated',t);
  execute format('create policy editorial_manage on public.%I for all to authenticated using((select private.is_editor())) with check((select private.is_editor()))',t);
 end loop;
 foreach t in array array['forum_topics','forum_posts'] loop
  execute format('create policy public_read on public.%I for select to anon,authenticated using(true)',t);
  execute format('create policy owner_insert on public.%I for insert to authenticated with check(user_id=(select auth.uid()))',t);
  execute format('create policy owner_update on public.%I for update to authenticated using(user_id=(select auth.uid()) or (select private.is_editor())) with check(user_id=(select auth.uid()) or (select private.is_editor()))',t);
  execute format('create policy owner_delete on public.%I for delete to authenticated using(user_id=(select auth.uid()) or (select private.is_editor()))',t);
  execute format('grant delete on public.%I to authenticated',t);
 end loop;
end $$;
grant insert(category_id,title,body) on public.forum_topics to authenticated;
grant update(category_id,title,body) on public.forum_topics to authenticated;
grant insert(topic_id,body) on public.forum_posts to authenticated;
grant update(body) on public.forum_posts to authenticated;
grant insert(category_id,author_id,title,slug,intro,body,image_url,image_alt,tags,status,published_at,related_player_ids,related_fixture_ids) on public.news_articles to authenticated;
grant update(category_id,author_id,title,slug,intro,body,image_url,image_alt,tags,status,published_at,related_player_ids,related_fixture_ids),delete on public.news_articles to authenticated;
create policy published_read on public.news_articles for select to anon,authenticated using(status='published' and published_at<=now());
create policy editorial_read on public.news_articles for select to authenticated using((select private.is_editor()));
create policy editorial_insert on public.news_articles for insert to authenticated with check((select private.is_editor()));
create policy editorial_update on public.news_articles for update to authenticated using((select private.is_editor())) with check((select private.is_editor()));
create policy editorial_delete on public.news_articles for delete to authenticated using((select private.is_editor()));

-- Invoker preserves RLS; moderation columns cannot be changed via direct table writes.
create function private.moderate_forum_topic(topic uuid, is_pinned boolean, is_closed boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_editor() then raise insufficient_privilege; end if;
 update public.forum_topics set pinned=is_pinned,closed=is_closed where id=topic;
end $$;
revoke all on function private.moderate_forum_topic(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function private.moderate_forum_topic(uuid,boolean,boolean) to authenticated;
create function public.moderate_forum_topic(topic uuid, is_pinned boolean, is_closed boolean) returns void language sql security invoker set search_path='' as $$ select private.moderate_forum_topic(topic,is_pinned,is_closed) $$;
revoke all on function public.moderate_forum_topic(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.moderate_forum_topic(uuid,boolean,boolean) to authenticated;

insert into public.forum_categories(name,position) values ('Algemeen Fantasy',1),('Mijn selectie',2),('Transfers & Wildcards',3),('Captainkeuze',4),('Speelronde-discussie',5),('FVT-video’s',6),('Off-topic voetbal',7);
insert into public.news_categories(name) values ('FVT'),('Speelronde'),('Transfers'),('Captainkeuze');
