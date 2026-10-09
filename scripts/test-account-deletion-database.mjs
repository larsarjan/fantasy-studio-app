import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text);create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',admin='00000000-0000-4000-8000-000000000003',session='00000000-0000-4000-8000-000000000004'
await db.exec(`insert into auth.users values('${a}'),('${b}'),('${admin}');insert into auth.sessions values('${session}','${a}');insert into user_roles(user_id,role_key) values('${a}','editor'),('${admin}','super_admin');`)
const as=async(id,role='authenticated')=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id||''}',false);set role ${role}`)
let checks=0;const check=(v,label)=>{assert(v,label);checks++;console.log(label)}
await as(a)
await db.exec(`update profiles set display_name='Naam verdwijnt' where id='${a}';insert into user_preferences(user_id) values('${a}');select save_fantasy_team('primary','Mijn selectie','{}','{}',0);`)
const category=(await db.query('select id from forum_categories limit 1')).rows[0].id
const topic=(await db.query(`insert into forum_topics(category_id,title,body) values($1,'Bestaand gesprek','Publieke discussie') returning id,created_at`,[category])).rows[0]
const article=(await db.query(`insert into news_articles(title,slug,body) values('Redactioneel artikel','lokale-deletion-test','Bestaande redactionele inhoud') returning id,updated_at`)).rows[0]
await as(b)
const reply=(await db.query(`insert into forum_posts(topic_id,body) values($1,'Reactie van iemand anders') returning id,created_at`,[topic.id])).rows[0]
await as(null,'postgres')
await db.exec(`delete from user_roles where user_id='${a}' and role_key='editor';insert into storage.buckets(id,name) values('personal','personal');insert into storage.objects(bucket_id,name,owner,owner_id) values('personal','file','${a}','${a}'),('news-images','shared.webp','${a}','${a}'),('personal','other','${b}','${b}');`)
for(const role of ['anon','authenticated']){
 await as(a,role)
 await assert.rejects(db.query(`select account_deletion_begin('${a}','${session}')`));checks++
 await assert.rejects(db.query(`select account_deletion_storage('${b}','${session}')`));checks++
}
await as(null,'service_role')
const start=(await db.query(`select account_deletion_begin('${a}','${session}') as result`)).rows[0].result
check(start.code==='started','Ordinary member can start through the server-only RPC')
check((await db.query(`select account_deletion_begin('${a}','${session}') as result`)).rows[0].result.code==='in_progress','Duplicate request is locked')
check((await db.query(`select account_deletion_begin('${b}','${session}') as result`)).rows[0].result.code==='session_required','Session for another user cannot start deletion')
await db.query(`select account_deletion_retain_editorial($1,$2)`,[a,start.job_id])
const files=(await db.query('select account_deletion_storage($1,$2) as result',[a,start.job_id])).rows[0].result
check(files.length===1&&files[0].name==='file','Storage inventory includes only the member’s personal object')
await as(null,'postgres')
check((await db.query("select owner_id from storage.objects where bucket_id='news-images'")).rows[0].owner_id===null,'Editorial file remains with account ownership removed')
// Simulated Storage API physical deletion in this isolated stub, never production SQL.
await db.exec("delete from storage.objects where bucket_id='personal' and name='file'")
await db.exec(`delete from auth.users where id='${a}'`)
const kept=(await db.query('select * from forum_topics where id=$1',[topic.id])).rows[0]
check(kept.user_id===null&&kept.author_name==='Verwijderd account','Topic author is anonymized')
check(String(kept.created_at)===String(topic.created_at)&&kept.body==='Publieke discussie','Public content and original timestamp survive')
check((await db.query('select user_id from forum_posts where id=$1',[reply.id])).rows[0].user_id===b,'Other member’s reply survives')
const news=(await db.query('select * from news_articles where id=$1',[article.id])).rows[0]
check(news.author_id===null&&news.last_editor_id===null&&news.author_name==='FVT-redactie','Editorial authorship safely detached through existing RBAC guards')
check(String(news.updated_at)===String(article.updated_at),'Editorial timestamp unchanged by anonymization')
for(const table of ['profiles','user_preferences','fantasy_teams','team_versions','user_roles']){const key=table==='profiles'?'id':'user_id';check((await db.query(`select count(*)::int n from ${table} where ${key}=$1`,[a])).rows[0].n===0,table+' private rows removed')}
check((await db.query('select count(*)::int n from private.account_deletion_jobs')).rows[0].n===0,'Completed job no longer stores user identity')
check((await db.query("select count(*)::int n from admin_audit_log where action='account.deletion_completed'")).rows[0].n===1,'One durable completion audit event')
check((await db.query("select owner_id from storage.objects where name='other'")).rows[0].owner_id===b,'Other member’s Storage object untouched')
await assert.rejects(db.query('delete from auth.users where id=$1',[admin]));checks++
await as(b)
check((await db.query(`update news_articles set title='Unauthorized change' where id=$1 returning id`,[article.id])).rows.length===0,'Member cannot bypass editorial RLS after anonymization')
await db.close();console.log(`${checks} account deletion database checks passed (isolated).`)
