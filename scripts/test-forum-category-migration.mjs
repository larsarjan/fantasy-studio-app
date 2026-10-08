import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite();const migration=readdirSync('supabase/migrations').find(f=>f.endsWith('_fvt_forum_categories_polish.sql'))
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&!f.includes('prominents_')&&f!==migration).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
await db.exec(`insert into auth.users values('${a}'),('${b}');insert into forum_categories(name) values('Custom community category');alter table forum_topics disable trigger prepare_forum_topic;insert into forum_topics(category_id,user_id,title,body,author_name) select id,'${a}',name,'Existing topic body','Existing Author' from forum_categories;alter table forum_topics enable trigger prepare_forum_topic;select set_config('request.jwt.claim.sub','${a}',false);insert into forum_posts(topic_id,body) select id,'Existing reply' from forum_topics limit 1;`)
const q=async(sql,args=[]) => (await db.query(sql,args)).rows
const before=await q('select id,user_id,title,body,created_at,updated_at from forum_topics order by id'),posts=await q('select * from forum_posts order by id'),policies=await q('select * from pg_policies order by schemaname,tablename,policyname')
await db.exec("select set_config('request.jwt.claim.sub','',false)");await db.exec(readFileSync('supabase/migrations/'+migration,'utf8'))
assert.deepEqual(await q('select id,user_id,title,body,created_at,updated_at from forum_topics order by id'),before)
assert.deepEqual(await q('select * from forum_posts order by id'),posts)
assert.deepEqual(await q('select * from pg_policies order by schemaname,tablename,policyname'),policies)
const mapping={'Mijn selectie':'Selectie & Transfers','Transfers & Wildcards':'Selectie & Transfers','Captainkeuze':'Speelrondes & Captainkeuzes','Speelronde-discussie':'Speelrondes & Captainkeuzes','FVT-video’s':'FVT-video’s & content'}
for(const row of await q('select t.title,c.name from forum_topics t join forum_categories c on c.id=t.category_id'))assert.equal(row.name,mapping[row.title]||row.title)
assert.equal((await q('select count(*)::int as n from forum_categories'))[0].n,8)
assert.equal((await q("select tgenabled from pg_trigger where tgname='prepare_forum_topic'"))[0].tgenabled,'O')
await assert.rejects(db.query("insert into forum_topics(category_id,title,body) select id,'No actor','Denied write' from forum_categories limit 1"))
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${b}',false)`)
assert.equal((await q("update forum_topics set title='Forbidden' returning id")).length,0)
await db.close();console.log('Migration preserves all 8 existing topics, replies, identities, timestamps, custom category and RLS; owner protection and posting trigger intact')
