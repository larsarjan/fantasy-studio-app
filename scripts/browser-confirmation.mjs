import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
const account=JSON.parse(readFileSync('test-results/signup-account.json','utf8'))
const env=loadEnv('production',process.cwd(),'')
const c=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
try {
 const result=await c.auth.signInWithPassword({email:account.email,password:account.password})
 if(process.argv[2]==='open') {
  if(result.error?.code!=='email_not_confirmed') throw new Error('Expected confirmation guard')
  const link=JSON.parse(readFileSync('test-results/signup-link.json','utf8')).link
  execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','authcheck','open',link],{stdio:'pipe',timeout:45000})
  console.log('PASS: login blocked before confirmation. Opened the genuine confirmation link; tokens omitted.')
 } else {
  if(result.error) throw result.error
  const profile=await c.from('profiles').select('id,role').single()
  if(profile.error||profile.data.id!==account.id||profile.data.role!=='viewer') throw new Error('Profile mismatch')
  await c.auth.signOut({scope:'local'})
  console.log('PASS: login accepted after live browser confirmation; own profile defaults to viewer.')
 }
} catch { console.error('Confirmation check failed; sensitive details omitted.');process.exitCode=1 }
