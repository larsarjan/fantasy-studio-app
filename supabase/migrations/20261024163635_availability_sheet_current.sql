-- Prepared for acceptance; does not install a scheduler or change existing data.
create table private.player_availability_current (
 player_id text not null, season text not null,
 status_type text not null check(status_type in ('available','injury','suspension','doubt','unavailable','unknown')),
 availability_percentage integer check(availability_percentage in (0,25,50,75,100)),
 reason text not null check(length(reason)<=500), expected_return_date date,
 source_name text not null default 'Blessures en Schorsingen', source_url text not null,
 source_updated_at timestamptz, observed_at timestamptz not null, synced_at timestamptz not null default now(),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'), match_method text not null check(match_method in ('exact','alias','manual')),
 primary key(season,player_id)
);
alter table private.player_availability_current enable row level security;
revoke all on private.player_availability_current from public,anon,authenticated,service_role;
-- Stable player identity is inside the reference snapshot JSON, not a relational FK.
-- Validate it transactionally in the only writer, instead of an invalid snapshot FK.
create function public.availability_sheet_sync(items jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare r jsonb; affected integer:=0; n integer; seen text[]:='{}'; identity_key text;
begin
 if current_user <> 'postgres' and current_setting('role',true)<>'service_role' then raise insufficient_privilege; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)<1 or jsonb_array_length(items)>650 then raise exception 'Ongeldige availability-batch';end if;
 perform pg_advisory_xact_lock(hashtext('availability-sheet-sync'));
 for r in select value from jsonb_array_elements(items) loop
  identity_key:=(r->>'season')||'|'||(r->>'player_id');
  if identity_key=any(seen) then raise exception 'Dubbele speler';end if;seen:=array_append(seen,identity_key);
  if r->>'season' !~ '^20[0-9]{2}/20[0-9]{2}$' or coalesce(r->>'player_id','')='' or
    (select count(*) from public.players p where p.season=r->>'season' and p.payload->>'id'=r->>'player_id' and p.payload->>'club'=r->>'club')<>1 then raise exception 'Onbekende/ambigue speler of club';end if;
  if coalesce(r->>'source_url','') !~ '^https://www\.blessuresenschorsingen\.nl/[a-z0-9-]+-[0-9]+$' then raise exception 'Ongeldige bron';end if;
  if (r->>'observed_at')::timestamptz>now()+interval '5 minutes' or (r->>'observed_at')::timestamptz<now()-interval '7 days' then raise exception 'Ongeldige observatietijd';end if;
  insert into private.player_availability_current as old(player_id,season,status_type,availability_percentage,reason,expected_return_date,source_url,source_updated_at,observed_at,source_hash,match_method)
  values(r->>'player_id',r->>'season',r->>'status_type',(r->>'availability_percentage')::integer,coalesce(r->>'reason',''),nullif(r->>'expected_return_date','')::date,r->>'source_url',nullif(r->>'source_updated_at','')::timestamptz,(r->>'observed_at')::timestamptz,r->>'source_hash',r->>'match_method')
  on conflict(season,player_id) do update set status_type=excluded.status_type,availability_percentage=excluded.availability_percentage,reason=excluded.reason,expected_return_date=excluded.expected_return_date,source_url=excluded.source_url,source_updated_at=excluded.source_updated_at,observed_at=excluded.observed_at,source_hash=excluded.source_hash,match_method=excluded.match_method,synced_at=now()
  where excluded.observed_at>old.observed_at;
  get diagnostics n=row_count;affected:=affected+n;
 end loop;
 return affected;
end$$;
revoke all on function public.availability_sheet_sync(jsonb) from public,anon,authenticated;
grant execute on function public.availability_sheet_sync(jsonb) to service_role;
