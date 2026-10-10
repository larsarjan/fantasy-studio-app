-- Availability uses the real Studio payload.id + season, never import row ordinals.
insert into public.permissions(key) values('availability.view'),('availability.manage') on conflict do nothing;
insert into public.role_permissions(role_key,permission_key) values('super_admin','availability.view'),('super_admin','availability.manage') on conflict do nothing;
create index players_identity_lookup on public.players(season,(payload->>'id'));

create table private.player_availability (
 id uuid primary key default gen_random_uuid(), player_id text not null, season text not null,
 status_type text not null check(status_type in ('available','injury','suspension','doubt','unavailable')),
 availability_percentage integer not null check(availability_percentage in (0,25,50,75,100)),
 reason text not null default '' check(length(reason)<=500), start_date date,
 expected_return_date date, returned_date date,
 source_name text not null default 'FVT-redactie' check(length(source_name)<=120), source_url text not null default '', source_updated_at timestamptz,
 notes text not null default '' check(length(notes)<=4000), is_manual_override boolean not null default false,
 source_mode text not null default 'manual' check(source_mode in ('manual','automatic')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id) on delete set null, revision integer not null default 1,
 unique(season,player_id), check(expected_return_date is null or start_date is null or expected_return_date>=start_date),
 check(returned_date is null or start_date is null or returned_date>=start_date)
);
create table private.availability_history (
 id uuid primary key default gen_random_uuid(), player_id text not null,season text not null,
 old_status jsonb,new_status jsonb not null,changed_at timestamptz not null default now(),
 changed_by uuid references public.profiles(id) on delete set null, change_mode text not null check(change_mode in ('manual','automatic'))
);
create index availability_history_player on private.availability_history(season,player_id,changed_at desc);
create table private.availability_sources (
 key text primary key check(key ~ '^[a-z0-9_-]{2,60}$'),name text not null check(length(name) between 1 and 120),
 url text not null default '',approved boolean not null default false,updated_at timestamptz not null default now()
);
create table private.availability_proposals (
 id uuid primary key default gen_random_uuid(),source_key text not null references private.availability_sources(key),
 external_id text not null check(length(external_id) between 1 and 200),season text not null,player_id text not null,
 proposed jsonb not null, state text not null default 'pending' check(state in ('pending','accepted','rejected')),
 created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references public.profiles(id) on delete set null,
 unique(source_key,external_id)
);
create index availability_proposals_state on private.availability_proposals(state,created_at desc);
create index availability_updated_by on private.player_availability(updated_by);
create index availability_history_actor on private.availability_history(changed_by);
create index availability_proposal_actor on private.availability_proposals(resolved_by);
do $$declare t text;begin
 foreach t in array array['player_availability','availability_history','availability_sources','availability_proposals'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end$$;

create function private.availability_validate(data jsonb) returns void language plpgsql set search_path='' as $$
begin
 if data is null or jsonb_typeof(data)<>'object' or octet_length(data::text)>10000 then raise exception 'Ongeldige status';end if;
 if (select count(*) from public.players where season=data->>'season' and payload->>'id'=data->>'player_id')<>1 then raise exception 'Speler-ID ontbreekt of is ambigu';end if;
 if data->>'status_type' is null or data->>'status_type' not in ('available','injury','suspension','doubt','unavailable') or (data->>'availability_percentage')::integer is null or (data->>'availability_percentage')::integer not in (0,25,50,75,100) then raise exception 'Ongeldige status of percentage';end if;
 if coalesce(data->>'source_url','')<>'' and (length(data->>'source_url')>2048 or data->>'source_url' !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(:443)?([/?#][^[:space:]<>]*)?$' or position('@' in split_part(substr(data->>'source_url',9),'/',1))>0) then raise exception 'Gebruik een veilige https bron-URL';end if;
 if nullif(data->>'expected_return_date','')::date<nullif(data->>'start_date','')::date then raise exception 'Terugkeer ligt voor de startdatum';end if;
 if length(coalesce(data->>'reason',''))>500 or length(coalesce(data->>'notes',''))>4000 or length(coalesce(data->>'source_name',''))>120 then raise exception 'Tekst is te lang';end if;
end$$;

create function private.availability_write(data jsonb,expected_revision integer,mode text default 'manual') returns jsonb language plpgsql security definer set search_path='' as $$
declare previous private.player_availability; upcoming private.player_availability;
begin
 if not private.has_permission('availability.manage') or not private.has_permission('admin.access') then raise insufficient_privilege;end if;
 perform private.availability_validate(data);
 perform pg_advisory_xact_lock(hashtextextended('availability:'||(data->>'season')||':'||(data->>'player_id'),0));
 select * into previous from private.player_availability where season=data->>'season' and player_id=data->>'player_id' for update;
 if coalesce(previous.revision,0) is distinct from expected_revision then raise exception 'Status is intussen gewijzigd. Herlaad en vergelijk eerst.' using errcode='40001';end if;
 insert into private.player_availability(player_id,season,status_type,availability_percentage,reason,start_date,expected_return_date,returned_date,source_name,source_url,source_updated_at,notes,is_manual_override,source_mode,updated_by)
 values(data->>'player_id',data->>'season',data->>'status_type',(data->>'availability_percentage')::integer,coalesce(data->>'reason',''),nullif(data->>'start_date','')::date,nullif(data->>'expected_return_date','')::date,
 case when data->>'status_type'='available' and (data->>'availability_percentage')::integer=100 then case when previous.status_type<>'available' or previous.availability_percentage<100 then current_date else previous.returned_date end else null end,
 coalesce(nullif(data->>'source_name',''),'FVT-redactie'),coalesce(data->>'source_url',''),nullif(data->>'source_updated_at','')::timestamptz,coalesce(data->>'notes',''),coalesce((data->>'is_manual_override')::boolean,false),mode,auth.uid())
 on conflict(season,player_id) do update set status_type=excluded.status_type,availability_percentage=excluded.availability_percentage,reason=excluded.reason,start_date=excluded.start_date,expected_return_date=excluded.expected_return_date,returned_date=excluded.returned_date,source_name=excluded.source_name,source_url=excluded.source_url,source_updated_at=excluded.source_updated_at,notes=excluded.notes,is_manual_override=excluded.is_manual_override,source_mode=excluded.source_mode,updated_by=auth.uid(),updated_at=now(),revision=private.player_availability.revision+1 returning * into upcoming;
 insert into private.availability_history(player_id,season,old_status,new_status,changed_by,change_mode) values(upcoming.player_id,upcoming.season,case when previous.id is null then null else to_jsonb(previous) end,to_jsonb(upcoming),auth.uid(),mode);
 perform private.audit(case when previous.id is null then 'availability.created' when upcoming.returned_date is distinct from previous.returned_date and upcoming.returned_date is not null then 'availability.returned' else 'availability.updated' end,'player_availability',upcoming.id::text,jsonb_build_object('player_id',upcoming.player_id,'season',upcoming.season,'old_status',previous.status_type,'new_status',upcoming.status_type,'old_percentage',previous.availability_percentage,'new_percentage',upcoming.availability_percentage,'old_return',previous.expected_return_date,'new_return',upcoming.expected_return_date,'old_override',previous.is_manual_override,'new_override',upcoming.is_manual_override,'old_source',previous.source_name,'new_source',upcoming.source_name,'mode',mode));
 return to_jsonb(upcoming);
end$$;

create function private.availability_list(admin_mode boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.active_member() then raise insufficient_privilege;end if;
 if admin_mode and (not private.has_permission('availability.view') or not private.has_permission('admin.access')) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(case when admin_mode then to_jsonb(a) else to_jsonb(a)-array['notes','updated_by'] end order by updated_at desc) from private.player_availability a),'[]');
end$$;
create function private.availability_history_read(player text,player_season text,admin_mode boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.active_member() or (admin_mode and (not private.has_permission('availability.view') or not private.has_permission('admin.access'))) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(case when admin_mode then to_jsonb(h) else jsonb_build_object('id',h.id,'old_status',h.old_status-array['notes','updated_by'],'new_status',h.new_status-array['notes','updated_by'],'changed_at',h.changed_at,'change_mode',h.change_mode) end order by changed_at desc) from (select * from private.availability_history where player_id=player and season=player_season order by changed_at desc limit 100) h),'[]');
end$$;

create function private.availability_sources_manage(data jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('availability.view') or not private.has_permission('admin.access') then raise insufficient_privilege;end if;
 if data is not null then
  if not private.has_permission('availability.manage') then raise insufficient_privilege;end if;
  if coalesce(data->>'url','')<>'' and data->>'url' !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}([/?#][^[:space:]<>]*)?$' then raise exception 'Ongeldige bron-URL';end if;
  insert into private.availability_sources(key,name,url,approved) values(data->>'key',data->>'name',coalesce(data->>'url',''),coalesce((data->>'approved')::boolean,false)) on conflict(key) do update set name=excluded.name,url=excluded.url,approved=excluded.approved,updated_at=now();
  perform private.audit('availability.source_changed','availability_sources',data->>'key',jsonb_build_object('approved',data->'approved'));
 end if;
 return coalesce((select jsonb_agg(s order by name) from private.availability_sources s),'[]');
end$$;
-- Server connectors submit proposals only. They never overwrite published statuses.
create function private.availability_propose(source text,external text,data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;source_name text;
begin
 select name into source_name from private.availability_sources where key=source and approved;
 if not found then raise insufficient_privilege;end if;
 perform private.availability_validate(data);
 insert into private.availability_proposals(source_key,external_id,season,player_id,proposed) values(source,external,data->>'season',data->>'player_id',data||jsonb_build_object('source_name',source_name,'notes','','is_manual_override',false)) on conflict(source_key,external_id) do nothing returning id into result;
 if result is null then select id into result from private.availability_proposals where source_key=source and external_id=external;end if;
 return result;
end$$;
create function private.availability_proposals_manage(proposal uuid default null,decision text default null,expected_revision integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare item private.availability_proposals;
begin
 if not private.has_permission('availability.view') or not private.has_permission('admin.access') then raise insufficient_privilege;end if;
 if proposal is not null then
  if not private.has_permission('availability.manage') or decision is null or decision not in ('accept','keep') then raise insufficient_privilege;end if;
  select * into item from private.availability_proposals where id=proposal and state='pending' for update;
  if not found then raise exception 'Voorstel is al verwerkt';end if;
  if decision='accept' then
   if not exists(select 1 from private.availability_sources where key=item.source_key and approved) then raise exception 'Deze bron is niet meer goedgekeurd';end if;
   perform private.availability_write(item.proposed||jsonb_build_object('notes',coalesce((select notes from private.player_availability where season=item.season and player_id=item.player_id),'')),expected_revision,'automatic');
  end if;
  update private.availability_proposals set state=case when decision='accept' then 'accepted' else 'rejected' end,resolved_at=now(),resolved_by=auth.uid() where id=proposal;
  perform private.audit('availability.proposal_'||decision,'availability_proposals',proposal::text,'{}');
 end if;
 return coalesce((select jsonb_agg(p order by created_at) from private.availability_proposals p where state='pending'),'[]');
end$$;

create function public.availability_save(data jsonb,expected_revision integer) returns jsonb language sql security invoker set search_path='' as $$select private.availability_write(data,expected_revision,'manual')$$;
create function public.availability_list(admin_mode boolean default false) returns jsonb language sql security invoker set search_path='' as $$select private.availability_list(admin_mode)$$;
create function public.availability_history(player text,player_season text,admin_mode boolean default false) returns jsonb language sql security invoker set search_path='' as $$select private.availability_history_read(player,player_season,admin_mode)$$;
create function public.availability_sources(data jsonb default null) returns jsonb language sql security invoker set search_path='' as $$select private.availability_sources_manage(data)$$;
create function public.availability_proposals(proposal uuid default null,decision text default null,expected_revision integer default null) returns jsonb language sql security invoker set search_path='' as $$select private.availability_proposals_manage(proposal,decision,expected_revision)$$;
create function public.availability_propose(source text,external text,data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.availability_propose(source,external,data)$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'availability_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname='availability_propose' then execute format('grant execute on function %s to service_role',f.signature);
  elsif f.proname<>'availability_validate' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end$$;
