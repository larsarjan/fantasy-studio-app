-- Bulk publication is atomic and restricted to editors/admins. Keep the longer
-- budget local to this RPC; ordinary user queries retain their existing limit.
alter function public.publish_reference_data(jsonb) set statement_timeout = '30s';
notify pgrst, 'reload schema';
