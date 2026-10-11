import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
const ids=Object.fromEntries(['member','editor','publisher','moderator'].map((r,i)=>[r,`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]))
for(const [r,id]of Object.entries(ids)){await db.query('insert into auth.users values($1)',[id]);if(r!=='member')await db.query('insert into user_roles(user_id,role_key) values($1,$2)',[id,r])}
const as=id=>db.exec(`reset role;set role ${id?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${id||''}',false)`),denied=async sql=>{await assert.rejects(db.query(sql));checks++}
let checks=0
const settings=(await db.query("select * from storage.buckets where id='news-images'")).rows[0];assert.equal(settings.file_size_limit,5242880);assert.deepEqual(settings.allowed_mime_types,['image/jpeg','image/png','image/webp']);checks+=2
await as(null);await denied(`insert into storage.objects(bucket_id,name) values('news-images','${ids.editor}/00000000-0000-4000-8000-000000000001.jpg')`)
for(const role of ['member','moderator']){await as(ids[role]);await denied(`insert into storage.objects(bucket_id,name) values('news-images','${ids[role]}/00000000-0000-4000-8000-000000000001.jpg')`)}
const path=ids.editor+'/00000000-0000-4000-8000-000000000001.jpg'
await as(ids.editor);await db.query(`insert into storage.objects(bucket_id,name) values('news-images',$1)`,[path]);checks++
await denied(`insert into storage.objects(bucket_id,name) values('news-images','${ids.publisher}/00000000-0000-4000-8000-000000000002.png')`)
await denied(`insert into storage.objects(bucket_id,name) values('news-images','${ids.editor}/../../evil.svg')`)
assert.equal((await db.query(`update storage.objects set name='overwritten' returning id`)).rows.length,0);checks++
await db.query(`insert into news_articles(title,slug,image_url) values('Referenced image','referenced-image',$1)`,['https://rzunbquzffdivlpuomjc.supabase.co/storage/v1/object/public/news-images/'+path]);
assert.equal((await db.query(`delete from storage.objects where name=$1 returning id`,[path])).rows.length,0);checks++
await as(ids.publisher);assert.equal((await db.query(`delete from storage.objects where name=$1 returning id`,[path])).rows.length,0);checks++
await as(ids.editor);await db.query(`update news_articles set image_url='' where slug='referenced-image'`);assert.equal((await db.query(`delete from storage.objects where name=$1 returning id`,[path])).rows.length,1);checks++
// Versioned blocks retain content RLS and protect inline/carousel Storage references.
const blocks={version:1,blocks:[{id:'text',type:'paragraph',text:'Een volledig artikel voor de gerichte beveiligingstest.'},{id:'image',type:'image',size:'medium',align:'center',url:'https://rzunbquzffdivlpuomjc.supabase.co/storage/v1/object/public/news-images/'+path,alt:'Testbeeld'}]}
await as(ids.editor);await db.query("insert into storage.objects(bucket_id,name) values('news-images',$1)",[path]);
await db.query("update news_articles set content_blocks=$1,body='Bestaande tekst blijft veilig bewaard.',intro='Een korte introductie.' where slug='referenced-image'",[JSON.stringify(blocks)]);
assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,0);checks++;
for(const who of [null,ids.member]){await as(who);assert.equal((await db.query("select * from news_articles where slug='referenced-image'")).rows.length,0);checks++}
await as(ids.member);assert.equal((await db.query("update news_articles set content_blocks=null where slug='referenced-image' returning id")).rows.length,0);checks++;
await as(ids.editor);await denied("update news_articles set status='published',published_at=now() where slug='referenced-image'");
await assert.rejects(db.query("update news_articles set content_blocks=$1 where slug='referenced-image'",[JSON.stringify({version:1,blocks:[blocks.blocks[0],blocks.blocks[0]]})]));checks++;
await as(ids.publisher);const noAlt=structuredClone(blocks);noAlt.blocks[1].alt='';await assert.rejects(db.query("update news_articles set status='published',published_at=now(),content_blocks=$1 where slug='referenced-image'",[JSON.stringify(noAlt)]));checks++;
await db.query("update news_articles set status='published',published_at=now() where slug='referenced-image'");checks++;
await as(null);assert.equal((await db.query("select content_blocks from news_articles where slug='referenced-image'")).rows[0].content_blocks.version,1);checks++;
await as(ids.publisher);await db.query("update news_articles set status='draft' where slug='referenced-image'");const carousel={version:1,blocks:[blocks.blocks[0],{id:'carousel',type:'imageCarousel',size:'full',images:[blocks.blocks[1],blocks.blocks[1],blocks.blocks[1],blocks.blocks[1]]}]};await db.query("update news_articles set content_blocks=$1 where slug='referenced-image'",[JSON.stringify(carousel)]);
await as(ids.editor);assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,0);checks++;
await db.query("update news_articles set content_blocks=null where slug='referenced-image'");assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,1);checks++;
assert.equal((await db.query("select body from news_articles where slug='referenced-image'")).rows[0].body,'Bestaande tekst blijft veilig bewaard.');checks++;
await as(ids.publisher);await db.query("update news_articles set body='Kort',content_blocks=$1,status='published',published_at=now() where slug='referenced-image'",[JSON.stringify(blocks)]);assert.equal((await db.query("select body from news_articles where slug='referenced-image'")).rows[0].body,'Kort');checks++;
const emptyBlocks={version:1,blocks:[]};await assert.rejects(db.query("update news_articles set content_blocks=$1 where slug='referenced-image'",[JSON.stringify(emptyBlocks)]));checks++;
await db.close();console.log(`${checks} new-bucket Storage RLS checks passed. Existing RBAC/content policies unchanged; hosted MIME/size enforcement is also tested live.`)
