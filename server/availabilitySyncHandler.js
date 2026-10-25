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
      if(Number(request.headers.get('content-length')||0)>100)return reply({error:'Ongeldig verzoek'},400)
      const body=await request.text();if(body.length>100||(body.trim()&&body.trim()!=='{}'))return reply({error:'Ongeldig verzoek'},400)
      const items=await collect(), result=await client.rpc('availability_sheet_sync',{items})
      if(result.error)throw Error('Database heeft availability-batch afgewezen')
      return reply({read:items.length,written:result.data})
    }catch {return reply({error:'Availability-sync mislukt; vorige status behouden'},503)}
  }
}
