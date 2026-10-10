-- Direct table access is deliberately denied; all reads/writes use permission-checked RPCs.
do $$declare t text;begin
 foreach t in array array['player_availability','availability_history','availability_sources','availability_proposals'] loop
  execute format('create policy no_direct_access on private.%I for all to anon,authenticated using(false) with check(false)',t);
 end loop;
end$$;
