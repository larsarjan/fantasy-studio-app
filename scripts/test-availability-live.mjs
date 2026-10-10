import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync} from 'node:fs'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import assert from 'node:assert/strict'
const env=loadEnv('production',process.cwd(),''),url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY
assert.equal(new URL(url).hostname,'rzunbquzffdivlpuomjc.supabase.co')
const keys=JSON.parse(execFileSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','node_modules\\.bin\\supabase.cmd projects api-keys --project-ref rzunbquzffdivlpuomjc --reveal -o json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
const secret=keys.find(k=>k.name==='service_role')?.api_key
if(!secret)throw Error('Server test credential unavailable; never printed.')
const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),folder='test-results/availability'
const unwrap=r=>{if(r.error)throw Error('Test operation failed: '+(r.error.code||r.error.status));return r.data}
mkdirSync(folder,{recursive:true});const mode=process.argv[2]
if(mode==='prepare'){
 if(existsSync(folder+'/accounts.json'))throw Error('Clean existing fixtures first')
 const run=randomUUID(),accounts=[];const save=()=>writeFileSync(folder+'/accounts.json',JSON.stringify({run,accounts}))
 save()
 for(const role of ['member','admin','super_admin']){
  const email=`fvt-availability-${role}-${run}@example.invalid`,password=randomBytes(30).toString('base64url')
  const {user}=unwrap(await admin.auth.admin.createUser({email,password,email_confirm:true}));accounts.push({role,id:user.id,email,password});save()
 }
 writeFileSync(folder+'/roles.sql',accounts.filter(a=>a.role!=='member').map(a=>`insert into public.user_roles(user_id,role_key) values('${a.id}','${a.role}');`).join('\n'))
 console.log('Three isolated acceptance accounts prepared; credentials not printed.')
}else{
 const {accounts}=JSON.parse(readFileSync(folder+'/accounts.json','utf8'))
 if(mode==='api'){
  const checks=[],ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
  for(const account of accounts){
   const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
   unwrap(await client.auth.signInWithPassword({email:account.email,password:account.password}))
   ok(Array.isArray(unwrap(await client.rpc('availability_list'))),`${account.role}: safe availability read succeeds`)
   const adminRead=await client.rpc('availability_list',{admin_mode:true})
   ok(account.role==='super_admin'?!adminRead.error:adminRead.error?.code==='42501',`${account.role}: admin read permission enforced`)
   if(account.role!=='super_admin'){
    const result=await client.rpc('availability_save',{data:{player_id:'not-a-real-target',season:'2026/2027',status_type:'injury',availability_percentage:0},expected_revision:0})
    ok(result.error?.code==='42501',`${account.role}: direct write bypass denied before validation`)
   }
   const proposed=await client.rpc('availability_propose',{source:'no-source',external:'test',data:{}})
   ok(Boolean(proposed.error),`${account.role}: cannot impersonate server connector`)
   ok(Boolean((await client.schema('private').from('player_availability').select('*')).error),`${account.role}: private table inaccessible via API`)
   unwrap(await client.auth.signOut())
  }
  const anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  ok(Boolean((await anon.rpc('availability_list')).error),'Anonymous API bypass denied')
  writeFileSync(folder+'/live-api.json',JSON.stringify({checks},null,2));console.log(`${checks.length} live API checks passed; no production status records written.`)
 }else if(mode==='cleanup'){
  for(const a of accounts){const result=await admin.auth.admin.getUserById(a.id);if(result.error?.status===404)continue;const u=unwrap(result).user;assert.equal(u.email,a.email);assert(u.email.startsWith('fvt-availability-'));unwrap(await admin.auth.admin.deleteUser(a.id))}
  unlinkSync(folder+'/accounts.json');console.log('All three temporary acceptance accounts and role assignments removed.')
 }else throw Error('Use prepare, api or cleanup')
}
