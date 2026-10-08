import {createClient} from 'npm:@supabase/supabase-js@2.117.2'
import {syncPrices} from '../../../src/services/priceCollector.js'
import {PRICE_MODEL_VERSION} from '../../../src/services/priceModel.js'
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://fantasy-studio-app.vercel.app','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}
Deno.serve(async req=>{
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
 if(req.method==='OPTIONS')return reply({})
 if(req.method!=='POST')return reply({error:'Method not allowed'},405)
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
 try{
  let scheduled=false
  const scheduleToken=req.headers.get('x-sync-token')
  if(scheduleToken){const r=await db.rpc('prominent_check_scheduler',{supplied_token:scheduleToken});if(r.error||r.data!==true)return reply({error:'Unauthorized'},401);scheduled=true}
  else{const token=req.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)return reply({error:'Unauthorized'},401);const user=await db.auth.getUser(token);if(user.error||!user.data.user)return reply({error:'Unauthorized'},401);const profile=await db.from('profiles').select('role').eq('id',user.data.user.id).single();if(profile.error||profile.data?.role!=='admin')return reply({error:'Forbidden'},403)}
  // Bounded stream read also protects requests without Content-Length.
  let length=0;const chunks=[];for await(const chunk of req.body||[]){length+=chunk.length;if(length>8*1024*1024)return reply({error:'Body too large'},413);chunks.push(chunk)}
  const buffer=new Uint8Array(length);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}
  const text=new TextDecoder().decode(buffer),body=text?JSON.parse(text):{}
  if(body.action==='calibrate'){
   if(scheduled)return reply({error:'Admin required'},403)
   if(body.model_version!==PRICE_MODEL_VERSION)return reply({error:'Model version mismatch'},400)
   if(body.evaluations){if(!Array.isArray(body.evaluations)||body.evaluations.length>400)return reply({error:'Invalid evaluations'},400);const r=await db.from('price_model_evaluations').upsert(body.evaluations,{ignoreDuplicates:true,onConflict:'season,window_start,origin,model_version'});if(r.error)throw r.error}
   if(body.events){if(!Array.isArray(body.events)||body.events.length>1000)return reply({error:'Invalid event backtests'},400);const r=await db.from('price_event_backtests').upsert(body.events,{ignoreDuplicates:true,onConflict:'season,player_id,detected_at,model_version'});if(r.error)throw r.error}
   if(body.state){if(body.state.version!==PRICE_MODEL_VERSION)return reply({error:'Invalid state'},400);return reply(await syncPrices(db,{force:true,seedState:body.state}))}
   return reply({status:'calibrated'})
  }
  if(body.action==='import'){
   if(scheduled)return reply({error:'Admin required'},403)
   const payload=body.payload
   if(!payload||!/^\d{4}-\d{4}$/.test(payload.season)||!Array.isArray(payload.snapshots)||payload.snapshots.length>10000||!Array.isArray(payload.events)||!Array.isArray(payload.predictions)||!Array.isArray(payload.evaluations))return reply({error:'Invalid import batch'},400)
   // Re-importing an archive must never replace a newer live calibration/cache.
   if(payload.state){const saved=await db.from('price_model_calibration').select('updated_at').eq('season',payload.season).maybeSingle();if(saved.error)throw saved.error;if(saved.data&&Date.parse(saved.data.updated_at)>=Date.parse(payload.state.last_at)){delete payload.state;delete payload.current}}
   const result=await db.rpc('price_commit',{payload,expected_at:body.expected_at||null});if(result.error)throw result.error
   return reply({status:'imported',...result.data})
  }
  if(body.action==='retention'){if(scheduled)return reply({error:'Admin required'},403);const r=await db.rpc('price_retention');if(r.error)throw r.error;return reply({status:'complete'})}
  if(body.action&&body.action!=='sync')return reply({error:'Unknown action'},400)
  return reply(await syncPrices(db,{force:!scheduled&&body.force===true}))
 }catch(e){console.error('price-sync',e.message);return reply({error:'Prijsverwerking mislukt; laatste geldige gegevens blijven beschikbaar.'},500)}
})
