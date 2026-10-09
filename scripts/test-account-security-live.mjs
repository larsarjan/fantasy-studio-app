// Uses only disposable acceptance accounts. Privileged key stays in this Node process.
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync} from 'node:fs'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import assert from 'node:assert/strict'
const env=loadEnv('production',process.cwd(),''),url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY
assert.equal(new URL(url).hostname,'rzunbquzffdivlpuomjc.supabase.co')
const raw=execFileSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','node_modules\\.bin\\supabase.cmd projects api-keys --project-ref rzunbquzffdivlpuomjc --reveal -o json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
const keys=JSON.parse(raw),secret=keys.find(k=>k.name==='service_role')?.api_key
if(!secret)throw Error('Server test credential unavailable; not printed.')
const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),folder='test-results/account-security'
mkdirSync(folder,{recursive:true})
const unwrap=r=>{if(r.error)throw Error(`Supabase test operation failed (${r.error.code||r.error.status||'unknown'})`);return r.data}
const mode=process.argv[2]
if(mode==='prepare'||mode==='prepare-ui'){
 if(existsSync(folder+'/accounts.json'))throw Error('Clean the existing isolated account fixtures first.')
 const run=randomUUID(),accounts=[]
 const state={run,bucket:'security-'+run,accounts,bucketCreated:false}
 const save=()=>writeFileSync(folder+'/accounts.json',JSON.stringify(state),{mode:0o600})
 save()
 for(const purpose of mode==='prepare-ui'?['ui']:['api','control','ui']){
  const email=`fvt-security-${purpose}-${run}@example.invalid`,password=randomBytes(30).toString('base64url')
  const {user}=unwrap(await admin.auth.admin.createUser({email,password,email_confirm:true}))
  accounts.push({purpose,id:user.id,email,password})
  save()
 }
 if(mode==='prepare-ui'){console.log('Prepared one disposable UI member; credentials not printed.');process.exit(0)}
 const bucket='security-'+run
 unwrap(await admin.storage.createBucket(bucket,{public:false}))
 state.bucketCreated=true;save()
 for(const purpose of ['api','control'])unwrap(await admin.storage.from(bucket).upload(purpose+'.txt',Buffer.from('Private deletion acceptance fixture'),{contentType:'text/plain'}))
 save()
 writeFileSync(folder+'/ownership.sql',accounts.filter(a=>a.purpose!=='ui').map(a=>`update storage.objects set owner='${a.id}',owner_id='${a.id}' where bucket_id='${bucket}' and name='${a.purpose}.txt';`).join('\n'))
 console.log('Prepared three disposable member accounts and one private test bucket; credentials not printed.')
}else{
 const state=JSON.parse(readFileSync(folder+'/accounts.json','utf8'))
 if(mode==='api'){
  const a=state.accounts.find(a=>a.purpose==='api'),other=state.accounts.find(a=>a.purpose==='control')
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  let session=unwrap(await client.auth.signInWithPassword(a)).session
  const request=(body={confirmation:'VERWIJDER'},token=session.access_token,origin='https://fantasyvoetbaltalk.nl')=>fetch(url+'/functions/v1/delete-account',{method:'POST',headers:{'content-type':'application/json',apikey:key,authorization:token?'Bearer '+token:'',origin},body:JSON.stringify(body)})
  const checks=[],ok=(value,label)=>{assert(value,label);checks.push(label);console.log(label)}
  ok((await request(undefined,'')).status===401,'Direct unauthenticated deletion denied')
  ok((await request({confirmation:'VERWIJDER',user_id:other.id})).status===400,'IDOR target parameter rejected')
  ok((await request({confirmation:'yes'})).status===400,'Typed confirmation required server-side')
  ok((await request(undefined,undefined,'https://evil.example')).status===403,'Cross-origin deletion denied')
  const oldToken=session.access_token;unwrap(await client.auth.signOut())
  const revoked=await request(undefined,oldToken);ok([401,403].includes(revoked.status),'Revoked session cannot delete through a still-unexpired JWT')
  session=unwrap(await client.auth.signInWithPassword(a)).session
  unwrap(await client.from('user_preferences').upsert({user_id:a.id,settings:{acceptance:'private'}}))
  const responses=await Promise.all([request(),request()]);const codes=await Promise.all(responses.map(r=>r.json()))
  ok(responses.some(r=>r.status===200)&&codes.some(c=>c.code==='deleted'),'Ordinary member deletion succeeds')
  ok(responses.every(r=>[200,401,403,409].includes(r.status)),'Concurrent duplicate is safe')
  ok((await admin.auth.admin.getUserById(a.id)).error?.status===404,'Auth user actually removed')
  ok(unwrap(await admin.from('user_preferences').select('user_id').eq('user_id',a.id)).length===0,'Private data actually cascaded')
  ok(Boolean(unwrap(await admin.auth.admin.getUserById(other.id)).user),'Other account untouched')
  const files=unwrap(await admin.storage.from(state.bucket).list())
  ok(!files.some(f=>f.name==='api.txt')&&files.some(f=>f.name==='control.txt'),'Storage cleanup removes only owned personal object')
  ok([401,403].includes((await request()).status),'Repeated deleted-account request cannot act again')
  writeFileSync(folder+'/live-results.json',JSON.stringify({checks},null,2))
 }else if(mode==='cleanup'){
  if(state.bucketCreated!==false){const files=unwrap(await admin.storage.from(state.bucket).list());if(files.length)unwrap(await admin.storage.from(state.bucket).remove(files.map(f=>f.name)));unwrap(await admin.storage.deleteBucket(state.bucket))}
  for(const a of state.accounts){const r=await admin.auth.admin.getUserById(a.id);if(r.error?.status===404)continue;const u=unwrap(r).user;assert.equal(u.email,a.email);assert(u.email.startsWith('fvt-security-'));unwrap(await admin.auth.admin.deleteUser(a.id))}
  unlinkSync(folder+'/accounts.json');console.log('Disposable accounts and private bucket cleaned.')
 }else throw Error('Use prepare, api or cleanup')
}
