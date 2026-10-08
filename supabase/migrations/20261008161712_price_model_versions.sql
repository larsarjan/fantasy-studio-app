-- Keep v1 and v2 forecasts/evaluations side by side; actual events are immutable.
alter table public.price_predictions drop constraint price_predictions_pkey;
alter table public.price_predictions add primary key(season,player_id,predicted_at,origin,model_version);
alter table public.price_model_evaluations drop constraint price_model_evaluations_pkey;
alter table public.price_model_evaluations add primary key(season,window_start,origin,model_version);
create table public.price_event_backtests (
 season text not null,player_id integer not null,detected_at timestamptz not null,model_version text not null,
 prediction jsonb,correct boolean,
 primary key(season,player_id,detected_at,model_version),
 foreign key(season,player_id,detected_at) references public.price_change_events(season,player_id,detected_at)
);
alter table public.price_event_backtests enable row level security;
revoke all on public.price_event_backtests from public,anon,authenticated;
grant select on public.price_event_backtests to anon,authenticated;
create policy price_event_backtests_read on public.price_event_backtests for select to anon,authenticated using(true);
do $$begin if exists(select 1 from pg_roles where rolname='service_role')then grant all on public.price_event_backtests to service_role;end if;end$$;
