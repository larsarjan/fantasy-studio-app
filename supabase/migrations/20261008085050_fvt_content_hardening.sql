-- Explicit deny policy documents that only the private trigger may use this table.
create policy server_only on private.forum_write_limits for all to public using(false) with check(false);
-- Canonical UTF-8 label, also repairs deployments read by a legacy Windows encoding.
update public.forum_categories set name=U&'FVT-video\2019s' where position=6;
