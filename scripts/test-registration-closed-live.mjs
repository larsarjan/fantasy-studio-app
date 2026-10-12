// Read settings first; never attempt a signup while public registration is open.
import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
const env=loadEnv('production',process.cwd(),''),url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY
assert.equal(new URL(url).hostname,'rzunbquzffdivlpuomjc.supabase.co')
const settings=await(await fetch(url+'/auth/v1/settings',{headers:{apikey:key}})).json()
assert.equal(settings.disable_signup,true);console.log('PASS Hosted Auth disables public signup')
assert.equal(settings.external.email,true);console.log('PASS Existing email authentication provider remains enabled')
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const {data,error}=await client.auth.signUp({email:'closed-registration-'+randomUUID()+'@example.invalid',password:randomUUID()+'Aa1!'})
assert.equal(error?.code,'signup_disabled');assert.equal(data.user,null);assert.equal(data.session,null)
console.log('PASS Direct signUp rejected with signup_disabled; no user/session created')
