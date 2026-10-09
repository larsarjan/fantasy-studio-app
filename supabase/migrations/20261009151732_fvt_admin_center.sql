-- Fantasy Studio only. Additive RBAC; no content or account deletion.
create table if not exists public.roles (key text primary key, label text not null);
create table if not exists public.permissions (key text primary key);
create table if not exists public.role_permissions (
 role_key text references public.roles(key), permission_key text references public.permissions(key),
 primary key(role_key,permission_key)
);
create table if not exists public.user_roles (
 user_id uuid references public.profiles(id) on delete cascade, role_key text references public.roles(key),
 assigned_by uuid references public.profiles(id), assigned_at timestamptz not null default now(),
 primary key(user_id,role_key)
);
create index if not exists user_roles_role on public.user_roles(role_key,user_id);
alter table public.profiles add column if not exists account_status text not null default 'active' check(account_status in ('active','blocked'));
insert into public.roles values ('member','Lid'),('moderator','Moderator'),('editor','Redacteur'),('publisher','Publisher'),('admin','Beheerder'),('super_admin','Super-admin') on conflict do nothing;
insert into public.permissions(key) select unnest(array[
 'admin.access','articles.read','articles.create','articles.edit','articles.publish','articles.unpublish','articles.delete',
 'videos.read','videos.create','videos.edit','videos.publish','videos.hide','videos.delete',
 'forum.moderate','forum.pin','forum.lock','forum.delete','forum.manage_categories',
 'users.view','users.manage_status','users.manage_roles','features.view','features.manage','data.view','data.correct',
 'sync.view','sync.run','player_photos.view','player_photos.manage','system.view','system.manage','audit.view'
]) on conflict do nothing;
insert into public.role_permissions select 'super_admin',key from public.permissions on conflict do nothing;
insert into public.role_permissions select 'admin',key from public.permissions where key<>'system.manage' on conflict do nothing;
insert into public.role_permissions select 'moderator',unnest(array['admin.access','forum.moderate','forum.pin','forum.lock','forum.delete','forum.manage_categories']) on conflict do nothing;
insert into public.role_permissions select r,unnest(array['admin.access','articles.read','articles.create','articles.edit']) from unnest(array['editor','publisher']) r on conflict do nothing;
insert into public.role_permissions select 'publisher',unnest(array['articles.publish','articles.unpublish']) on conflict do nothing;
insert into public.user_roles(user_id,role_key) select id,case when role in ('admin','editor') then role else 'member' end from public.profiles on conflict do nothing;

create or replace function private.has_permission(wanted text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p join public.user_roles ur on ur.user_id=p.id join public.role_permissions rp on rp.role_key=ur.role_key where p.id=auth.uid() and p.account_status='active' and rp.permission_key=wanted)
$$;
revoke all on function private.has_permission(text) from public,anon;
grant execute on function private.has_permission(text) to authenticated;
create or replace function private.active_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and account_status='active')
$$;
revoke all on function private.active_member() from public;
grant execute on function private.active_member() to authenticated,anon;
create or replace function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id) values(new.id);
 insert into public.user_roles(user_id,role_key) values(new.id,'member');
 return new;
end $$;
-- Legacy helper remains for reference-data RLS only. Editorial/forum policies below are explicit.
create or replace function private.is_editor() returns boolean language sql stable security definer set search_path='' as $$select private.has_permission('data.correct')$$;

create table if not exists public.admin_audit_log (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid references public.profiles(id) on delete set null,
 action text not null, target_type text not null, target_id text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists admin_audit_time on public.admin_audit_log(created_at desc,id);
create or replace function private.audit(action text,target_type text,target_id text,metadata jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),action,target_type,target_id,metadata)
$$;
revoke all on function private.audit(text,text,text,jsonb) from public,anon,authenticated;
create or replace function private.current_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('roles',coalesce((select jsonb_agg(role_key order by role_key) from public.user_roles where user_id=auth.uid()),'[]'),
 'permissions',coalesce((select jsonb_agg(permission_key order by permission_key) from (select distinct rp.permission_key from public.user_roles ur join public.role_permissions rp on ur.role_key=rp.role_key where ur.user_id=auth.uid() and private.active_member()) p),'[]'))
