import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
const action=process.argv[2]??'open'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','authcheck',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000})
try {
 if(action==='open'||action==='reuse') {
  run('open',JSON.parse(readFileSync('test-results/recovery-link.json','utf8')).link)
  console.log('Opened genuine Supabase recovery link; URL/tokens omitted.')
 } else if(action==='reset') {
  const password=randomBytes(30).toString('base64url')
  writeFileSync('test-results/recovery-password.json',JSON.stringify({password}),{mode:0o600})
  run('fill','input[name="password"]',password)
  run('fill','input[name="confirmation"]',password)
  run('click','button[type="submit"]')
  console.log('Submitted a new random password via the live reset form.')
 } else if(action==='verify') {
  const accounts=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8'))
  const account=accounts.find(a=>a.role==='b')
  const {password}=JSON.parse(readFileSync('test-results/recovery-password.json','utf8'))
  const env=loadEnv('production',process.cwd(),'')
  const c=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const result=await c.auth.signInWithPassword({email:account.email,password})
  if(result.error) throw new Error(result.error.code)
  account.password=password
  writeFileSync('test-results/staging-accounts.json',JSON.stringify(accounts,null,2),{mode:0o600})
  await c.auth.signOut({scope:'local'})
  console.log('PASS: Supabase accepts the password set through the live reset form.')
 }
} catch { console.error('Recovery test step failed; sensitive details omitted. Inspect the browser form.');process.exitCode=1 }
