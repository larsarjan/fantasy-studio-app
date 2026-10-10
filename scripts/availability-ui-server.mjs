// Isolated browser acceptance backend. Never connects to production or holds credentials.
import {PGlite} from '@electric-sql/pglite'
import {createServer} from 'node:http'
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs'
const dataset=JSON.parse(readFileSync(process.env.AVAILABILITY_TEST_DATA||'test-results/personal-source.json','utf8'))
const db=new PGlite(),actor='00000000-0000-4000-8000-000000000001'
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text);create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;`)
for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))
await db.exec(`insert into auth.users values('${actor}');insert into user_roles(user_id,role_key) values('${actor}','super_admin');insert into reference_imports(id,counts) values('00000000-0000-4000-8000-000000000010','{}')`)
await db.query("insert into players(id,import_id,payload) select ordinality::text,'00000000-0000-4000-8000-000000000010',value from jsonb_array_elements($1) with ordinality",[JSON.stringify(dataset.players)])
await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);set role authenticated`)
const fixturePlayers=dataset.players.slice(0,3)
const writeStatus=(p,status_type,pct)=>db.query('select public.availability_save($1,0)',[JSON.stringify({player_id:String(p.id),season:p.season,status_type,availability_percentage:pct,reason:'Uitsluitend lokale acceptatiefixture',start_date:'2026-01-01',source_name:'Lokale test',is_manual_override:true,notes:'Interne lokale testnotitie'})])
await writeStatus(fixturePlayers[0],'injury',0);await writeStatus(fixturePlayers[1],'suspension',0);await writeStatus(fixturePlayers[2],'doubt',75)
await db.query('select public.availability_sources($1)',[JSON.stringify({key:'fixture-club',name:'Lokale connectorfixture',approved:true})])
await db.exec('reset role;set role service_role')
for(const external of ['fixture-1','fixture-2'])await db.query('select public.availability_propose($1,$2,$3)',['fixture-club',external,JSON.stringify({player_id:String(fixturePlayers[0].id),season:fixturePlayers[0].season,status_type:'doubt',availability_percentage:50,reason:'Lokaal bronvoorstel'})])
await db.exec('reset role;set role authenticated')
const signatures={availability_list:['admin_mode'],availability_save:['data','expected_revision'],availability_history:['player','player_season','admin_mode'],availability_sources:['data'],availability_proposals:['proposal','decision','expected_revision']}
mkdirSync('test-results/availability',{recursive:true});writeFileSync('test-results/availability/fixture-players.json',JSON.stringify(fixturePlayers))
writeFileSync('test-results/availability/harness.html',readFileSync('scripts/availability-ui-harness.html','utf8'))
let queue=Promise.resolve()
createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5180');res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Content-Type','application/json')
 if(req.method==='OPTIONS'){res.end();return}
 let body='';for await(const chunk of req)body+=chunk
 queue=queue.then(async()=>{
  try{
   const input=JSON.parse(body||'{}'),url=new URL(input.url||'http://local/'),path=url.pathname
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1),keys=signatures[name]
    if(!keys)throw Error('Blocked isolated RPC: '+name)
    const data=input.body||{},params=keys.map(k=>data[k]??(k==='admin_mode'?false:null))
    const result=await db.query(`select public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) as result`,params.map(p=>p&&typeof p==='object'?JSON.stringify(p):p))
    res.end(JSON.stringify(result.rows[0].result));return
   }
   if(path.endsWith('/reference_imports')){res.end(JSON.stringify([{id:'local',created_at:new Date().toISOString(),counts:Object.fromEntries(Object.entries(dataset).map(([k,v])=>[k,v.length]))}]));return}
   const table=path.split('/').at(-1)
   const rows=dataset[table]||[];const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000)
   res.end(JSON.stringify(rows.slice(offset,offset+limit).map(payload=>({payload}))))
  }catch(error){res.statusCode=400;res.end(JSON.stringify({message:error.message,code:error.code||'test_error'}))}
 }).catch(()=>{})
}).listen(5191,'127.0.0.1',()=>console.log('Isolated availability UI backend on 127.0.0.1:5191; no production writes.'))
