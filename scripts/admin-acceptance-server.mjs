// Isolated acceptance backend: simulated Auth/PostgREST transport, real PostgreSQL RLS.
// Never deployed. No calls to production and no production accounts/content created.
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
const db = new PGlite(), sessions = new Map(), users = new Map()
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant all on tables to anon,authenticated;`)
for (const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
for(const [i,role] of ['member','moderator','editor','publisher','admin','super_admin'].entries()) {
 const id=`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`
 await db.query('insert into auth.users values($1)',[id]);if(role!=='member')await db.query('insert into user_roles(user_id,role_key) values($1,$2)',[id,role])
 await db.query('update profiles set display_name=$1 where id=$2',['Acceptatie '+role,id]);users.set(role+'@fvt.test',{id,email:role+'@fvt.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()})
}
await db.query(`insert into player_photos(player_key) values('studio:2026/2027:20260001')`)
await db.query(`with imported as (insert into reference_imports(source) values('Isolated acceptance') returning id) insert into players(id,import_id,payload) select 'acceptance',id,'{"id":"20260001","name":"Local Test Player","club":"Local Club","season":"2026/2027"}' from imported`)
const tables = new Set((await db.query(`select tablename from pg_tables where schemaname='public'`)).rows.map(r=>r.tablename))
const rpcArguments = {
 current_access:[],feature_access:['feature'],public_video_catalog:[],admin_sync_started:[],
 admin_player_photos:['query_text','start_offset'],admin_set_photo_override:['target_key','photo_url','is_enabled','expected_updated_at'],
 admin_assign_roles:['target','requested','reason'],admin_manage_status:['target','new_status','reason'],
 moderate_forum_topic:['topic','is_pinned','is_closed'],admin_moderate_content:['target_table','target','operation','reason','category'],
 save_preferences:['new_settings','expected_version'],save_fantasy_team:['team_slug','team_name','team_state','manager_settings','expected_version'],save_transfer_editorial:['records','expected_version'],
}
function session(user) {const token=Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.local';sessions.set(token,user);return{access_token:token,refresh_token:token,expires_in:3600,token_type:'bearer',user}}
async function handle(req,res) {
 res.setHeader('Access-Control-Allow-Origin','http://localhost:5180');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,HEAD,POST,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Expose-Headers','Content-Range');res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store')
 const send=(data,code=200)=>{res.statusCode=code;res.end(req.method==='HEAD'?'':JSON.stringify(data))}
 if(req.method==='OPTIONS')return send({})
 const url=new URL(req.url,'http://localhost'),user=sessions.get((req.headers.authorization||'').replace('Bearer ',''));let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{}
 if(url.pathname==='/auth/v1/token'){const found=users.get(body.email)||sessions.get(body.refresh_token);if(!found||body.password&&body.password!=='FvtLocalAcceptance!2026')return send({code:'invalid_credentials',message:'Invalid credentials'},400);return send(session(found))}
 if(url.pathname==='/auth/v1/user')return send(user||{},user?200:401)
 if(url.pathname==='/auth/v1/logout')return send({})
 await db.exec(`reset role;set role ${user?'authenticated':'anon'}`);await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[user?.id||''])
 const rpc=url.pathname.split('/rpc/')[1]
 if(rpc){if(!Object.hasOwn(rpcArguments,rpc))return send({},403);const args=rpcArguments[rpc].map(k=>body[k]??null);const r=await db.query(`select public.${rpc}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args);return send(r.rows[0].result)}
 const table=url.pathname.split('/rest/v1/')[1];if(!tables.has(table))return send({},404)
 const cols=(await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`,[table])).rows.map(r=>r.column_name),params=[],clauses=[]
 for(const [key,value]of url.searchParams){if(!cols.includes(key))continue;const dot=value.indexOf('.'),op=value.slice(0,dot),v=value.slice(dot+1);if(['eq','ilike','lte','gte'].includes(op)){params.push(v);clauses.push(`"${key}" ${ {eq:'=',ilike:'ilike',lte:'<=',gte:'>='}[op]} $${params.length}`)}else if(op==='in'){params.push(v.slice(1,-1).split(','));clauses.push(`"${key}"=any($${params.length})`)}}
 const where=clauses.length?' where '+clauses.join(' and '):'',order=(url.searchParams.get('order')||'').split(',').map(s=>s.split('.')).filter(([c])=>cols.includes(c)).map(([c,dir])=>`"${c}" ${dir==='desc'?'desc':'asc'}`).join(','),offset=Math.max(0,Number(url.searchParams.get('offset'))||0),limit=Math.min(1000,Math.max(1,Number(url.searchParams.get('limit'))||1000));let rows
 if(['GET','HEAD'].includes(req.method)){const count=(await db.query(`select count(*)::int n from public."${table}"${where}`,params)).rows[0].n;res.setHeader('Content-Range',`0-${Math.max(0,count-1)}/${count}`);rows=(await db.query(`select * from public."${table}"${where}${order?' order by '+order:''} limit ${limit} offset ${offset}`,params)).rows;
  if(table==='profiles'&&(url.searchParams.get('select')||'').includes('user_roles'))for(const row of rows)row.user_roles=(await db.query('select role_key from user_roles where user_id=$1',[row.id])).rows
 }else{const values=Object.entries(body);if(values.some(([k])=>!cols.includes(k)))return send({message:'Invalid column'},400);if(req.method==='POST')rows=(await db.query(`insert into public."${table}"(${values.map(([k])=>'"'+k+'"').join(',')}) values(${values.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,values.map(([,v])=>v))).rows;else if(req.method==='PATCH'){const length=params.length;rows=(await db.query(`update public."${table}" set ${values.map(([k],i)=>`"${k}"=$${length+i+1}`).join(',')}${where} returning *`,[...params,...values.map(([,v])=>v)])).rows}else if(req.method==='DELETE')rows=(await db.query(`delete from public."${table}"${where} returning *`,params)).rows;else return send({},405)}
 const single=(req.headers.accept||'').includes('vnd.pgrst.object');if(single&&rows.length!==1)return send({code:'PGRST116',details:`The result contains ${rows.length} rows`},406);return send(single?rows[0]:rows,req.method==='POST'?201:200)
}
let queue=Promise.resolve()
const server=http.createServer((req,res)=>{queue=queue.then(()=>handle(req,res)).catch(e=>{res.statusCode=e.code==='42501'?403:400;res.end(JSON.stringify({code:e.code,message:e.message}));console.error('Acceptance API:',e.code,e.message)})})
server.listen(54322,'127.0.0.1',()=>console.log('Isolated admin acceptance API ready at localhost:54322'))
process.on('SIGINT',async()=>{server.close();await db.close();process.exit()})
