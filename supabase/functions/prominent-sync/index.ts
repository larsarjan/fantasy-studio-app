import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { syncProminents } from '../../../src/services/prominentCollector.js';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'https://fantasy-studio-app.vercel.app', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
Deno.serve(async req => {
  const origin=req.headers.get('origin');
  const allowed=origin && ['https://fantasyvoetbaltalk.nl','https://www.fantasyvoetbaltalk.nl','https://fantasy-studio-app.vercel.app','http://localhost:5173','http://localhost:4173'].includes(origin);
  const cors={...headers,...(allowed ? {'Access-Control-Allow-Origin':origin!}: {})};
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
  if(req.method==='OPTIONS')return reply({});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    let trigger='admin';
    const scheduled=req.headers.get('x-sync-token');
    if(scheduled){const {data,error}=await db.rpc('prominent_check_scheduler',{supplied_token:scheduled});if(error || data!==true)return reply({error:'Unauthorized'},401);trigger='scheduler';}
    else {
      const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
      if(!token)return reply({error:'Unauthorized'},401);
      const {data,error}=await db.auth.getUser(token);if(error || !data.user)return reply({error:'Unauthorized'},401);
      const actor=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
      const access=await actor.rpc('current_access');if(access.error || !access.data?.permissions?.includes('sync.run'))return reply({error:'Forbidden'},403);
      const audit=await actor.rpc('admin_sync_started');if(audit.error)return reply({error:'Forbidden'},403);
    }
    return reply(await syncProminents(db,{trigger,limit:45,budgetMs:85000}));
  } catch(e) {console.error('prominent-sync failed',e.message);return reply({error:'Synchronisatie mislukt. Bekijk het beheerlog.'},500);}
});
