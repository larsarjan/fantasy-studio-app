import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
// Hosted service_role already has these article privileges; reproduce that here.
await db.exec('grant select,update on public.news_articles to service_role')
const ids={member:'00000000-0000-4000-8000-000000000001',publisher:'00000000-0000-4000-8000-000000000002'}
await db.query('insert into auth.users values($1),($2)',Object.values(ids));await db.query("insert into user_roles(user_id,role_key) values($1,'publisher')",[ids.publisher])
let checks=0
const ok=(value,label)=>{assert(value,label);checks++;console.log('PASS',label)}
const as=async(role='authenticated',id='')=>db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${id}',false)`)
const fixtures={}
await as('authenticated',ids.publisher)
for(const state of ['published','second','draft','hidden','scheduled','future']){
 const r=await db.query('insert into news_articles(title,slug,body,intro,status,published_at) values($1,$2,$3,$4,$5,$6) returning id',[state+' article',state+'-views','Veilige lokale testtekst voor artikelstatistiek.','Veilige introductie.',state==='second'||state==='future'?'published':state,['draft','hidden'].includes(state)?null:new Date(Date.now()+(state==='future'||state==='scheduled'?86400000:-86400000)).toISOString()]);fixtures[state]=r.rows[0].id
}
const expires=new Date(Date.now()+86400000).toISOString(),hash='a'.repeat(64),other='b'.repeat(64)
const record=async(article,visitor=hash)=>{const r=await db.query('select public.record_article_view($1,$2,$3) as total',[article,visitor,expires]);return r.rows[0].total}
const total=async article=>(await db.query('select public.article_view_total($1) as total',[article])).rows[0].total
await as('service_role');ok(await record(fixtures.published)===1,'Published first view increments total')
ok(await record(fixtures.published)===1,'Refresh deduplicates within 30 minutes')
ok(await record(fixtures.second)===1,'Same session on another article counts independently')
ok(await record(fixtures.published,other)===2,'New session increments total')
for(const state of ['draft','hidden','scheduled','future'])ok(await record(fixtures[state])===null,state+' cannot register a view')
await as('authenticated',ids.publisher)
let stats=(await db.query('select * from article_view_statistics($1)',[[fixtures.published]])).rows[0]
ok(stats.total_views===2&&stats.unique_views===2,'Editorial stats contain correct total and uniques')
ok(!!stats.last_view_at,'Last-view timestamp is available internally')
ok((await db.query('select * from article_view_statistics($1)',[[fixtures.draft]])).rows[0].total_views===0,'Article with no views has zero statistics')
ok(await total(fixtures.published)===2,'Reading editorial statistics does not count a view')
await as('service_role');await db.query("update private.news_view_sessions set last_counted_at=now()-interval '31 minutes' where article_id=$1 and session_hash=$2",[fixtures.published,hash]);ok(await record(fixtures.published)===3,'Same session counts again after window')
await as('authenticated',ids.publisher);stats=(await db.query('select * from article_view_statistics($1)',[[fixtures.published]])).rows[0];ok(stats.total_views===3&&stats.unique_views===2,'Repeat after window does not inflate unique sessions')
for(const [role,id] of [['anon',''],['authenticated',ids.member]]){
 await as(role,id);ok(await total(fixtures.published)===3,role+' can read only public total')
 await assert.rejects(()=>record(fixtures.published));checks++
 await assert.rejects(()=>db.query('select * from private.news_view_totals'));checks++
 await assert.rejects(()=>db.query('select * from private.news_view_sessions'));checks++
 await assert.rejects(()=>db.query('update private.news_view_totals set total_views=999'));checks++
 await assert.rejects(()=>db.query('select * from article_view_statistics($1)',[[fixtures.published]]));checks++
 for(const state of ['draft','hidden','scheduled','future'])ok(await total(fixtures[state])===null,role+' cannot read '+state+' totals')
}
await as('service_role');await assert.rejects(()=>record(fixtures.published,'not-a-hash'));checks++
await assert.rejects(()=>db.query('select record_article_view($1,$2,$3)',[fixtures.published,hash,new Date(Date.now()-1000).toISOString()]));checks++
await db.exec('reset role');await db.query("insert into user_roles(user_id,role_key) values($1,'super_admin')",[ids.publisher]);await as('authenticated',ids.publisher);await db.query("update site_features set enabled=false where key='news'");await as('service_role');ok(await record(fixtures.published)===null,'Disabled news feature cannot register views');await as('authenticated',ids.publisher);await db.query("update site_features set enabled=true where key='news'");await db.exec('reset role');
await db.query("update private.news_view_sessions set expires_at=now()-interval '1 second' where article_id=$1",[fixtures.second]);await db.exec('delete from private.news_view_sessions where expires_at<now()');ok((await db.query('select count(*)::int n from private.news_view_sessions where article_id=$1',[fixtures.second])).rows[0].n===0,'Expired session hash is removed');ok((await db.query('select total_views from private.news_view_totals where article_id=$1',[fixtures.second])).rows[0].total_views===1,'Retention preserves aggregate totals')
await db.query('delete from news_articles where id=$1',[fixtures.second]);ok((await db.query('select count(*)::int n from private.news_view_totals where article_id=$1',[fixtures.second])).rows[0].n===0,'Article deletion cascades analytics cleanup')
await db.close();console.log(`${checks} article view database/security checks passed.`)
