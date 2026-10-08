-- Materialize protected timestamps once instead of a correlated JSON scan per
-- snapshot. Limit each pass; hourly scheduling spreads work across the day.
create or replace function public.price_retention() returns void language plpgsql security invoker set search_path='' as $$
begin
 with protected as materialized (
 select season,player_id,detected_at at from public.price_change_events union
 select season,player_id,(data->>'previous_seen_at')::timestamptz from public.price_change_events union
 select season,player_id,(data->'reset'->>'captured_at')::timestamptz from public.price_change_events
 ), ranked as materialized (
 select season,player_id,captured_at,row_number()over(partition by season,player_id,
 case when captured_at<now()-interval '30 days' then date_trunc('day',captured_at) else date_trunc('hour',captured_at) end order by captured_at desc) n
 from public.price_snapshots where captured_at<now()-interval '7 days'
 ), removable as (
 select r.season,r.player_id,r.captured_at from ranked r left join protected p on (p.season,p.player_id,p.at)=(r.season,r.player_id,r.captured_at)
 where r.n>1 and p.at is null limit 20000
 ) delete from public.price_snapshots s using removable r where (s.season,s.player_id,s.captured_at)=(r.season,r.player_id,r.captured_at);
 with protected as materialized (
 select season,player_id,(data->'prediction'->>'predicted_at')::timestamptz at from public.price_change_events where data->'prediction'->>'predicted_at' is not null
 ), ranked as materialized (
 select season,player_id,predicted_at,origin,row_number()over(partition by season,player_id,origin,date_trunc('day',predicted_at) order by predicted_at desc) n
 from public.price_predictions where predicted_at<now()-interval '7 days'
 ), removable as (
 select r.season,r.player_id,r.predicted_at,r.origin from ranked r left join protected p on (p.season,p.player_id,p.at)=(r.season,r.player_id,r.predicted_at)
 where r.n>1 and p.at is null limit 20000
 ) delete from public.price_predictions p using removable r where (p.season,p.player_id,p.predicted_at,p.origin)=(r.season,r.player_id,r.predicted_at,r.origin);
end$$;
do $$begin if exists(select 1 from pg_available_extensions where name='pg_cron')then perform cron.schedule('fantasy-studio-prices-retention','15 * * * *','select public.price_retention()');end if;end$$;
