import {loadEnv} from 'vite'
import {createClient} from '@supabase/supabase-js'
import {readFileSync,writeFileSync} from 'node:fs'
import {registerHooks} from 'node:module'
const env=loadEnv('production',process.cwd(),''),account=JSON.parse(readFileSync('test-results/performance/account.json','utf8')),measurements=[]
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{const start=performance.now(),response=await fetch(url,init);if(String(url).includes('/rest/v1/'))measurements.push({path:new URL(url).pathname,bytes:Buffer.byteLength(await response.clone().text()),ms:performance.now()-start});return response}}})
const login=await client.auth.signInWithPassword({email:account.email,password:account.password});if(login.error)throw Error('Test login failed')
globalThis.__referenceClient=client
registerHooks({load(url,context,next){if(url.endsWith('/platform/client.js'))return {format:'module',source:'export const supabase=globalThis.__referenceClient',shortCircuit:true};if(url.endsWith('/platform/access.js'))return {format:'module',source:'export const refreshAccess=()=>{};export const hasPermission=()=>false',shortCircuit:true};return next(url,context)}})
const {loadReferenceData}=await import('../src/platform/referenceData.js'),result={}
let cached
for(const mode of ['cold','warm']){measurements.length=0;const start=performance.now();cached=await loadReferenceData(cached);result[mode]={snapshot:cached.syncStatus.snapshotId,ms:performance.now()-start,requests:measurements.length,bytes:measurements.reduce((n,r)=>n+r.bytes,0),cacheHit:cached.cacheHit===true,measurements:[...measurements]}}
writeFileSync('test-results/performance/reference-live.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await client.auth.signOut({scope:'local'})
