import { createClient } from '@supabase/supabase-js'
import { collectAvailabilitySheet } from './availabilitySheet.js'
export function createAvailabilitySyncHandler({env=process.env,clientFactory=createClient,collect=collectAvailabilitySheet}={}) {
  return async request => {
    const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
    if(request.method!=='POST')return reply({error:'Methode niet toegestaan'},405)
    if(env.AVAILABILITY_SHEET_ENABLED!=='true')return reply({error:'Availability-import nog niet geactiveerd'},503)
    if(!env.VITE_SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return reply({error:'Serverconfiguratie ontbreekt'},503)
    const client=clientFactory(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    try {
      const token=request.headers.get('x-sync-token')
      if(!token||token.length>200)return reply({error:'Niet toegestaan'},403)
      const auth=await client.rpc('reference_check_scheduler',{supplied_token:token})
      if(auth.error||auth.data!==true)return reply({error:'Niet toegestaan'},403)
      if(Number(request.headers.get('content-length')||0)>256)return reply({error:'Ongeldig verzoek'},400)
      const body=await request.text();if(body.length>256)return reply({error:'Ongeldig verzoek'},400)
      let input;try{input=JSON.parse(body.trim()||'{}')}catch{return reply({error:'Ongeldig verzoek'},400)}
      if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!['expectedObservedAt','expectedMatched'].includes(k)))return reply({error:'Ongeldig verzoek'},400)
      const expected=input.expectedObservedAt!==undefined||input.expectedMatched!==undefined
      if(expected&&(!Number.isInteger(input.expectedMatched)||input.expectedMatched<1||typeof input.expectedObservedAt!=='string'||!Number.isFinite(Date.parse(input.expectedObservedAt))))return reply({error:'Ongeldig verzoek'},400)
      const items=await collect()
      const observedMatched=expected?items.filter(r=>r.observed_at===input.expectedObservedAt).length:null
      // Published CSV may lag: reject before writing rather than confirm stale data.
      if(expected&&observedMatched!==input.expectedMatched)return reply({error:'Sheetpublicatie nog niet volledig bijgewerkt; vorige runtime behouden'},409)
      const result=await client.rpc('availability_sheet_sync',{items})
      if(result.error)throw Error('Database heeft availability-batch afgewezen')
      if(!Number.isInteger(result.data)||result.data<0||result.data>items.length)throw Error('Ongeldig writerresultaat')
      return reply({read:items.length,written:result.data,unchanged:items.length-result.data,skipped:items.summary?.skipped??0,sourceRows:items.summary?.sourceRows??items.length,errors:0,observedAt:input.expectedObservedAt??null,observedMatched})
    }catch {return reply({error:'Availability-sync mislukt; vorige status behouden'},503)}
  }
}
