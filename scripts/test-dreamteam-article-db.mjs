import {dreamDefaults,prepareDream} from '../src/services/dreamTeamArticle.js'
import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))

await db.exec("insert into auth.users values('00000000-0000-4000-8000-000000000002'); insert into user_roles(user_id,role_key) values('00000000-0000-4000-8000-000000000002','editor'); set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false)");
const candidates=Object.entries({keeper:3,verdediger:8,middenvelder:8,aanvaller:6}).flatMap(([position,n])=>Array.from({length:n},(_,i)=>({id:position+i,name:position+i,club:'Club '+i,season:'2026/2027',position,fantasyPoints:10-i,minutes:90,selectedPct:5,startPrice:5,endPrice:5})))
const {block}=prepareDream(dreamDefaults(),candidates);block.id='dream1';block.type='dreamTeam';block.analyses.keeper='Vrije analyse';
const content={version:1,blocks:[{id:'intro',type:'paragraph',text:'Dit is voldoende redactionele introductie voor een artikel.'},block]};
const saved=await db.query('insert into news_articles(title,slug,content_blocks) values($1,$2,$3) returning id,content_blocks',['Test','dream-test',JSON.stringify(content)]);assert.deepEqual(saved.rows[0].content_blocks,content);
const bad=structuredClone(content);bad.blocks[1].xi[0]=bad.blocks[1].xi[1];await assert.rejects(db.query('update news_articles set content_blocks=$1 where id=$2',[JSON.stringify(bad),saved.rows[0].id]));
const after=await db.query('select content_blocks from news_articles where id=$1',[saved.rows[0].id]);assert.deepEqual(after.rows[0].content_blocks,content);
console.log('Dreamteam database save/reload, duplicate rejection and unchanged record after failure passed');await db.close();
