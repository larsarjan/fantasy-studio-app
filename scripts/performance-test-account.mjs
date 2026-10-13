import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync} from 'node:fs'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
const env=loadEnv('production',process.cwd(),''),folder='test-results/performance',file=folder+'/account.json'
if(new URL(env.VITE_SUPABASE_URL).hostname!=='rzunbquzffdivlpuomjc.supabase.co')throw Error('Unexpected project')
const keys=JSON.parse(execFileSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','node_modules\\.bin\\supabase.cmd projects api-keys --project-ref rzunbquzffdivlpuomjc --reveal -o json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
const secret=keys.find(k=>k.name==='service_role')?.api_key
if(!secret)throw Error('Server credential unavailable')
const admin=createClient(env.VITE_SUPABASE_URL,secret,{auth:{persistSession:false,autoRefreshToken:false}})
const check=r=>{if(r.error)throw Error('Test operation failed: '+(r.error.code||r.error.status));return r.data}
const mode=process.argv[2]
if(mode==='prepare'){
 if(existsSync(file))throw Error('Existing account must be reused or cleaned')
 const run=randomUUID(),account={email:`fvt-performance-${run}@example.invalid`,password:randomBytes(30).toString('base64url')}
 mkdirSync(folder,{recursive:true});writeFileSync(file,JSON.stringify(account))
 const {user}=check(await admin.auth.admin.createUser({...account,email_confirm:true}));account.id=user.id;writeFileSync(file,JSON.stringify(account))
 console.log('One member test account created; no elevated role, credentials not printed.')
}else if(mode==='cleanup'){
 const account=JSON.parse(readFileSync(file,'utf8'));if(!account.id||!account.email.startsWith('fvt-performance-'))throw Error('Invalid cleanup target')
 check(await admin.auth.admin.deleteUser(account.id));const verify=await admin.auth.admin.getUserById(account.id);if(verify.data?.user)throw Error('Account still exists')
 unlinkSync(file);writeFileSync(folder+'/cleanup.json',JSON.stringify({at:new Date().toISOString(),deleted:true}));console.log('Temporary account deleted; linked rights and personal data cascade cleaned.')
}else throw Error('Use prepare or cleanup')
