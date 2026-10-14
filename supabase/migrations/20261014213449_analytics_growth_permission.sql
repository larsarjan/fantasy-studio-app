insert into public.permissions(key) values ('analytics.view') on conflict do nothing;
insert into public.role_permissions(role_key,permission_key) values
 ('admin','analytics.view'),('super_admin','analytics.view') on conflict do nothing;
