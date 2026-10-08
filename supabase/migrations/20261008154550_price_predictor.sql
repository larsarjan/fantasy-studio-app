-- All writes are server-only. Immutable historical rows use exact source time.
create table public.price_snapshots (
 season text not null, player_id integer not null, captured_at timestamptz not null,
 gameweek smallint not null, price smallint not null check(price>=0), ownership numeric(5,2) not null,
 transfers_in integer not null, transfers_out integer not null,
 transfers_in_event integer not null, transfers_out_event integer not null,
 net_transfers integer generated always as (transfers_in-transfers_out) stored,
 primary key(season,player_id,captured_at)
);
create index price_snapshots_time on public.price_snapshots(captured_at);
create index price_snapshots_round on public.price_snapshots(season,gameweek,captured_at);
create table public.price_change_events (
 season text not null,player_id integer not null,detected_at timestamptz not null,
 gameweek smallint not null,direction text not null check(direction in ('rise','fall')),
 model_version text not null,data jsonb not null,
 primary key(season,player_id,detected_at)
);
create index price_changes_time on public.price_change_events(season,detected_at desc);
create index price_changes_round on public.price_change_events(season,gameweek,detected_at desc);
create table public.price_predictions (
 season text not null,player_id integer not null,predicted_at timestamptz not null,
 model_version text not null,origin text not null check(origin in ('live','backtest')),data jsonb not null,
 primary key(season,player_id,predicted_at,origin)
);
create index price_predictions_time on public.price_predictions(predicted_at);
create index price_predictions_model on public.price_predictions(model_version,origin,predicted_at);
create table public.price_model_evaluations (
 season text not null,window_start timestamptz not null,origin text not null check(origin in ('live','backtest')),
 model_version text not null,data jsonb not null,primary key(season,window_start,origin)
);
create index price_evaluations_model on public.price_model_evaluations(model_version,window_start);
create table public.price_model_calibration (
 season text primary key,state jsonb not null,updated_at timestamptz not null
);
create table public.price_current (
 season text primary key,data jsonb not null,updated_at timestamptz not null
);
do $$declare t text;begin
 foreach t in array array['price_snapshots','price_change_events','price_predictions','price_model_evaluations','price_model_calibration','price_current'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant all on public.%I to service_role',t); end if;
 end loop;
end$$;
grant select on public.price_current,public.price_change_events,public.price_model_evaluations to anon,authenticated;
create policy price_current_read on public.price_current for select to anon,authenticated using(true);
create policy price_changes_read on public.price_change_events for select to anon,authenticated using(true);
create policy price_evaluations_read on public.price_model_evaluations for select to anon,authenticated using(true);

create function public.price_commit(payload jsonb,expected_at timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current_at timestamptz; ns integer;ne integer;np integer; season_key text:=payload->>'season';
begin
 perform pg_advisory_xact_lock(hashtext('price_predictor'));
 if jsonb_array_length(coalesce(payload->'snapshots','[]'))>10000 then raise exception 'Batch too large';end if;
 if payload ? 'state' then
 select updated_at into current_at from public.price_model_calibration where season=season_key for update;
 if current_at is distinct from expected_at then raise exception 'Price state version conflict' using errcode='40001';end if;
 if current_at is not null and (payload->'state'->>'last_at')::timestamptz<=current_at then raise exception 'Price state cannot move backwards';end if;
 end if;
 insert into public.price_snapshots(season,player_id,captured_at,gameweek,price,ownership,transfers_in,transfers_out,transfers_in_event,transfers_out_event)
 select season_key,s.player_id,s.captured_at,s.gameweek,s.price,s.ownership,s.transfers_in,s.transfers_out,s.transfers_in_event,s.transfers_out_event
 from jsonb_to_recordset(coalesce(payload->'snapshots','[]')) as s(player_id integer,captured_at timestamptz,gameweek smallint,price smallint,ownership numeric,transfers_in integer,transfers_out integer,transfers_in_event integer,transfers_out_event integer)
 on conflict do nothing;get diagnostics ns=row_count;
 insert into public.price_change_events select season_key,(e->>'player_id')::integer,(e->>'detected_at')::timestamptz,(e->>'gameweek')::smallint,e->>'direction',e->>'model_version',e from jsonb_array_elements(coalesce(payload->'events','[]')) e on conflict do nothing;get diagnostics ne=row_count;
 insert into public.price_predictions select season_key,(p->>'player_id')::integer,(p->>'predicted_at')::timestamptz,p->>'model_version',p->>'origin',p from jsonb_array_elements(coalesce(payload->'predictions','[]')) p on conflict do nothing;get diagnostics np=row_count;
 insert into public.price_model_evaluations select season_key,(e->>'window_start')::timestamptz,e->>'origin',e->>'model_version',e from jsonb_array_elements(coalesce(payload->'evaluations','[]')) e on conflict do nothing;
 if payload ? 'state' then
 insert into public.price_model_calibration values(season_key,payload->'state',(payload->'state'->>'last_at')::timestamptz) on conflict(season)do update set state=excluded.state,updated_at=excluded.updated_at;
 insert into public.price_current values(season_key,payload->'current',(payload->'state'->>'last_at')::timestamptz) on conflict(season)do update set data=excluded.data,updated_at=excluded.updated_at;
 end if;
 return jsonb_build_object('snapshots',ns,'events',ne,'predictions',np);
end$$;
revoke all on function public.price_commit(jsonb,timestamptz) from public,anon,authenticated;
do $$begin if exists(select 1 from pg_roles where rolname='service_role')then grant execute on function public.price_commit(jsonb,timestamptz) to service_role;end if;end$$;

-- Exact event source/reset/before/after observations are embedded permanently in
-- price_change_events. Retention removes only redundant raw sampling resolution.
create function public.price_retention() returns void language plpgsql security invoker set search_path='' as $$
begin
 delete from public.price_snapshots s using (
 select season,player_id,captured_at,row_number()over(partition by season,player_id,
 case when captured_at<now()-interval '30 days' then date_trunc('day',captured_at) else date_trunc('hour',captured_at) end order by captured_at desc) n
 from public.price_snapshots where captured_at<now()-interval '7 days'
 ) old where old.n>1 and (s.season,s.player_id,s.captured_at)=(old.season,old.player_id,old.captured_at)
 and not exists(select 1 from public.price_change_events e where e.season=s.season and e.player_id=s.player_id and (s.captured_at=e.detected_at or s.captured_at=(e.data->>'previous_seen_at')::timestamptz or s.captured_at=(e.data->'reset'->>'captured_at')::timestamptz));
 delete from public.price_predictions p using (
 select season,player_id,predicted_at,origin,row_number()over(partition by season,player_id,origin,date_trunc('day',predicted_at) order by predicted_at desc) n
 from public.price_predictions where predicted_at<now()-interval '7 days'
 ) old where old.n>1 and (p.season,p.player_id,p.predicted_at,p.origin)=(old.season,old.player_id,old.predicted_at,old.origin)
 and not exists(select 1 from public.price_change_events e where e.season=p.season and e.player_id=p.player_id and p.predicted_at=(e.data->'prediction'->>'predicted_at')::timestamptz);
end$$;
revoke all on function public.price_retention() from public,anon,authenticated;
do $$begin if exists(select 1 from pg_roles where rolname='service_role')then grant execute on function public.price_retention() to service_role;end if;end$$;