$$;
revoke all on function private.current_access() from public,anon;
grant execute on function private.current_access() to authenticated;
create or replace function public.current_access() returns jsonb language sql security invoker set search_path='' as $$select private.current_access()$$;
revoke all on function public.current_access() from public,anon;
grant execute on function public.current_access() to authenticated;

create or replace function private.assign_roles(target uuid,requested text[],reason text) returns void language plpgsql security definer set search_path='' as $$
declare critical boolean; previous text[];
begin
 if not private.has_permission('users.manage_roles') or target=auth.uid() then raise insufficient_privilege; end if;
 if length(btrim(reason)) not between 3 and 500 or requested is null or cardinality(requested) not between 1 and 6 then raise exception 'Ongeldige rolwijziging'; end if;
 if exists(select 1 from unnest(requested) r where not exists(select 1 from public.roles where key=r)) then raise exception 'Onbekende rol'; end if;
 perform pg_advisory_xact_lock(9100926);
 perform 1 from public.profiles where id=target for update;
 if not found then raise exception 'Onbekende gebruiker'; end if;
 select array_agg(role_key) into previous from public.user_roles where user_id=target;
 critical := requested && array['admin','super_admin'] or coalesce(previous,'{}') && array['admin','super_admin'];
 if critical and not exists(select 1 from public.user_roles where user_id=auth.uid() and role_key='super_admin') then raise insufficient_privilege; end if;
 if 'super_admin'=any(coalesce(previous,'{}')) and not 'super_admin'=any(requested) and (select count(*) from public.user_roles ur join public.profiles p on p.id=ur.user_id where ur.role_key='super_admin' and p.account_status='active')<=1 then raise exception 'De laatste actieve super-admin moet behouden blijven'; end if;
 delete from public.user_roles where user_id=target;
 insert into public.user_roles(user_id,role_key,assigned_by) select target,r,auth.uid() from (select distinct unnest(requested) r)s;
 update public.profiles set role=case when requested && array['admin','super_admin'] then 'admin' when requested && array['editor','publisher'] then 'editor' else 'viewer' end where id=target;
 perform private.audit('users.roles_changed','profiles',target::text,jsonb_build_object('before',previous,'after',requested,'reason',reason));
