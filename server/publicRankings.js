import {createClient} from '@supabase/supabase-js';
import {PUBLIC_GROUPS,rankingAnalytics,compactRanking} from '../src/services/publicRankingModel.js';
import {loadEliteRankingSource,projectEliteSource,mergeEliteHistory} from './eliteRankingSource.js';
import {loadOfficialRankingDetails} from './rankingOfficialDetails.js';

const fields='id,prominent_id,season,event,active_chip,event_points,total_points,event_rank,overall_rank,bank,team_value,event_transfers,event_transfers_cost,points_on_bench,fantasy_team_name,groups,fetched_at,automatic_subs';
async function all(query){const out=[];for(let offset=0;offset<100000;offset+=1000){const {data,error}=await query().range(offset,offset+999);if(error)throw Error('Snapshot query failed');out.push(...data);if(data.length<1000)return out;}throw Error('Snapshot limit exceeded');}
export function createPublicRankingsHandler({env=process.env,clientFactory=createClient,now=Date.now,eliteSource=loadEliteRankingSource,officialDetails=loadOfficialRankingDetails}={}) {
  const cache=new Map();
  return async request=>{
    const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':status===200?'public, max-age=60, s-maxage=300':'no-store','X-Content-Type-Options':'nosniff'}});
    if(request.method!=='GET')return json({error:'Methode niet toegestaan.'},405);
    const url=new URL(request.url),season=url.searchParams.get('season'),event=Number(url.searchParams.get('event')||0),group=url.searchParams.get('group')||'',entry=Number(url.searchParams.get('entry')||0);
    if(!Number.isSafeInteger(entry)||entry<0)return json({error:'Ongeldige manager.'},400);
    if((season&&!/^20\d{2}-20\d{2}$/.test(season))||!Number.isInteger(event)||event<0||event>60||(group&&!PUBLIC_GROUPS[group]))return json({error:'Ongeldige filters.'},400);
    const key=JSON.stringify([season,event,group,entry]),existing=cache.get(key);
    if(existing&&now()-existing.at<300000){try{return json(await existing.promise);}catch{return json({error:'De ranglijst kon niet worden geladen. Probeer opnieuw.'},503);}}
    if(!env.VITE_SUPABASE_URL||!env.VITE_SUPABASE_PUBLISHABLE_KEY)return json({error:'Ranglijstbron niet geconfigureerd.'},503);
    const load=async()=>{
      // Public reads use the public key and existing RLS, never service credentials.
      const db=clientFactory(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
      const bootstrap=await all(()=>db.from('prominent_bootstrap').select('season,chip_labels,events,chips,game_settings,players,teams,element_types,fetched_at').order('season',{ascending:false}));
      const selectedSeason=season||bootstrap[0]?.season;
      if(!bootstrap.some(b=>b.season===selectedSeason))return {bootstrap:bootstrap.map(b=>({season:b.season})),rounds:[],season:selectedSeason,event,rows:[],empty:true};
      const config=bootstrap.find(b=>b.season===selectedSeason);
      const rounds=config.events.filter(e=>e.finished&&e.data_checked).map(e=>e.id).sort((a,b)=>b-a);
      const selectedEvent=event||rounds[0];
      if(!rounds.includes(selectedEvent))return {bootstrap:bootstrap.map(({players,teams,element_types,...b})=>b),rounds,season:selectedSeason,event:selectedEvent,rows:[],empty:true};
      const managers=await all(()=>db.from('prominents').select('id,espn_entry_id,public_name,fantasy_team_name,active,prominent_groups(*)').order('id'));
      const throughEvent=entry?Math.max(...rounds):selectedEvent;
      const history=await all(()=>db.from('prominent_round_snapshots').select(fields).eq('season',selectedSeason).lte('event',throughEvent).order('id'));
      const elite=projectEliteSource(await eliteSource(),config,selectedSeason,throughEvent,managers,entry);
      managers.push(...elite.managers);mergeEliteHistory(history,elite.snapshots);
      const detailManager=entry?managers.find(m=>m.espn_entry_id===entry):null;
      if(entry&&!detailManager)return {notFound:true};
      const selected=history.filter(s=>s.event===selectedEvent&&(!group||s.groups.includes(group)));
      const ids=new Set(selected.map(s=>s.prominent_id));if(detailManager)ids.add(detailManager.id);
      const scoped=history.filter(s=>ids.has(s.prominent_id));
      const pickIds=scoped.filter(s=>!s.id.startsWith('elite-')&&(s.event===selectedEvent||s.event===selectedEvent-1||s.prominent_id===detailManager?.id)).map(s=>s.id);
      const picks=[];
      for(let i=0;i<pickIds.length;i+=100)picks.push(...await all(()=>db.from('prominent_round_picks').select('snapshot_id,element_id,squad_position,multiplier,is_captain,is_vice_captain,element_type,player_name,web_name,club_name,club_id').in('snapshot_id',pickIds.slice(i,i+100)).order('snapshot_id').order('squad_position')));
      const bySnapshot=new Map();for(const p of picks){if(!bySnapshot.has(p.snapshot_id))bySnapshot.set(p.snapshot_id,[]);bySnapshot.get(p.snapshot_id).push(p);}
      for(const s of scoped)if(!s.id.startsWith('elite-'))s.picks=bySnapshot.get(s.id)||[];
      const enrichment=await officialDetails(scoped.filter(s=>s.event===selectedEvent||s.prominent_id===detailManager?.id),managers);
      const result=rankingAnalytics(managers,history,selectedSeason,selectedEvent,group);
      const comparison=group?null:Object.fromEntries(Object.keys(PUBLIC_GROUPS).map(g=>{const r=rankingAnalytics(managers,history,selectedSeason,selectedEvent,g);return [g,{...r.summary,players:r.analytics.players}];}));
      const response=compactRanking({...result,comparison,enrichment,bootstrap:bootstrap.map(({players,teams,element_types,...b})=>b),rounds,season:selectedSeason,event:selectedEvent,labels:config.chip_labels,updated:selected.map(s=>s.fetched_at).filter(Boolean).sort().at(-1),unavailable:[]});
      if(detailManager)response.profileData={managers,snapshots:history.map(({picks,...s})=>({...s,...(s.prominent_id===detailManager.id?{picks:picks||[]}:{})})),bootstrap:response.bootstrap};
      return response;
    };
    const promise=load();if(cache.size>32)cache.clear();cache.set(key,{at:now(),promise});
    try{return json(await promise);}catch{cache.delete(key);return json({error:'De ranglijst kon niet worden geladen. Probeer opnieuw.'},503);}
  };
}
