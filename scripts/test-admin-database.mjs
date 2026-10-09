import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text); create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;`)
for (const f of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync('supabase/migrations/' + f, 'utf8')) } catch (e) { console.error('Migration failed:', f, e.message); throw e }
}
let checks = 0
// Replaying the new migration must preserve seeded roles and schema.
await db.exec(readFileSync('supabase/migrations/20261009142245_fvt_admin_center.sql','utf8'))
checks++
const ids = Object.fromEntries(['member','moderator','editor','publisher','admin','super_admin','multi'].map((r,i) => [r, `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]))
for (const [role,id] of Object.entries(ids)) {
  await db.query('insert into auth.users values($1)',[id])
  if(role!=='member') await db.query('insert into user_roles(user_id,role_key) values($1,$2)',[id,role==='multi'?'editor':role])
}
await db.query('insert into user_roles(user_id,role_key) values($1,$2)',[ids.multi,'moderator'])
const as = id => db.exec(`reset role; set role ${id?'authenticated':'anon'}; select set_config('request.jwt.claim.sub','${id || ''}',false)`)
const rows = async (sql,args=[]) => (await db.query(sql,args)).rows
const check = (value,label) => { assert(value,label); checks++; console.log('PASS',label) }
const denied = async (sql,args=[],label=sql) => { await assert.rejects(db.query(sql,args)); checks++; console.log('DENIED',label) }
await as(null); await denied('select current_access()'); await denied('select * from admin_audit_log'); await denied(`select admin_assign_roles($1,array['admin'],'attack')`,[ids.member])
for(const [role,id] of Object.entries(ids)) {
 await as(id); const access=(await rows('select current_access() a'))[0].a
 check(access.permissions.includes('admin.access')===(role!=='member'),role+' admin access')
 check(access.permissions.includes('articles.publish')===['publisher','admin','super_admin'].includes(role),role+' publish boundary')
 await denied(`update profiles set role='admin' where id=$1`,[id],role+' profile escalation')
 await denied(`insert into user_roles(user_id,role_key) values($1,'super_admin')`,[id],role+' direct role escalation')
 await denied(`insert into admin_audit_log(action,target_type,target_id) values('forged','user','x')`,[],role+' audit forge')
}
await as(ids.editor)
const article=(await rows(`insert into news_articles(title,slug,intro,body) values('Acceptance draft','acceptance-draft','Meaningful test intro','A meaningful local-only acceptance article body.') returning *`))[0]
check(article.last_editor_id===ids.editor,'Editor creates draft, server stamps editor')
await rows(`update news_articles set title='Edited draft' where id=$1`,[article.id])
await denied(`update news_articles set status='published',published_at=now() where id=$1`,[article.id],'Editor direct publish')
await denied(`insert into news_articles(title,slug,status,published_at,intro,body) values('Bypass insert','bypass-insert','published',now(),'Valid test intro','Long enough valid article body')`,[],'Editor published insert')
await denied(`select moderate_forum_topic(gen_random_uuid(),true,true)`,[],'Editor moderation')
await denied(`select admin_assign_roles($1,array['admin'],'attack')`,[ids.member],'Editor role RPC')
await as(ids.moderator);check((await rows('select * from news_articles')).length===0,'Moderator cannot read drafts');await denied(`insert into news_articles(title,slug) values('Attack','attack')`)
await as(ids.member)
const topic=(await rows(`insert into forum_topics(category_id,title,body) select id,'Acceptance topic','Acceptance topic body' from forum_categories limit 1 returning *`))[0]
await denied(`select moderate_forum_topic($1,true,true)`,[topic.id],'Member moderation')
await as(ids.moderator);await rows(`select moderate_forum_topic($1,true,true)`,[topic.id]);check((await rows('select pinned,closed from forum_topics where id=$1',[topic.id]))[0].closed,'Moderator pin and lock')
await rows(`select admin_moderate_content('forum_topics',$1,'hide','Acceptance hide',null)`,[topic.id])
await as(ids.member);check((await rows('select * from forum_topics where id=$1',[topic.id])).length===0,'Hidden topic REST read blocked')
await as(ids.moderator);await rows(`select admin_moderate_content('forum_topics',$1,'show','Acceptance show',null)`,[topic.id]);await rows(`select moderate_forum_topic($1,false,false)`,[topic.id])
await as(ids.publisher);await rows(`update news_articles set status='published',published_at=now() where id=$1`,[article.id]);check((await rows('select published_by from news_articles where id=$1',[article.id]))[0].published_by===ids.publisher,'Publisher publishes with stamped actor')
await as(null);check((await rows('select * from news_articles')).length===1,'Published public');await rows('select public_video_catalog()');
await as(ids.editor);await denied(`update news_articles set body='A changed live published article body' where id=$1`,[article.id],'Editor cannot edit live publication')
await as(ids.publisher);await rows(`update news_articles set status='draft' where id=$1`,[article.id]);await as(null);check((await rows('select * from news_articles')).length===0,'Unpublish removes public content')
await as(ids.admin);await rows(`select admin_assign_roles($1,array['editor','moderator'],'Acceptance union')`,[ids.member]);await denied(`select admin_assign_roles($1,array['super_admin'],'Self promotion')`,[ids.admin]);await denied(`select admin_assign_roles($1,array['admin'],'Admin promotion')`,[ids.editor]);await denied(`select admin_assign_roles($1,array['member'],'Super demotion')`,[ids.super_admin]);
await as(ids.member);check((await rows('select current_access() a'))[0].a.permissions.includes('forum.moderate'),'Multiple-role permission union')
await as(ids.admin);await rows(`select admin_assign_roles($1,array['member'],'Restore member')`,[ids.member]);
await as(ids.super_admin);await denied(`select admin_assign_roles($1,array['member'],'Self demotion')`,[ids.super_admin]);await denied(`select admin_manage_status($1,'blocked','Block self')`,[ids.super_admin]);
// Last-super-admin protection is exercised through a second super-admin actor that is blocked.
await db.exec('reset role');await db.query(`insert into user_roles(user_id,role_key) values($1,'super_admin')`,[ids.admin]);await db.query(`update profiles set account_status='blocked' where id=$1`,[ids.admin]);
await as(ids.admin);await denied(`select admin_assign_roles($1,array['member'],'Last super-admin')`,[ids.super_admin]);await db.exec('reset role');await db.query(`delete from user_roles where user_id=$1 and role_key='super_admin'`,[ids.admin]);await db.query(`update profiles set account_status='active' where id=$1`,[ids.admin]);
await as(ids.admin);await rows(`update site_features set visibility='hidden' where key='community'`);await as(ids.member);check((await rows(`select feature_access('community') a`))[0].a===false,'Hidden route denied');check((await rows('select * from forum_topics')).length===0,'Hidden feature data denied');await denied(`insert into forum_topics(category_id,title,body) select id,'Hidden bypass','Hidden bypass body' from forum_categories limit 1`);
await as(ids.admin);await rows(`update site_features set visibility='admin' where key='news'`);await as(ids.member);check(!(await rows(`select feature_access('news') a`))[0].a,'Admin-only feature denied to member');await as(ids.admin);check((await rows(`select feature_access('news') a`))[0].a,'Admin-only feature allowed to admin');await rows(`update site_features set visibility='public' where key='news'`);await denied(`update site_features set visibility='public' where key='internal_data_entry'`);
for(const [visibility,member,anonymous] of [['public',true,true],['member',true,false],['staff',false,false],['admin',false,false],['hidden',false,false]]) { await as(ids.admin);await rows(`update site_features set visibility=$1 where key='videos'`,[visibility]);await as(ids.publisher);check((await rows(`select feature_access('videos') a`))[0].a===(visibility==='staff'||member),'Feature '+visibility+' staff');await as(null);check((await rows(`select feature_access('videos') a`))[0].a===anonymous,'Feature '+visibility+' anonymous'); }
await as(ids.admin);await rows(`update site_features set visibility='public' where key='videos'`);await rows(`insert into site_videos(youtube_id,title,category,visible) values('95hoTNaS6xo','Acceptance video','Live',true)`);await as(null);check((await rows('select public_video_catalog() a'))[0].a.videos.length===1,'Video CMS public feed');await as(ids.admin);await rows('update site_videos set visible=false');await as(null);check((await rows('select public_video_catalog() a'))[0].a.suppressed.includes('95hoTNaS6xo'),'Hidden CMS video suppressed from feed');
await db.exec('reset role');await rows(`insert into player_photos(player_key) values('studio:2026/2027:20260001')`);await as(ids.admin);await rows(`update player_photos set override_url='https://cdn.example.com/photo.webp'`);await denied(`update player_photos set source_url='https://attacker.example/photo.webp'`);await rows(`select admin_manage_status($1,'blocked','Acceptance block')`,[ids.editor]);await as(ids.editor);check((await rows('select current_access() a'))[0].a.permissions.length===0,'Blocked stale JWT permissions revoked');await denied(`insert into news_articles(title,slug) values('Blocked','blocked')`);
await as(ids.admin);check((await rows('select * from admin_audit_log')).length>=10,'Actions audited');await denied('delete from admin_audit_log');await denied('update admin_audit_log set metadata=\'{}\'');await rows('delete from news_articles where id=$1',[article.id]);check((await rows(`select * from admin_audit_log where action='news_articles.delete'`)).length===1,'Delete audited');
await db.exec('reset role');check((await rows(`select * from pg_tables where schemaname='public' and not rowsecurity`)).length===0,'Every public table RLS');
await rows(`with imported as (insert into reference_imports(source) values('Local acceptance') returning id) insert into players(id,import_id,payload) select 'photo-local',id,'{"id":"20269999","name":"Local Missing Photo","club":"Local Club","season":"2026/2027"}' from imported`)
await as(ids.member);await denied(`select admin_player_photos('',0)`);await denied(`select admin_set_photo_override('studio:2026/2027:20269999','https://cdn.example.com/photo.webp',true,null)`)
await as(ids.admin);check((await rows(`select admin_player_photos('Missing',0) a`))[0].a.length===1,'Photo search finds player without registry record');await rows(`select admin_set_photo_override('studio:2026/2027:20269999','https://cdn.example.com/photo.webp',true,null)`);check((await rows(`select override_url from player_photos where player_key='studio:2026/2027:20269999'`))[0].override_url==='https://cdn.example.com/photo.webp','Photo override inserts existing central registry entry safely');await denied(`select admin_set_photo_override('studio:2026/2027:20269999','https://cdn.example.com/stale.webp',true,null)`);await denied(`select admin_set_photo_override('studio:2026/2027:does-not-exist','https://cdn.example.com/photo.webp',true,null)`)
await db.close();console.log(`${checks} admin PostgreSQL/RLS checks passed. Local isolated database; no production test content.`)
