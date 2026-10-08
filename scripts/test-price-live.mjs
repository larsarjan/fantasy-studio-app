import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const env=loadEnv('production',process.cwd(),'');assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co')
const make=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),db=make(),publicClient=make(),accounts=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')),checks=[]
const ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
const admin=accounts.find(a=>a.role==='admin');assert.equal((await db.auth.signInWithPassword({email:admin.email,password:admin.password})).error,null)
try{
 const r=await db.functions.invoke('price-sync',{body:{force:true}});if(r.error)throw Error(await r.error.context.text());ok(['complete','duplicate'].includes(r.data.status),'Admin collector uses real ESPN data');console.log(JSON.stringify(r.data))
 const cache=await publicClient.from('price_current').select('*').order('updated_at',{ascending:false}).limit(1).single();assert.equal(cache.error,null);ok(cache.data.data.players.length>500,'Public compact cache has real players');ok(Date.now()-Date.parse(cache.data.updated_at)<15*60000,'Live snapshot freshness')
 ok(cache.data.data.players.every(p=>p.confidence_score>=0&&p.confidence_score<=100),'Confidence score in numeric range');ok(cache.data.data.players.some(p=>p.rise_probability!=null&&p.confidence_score<75),'Probabilities available with limited confidence')
 const duplicate=await db.functions.invoke('price-sync',{body:{force:true}});assert.equal(duplicate.error,null);ok(duplicate.data.status==='duplicate','Identical cached source does not duplicate snapshots')
 const changes=await publicClient.from('price_change_events').select('data',{count:'exact'}).eq('season',cache.data.season);assert.equal(changes.error,null);ok(changes.count>=220,'Imported price changes remain public');ok(changes.data.every(r=>!r.data.prediction||Date.parse(r.data.prediction.predicted_at)<Date.parse(r.data.detected_at)),'Every event forecast strictly predates detection')
 for(const table of ['price_snapshots','price_predictions','price_model_calibration'])ok(Boolean((await publicClient.from(table).select('*').limit(1)).error),`Public cannot read internal ${table}`)
 ok(Boolean((await publicClient.rpc('price_commit',{payload:{},expected_at:null})).error),'Public write RPC denied')
 const viewer=accounts.find(a=>a.role==='a');assert.equal((await publicClient.auth.signInWithPassword({email:viewer.email,password:viewer.password})).error,null)
 const denied=await publicClient.functions.invoke('price-sync',{body:{force:true}});ok(denied.error?.context?.status===403,'Non-admin cannot run collector/import')
 writeFileSync('test-results/price-live.json',JSON.stringify({checks,collector:r.data,players:cache.data.data.players.length,events:changes.count,updated:cache.data.updated_at},null,2))
}finally{await Promise.all([db.auth.signOut({scope:'local'}),publicClient.auth.signOut({scope:'local'})])}
