import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {PRICE_MODEL_VERSION} from '../src/services/priceModel.js'
const env=loadEnv('production',process.cwd(),'');assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co')
const db=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:true}}),account=process.env.PRICE_ADMIN_EMAIL?{email:process.env.PRICE_ADMIN_EMAIL,password:process.env.PRICE_ADMIN_PASSWORD}:JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')).find(a=>a.role==='admin')
assert.equal((await db.auth.signInWithPassword({email:account.email,password:account.password})).error,null)
const state=JSON.parse(readFileSync('test-results/price-model-state.json','utf8')),events=JSON.parse(readFileSync('test-results/price-events.json','utf8')),evaluations=JSON.parse(readFileSync('test-results/price-evaluations.json','utf8'));assert.equal(state.version,PRICE_MODEL_VERSION)
async function send(payload){const r=await db.functions.invoke('price-sync',{body:{action:'calibrate',model_version:PRICE_MODEL_VERSION,...payload}});if(r.error)throw Error(await r.error.context.text());console.log(JSON.stringify(r.data));return r.data}
try{
 await send({evaluations:evaluations.map(e=>({season:state.season,window_start:e.window_start,origin:e.origin,model_version:e.model_version,data:e}))})
 await send({events:events.map(e=>({season:e.season,player_id:e.player_id,detected_at:e.detected_at,model_version:e.model_version,prediction:e.prediction,correct:e.correct}))})
 const result=await send({state});writeFileSync('test-results/price-model-activation.json',JSON.stringify(result,null,2))
}finally{await db.auth.signOut({scope:'local'})}