end $$;
revoke all on function private.assign_roles(uuid,text[],text) from public,anon;
grant execute on function private.assign_roles(uuid,text[],text) to authenticated;
create or replace function public.admin_assign_roles(target uuid,requested text[],reason text) returns void language sql security invoker set search_path='' as $$select private.assign_roles(target,requested,reason)$$;
revoke all on function public.admin_assign_roles(uuid,text[],text) from public,anon;
grant execute on function public.admin_assign_roles(uuid,text[],text) to authenticated;
create or replace function private.manage_status(target uuid,new_status text,reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('users.manage_status') or target=auth.uid() then raise insufficient_privilege; end if;
 if new_status not in ('active','blocked') or length(btrim(reason)) not between 3 and 500 then raise exception 'Ongeldige status'; end if;
 perform pg_advisory_xact_lock(9100926);
 if exists(select 1 from public.user_roles where user_id=target and role_key in ('admin','super_admin')) and not exists(select 1 from public.user_roles where user_id=auth.uid() and role_key='super_admin') then raise insufficient_privilege; end if;
 if new_status='blocked' and exists(select 1 from public.user_roles where user_id=target and role_key='super_admin') and (select count(*) from public.user_roles ur join public.profiles p on p.id=ur.user_id where ur.role_key='super_admin' and p.account_status='active')<=1 then raise exception 'De laatste actieve super-admin moet behouden blijven'; end if;
 update public.profiles set account_status=new_status where id=target;
 if not found then raise exception 'Onbekende gebruiker'; end if;
 perform private.audit('users.status_changed','profiles',target::text,jsonb_build_object('status',new_status,'reason',reason));
end $$;
revoke all on function private.manage_status(uuid,text,text) from public,anon;
grant execute on function private.manage_status(uuid,text,text) to authenticated;
create or replace function public.admin_manage_status(target uuid,new_status text,reason text) returns void language sql security invoker set search_path='' as $$select private.manage_status(target,new_status,reason)$$;
revoke all on function public.admin_manage_status(uuid,text,text) from public,anon;
grant execute on function public.admin_manage_status(uuid,text,text) to authenticated;

create table if not exists public.site_features (
 key text primary key, label text not null, description text not null default '', route text not null,
 enabled boolean not null default true, visibility text not null check(visibility in ('public','member','staff','admin','hidden')),
 required_permission text references public.permissions(key), maintenance_message text not null default '' check(length(maintenance_message)<=500),
 updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
insert into public.site_features(key,label,description,route,visibility,required_permission) values
 ('price_predictor','Prijsvoorspelling','Prijsdata en historie','/studio/prices','member',null),
 ('captain_radar','Captain Radar','Captainanalyse','/studio/captain','member',null),
 ('differentials','Differentials','Onderscheidende spelers','/studio/differentials','member',null),
 ('dream_team','Dream Team','Droomelftal','/studio/dreamteam','member',null),
 ('rankings','Ranglijsten','Prominente fantasyspelers','/ranglijsten','public',null),
 ('community','Community','FVT forum','/community','public',null),
 ('news','Nieuws','FVT redactie','/nieuws','public',null),
 ('videos','Video''s','FVT videotheek','/videos','public',null),
 ('internal_data_entry','Interne invoer','Bestaande lokale invoermodule','/admin/input','admin','data.correct'),
 ('manual_match_input','Wedstrijdinvoer','Handmatige wedstrijdaanpassingen','/admin/input','admin','data.correct'),
 ('experimental_tools','Experimentele tools','Nog geen publieke route','/admin/studio','hidden','system.manage') on conflict do nothing;
create or replace function private.feature_access(feature text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled and visibility<>'hidden' and (visibility='public' or visibility='member' and private.active_member() or visibility='staff' and private.has_permission('admin.access') or visibility='admin' and private.has_permission('system.view')) and (required_permission is null or private.has_permission(required_permission)) from public.site_features where key=feature),false)
$$;
revoke all on function private.feature_access(text) from public;
grant usage on schema private to anon;
grant execute on function private.feature_access(text),private.has_permission(text) to anon,authenticated;
create or replace function public.feature_access(feature text) returns boolean language sql security invoker set search_path='' as $$select private.feature_access(feature)$$;
revoke all on function public.feature_access(text) from public;
grant execute on function public.feature_access(text) to anon,authenticated;

-- New tables: explicit grants and RLS. No client can insert audit or assign roles directly.
do $$declare t text; begin
 foreach t in array array['roles','permissions','role_permissions','user_roles','admin_audit_log','site_features'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using(private.has_permission('admin.access'));
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using(private.has_permission('admin.access'));
drop policy if exists mapping_read on public.role_permissions;
create policy mapping_read on public.role_permissions for select to authenticated using(private.has_permission('admin.access'));
drop policy if exists assigned_read on public.user_roles;
create policy assigned_read on public.user_roles for select to authenticated using(user_id=auth.uid() or private.has_permission('users.view'));
drop policy if exists audit_read on public.admin_audit_log;
create policy audit_read on public.admin_audit_log for select to authenticated using(private.has_permission('audit.view'));
drop policy if exists feature_read on public.site_features;
create policy feature_read on public.site_features for select to authenticated using(private.has_permission('features.view'));
grant update(enabled,visibility,required_permission,maintenance_message) on public.site_features to authenticated;
drop policy if exists feature_update on public.site_features;
create policy feature_update on public.site_features for update to authenticated using(private.has_permission('features.manage')) with check(private.has_permission('features.manage'));
drop policy if exists staff_profiles on public.profiles;
create policy staff_profiles on public.profiles for select to authenticated using(private.has_permission('users.view'));

-- Article workflow preserves existing published rows and adds explicit transition checks.
alter table public.news_articles drop constraint if exists news_articles_status_check;
alter table public.news_articles drop constraint if exists news_articles_check;
alter table public.news_articles drop constraint if exists news_articles_publication_check;
alter table public.news_articles add constraint news_articles_status_check check(status in ('draft','review','scheduled','published','hidden','archived'));
alter table public.news_articles add constraint news_articles_publication_check check(status not in ('published','scheduled') or (published_at is not null and length(btrim(body))>=20 and length(btrim(intro))>=10));
alter table public.news_articles add column if not exists featured boolean not null default false;
alter table public.news_articles add column if not exists last_editor_id uuid references public.profiles(id);
alter table public.news_articles add column if not exists published_by uuid references public.profiles(id);
grant insert(featured),update(featured) on public.news_articles to authenticated;
create or replace function private.content_author_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission(case when tg_op='INSERT' then 'articles.create' else 'articles.edit' end) then raise insufficient_privilege; end if;
 if tg_op='INSERT' then
  if new.author_id<>auth.uid() and not private.has_permission('users.view') then raise insufficient_privilege; end if;
  if (new.status not in ('draft','review') or new.featured) and not private.has_permission('articles.publish') then raise insufficient_privilege; end if;
 else
  if new.author_id<>old.author_id and not private.has_permission('users.view') then raise insufficient_privilege; end if;
  if (new.status in ('published','scheduled') or old.status in ('published','scheduled')) and not private.has_permission('articles.publish') then raise insufficient_privilege; end if;
  if old.status in ('published','scheduled') and new.status not in ('published','scheduled') and not private.has_permission('articles.unpublish') then raise insufficient_privilege; end if;
  if (new.featured is distinct from old.featured or new.published_at is distinct from old.published_at) and not private.has_permission('articles.publish') then raise insufficient_privilege; end if;
 end if;
 select coalesce(nullif(btrim(display_name),''),'FVT-redactie') into new.author_name from public.profiles where id=new.author_id;
 if new.author_name is null then raise exception 'Onbekende auteur'; end if;
 new.updated_at=clock_timestamp(); new.last_editor_id=auth.uid();
 if new.status in ('published','scheduled') then new.published_by=auth.uid(); end if;
 return new;
end $$;
drop policy if exists editorial_read on public.news_articles;
drop policy if exists editorial_insert on public.news_articles;
drop policy if exists editorial_update on public.news_articles;
drop policy if exists editorial_delete on public.news_articles;
drop policy if exists published_read on public.news_articles;
drop policy if exists published_read on public.news_articles;
create policy published_read on public.news_articles for select to anon,authenticated using(status in ('published','scheduled') and published_at<=now() and private.feature_access('news'));
drop policy if exists editorial_read on public.news_articles;
create policy editorial_read on public.news_articles for select to authenticated using(private.has_permission('articles.read'));
drop policy if exists editorial_insert on public.news_articles;
create policy editorial_insert on public.news_articles for insert to authenticated with check(private.has_permission('articles.create'));
drop policy if exists editorial_update on public.news_articles;
create policy editorial_update on public.news_articles for update to authenticated using(private.has_permission('articles.edit')) with check(private.has_permission('articles.edit'));
drop policy if exists editorial_delete on public.news_articles;
create policy editorial_delete on public.news_articles for delete to authenticated using(private.has_permission('articles.delete'));
drop policy if exists editorial_manage on public.news_categories;
drop policy if exists editorial_manage on public.news_categories;
create policy editorial_manage on public.news_categories for all to authenticated using(private.has_permission('articles.publish')) with check(private.has_permission('articles.publish'));

-- Forum: preserve ownership, remove editorial moderation; moderation columns RPC-only.
alter table public.forum_topics add column if not exists hidden boolean not null default false;
alter table public.forum_posts add column if not exists hidden boolean not null default false;
do $$declare t text; begin
 foreach t in array array['forum_topics','forum_posts'] loop
  execute format('drop policy if exists owner_update on public.%I',t);
  execute format('drop policy if exists owner_delete on public.%I',t);
  execute format('drop policy if exists public_read on public.%I',t);
  execute format('drop policy if exists moderator_read on public.%I',t);
  execute format('drop policy if exists active_insert on public.%I',t);
  execute format('create policy public_read on public.%I for select to anon,authenticated using(not hidden and private.feature_access(''community''))',t);
  execute format('create policy moderator_read on public.%I for select to authenticated using(private.has_permission(''forum.moderate''))',t);
  execute format('create policy owner_update on public.%I for update to authenticated using(user_id=auth.uid() and private.active_member() and private.feature_access(''community'')) with check(user_id=auth.uid() and private.active_member() and private.feature_access(''community''))',t);
  execute format('create policy owner_delete on public.%I for delete to authenticated using(user_id=auth.uid() and private.active_member() and private.feature_access(''community''))',t);
  execute format('create policy active_insert on public.%I as restrictive for insert to authenticated with check(private.active_member() and private.feature_access(''community''))',t);
 end loop;
end $$;
-- Prevent comments on hidden parents from leaking through a direct REST query.
drop policy if exists visible_parent on public.forum_posts;
create policy visible_parent on public.forum_posts as restrictive for select to anon,authenticated using(private.has_permission('forum.moderate') or exists(select 1 from public.forum_topics where id=topic_id and not hidden));
drop policy if exists editorial_manage on public.forum_categories;
drop policy if exists moderator_categories on public.forum_categories;
create policy moderator_categories on public.forum_categories for all to authenticated using(private.has_permission('forum.manage_categories')) with check(private.has_permission('forum.manage_categories'));
create or replace function private.moderate_forum_topic(topic uuid,is_pinned boolean,is_closed boolean) returns void language plpgsql security definer set search_path='' as $$
declare previous public.forum_topics;
begin
 select * into previous from public.forum_topics where id=topic for update;
 if not found then raise exception 'Onbekend topic'; end if;
 if not private.has_permission('forum.moderate') or (is_pinned is distinct from previous.pinned and not private.has_permission('forum.pin')) or (is_closed is distinct from previous.closed and not private.has_permission('forum.lock')) then raise insufficient_privilege; end if;
 update public.forum_topics set pinned=is_pinned,closed=is_closed,updated_at=clock_timestamp() where id=topic;
 perform private.audit('forum.moderated','forum_topics',topic::text,jsonb_build_object('pinned',is_pinned,'closed',is_closed));
end $$;
create or replace function private.moderate_content(target_table text,target uuid,operation text,reason text,category uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if target_table not in ('forum_topics','forum_posts') or operation not in ('hide','show','delete','category') or length(btrim(reason)) not between 3 and 500 then raise exception 'Ongeldige moderatie'; end if;
 if not private.has_permission(case when operation='delete' then 'forum.delete' when operation='category' then 'forum.manage_categories' else 'forum.moderate' end) then raise insufficient_privilege; end if;
 if operation='delete' then execute format('delete from public.%I where id=$1',target_table) using target;
 elsif operation='category' then
  if target_table<>'forum_topics' then raise exception 'Categorie alleen voor topics'; end if;
  update public.forum_topics set category_id=category where id=target;
 else execute format('update public.%I set hidden=$1,updated_at=clock_timestamp() where id=$2',target_table) using operation='hide',target; end if;
 get diagnostics changed = row_count;
 if changed=0 then raise exception 'Onbekende content'; end if;
 perform private.audit('forum.'||operation,target_table,target::text,jsonb_build_object('reason',reason,'category',category));
end $$;
revoke all on function private.moderate_content(text,uuid,text,text,uuid) from public,anon;
grant execute on function private.moderate_content(text,uuid,text,text,uuid) to authenticated;
create or replace function public.admin_moderate_content(target_table text,target uuid,operation text,reason text,category uuid default null) returns void language sql security invoker set search_path='' as $$select private.moderate_content(target_table,target,operation,reason,category)$$;
revoke all on function public.admin_moderate_content(text,uuid,text,text,uuid) from public,anon;
grant execute on function public.admin_moderate_content(text,uuid,text,text,uuid) to authenticated;
-- Existing rate limiter and owner checks remain; closed-topic bypass becomes moderator-only.
do $$declare source text; begin
 select pg_get_functiondef('private.prepare_forum_write()'::regprocedure) into source;
 source:=replace(source,'not private.is_editor()','not private.has_permission(''forum.moderate'')');
 execute source;
end $$;

create table if not exists public.site_videos (
 id uuid primary key default gen_random_uuid(), youtube_id text not null unique check(youtube_id~'^[A-Za-z0-9_-]{11}$'),
 title text not null check(length(btrim(title)) between 3 and 250), category text not null check(category in ('5 Vooruit','De Picks','Terugblik','Samenwerkingen','Live','Overige / Specials')),
 description text not null default '' check(length(description)<=5000), thumbnail_url text not null default '' check(thumbnail_url='' or thumbnail_url~'^https://[^[:space:]]+$'),
 visible boolean not null default false, featured boolean not null default false, published_at timestamptz not null default now(), sort_order integer not null default 0,
 updated_by uuid references public.profiles(id), updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
alter table public.site_videos enable row level security;
revoke all on public.site_videos from public,anon,authenticated;
grant select on public.site_videos to anon,authenticated;
grant insert(youtube_id,title,category,description,thumbnail_url,visible,featured,published_at,sort_order),update(youtube_id,title,category,description,thumbnail_url,visible,featured,published_at,sort_order),delete on public.site_videos to authenticated;
drop policy if exists videos_public on public.site_videos;
create policy videos_public on public.site_videos for select to anon,authenticated using(visible and published_at<=now() and private.feature_access('videos'));
drop policy if exists videos_staff on public.site_videos;
create policy videos_staff on public.site_videos for select to authenticated using(private.has_permission('videos.read'));
drop policy if exists videos_insert on public.site_videos;
create policy videos_insert on public.site_videos for insert to authenticated with check(private.has_permission('videos.create'));
drop policy if exists videos_update on public.site_videos;
create policy videos_update on public.site_videos for update to authenticated using(private.has_permission('videos.edit')) with check(private.has_permission('videos.edit'));
drop policy if exists videos_delete on public.site_videos;
create policy videos_delete on public.site_videos for delete to authenticated using(private.has_permission('videos.delete'));

drop policy if exists photo_admin_write on public.player_photos;
drop policy if exists photo_admin_write on public.player_photos;
create policy photo_admin_write on public.player_photos for all to authenticated using(private.has_permission('player_photos.manage')) with check(private.has_permission('player_photos.manage'));
-- Keep human overrides separate from machine-managed source records via column privileges.
revoke insert,update,delete on public.player_photos from authenticated;
grant update(override_url,override_thumbnail_url,override_enabled) on public.player_photos to authenticated;

create or replace function private.admin_before_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='site_features' then
  if not private.has_permission('features.manage') then raise insufficient_privilege; end if;
  if (old.required_permission='system.manage' or new.required_permission='system.manage') and not private.has_permission('system.manage') then raise insufficient_privilege; end if;
  -- Internal tools cannot be made public; system permissions remain super-admin-only.
  if new.key in ('internal_data_entry','manual_match_input','experimental_tools') and (new.visibility not in ('admin','hidden') or new.required_permission is distinct from old.required_permission) then raise insufficient_privilege; end if;
  new.updated_by=auth.uid(); new.updated_at=clock_timestamp();
 elsif tg_table_name='site_videos' then
  if tg_op='INSERT' then
   if (new.visible or new.featured) and not private.has_permission('videos.publish') then raise insufficient_privilege; end if;
  else
   if (new.visible and not old.visible or new.featured is distinct from old.featured or new.published_at is distinct from old.published_at) and not private.has_permission('videos.publish') then raise insufficient_privilege; end if;
   if old.visible and not new.visible and not private.has_permission('videos.hide') then raise insufficient_privilege; end if;
  end if;
  new.updated_by=auth.uid();new.updated_at=clock_timestamp();
 end if;
 return new;
end $$;
revoke all on function private.admin_before_write() from public,anon,authenticated;
drop trigger if exists admin_before_features on public.site_features;
create trigger admin_before_features before update on public.site_features for each row execute function private.admin_before_write();
drop trigger if exists admin_before_videos on public.site_videos;
create trigger admin_before_videos before insert or update on public.site_videos for each row execute function private.admin_before_write();
create or replace function private.audit_table_change() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; previous jsonb; identity text;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 previous:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 identity:=coalesce(row_data->>'id',row_data->>'key',row_data->>'player_key','');
 -- Only allow-listed fields: no article bodies, account emails, tokens or raw payloads.
 perform private.audit(tg_table_name||'.'||lower(tg_op),tg_table_name,identity,jsonb_build_object('status',row_data->>'status','previous_status',previous->>'status','visibility',row_data->>'visibility','enabled',row_data->>'enabled','featured',row_data->>'featured','override_enabled',row_data->>'override_enabled'));
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.audit_table_change() from public,anon,authenticated;
do $$declare t text; begin
 foreach t in array array['news_articles','site_videos','site_features','player_photos','reference_imports'] loop
  execute format('drop trigger if exists admin_audit on public.%I',t);
  execute format('create trigger admin_audit after insert or update or delete on public.%I for each row execute function private.audit_table_change()',t);
 end loop;
end $$;

-- Visibility also covers direct data calls, including hidden/admin-only prices and rankings.
do $$declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and (tablename like 'price_%' or tablename in ('prominents','prominent_groups','prominent_bootstrap','prominent_round_snapshots','prominent_round_picks')) loop
  execute format('drop policy if exists feature_boundary on public.%I',t);
  execute format('create policy feature_boundary on public.%I as restrictive for select to anon,authenticated using(private.feature_access(%L) or private.has_permission(''data.view''))',t,case when t like 'price_%' then 'price_predictor' else 'rankings' end);
 end loop;
 for t in select tablename from pg_tables where schemaname='public' and tablename in ('prominent_sync_runs','prominent_sync_jobs') loop
  execute format('drop policy if exists admin_read on public.%I',t);
  execute format('drop policy if exists sync_staff_read on public.%I',t);
  execute format('create policy sync_staff_read on public.%I for select to authenticated using(private.has_permission(''sync.view''))',t);
 end loop;
end $$;
-- A blocked account cannot keep writing using an already-issued JWT.
create or replace function private.search_player_photos(query_text text,start_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission('player_photos.view') then raise insufficient_privilege; end if;
 return coalesce((select jsonb_agg(to_jsonb(r)) from (
  select 'studio:'||(p.payload->>'season')||':'||(p.payload->>'id') as player_key,p.payload->>'name' as display_name,p.payload->>'club' as club,
   ph.source_name,ph.source_url,ph.source_thumbnail_url,coalesce(ph.source_status,'unverified') as source_status,coalesce(ph.source_enabled,false) as source_enabled,
   ph.override_url,ph.override_thumbnail_url,coalesce(ph.override_enabled,true) as override_enabled,ph.updated_at
  from public.players p left join public.player_photos ph on ph.player_key='studio:'||(p.payload->>'season')||':'||(p.payload->>'id')
  where (coalesce(p.payload->>'name','') ilike '%'||left(coalesce(query_text,''),100)||'%' or coalesce(p.payload->>'id','') ilike '%'||left(coalesce(query_text,''),100)||'%' or coalesce(p.payload->>'club','') ilike '%'||left(coalesce(query_text,''),100)||'%')
   and (p.payload->>'season')~'^[0-9]{4}/[0-9]{4}$' and (p.payload->>'id')~'^[A-Za-z0-9_-]+$'
  order by p.payload->>'name',p.payload->>'season',p.payload->>'id' limit 31 offset greatest(0,least(coalesce(start_offset,0),300000))
 ) r),'[]');
end $$;
revoke all on function private.search_player_photos(text,integer) from public,anon;
grant execute on function private.search_player_photos(text,integer) to authenticated;
create or replace function public.admin_player_photos(query_text text default '',start_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select private.search_player_photos(query_text,start_offset)$$;
revoke all on function public.admin_player_photos(text,integer) from public,anon;
grant execute on function public.admin_player_photos(text,integer) to authenticated;
create or replace function private.set_photo_override(target_key text,photo_url text,is_enabled boolean,expected_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare stamp timestamptz;
begin
 if not private.has_permission('player_photos.manage') then raise insufficient_privilege; end if;
 if not exists(select 1 from public.players p where target_key='studio:'||(p.payload->>'season')||':'||(p.payload->>'id')) then raise exception 'Onbekende speler'; end if;
 if photo_url is not null and (length(photo_url)>2000 or photo_url!~'^https://[^[:space:]]+$') then raise exception 'Ongeldige foto URL'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_key,0));
 select updated_at into stamp from public.player_photos where player_key=target_key for update;
 if stamp is distinct from expected_updated_at then raise exception 'Foto inmiddels gewijzigd' using errcode='P0001'; end if;
 insert into public.player_photos(player_key,override_url,override_enabled) values(target_key,photo_url,is_enabled)
 on conflict(player_key) do update set override_url=excluded.override_url,override_thumbnail_url=null,override_enabled=excluded.override_enabled;
end $$;
revoke all on function private.set_photo_override(text,text,boolean,timestamptz) from public,anon;
grant execute on function private.set_photo_override(text,text,boolean,timestamptz) to authenticated;
create or replace function public.admin_set_photo_override(target_key text,photo_url text,is_enabled boolean,expected_updated_at timestamptz default null) returns void language sql security invoker set search_path='' as $$select private.set_photo_override(target_key,photo_url,is_enabled,expected_updated_at)$$;
revoke all on function public.admin_set_photo_override(text,text,boolean,timestamptz) from public,anon;
grant execute on function public.admin_set_photo_override(text,text,boolean,timestamptz) to authenticated;

create or replace function private.sync_started() returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('sync.run') then raise insufficient_privilege; end if;
 perform private.audit('sync.started','prominent_sync_runs','batch','{}');
end $$;
revoke all on function private.sync_started() from public,anon;
grant execute on function private.sync_started() to authenticated;
create or replace function public.admin_sync_started() returns void language sql security invoker set search_path='' as $$select private.sync_started()$$;
revoke all on function public.admin_sync_started() from public,anon;
grant execute on function public.admin_sync_started() to authenticated;

create or replace function private.public_video_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.feature_access('videos') then raise insufficient_privilege; end if;
 return jsonb_build_object('videos',coalesce((select jsonb_agg(jsonb_build_object('youtube_id',youtube_id,'title',title,'category',category,'thumbnail_url',thumbnail_url,'featured',featured,'published_at',published_at,'sort_order',sort_order)) from public.site_videos where visible and published_at<=now()),'[]'),'suppressed',coalesce((select jsonb_agg(youtube_id) from public.site_videos where not visible or published_at>now()),'[]'));
end $$;
revoke all on function private.public_video_catalog() from public;
grant execute on function private.public_video_catalog() to anon,authenticated;
create or replace function public.public_video_catalog() returns jsonb language sql security invoker set search_path='' as $$select private.public_video_catalog()$$;
revoke all on function public.public_video_catalog() from public;
grant execute on function public.public_video_catalog() to anon,authenticated;

do $$declare t text; begin
 foreach t in array array['user_preferences','fantasy_teams','team_versions','transfer_editorial'] loop
  execute format('drop policy if exists active_account on public.%I',t);
  execute format('create policy active_account on public.%I as restrictive for all to authenticated using(private.active_member()) with check(private.active_member())',t);
 end loop;
end $$;
