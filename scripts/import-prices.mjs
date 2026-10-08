import {createReadStream,readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import {createPriceState,processPriceBatch} from '../src/services/priceModel.js'
import {currentPriceCache,retainedPredictions} from '../src/services/priceCollector.js'
import assert from 'node:assert/strict'
const env=loadEnv('production',process.cwd(),'');assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co')
const db=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:true}})
const account=process.env.PRICE_ADMIN_EMAIL?{email:process.env.PRICE_ADMIN_EMAIL,password:process.env.PRICE_ADMIN_PASSWORD}:JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')).find(a=>a.role==='admin')
const login=await db.auth.signInWithPassword({email:account.email,password:account.password});if(login.error)throw login.error
let state,output,count=0,payload,totals={snapshots:0,events:0,predictions:0,batches:0}
const progress=process.argv.includes('--resume')&&existsSync('test-results/price-import-progress.json')?JSON.parse(readFileSync('test-results/price-import-progress.json','utf8')):null,resumeAt=progress?.sourceBatches||0
if(progress)for(const k of Object.keys(totals))totals[k]=progress[k]||0
const retentionAt=Date.now(),snapshotBuckets=new Map(),predictionBuckets=new Map()
const fresh=season=>({season,snapshots:[],events:[],predictions:[],evaluations:[]})
async function send(final=false){if(!payload)return;const r=await db.functions.invoke('price-sync',{body:{action:'import',payload}});if(r.error){const detail=await r.error.context?.text?.();throw Error(`Import batch ${count} failed (${r.error.context?.status}): ${detail||r.error.message}`)}for(const k of ['snapshots','events','predictions'])totals[k]+=r.data[k];totals.batches++;writeFileSync('test-results/price-import-progress.json',JSON.stringify({...totals,sourceBatches:count,last:state.last_at,final},null,2));console.log(JSON.stringify({sourceBatches:count,...totals,final}));payload=fresh(state.season)}
try{
 for await(const line of createInterface({input:createReadStream('test-results/price-archive.ndjson'),crlfDelay:Infinity})){
  const batch=JSON.parse(line);state??=createPriceState(batch.season);payload??=fresh(batch.season);const previous=state.last_at
  output=processPriceBatch(state,batch);count++
  // Apply the documented retention resolution while importing old observations.
  // Every source row still participates in detection/backtesting. Exact event
  // reference snapshots are always persisted, regardless of sampling age.
  const age=retentionAt-Date.parse(batch.captured_at),resolution=age>30*86400000?86400000:age>7*86400000?3600000:1
  const kept=output.snapshots.filter(p=>{const key=Math.floor(Date.parse(p.captured_at)/resolution),old=snapshotBuckets.get(p.player_id);snapshotBuckets.set(p.player_id,key);return key!==old})
  const predictions=retainedPredictions(output,previous).filter(p=>{if(retentionAt-Date.parse(p.predicted_at)<=7*86400000)return true;const key=p.predicted_at.slice(0,10),old=predictionBuckets.get(p.player_id);predictionBuckets.set(p.player_id,key);return key!==old})
  for(const e of output.events){for(const p of [e.reset,e.before,e.after])kept.push({...p,season:batch.season});if(e.prediction)predictions.push(e.prediction)}
  if(count<=resumeAt)continue
  payload.snapshots.push(...kept);payload.events.push(...output.events);payload.evaluations.push(...output.evaluations);payload.predictions.push(...predictions)
  if(payload.snapshots.length>=1800||JSON.stringify(payload).length>1500000)await send()
 }
 await send();payload.state=state;payload.current=currentPriceCache(state,output.predictions,state.last_at);await send(true)
}finally{await db.auth.signOut({scope:'local'})}
