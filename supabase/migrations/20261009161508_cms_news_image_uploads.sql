-- Only the new CMS asset bucket. Existing RBAC, content RLS and audit remain unchanged.
create or replace function private.news_image_unreferenced(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
  and (private.has_permission('articles.create') or private.has_permission('articles.edit'))
  and not exists(select 1 from public.news_articles where right(split_part(image_url,'?',1),length(object_name)+length('/news-images/'))='/news-images/'||object_name)
$$;
revoke all on function private.news_image_unreferenced(text) from public,anon;
grant execute on function private.news_image_unreferenced(text) to authenticated;
do $$begin
 -- Isolated PGlite installations have no hosted Storage schema; storage tests create it explicitly.
 if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then return; end if;
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('news-images','news-images',true,5242880,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
 execute 'drop policy if exists news_images_insert on storage.objects';
 execute 'create policy news_images_insert on storage.objects for insert to authenticated with check (
  bucket_id=''news-images'' and (private.has_permission(''articles.create'') or private.has_permission(''articles.edit''))
  and split_part(name,''/'',1)=auth.uid()::text
  and name ~ ''^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$''
 )';
 execute 'drop policy if exists news_images_staff_read on storage.objects';
 execute 'create policy news_images_staff_read on storage.objects for select to authenticated using (
  bucket_id=''news-images'' and (private.has_permission(''articles.read'') or private.has_permission(''articles.create'') or private.has_permission(''articles.edit''))
 )';
 execute 'drop policy if exists news_images_orphan_delete on storage.objects';
 execute 'create policy news_images_orphan_delete on storage.objects for delete to authenticated using (
  bucket_id=''news-images'' and split_part(name,''/'',1)=auth.uid()::text and private.news_image_unreferenced(name)
 )';
 -- No anon writes and no UPDATE policy: immutable unique object names; replacement uploads a new file.
end $$;
