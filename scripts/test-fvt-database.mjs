import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite();let checks=0
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant all on tables to anon,authenticated;`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&!f.includes('prominents_')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',ed='00000000-0000-4000-8000-000000000003'
await db.exec(`insert into auth.users values('${a}'),('${b}'),('${ed}');update profiles set role='editor' where id='${ed}'`)
const as=async id=>db.exec(`reset role;set role ${id?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${id||''}',false)`)
const rows=async(sql,args=[]) => (await db.query(sql,args)).rows
const check=(value,label)=>{assert(value,label);checks++;console.log(label)}
const denied=async(sql,args=[])=>{await assert.rejects(db.query(sql,args));checks++}
await as(null);check((await rows('select * from forum_categories')).length===7,'Public categories available')
await denied(`insert into forum_topics(category_id,title,body) select id,'Test topic','Test body' from forum_categories limit 1`)
await denied('select * from profiles')
await as(a);await db.exec("update profiles set display_name='Public Test Name'")
const topic=(await rows(`insert into forum_topics(category_id,title,body) select id,'Test topic','Test body' from forum_categories limit 1 returning *`))[0]
check(topic.author_name==='Public Test Name'&&topic.user_id===a,'Author and ownership stamped from private profile')
await denied(`insert into forum_posts(topic_id,body) values($1,'Too fast')`,[topic.id])
await denied(`update forum_topics set user_id=$1 where id=$2`,[b,topic.id])
await denied(`update forum_topics set author_name='Impersonated'`)
await denied(`update forum_topics set pinned=true`)
await denied(`select moderate_forum_topic($1,true,true)`,[topic.id])
await denied(`insert into news_articles(title,slug) values('Forbidden','forbidden')`)
await as(b);check((await rows(`update forum_topics set title='Attack' where id=$1 returning id`,[topic.id])).length===0,'Cross-user topic update denied')
check((await rows(`delete from forum_topics where id=$1 returning id`,[topic.id])).length===0,'Cross-user topic delete denied')
const reply=(await rows(`insert into forum_posts(topic_id,body) values($1,'Reply by user B') returning *`,[topic.id]))[0]
check(reply.user_id===b,'Authenticated reply persists')
await as(a);check((await rows(`update forum_posts set body='Attack' where id=$1 returning id`,[reply.id])).length===0,'Cross-user reply update denied')
await db.exec("update profiles set display_name='Renamed Author'");check((await rows('select author_name from forum_topics where id=$1',[topic.id]))[0].author_name==='Renamed Author','Public author name follows profile edits')
await as(ed);await db.query(`select moderate_forum_topic($1,true,true)`,[topic.id]);check((await rows('select closed from forum_topics where id=$1',[topic.id]))[0].closed,'Editor can moderate')
await as(b);await denied(`update forum_posts set body='Closed reply edit' where id=$1`,[reply.id])
await as(ed);const article=(await rows(`insert into news_articles(title,slug,intro,body) values('Test draft','test-draft','Explicit test intro','Explicit acceptance content, not real news.') returning *`))[0]
await as(null);check((await rows('select * from news_articles')).length===0,'Anonymous cannot read drafts')
await as(a);check((await rows('select * from news_articles')).length===0,'Viewer cannot read drafts')
check((await rows(`update news_articles set status='published',published_at=now() where id=$1 returning id`,[article.id])).length===0,'Viewer cannot publish')
await as(ed);await db.query(`update news_articles set status='published',published_at=now() where id=$1`,[article.id])
await as(null);check((await rows('select * from news_articles')).length===1,'Published article is public')
await as(ed);await db.query(`update news_articles set published_at=now()+interval '1 day' where id=$1`,[article.id])
await as(null);check((await rows('select * from news_articles')).length===0,'Scheduled article remains private until publication time')
await denied('select * from fantasy_teams')
await as(a);check((await rows('select * from profiles')).length===1,'Existing private profile isolation preserved')
await db.close();console.log(`${checks} FVT database/security checks passed`)
