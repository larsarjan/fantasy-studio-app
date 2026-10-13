import {readFileSync,writeFileSync} from 'node:fs'
import {loadEnv} from 'vite'
import {createClient} from '@supabase/supabase-js'
import assert from 'node:assert/strict'
const env=loadEnv('production',process.cwd(),''),account=JSON.parse(readFileSync('test-results/performance/account.json','utf8')),base='https://fantasyvoetbaltalk.nl'
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const login=await client.auth.signInWithPassword({email:account.email,password:account.password});if(login.error)throw Error('Test login failed')
const headers={Authorization:'Bearer '+login.data.session.access_token,'Content-Type':'application/json'},mode=process.argv[2],checks=[]
async function call(extra={}){const r=await fetch(base+'/api/reference-sync',{method:'POST',headers,...extra});let data;try{data=await r.json()}catch{data={error:'Non-JSON response'}}return {status:r.status,data}}
if(mode==='member'){
 for(const [name,request,expected] of [['member',{},403],['anonymous',{headers:{}},401],['invalid scheduler',{headers:{'x-sync-token':'invalid'}},403]]){const r=await call(request);assert.equal(r.status,expected,JSON.stringify(r));checks.push({name,status:r.status})}
 for(const name of ['reference_sync_claim','reference_check_scheduler']){const r=await client.rpc(name,name==='reference_sync_claim'?{trigger_kind:'manual'}:{supplied_token:'invalid'});assert(r.error);checks.push({name,denied:true})}
 const r=await client.from('reference_sync_runs').select('id');assert(!r.error);assert.equal(r.data.length,0);checks.push({name:'member operational history',hidden:true})
}else if(mode==='sync'){
 const access=await client.rpc('current_access');assert(!access.error);const permissions=[...access.data.permissions].sort();assert.deepEqual(permissions,['admin.access','data.correct','data.view','sync.run','sync.view']);checks.push({permissions})
 const first=call();await new Promise(r=>setTimeout(r,1500));const second=await call();assert.equal(second.status,409,JSON.stringify(second));checks.push({name:'parallel sync',status:second.status})
 const result=await first;assert.equal(result.status,200,JSON.stringify(result));assert(result.data.publication?.id);checks.push({name:'real Sheets sync',...result})
 const [latest]= (await client.from('reference_imports').select('id,created_at,counts,source').eq('source','Google Sheets').order('created_at',{ascending:false}).limit(1)).data;assert.equal(latest.id,result.data.publication.id);checks.push({name:'verified receipt',...latest})
 const unchanged=await call();assert.equal(unchanged.status,200,JSON.stringify(unchanged));checks.push({name:'repeat',...unchanged})
}else throw Error('member or sync required')
writeFileSync(`test-results/performance/live-${mode}.json`,JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await client.auth.signOut({scope:'local'})
