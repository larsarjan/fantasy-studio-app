-- Private data keeps its existing CASCADEs; public conversations and editorial
-- content retain their IDs, bodies, timestamps and replies after author removal.
alter table public.forum_topics alter column user_id drop not null;
alter table public.forum_posts alter column user_id drop not null;
alter table public.news_articles alter column author_id drop not null;
do $$declare item record; constraint_name text; begin
 for item in select * from (values ('forum_topics','user_id'),('forum_posts','user_id'),
 ('news_articles','author_id'),('news_articles','last_editor_id'),('news_articles','published_by'),
 ('user_roles','assigned_by'),('site_features','updated_by'),('site_videos','updated_by')) v(tbl,col) loop
  select c.conname into strict constraint_name from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='f' and c.conrelid=('public.'||item.tbl)::regclass and c.confrelid='public.profiles'::regclass and a.attname=item.col;
  execute format('alter table public.%I drop constraint %I',item.tbl,constraint_name);
  execute format('alter table public.%I add constraint %I foreign key(%I) references public.profiles(id) on delete set null',item.tbl,constraint_name,item.col);
 end loop;
end $$;

-- Narrow exception for FK-generated updates ONLY: no role/status/content edits.
create function private.deleted_profile_reference(previous jsonb, upcoming jsonb, fields text[]) returns boolean
language plpgsql security definer set search_path='' as $$
declare field text; changed boolean:=false;
begin
 if pg_trigger_depth()<2 or previous-fields is distinct from upcoming-fields then return false; end if;
 foreach field in array fields loop
  if previous->field is distinct from upcoming->field then
   if upcoming->>field is not null or previous->>field is null or exists(select 1 from public.profiles where id::text=previous->>field) then return false; end if;
   changed:=true;
  end if;
 end loop;
 return changed;
end $$;
revoke all on function private.deleted_profile_reference(jsonb,jsonb,text[]) from public,anon,authenticated;

-- Keep the current Admin Center guards byte-for-byte after a narrow FK prelude.
do $$declare definition text; prelude text; begin
 definition:=replace(pg_get_functiondef('private.content_author_name()'::regprocedure),E'\r\n',E'\n');
 prelude:=$guard$
 if tg_op='UPDATE' and private.deleted_profile_reference(to_jsonb(old),to_jsonb(new),array['author_id','last_editor_id','published_by']) then
  if new.author_id is null then new.author_name:='FVT-redactie'; end if;
  return new;
 end if;
$guard$;
 if position(E'begin\n' in definition)=0 then raise exception 'Unexpected content guard definition'; end if;
 execute replace(definition,E'begin\n',E'begin\n'||prelude);
 definition:=replace(pg_get_functiondef('private.admin_before_write()'::regprocedure),E'\r\n',E'\n');
 prelude:=$guard$
 if tg_op='UPDATE' and private.deleted_profile_reference(to_jsonb(old),to_jsonb(new),array['updated_by']) then return new; end if;
$guard$;
 if position(E'begin\n' in definition)=0 then raise exception 'Unexpected admin guard definition'; end if;
 execute replace(definition,E'begin\n',E'begin\n'||prelude);
end $$;
create function private.anonymize_forum_author() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.deleted_profile_reference(to_jsonb(old),to_jsonb(new),array['user_id']) then new.author_name:='Verwijderd account'; end if;
 return new;
end $$;
revoke all on function private.anonymize_forum_author() from public,anon,authenticated;
create trigger anonymize_author before update of user_id on public.forum_topics for each row execute function private.anonymize_forum_author();
create trigger anonymize_author before update of user_id on public.forum_posts for each row execute function private.anonymize_forum_author();

create table private.account_deletion_jobs(user_id uuid primary key,job_id uuid not null unique default gen_random_uuid(),started_at timestamptz not null default now(),state text not null check(state in ('processing','failed')));
alter table private.account_deletion_jobs enable row level security;
revoke all on private.account_deletion_jobs from public,anon,authenticated;
create policy server_only on private.account_deletion_jobs for all to service_role using(true) with check(true);

create function private.deletion_last_admin(actor uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.user_roles where user_id=actor and role_key in ('admin','super_admin'))
 and not exists(select 1 from public.user_roles ur join public.profiles p on p.id=ur.user_id
 where ur.user_id<>actor and p.account_status='active'
 and (ur.role_key='super_admin' or (ur.role_key='admin' and not exists(select 1 from public.user_roles where user_id=actor and role_key='super_admin')))
 and not exists(select 1 from private.account_deletion_jobs j where j.user_id=ur.user_id and j.state='processing' and j.started_at>now()-interval '3 minutes'))
$$;
revoke all on function private.deletion_last_admin(uuid) from public,anon,authenticated;

