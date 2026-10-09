-- Additional hardening of the pre-existing Price Predictor maintenance endpoint.
create or replace function private.sync_action(kind text,operation text) returns void language plpgsql security definer set search_path='' as $$
declare needed text;
begin
 if kind not in ('price','prominent') or operation not in ('sync','import','calibrate','retention') then raise exception 'Ongeldige syncactie'; end if;
 needed:=case when operation in ('calibrate','retention') then 'system.manage' when operation='import' then 'data.correct' else 'sync.run' end;
 if not private.has_permission(needed) then raise insufficient_privilege; end if;
 perform private.audit('sync.'||operation||'_started',kind||'_sync','batch','{}');
end $$;
revoke all on function private.sync_action(text,text) from public,anon;
grant execute on function private.sync_action(text,text) to authenticated;
create or replace function public.admin_sync_action(kind text,operation text) returns void language sql security invoker set search_path='' as $$select private.sync_action(kind,operation)$$;
revoke all on function public.admin_sync_action(text,text) from public,anon;
grant execute on function public.admin_sync_action(text,text) to authenticated;
