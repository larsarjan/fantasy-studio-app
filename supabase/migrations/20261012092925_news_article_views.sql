-- First-party article views. No changes to articles, content/RBAC policies or Storage.
create table private.news_view_totals (
 article_id uuid primary key references public.news_articles(id) on delete cascade,
 total_views bigint not null default 0 check(total_views>=0),
 unique_views bigint not null default 0 check(unique_views>=0 and unique_views<=total_views),
 last_view_at timestamptz
);
create table private.news_view_sessions (
 article_id uuid not null references public.news_articles(id) on delete cascade,
 session_hash text not null check(session_hash ~ '^[0-9a-f]{64}$'),
 last_counted_at timestamptz not null,
 expires_at timestamptz not null,
 primary key(article_id,session_hash)
);
create index news_view_sessions_expiry on private.news_view_sessions(expires_at);
alter table private.news_view_totals enable row level security;
alter table private.news_view_sessions enable row level security;
revoke all on private.news_view_totals,private.news_view_sessions from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.feature_access(text) to service_role;
grant select,insert,update,delete on private.news_view_totals,private.news_view_sessions to service_role;

-- Read-only public projection. Unique counts and session hashes never leave private tables.
create function public.article_view_total(article uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce(t.total_views,0) from public.news_articles a
 left join private.news_view_totals t on t.article_id=a.id
 where a.id=article and a.status='published' and a.published_at<=now()
  and private.feature_access('news')
$$;
revoke all on function public.article_view_total(uuid) from public;
grant execute on function public.article_view_total(uuid) to anon,authenticated,service_role;

-- Caller is the Vercel server, never the browser. Row locking serializes concurrent
-- registrations per article so a refresh/remount cannot win a race to count twice.
create function public.record_article_view(article uuid, visitor_hash text, session_expires_at timestamptz) returns bigint
language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); previous timestamptz; total bigint; fresh boolean;
begin
 if visitor_hash is null or visitor_hash!~'^[0-9a-f]{64}$' or session_expires_at is null
  or session_expires_at<=stamp or session_expires_at>stamp+interval '25 hours' then
  raise exception 'Invalid view session' using errcode='22023';
 end if;
 perform 1 from public.news_articles a where a.id=article and a.status='published'
  and a.published_at<=stamp and private.feature_access('news') for share;
 if not found then return null; end if;
 insert into private.news_view_totals(article_id) values(article) on conflict do nothing;
 select total_views into total from private.news_view_totals where article_id=article for update;
 select last_counted_at into previous from private.news_view_sessions where article_id=article and session_hash=visitor_hash;
 fresh:=not found;
 if fresh then
  insert into private.news_view_sessions(article_id,session_hash,last_counted_at,expires_at)
   values(article,visitor_hash,stamp,session_expires_at);
 elsif previous>stamp-interval '30 minutes' then return total;
 else
  update private.news_view_sessions set last_counted_at=stamp where article_id=article and session_hash=visitor_hash;
 end if;
 update private.news_view_totals set total_views=total_views+1,
  unique_views=unique_views+case when fresh then 1 else 0 end,last_view_at=stamp
  where article_id=article returning total_views into total;
 return total;
end $$;
revoke all on function public.record_article_view(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_article_view(uuid,text,timestamptz) to service_role;

create function public.article_view_statistics(articles uuid[]) returns table(article_id uuid,total_views bigint,unique_views bigint,last_view_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.has_permission('articles.read') then raise insufficient_privilege; end if;
 if coalesce(cardinality(articles),0)>50 then raise exception 'At most 50 articles' using errcode='22023'; end if;
 return query select a.id,coalesce(t.total_views,0),coalesce(t.unique_views,0),t.last_view_at
  from public.news_articles a left join private.news_view_totals t on t.article_id=a.id where a.id=any(articles);
end $$;
revoke all on function public.article_view_statistics(uuid[]) from public,anon;
grant execute on function public.article_view_statistics(uuid[]) to authenticated;

-- Sessions expire after at most 24 hours. Daily removal bounds hash retention to
-- less than 48 hours; aggregate counters contain no visitor identifiers.
do $$begin
 if to_regnamespace('cron') is not null then
  perform cron.schedule('news-view-session-retention','17 2 * * *',
   'delete from private.news_view_sessions where expires_at < now()');
 end if;
end $$;
