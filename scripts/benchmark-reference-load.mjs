import {loadEnv} from 'vite'
import {createClient} from '@supabase/supabase-js'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
const env=loadEnv('production',process.cwd(),''),base=env.VITE_SUPABASE_URL+'/rest/v1/',headers={apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY},measurements=[]
const account=JSON.parse(readFileSync('test-results/performance/account.json','utf8'))
const auth=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const login=await auth.auth.signInWithPassword({email:account.email,password:account.password});if(login.error)throw Error('Test login failed')
headers.Authorization='Bearer '+login.data.session.access_token
async function get(path){const start=performance.now(),r=await fetch(base+path,{headers}),text=await r.text(),read=performance.now();if(!r.ok)throw Error('Reference read failed '+r.status);const result=JSON.parse(text);measurements.push({path,bytes:Buffer.byteLength(text),fetchMs:read-start,parseMs:performance.now()-read});return result}
const start=performance.now(),[snapshot]=await get('reference_imports?select=id,created_at,counts&source=eq.Google%20Sheets&order=created_at.desc&limit=1')
if(!snapshot)throw Error('No public snapshot available')
const data=Object.fromEntries(await Promise.all(Object.keys(snapshot.counts).map(async table=>{const rows=[];for(let offset=0;;offset+=1000){const page=await get(`${table}?select=payload&import_id=eq.${snapshot.id}&order=id&offset=${offset}&limit=1000`);rows.push(...page.map(row=>row.payload));if(page.length<1000)break}if(rows.length!==snapshot.counts[table])throw Error('Concurrent snapshot change');return [table,rows]})))
const result={snapshot:snapshot.id,at:new Date().toISOString(),durationMs:performance.now()-start,bytes:measurements.reduce((n,r)=>n+r.bytes,0),requests:measurements.length,datasets:Object.entries(data).map(([name,rows])=>({name,records:rows.length,bytes:Buffer.byteLength(JSON.stringify(rows))})),measurements}
mkdirSync('test-results/performance',{recursive:true});writeFileSync('test-results/performance/baseline-reference.json',JSON.stringify(result,null,2));writeFileSync('test-results/performance/reference.json',JSON.stringify(data));console.log(JSON.stringify({...result,measurements:undefined},null,2))

await auth.auth.signOut({scope:'local'})
