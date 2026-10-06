alter table public.user_preferences add column version integer not null default 1 check(version > 0);
create table public.editorial_revisions (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 version integer not null default 0 check(version >= 0)
);
alter table public.editorial_revisions enable row level security;
revoke all on public.editorial_revisions from anon;
grant select,insert,update on public.editorial_revisions to authenticated;
create policy owner_read on public.editorial_revisions for select to authenticated using(user_id=(select auth.uid()));
create policy owner_insert on public.editorial_revisions for insert to authenticated with check(user_id=(select auth.uid()));
create policy owner_update on public.editorial_revisions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create function public.save_preferences(new_settings jsonb,expected_version integer) returns public.user_preferences language plpgsql security invoker set search_path='' as $$
declare saved public.user_preferences;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || 'preferences',0));
 select * into saved from public.user_preferences where user_id=auth.uid() for update;
 if coalesce(saved.version,0)<>expected_version then raise exception 'Version conflict' using errcode='P0001'; end if;
 if saved.user_id is null then
  insert into public.user_preferences(user_id,settings) values(auth.uid(),new_settings) returning * into saved;
 else
  update public.user_preferences set settings=new_settings,version=version+1 where user_id=auth.uid() returning * into saved;
 end if;
 return saved;
end $$;
revoke all on function public.save_preferences(jsonb,integer) from public,anon;
grant execute on function public.save_preferences(jsonb,integer) to authenticated;

drop function public.save_transfer_editorial(jsonb);
create function public.save_transfer_editorial(records jsonb,expected_version integer) returns integer language plpgsql security invoker set search_path='' as $$
declare current_version integer;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if jsonb_typeof(records)<>'array' or jsonb_array_length(records)>2000 then raise exception 'Invalid editorial data'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || 'editorial',0));
 insert into public.editorial_revisions(user_id) values(auth.uid()) on conflict do nothing;
 select version into current_version from public.editorial_revisions where user_id=auth.uid() for update;
 if current_version<>expected_version then raise exception 'Version conflict' using errcode='P0001'; end if;
 delete from public.transfer_editorial where user_id=auth.uid();
 insert into public.transfer_editorial(user_id,kind,key,payload) select auth.uid(),r->>'kind',r->>'key',r->'payload' from jsonb_array_elements(records) r;
 update public.editorial_revisions set version=version+1 where user_id=auth.uid();
 return current_version+1;
end $$;
revoke all on function public.save_transfer_editorial(jsonb,integer) from public,anon;
grant execute on function public.save_transfer_editorial(jsonb,integer) to authenticated;
