// Local-only test double for the Supabase HTTP contract. Never deployed.
// Uses real PostgreSQL RLS via PGlite; auth delivery is intentionally simulated.
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync,readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const testPassword = process.env.STUDIO_TEST_PASSWORD
if (!testPassword || testPassword.length < 12) throw new Error('Set STUDIO_TEST_PASSWORD to a temporary password of at least 12 characters')
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'))
const users = new Map()
for(const [email,id] of [['a@studio.test','00000000-0000-4000-8000-000000000001'],['b@studio.test','00000000-0000-4000-8000-000000000002']]) {
  users.set(email,{id,email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()})
  await db.query('insert into auth.users values($1)',[id])
}
const sessions = new Map()
let queue = Promise.resolve()
function session(user) {
  const token = `${Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`
  sessions.set(token,user)
  return {access_token:token,refresh_token:token,expires_in:3600,token_type:'bearer',user}
}
async function handle(req,res) {
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5173')
  res.setHeader('Access-Control-Allow-Headers','*')
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Content-Type','application/json')
  if(req.method==='OPTIONS'){res.end();return}
  const url = new URL(req.url,'http://127.0.0.1')
  let text=''; for await(const chunk of req) text+=chunk
  const body=text?JSON.parse(text):{}
  const user=sessions.get((req.headers.authorization??'').replace('Bearer ',''))
  const send=(data,status=200)=>{res.statusCode=status;res.end(JSON.stringify(data))}
  if(url.pathname==='/auth/v1/token') {
    const found=url.searchParams.get('grant_type')==='refresh_token'?sessions.get(body.refresh_token):users.get(body.email)
    if(!found || (body.password && body.password!==testPassword)) return send({code:'invalid_credentials',message:'Invalid login credentials'},400)
    return send(session(found))
  }
  if(url.pathname==='/auth/v1/logout') return send({})
  if(url.pathname==='/auth/v1/user') return user?send(user):send({},401)
  if(url.pathname==='/auth/v1/recover') return send({})
  if(url.pathname==='/auth/v1/signup') return send({user:{id:randomUUID(),email:body.email},session:null})
  if(!user) return send({message:'Not authenticated'},401)
  await db.exec(`reset role; set role authenticated`)
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[user.id])
  const rpc=url.pathname.split('/rpc/')[1]
  if(rpc) {
    const args = rpc==='save_fantasy_team' ? [body.team_slug,body.team_name,body.team_state,body.manager_settings,body.expected_version] : rpc==='save_transfer_editorial' ? [body.records] : null
    if(!args) return send({},403)
    const result=await db.query(`select public.${rpc}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)
    return send(result.rows[0].result)
  }
  const table=url.pathname.split('/rest/v1/')[1]
  if(!['profiles','user_preferences','fantasy_teams','team_versions','transfer_editorial','reference_imports'].includes(table)) return send([],200)
  if(req.method==='POST' && table==='user_preferences') {
    await db.query('insert into user_preferences(user_id,settings) values($1,$2) on conflict(user_id) do update set settings=excluded.settings',[body.user_id,body.settings]); return send(null,201)
  }
  if(req.method!=='GET') return send({},405)
  const params=[], clauses=[]
  for(const [key,value] of url.searchParams) if(['id','user_id','slug'].includes(key)&&value.startsWith('eq.')) {params.push(value.slice(3));clauses.push(`${key}=$${params.length}`)}
  const result=await db.query(`select * from public.${table}${clauses.length?' where '+clauses.join(' and '):''}`,params)
  const single=(req.headers.accept??'').includes('vnd.pgrst.object')
  if(single && result.rows.length!==1) return send({code:'PGRST116',details:`The result contains ${result.rows.length} rows`},406)
  send(single?result.rows[0]:result.rows)
}
http.createServer((req,res)=>{queue=queue.then(()=>handle(req,res)).catch(error=>{res.statusCode=400;res.end(JSON.stringify({code:error.code??'test_error',message:'Test API failure'}));console.error(error.message)})}).listen(54321,'127.0.0.1',()=>console.log('Local test API on 127.0.0.1:54321; mock email/auth, real SQL policies.'))
