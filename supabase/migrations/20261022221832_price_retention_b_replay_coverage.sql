-- Scenario B: compact historical storage remains lossless for replay/research.
-- No public access, no new cron/trigger. Existing price_retention entrypoint.
create table public.price_snapshot_coverage (
 season text not null,player_id integer not null,observation_day date not null,
 observations jsonb not null check(jsonb_typeof(observations)='array'),
 primary key(season,player_id,observation_day)
);
create table public.price_prediction_archive (
 season text not null,player_id integer not null,observation_day date not null,
 model_version text not null,origin text not null,
 predictions jsonb not null check(jsonb_typeof(predictions)='array'),
 primary key(season,player_id,observation_day,model_version,origin)
);
create table public.price_retention_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 checkpoint jsonb
);
insert into public.price_retention_control(singleton) values(true);
do $$declare t text;begin
 foreach t in array array['price_snapshot_coverage','price_prediction_archive','price_retention_control'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end$$;
create view public.price_replay_snapshots with(security_invoker=true) as
 select * from public.price_snapshots
 union all
 select c.season,c.player_id,x.captured_at,x.gameweek,x.price,x.ownership,
 x.transfers_in,x.transfers_out,x.transfers_in_event,x.transfers_out_event,
 x.transfers_in-x.transfers_out as net_transfers
 from public.price_snapshot_coverage c
 cross join lateral jsonb_to_recordset(c.observations) as x(
 captured_at timestamptz,gameweek smallint,price smallint,ownership numeric(5,2),
 transfers_in integer,transfers_out integer,transfers_in_event integer,transfers_out_event integer)
 where not exists(select 1 from public.price_snapshots s where
 (s.season,s.player_id,s.captured_at)=(c.season,c.player_id,x.captured_at));
revoke all on public.price_replay_snapshots from public,anon,authenticated;
grant select on public.price_replay_snapshots to service_role;

create or replace function public.price_retention() returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not (select enabled from public.price_retention_control where singleton) then return;end if;
 -- Do not queue behind live collection. Shared with price_commit.
 if not pg_try_advisory_xact_lock(hashtext('price_predictor')) then return;end if;
 update public.price_retention_control set checkpoint=jsonb_build_object(
 'captured_at',now(),'strategy','B','code_version','empirical-window-v2.1',
 'calibration',(select jsonb_agg(to_jsonb(c)) from public.price_model_calibration c),
 'current',(select jsonb_agg(to_jsonb(c)) from public.price_current c))
 where singleton and checkpoint is null;

 with base as materialized(
 select s.*,
 lag(row(price,ownership,transfers_in,transfers_out,transfers_in_event,transfers_out_event,gameweek))over w prev,
 lead(row(price,ownership,transfers_in,transfers_out,transfers_in_event,transfers_out_event,gameweek))over w nxt,
 row_number()over(partition by season,player_id,(captured_at at time zone 'UTC')::date order by captured_at desc) daily
 from public.price_snapshots s
 window w as(partition by season,player_id order by captured_at)
 ), ev as(
 select season,player_id,range_agg(tstzrange(detected_at-interval '24 hours',detected_at+interval '6 hours','[]')) windows
 from public.price_change_events group by season,player_id
 ), pinned as(
 select season,player_id,detected_at at from public.price_change_events
 union select season,player_id,(data->>'previous_seen_at')::timestamptz from public.price_change_events
 union select season,player_id,(data->'reset'->>'captured_at')::timestamptz from public.price_change_events
 ), candidates as(
 select s.season,s.player_id,s.captured_at from base s
 left join ev using(season,player_id)
 left join pinned p on (p.season,p.player_id,p.at)=(s.season,s.player_id,s.captured_at)
 where s.captured_at<now()-interval '72 hours' and s.daily<>1 and p.at is null
 and not coalesce(ev.windows @> s.captured_at,false)
 and not ((s.captured_at at time zone 'UTC')::time between time '01:30' and time '03:00')
 and row(s.price,s.ownership,s.transfers_in,s.transfers_out,s.transfers_in_event,s.transfers_out_event,s.gameweek) is not distinct from s.prev
 and row(s.price,s.ownership,s.transfers_in,s.transfers_out,s.transfers_in_event,s.transfers_out_event,s.gameweek) is not distinct from s.nxt
 order by s.captured_at,s.player_id limit 20000
 ), removed as(
 delete from public.price_snapshots s using candidates c
 where (s.season,s.player_id,s.captured_at)=(c.season,c.player_id,c.captured_at) returning s.*
 )
 insert into public.price_snapshot_coverage as old(season,player_id,observation_day,observations)
 select season,player_id,(captured_at at time zone 'UTC')::date,
 jsonb_agg(to_jsonb(r)-'season'-'player_id'-'net_transfers' order by captured_at)
 from removed r group by season,player_id,(captured_at at time zone 'UTC')::date
 on conflict(season,player_id,observation_day) do update set observations=(
 select jsonb_agg(v order by v->>'captured_at')
 from (select distinct on (v->>'captured_at') v from jsonb_array_elements(excluded.observations||old.observations) v order by v->>'captured_at') dedup
 );

 with base as materialized(
 select p.*,
 (data->>'price_pressure_percentage')::numeric pressure,data->>'direction' direction,
 lag((data->>'price_pressure_percentage')::numeric)over w prev_pressure,
 lead((data->>'price_pressure_percentage')::numeric)over w next_pressure,
 lag(data->>'direction')over w prev_direction,lead(data->>'direction')over w next_direction,
 row_number()over(partition by season,player_id,model_version,origin,(predicted_at at time zone 'UTC')::date order by
 case when (predicted_at at time zone 'UTC')::time<time '02:30' then 0 else 1 end,predicted_at desc) daily
 from public.price_predictions p window w as(partition by season,player_id,model_version,origin order by predicted_at)
 ), pinned as(
 select distinct season,player_id,(data->'prediction'->>'predicted_at')::timestamptz at,
 data->'prediction'->>'model_version' model_version from public.price_change_events
 where data->'prediction'->>'predicted_at' is not null
 ), candidates as(
 select b.season,b.player_id,b.predicted_at,b.model_version,b.origin from base b
 left join pinned p on (p.season,p.player_id,p.at,p.model_version)=(b.season,b.player_id,b.predicted_at,b.model_version)
 where b.predicted_at<now()-interval '72 hours' and b.daily<>1 and p.at is null
 and b.direction is not distinct from b.prev_direction and b.direction is not distinct from b.next_direction
 and (b.pressure>=100) is not distinct from (b.prev_pressure>=100)
 and (b.pressure>=100) is not distinct from (b.next_pressure>=100)
 order by b.predicted_at,b.player_id limit 20000
 ), removed as(
 delete from public.price_predictions p using candidates c
 where (p.season,p.player_id,p.predicted_at,p.model_version,p.origin)=(c.season,c.player_id,c.predicted_at,c.model_version,c.origin) returning p.*
 )
 insert into public.price_prediction_archive as old(season,player_id,observation_day,model_version,origin,predictions)
 select season,player_id,(predicted_at at time zone 'UTC')::date,model_version,origin,
 jsonb_agg(jsonb_build_object('predicted_at',predicted_at,'data',data) order by predicted_at)
 from removed group by season,player_id,(predicted_at at time zone 'UTC')::date,model_version,origin
 on conflict(season,player_id,observation_day,model_version,origin) do update set predictions=(
 select jsonb_agg(v order by v->>'predicted_at')
 from (select distinct on (v->>'predicted_at') v from jsonb_array_elements(excluded.predictions||old.predictions) v order by v->>'predicted_at') dedup
 );
end$$;
revoke all on function public.price_retention() from public,anon,authenticated;
grant execute on function public.price_retention() to service_role;

