-- Explicit defense-in-depth denial. Only server_role's existing BYPASSRLS and
-- the narrow, non-exposed aggregate functions access the private tables.
create policy news_view_totals_client_deny on private.news_view_totals as restrictive for all to anon,authenticated using(false) with check(false);
create policy news_view_sessions_client_deny on private.news_view_sessions as restrictive for all to anon,authenticated using(false) with check(false);

-- Match the platform's established private implementation / public invoker pattern.
alter function public.article_view_total(uuid) set schema private;
create function public.article_view_total(article uuid) returns bigint
language sql stable security invoker set search_path='' as $$select private.article_view_total(article)$$;
revoke all on function public.article_view_total(uuid) from public;
grant execute on function public.article_view_total(uuid) to anon,authenticated,service_role;

alter function public.article_view_statistics(uuid[]) set schema private;
create function public.article_view_statistics(articles uuid[]) returns table(article_id uuid,total_views bigint,unique_views bigint,last_view_at timestamptz)
language sql stable security invoker set search_path='' as $$select * from private.article_view_statistics(articles)$$;
revoke all on function public.article_view_statistics(uuid[]) from public,anon;
grant execute on function public.article_view_statistics(uuid[]) to authenticated;
