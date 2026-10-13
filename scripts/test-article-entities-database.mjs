import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
let checks=0
const ok=(value,label)=>{assert(value,label);checks++;console.log('PASS',label)}
const query=async(sql,args=[])=> (await db.query(sql,args)).rows
const denied=async(sql,args=[])=>{await assert.rejects(()=>query(sql,args));checks++}
const member='00000000-0000-4000-8000-000000000001',editor='00000000-0000-4000-8000-000000000002'
await db.query('insert into auth.users values($1),($2)',[member,editor])
await db.query("insert into user_roles(user_id,role_key) values($1,'publisher')",[editor])
const snapshot=(await query("insert into reference_imports(source,counts) values('Google Sheets','{}') returning id"))[0].id
const player={id:'p1',season:'2026/2027',name:'Local test',club:'PSV',position:'Spits',notes:'PRIVATE',email:'PRIVATE'}
for(const [table,payload] of [['players',player],['fixtures',{id:'f1',season:player.season,round:1,home:'PSV',away:'Ajax',date:'2026-08-01'}],['player_match_stats',{id:'s1',season:player.season,fixtureId:'f1',playerId:'p1',minutes:90,matchStatus:true,notes:'PRIVATE'}]])await db.query(`insert into ${table}(id,import_id,payload) values($3,$1,$2)`,[snapshot,payload,payload.id])
const as=async(role,id='')=>db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${id}',false)`)
const read=async(kind,id='p1')=>(await query('select public.article_entity_data($1,$2,$3) result',[kind,id,player.season]))[0].result
for(const [role,id] of [['anon',''],['authenticated',member]]){
 await as(role,id);const data=await read('player');ok(data.player.id==='p1',role+' reads narrow public football facts');ok(!JSON.stringify(data).includes('PRIVATE'),role+' cannot see internal fields')
 await denied("select article_entity_data('catalog')");await denied("select article_entity_data(null,'p1','2026/2027')");await denied("select article_entity_data('player','bad id','2026/2027')")
 ok(await read('player','missing')===null,'Missing mapping returns no guessed player')
 const summary=await read('summary','f1');ok(summary.stats.length===0&&summary.players.length===0,'Collapsed summary has no player statistics')
}
await as('authenticated',editor);ok((await read('catalog')).players.length===1,'Editor can read candidate catalog')
const content={version:1,blocks:[{id:'text',type:'paragraph',text:'⚽ Local test is alleen lokale testdata.',players:[{start:2,end:12,text:'Local test',playerId:'p1',season:player.season}]}]}
const insert=async c=>query("insert into news_articles(title,slug,body,intro,status,content_blocks) values('Local-only article',gen_random_uuid()::text,'Local-only article body','Local-only intro','draft',$1) returning id",[c])
const id=(await insert(content))[0].id;ok(!!id,'UTF-16 offsets are validated without rewriting content')
assert.deepEqual((await query('select content_blocks from news_articles where id=$1',[id]))[0].content_blocks,content);checks++
for(const bad of [{...content.blocks[0].players[0],end:900},{...content.blocks[0].players[0],text:'Wrong'},null]){const copy=structuredClone(content);copy.blocks[0].players=[bad];await assert.rejects(()=>insert(copy));checks++}
const overlap=structuredClone(content);overlap.blocks[0].players.push({...overlap.blocks[0].players[0]});await assert.rejects(()=>insert(overlap));checks++
const match={id:'match',type:'match',fixtureId:'f1',season:player.season,collapsedByDefault:true,showTopScorer:true,showLegend:true,showSubstitutes:true,playerLinks:true};content.blocks.push(match);ok(!!(await insert(content))[0].id,'Optional match block accepted');match.playerLinks='true';await assert.rejects(()=>insert(content));checks++
await as('authenticated',member);await assert.rejects(()=>insert({version:1,blocks:[]}));checks++
await db.close();console.log(`${checks} article entity database/security checks passed.`)