create function private.account_deletion_begin(actor uuid,session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.account_deletion_jobs;
begin
 perform pg_advisory_xact_lock(9100926);
 if not exists(select 1 from auth.sessions s where s.id=session_id and s.user_id=actor) or not exists(select 1 from public.profiles where id=actor) then return jsonb_build_object('code','session_required'); end if;
 if private.deletion_last_admin(actor) then return jsonb_build_object('code','last_admin'); end if;
 select * into job from private.account_deletion_jobs where user_id=actor for update;
 if found and job.state='processing' and job.started_at>now()-interval '3 minutes' then return jsonb_build_object('code','in_progress'); end if;
 insert into private.account_deletion_jobs(user_id,state) values(actor,'processing') on conflict(user_id) do update set job_id=gen_random_uuid(),state='processing',started_at=now() returning * into job;
 insert into public.admin_audit_log(action,target_type,target_id,metadata) values('account.deletion_started','account_deletion',job.job_id::text,'{}');
 return jsonb_build_object('code','started','job_id',job.job_id);
end $$;

create function private.account_deletion_storage(actor uuid,job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update private.account_deletion_jobs j set started_at=now() where j.user_id=actor and j.job_id=account_deletion_storage.job_id and state='processing';
 if not found then raise insufficient_privilege; end if;
 return coalesce((select jsonb_agg(x) from (select bucket_id,name from storage.objects where owner_id=actor::text or owner=actor order by bucket_id,name limit 100) x),'[]');
end $$;
create function private.account_deletion_retain_editorial(actor uuid,job_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.account_deletion_jobs j where j.user_id=actor and j.job_id=account_deletion_retain_editorial.job_id and state='processing') then raise insufficient_privilege; end if;
 -- Preserve shared editorial files physically; only remove account ownership.
 update storage.objects set owner=null,owner_id=null where bucket_id='news-images' and (owner_id=actor::text or owner=actor);
end $$;
create function private.account_deletion_failed(job_id uuid,failed_stage text) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.account_deletion_jobs j set state='failed' where j.job_id=account_deletion_failed.job_id;
 if found then insert into public.admin_audit_log(action,target_type,target_id,metadata) values('account.deletion_failed','account_deletion',job_id::text,jsonb_build_object('stage',case when failed_stage in ('storage','sessions','auth') then failed_stage else 'unknown' end)); end if;
end $$;

create function private.guard_account_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(9100926);
 if private.deletion_last_admin(old.id) then raise exception 'Draag eerst het laatste beheeraccount over.'; end if;
 return old;
end $$;
create trigger guard_account_delete before delete on public.profiles for each row execute function private.guard_account_delete();
create function private.complete_account_delete() returns trigger language plpgsql security definer set search_path='' as $$
declare job private.account_deletion_jobs;
begin
 delete from private.account_deletion_jobs where user_id=old.id returning * into job;
 if found then insert into public.admin_audit_log(action,target_type,target_id,metadata) values('account.deletion_completed','account_deletion',job.job_id::text,'{}'); end if;
 return old;
end $$;
create trigger complete_account_delete after delete on public.profiles for each row execute function private.complete_account_delete();
revoke all on function private.guard_account_delete(),private.complete_account_delete() from public,anon,authenticated;

create function public.account_deletion_begin(actor uuid,session_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.account_deletion_begin(actor,session_id)$$;
create function public.account_deletion_storage(actor uuid,job_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.account_deletion_storage(actor,job_id)$$;
create function public.account_deletion_retain_editorial(actor uuid,job_id uuid) returns void language sql security invoker set search_path='' as $$select private.account_deletion_retain_editorial(actor,job_id)$$;
create function public.account_deletion_failed(job_id uuid,failed_stage text) returns void language sql security invoker set search_path='' as $$select private.account_deletion_failed(job_id,failed_stage)$$;
revoke all on function public.account_deletion_begin(uuid,uuid),public.account_deletion_storage(uuid,uuid),public.account_deletion_retain_editorial(uuid,uuid),public.account_deletion_failed(uuid,text) from public,anon,authenticated;
revoke all on function private.account_deletion_begin(uuid,uuid),private.account_deletion_storage(uuid,uuid),private.account_deletion_retain_editorial(uuid,uuid),private.account_deletion_failed(uuid,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function public.account_deletion_begin(uuid,uuid),public.account_deletion_storage(uuid,uuid),public.account_deletion_retain_editorial(uuid,uuid),public.account_deletion_failed(uuid,text),private.account_deletion_begin(uuid,uuid),private.account_deletion_storage(uuid,uuid),private.account_deletion_retain_editorial(uuid,uuid),private.account_deletion_failed(uuid,text) to service_role;
