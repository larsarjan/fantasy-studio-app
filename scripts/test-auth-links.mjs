// Server-side only. Existing project key stays in process memory and is never logged.
import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
const ref='rzunbquzffdivlpuomjc'
try {
 const output=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','projects','api-keys','--project-ref',ref,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000})
 const parsed=JSON.parse(output),keys=Array.isArray(parsed)?parsed:parsed.keys??parsed.api_keys??[]
 const key=keys.find(k=>k.name==='service_role')??keys.find(k=>k.type==='secret')
 if(!key?.api_key) { console.log('No server key selected. Response shape:',Object.keys(parsed));process.exit(1) }
 const admin=createClient(`https://${ref}.supabase.co`,key.api_key,{auth:{persistSession:false,autoRefreshToken:false}})
 const signup=process.argv[2]==='signup'
 const account=signup ? {email:`studio-acceptance-${randomBytes(8).toString('hex')}@fantasyvoetbaltalk.nl`,password:randomBytes(30).toString('base64url')} : JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')).find(a=>a.role==='b')
 const {data,error}=await admin.auth.admin.generateLink({type:signup?'signup':'recovery',email:account.email,...(signup?{password:account.password}:{}),options:{redirectTo:`https://fantasy-studio-app.vercel.app/auth/callback${signup?'':'?flow=recovery'}`}})
 if(error) throw new Error(error.code??'generate_link_failed')
 writeFileSync(`test-results/${signup?'signup':'recovery'}-link.json`,JSON.stringify({link:data.properties.action_link,role:signup?'signup':'b'}),{mode:0o600})
 if(signup) writeFileSync('test-results/signup-account.json',JSON.stringify({...account,id:data.user.id}),{mode:0o600})
 console.log(`Real Supabase ${signup?'confirmation':'recovery'} link generated for a temporary account. No email sent; no server key persisted.`)
} catch(error) { console.error('Auth-link check failed:',error.code??(error.message?.length<100?error.message:'details omitted'));process.exitCode=1 }
