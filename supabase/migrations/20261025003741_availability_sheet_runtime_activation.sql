-- Activate member runtime reads only with the application release.
create or replace function private.availability_list(admin_mode boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.active_member() then raise insufficient_privilege;end if;
 if admin_mode and (not private.has_permission('availability.view') or not private.has_permission('admin.access')) then raise insufficient_privilege;end if;
 if admin_mode then return coalesce((select jsonb_agg(to_jsonb(a) order by updated_at desc) from private.player_availability a),'[]');end if;
 return coalesce((select jsonb_agg(row) from (
  select to_jsonb(a)-array['notes','updated_by'] as row from private.player_availability a
  union all
  select to_jsonb(c)||jsonb_build_object('updated_at',c.observed_at,'source_mode','automatic','is_manual_override',false)
  from private.player_availability_current c
  where not exists(select 1 from private.player_availability a where a.season=c.season and a.player_id=c.player_id)
 ) records),'[]');
end$$;
