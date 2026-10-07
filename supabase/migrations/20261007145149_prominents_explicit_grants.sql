-- Supabase default table grants are intentionally overridden; RLS is not a substitute for privileges.
revoke all on public.prominents,public.prominent_groups,public.prominent_bootstrap,public.prominent_round_snapshots,public.prominent_round_picks,public.prominent_sync_jobs,public.prominent_sync_runs from public,anon,authenticated;
grant select on public.prominents,public.prominent_groups,public.prominent_bootstrap,public.prominent_round_snapshots,public.prominent_round_picks to anon,authenticated;
grant select on public.prominent_sync_jobs,public.prominent_sync_runs to authenticated;
