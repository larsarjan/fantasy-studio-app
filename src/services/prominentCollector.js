import { LEAGUES, ESPN_SEEDS, mergeManagers, completedEvents, seasonOf, normalizeSnapshot } from './prominentModel.js';
export const ESPN_BASE = 'https://fantasy.espngoal.nl/api/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function createEspnClient({fetcher = fetch, delay = 300, wait = sleep} = {}) {
  return async path => {
    if (!/^(bootstrap-static\/|entry\/\d+\/(?:event\/\d+\/picks\/)?|leagues-classic\/\d+\/standings\/\?page_new_entries=1&page_standings=\d+&phase=1)$/.test(path)) throw Error('Niet toegestaan ESPN-pad');
    for (let attempt=0; attempt<3; attempt++) {
      await wait(delay);
      try {
        const response = await fetcher(ESPN_BASE + path, {signal: AbortSignal.timeout(15000), headers: {Accept: 'application/json'}});
        if (!response.ok) { const error = Error(`ESPN HTTP ${response.status}`); error.status=response.status; throw error; }
        const data = await response.json();
        if (!data || typeof data !== 'object') throw Error('Lege ESPN-response');
        return data;
      } catch (error) {
        if (error.status === 404 || attempt === 2) throw error;
        await wait(Math.min(10000, 1000 * 2 ** attempt));
      }
    }
  };
}
export async function fetchLeague(get, id) {
  const rows = [], identities = new Set();
  for (let page=1; page<=500; page++) {
    const data = await get(`leagues-classic/${id}/standings/?page_new_entries=1&page_standings=${page}&phase=1`);
    const s = data.standings;
    if (data.league?.id !== id || !s || s.page !== page || !Array.isArray(s.results) || typeof s.has_next !== 'boolean' || (s.has_next && !s.results.length)) throw Error(`Ongeldige paginatie league ${id}`);
    for (const row of s.results) { if (identities.has(row.entry)) throw Error('Herhaalde leaguepagina'); identities.add(row.entry); rows.push(row); }
    if (!s.has_next) return rows;
  }
  throw Error('League-paginatie overschrijdt limiet');
}
const result = r => { if (r.error) throw Error(r.error.message); return r.data; };
export async function allRows(queryFactory, batch=1000) {
  const rows=[];
  for(let offset=0; ; offset+=batch) {const page=result(await queryFactory().range(offset,offset+batch-1)); rows.push(...page); if(page.length<batch)return rows;}
}
export async function syncProminents(db, {get=createEspnClient(), limit=30, budgetMs=85000, trigger='scheduler', clock=()=>Date.now()} = {}) {
  const owner=crypto.randomUUID(), started=clock();
  if (!result(await db.rpc('prominent_acquire_lock',{lock_owner:owner}))) return {status:'busy'};
  let run, season, event, processed=0, errors=0, counts={}, warnings=[];
  try {
    run=result(await db.from('prominent_sync_runs').insert({trigger_type:trigger}).select().single());
    const bootstrap=await get('bootstrap-static/');
    const events=completedEvents(bootstrap); season=seasonOf(bootstrap); event=events.at(-1)?.id ?? 0;
    result(await db.from('prominent_bootstrap').upsert({season,events:bootstrap.events,players:bootstrap.elements,teams:bootstrap.teams,element_types:bootstrap.element_types,chips:bootstrap.chips,game_settings:bootstrap.game_settings,game_config:bootstrap.game_config || {},fetched_at:new Date().toISOString()},{onConflict:'season'}));
    const last = result(await db.from('prominent_sync_runs').select('source_counts,source_warnings,finished_at').not('finished_at','is',null).order('started_at',{ascending:false}).limit(1));
    const existing = result(await db.from('prominents').select('id').limit(1));
    if (!existing.length || !last.length || last[0].source_warnings.length || !last[0].source_counts.synced_at || Date.now()-Date.parse(last[0].source_counts.synced_at)>6*3600000) {
      const sources=[];
      for (const league of LEAGUES) { try { const rows=await fetchLeague(get,league.id); sources.push({...league,rows}); counts[league.id]=rows.length; } catch(e) { warnings.push(`League ${league.id}: ${e.message}`); } }
      try {const control=await fetchLeague(get,7302); const ids=new Set(control.map(r=>r.entry)); counts[7302]=control.length; const missing=ESPN_SEEDS.filter(s=>!ids.has(s.espn_entry_id));if(missing.length)warnings.push(`Niet gevonden in controleleague 7302: ${missing.map(s=>s.espn_entry_id).join(', ')}`);} catch(e){warnings.push(`Controleleague 7302: ${e.message}`);}
      const imported=mergeManagers(sources);
      const oldManagers=await allRows(()=>db.from('prominents').select('*,prominent_groups(*)').order('espn_entry_id'));
      const oldById=new Map(oldManagers.map(m=>[m.espn_entry_id,m]));
      const records=imported.map(m=>{const {groups,...record}=m,old=oldById.get(m.espn_entry_id);if(old?.curated&&!m.curated){record.public_name=old.public_name;record.curated=true;}if(m.espn_entry_id===260)record.public_name='Lars';return {...record,updated_at:new Date().toISOString()};});
      const saved=result(await db.from('prominents').upsert(records,{onConflict:'espn_entry_id'}).select());
      const savedById=new Map(saved.map(m=>[m.espn_entry_id,m.id]));
      const memberships=imported.flatMap(m=>m.groups.filter(g=>!oldById.get(m.espn_entry_id)?.prominent_groups.some(old=>old.group_type===g.group_type&&old.manual_override)).map(g=>({...g,prominent_id:savedById.get(m.espn_entry_id),active:true})));
      if(memberships.length)result(await db.from('prominent_groups').upsert(memberships,{onConflict:'prominent_id,group_type'}));
      // Only reconcile a source after ALL pages succeeded. Manual/curated tags survive.
      for(const source of sources){const ids=new Set(source.rows.map(r=>r.entry));const members=result(await db.from('prominent_groups').select('*,prominents(espn_entry_id)').eq('source_league_id',source.id).eq('source_type','league').eq('manual_override',false));for(const g of members)if(!ids.has(g.prominents.espn_entry_id))result(await db.from('prominent_groups').update({active:false}).eq('prominent_id',g.prominent_id).eq('group_type',g.group_type));}
      counts.synced_at=new Date().toISOString();
    } else counts=last[0].source_counts;
    const managers=(await allRows(()=>db.from('prominents').select('*,prominent_groups(*)').eq('active',true).order('espn_entry_id'))).filter(m=>m.prominent_groups.some(g=>g.active));
    const snapshots=await allRows(()=>db.from('prominent_round_snapshots').select('prominent_id,event').eq('season',season).order('id'));
    const present=new Set(snapshots.map(s=>`${s.prominent_id}:${s.event}`));
    const jobs=managers.flatMap(m=>events.filter(e=>!present.has(`${m.id}:${e.id}`)).map(e=>({prominent_id:m.id,season,event:e.id})));
    for(let i=0;i<jobs.length;i+=200)result(await db.from('prominent_sync_jobs').upsert(jobs.slice(i,i+200),{onConflict:'prominent_id,season,event',ignoreDuplicates:true}));
    const due=result(await db.from('prominent_sync_jobs').select('*').eq('season',season).in('status',['pending','error']).lte('next_retry_at',new Date().toISOString()).order('event').order('prominent_id').limit(limit));
    const byId=new Map(managers.map(m=>[m.id,m])), entries=new Map();
    for(const job of due) {
      if(clock()-started>budgetMs)break;
      const manager=byId.get(job.prominent_id);
      if(!manager){result(await db.from('prominent_sync_jobs').update({status:'unavailable',last_error:'Manager wordt niet langer gevolgd',updated_at:new Date().toISOString()}).match({prominent_id:job.prominent_id,season,event:job.event}));continue;}
      try {
        if(!entries.has(manager.id)) {const entry=await get(`entry/${manager.espn_entry_id}/`);if(entry.id!==manager.espn_entry_id || typeof entry.name!=='string')throw Error('Ongeldige entry');entries.set(manager.id,entry);result(await db.from('prominents').update({fantasy_team_name:entry.name,fantasy_manager_name:entry.player_manager_display_name || `${entry.player_first_name} ${entry.player_last_name}`,updated_at:new Date().toISOString()}).eq('id',manager.id));}
        const entry=entries.get(manager.id);
        if(Number.isInteger(entry.started_event) && job.event<entry.started_event){result(await db.from('prominent_sync_jobs').update({status:'unavailable',last_error:`Entry begon in SR${entry.started_event}`,updated_at:new Date().toISOString()}).match({prominent_id:job.prominent_id,season,event:job.event}));continue;}
        const raw=await get(`entry/${manager.espn_entry_id}/event/${job.event}/picks/`);
        const s=normalizeSnapshot(raw,bootstrap,job.event,{...manager,fantasy_team_name:entry.name,groups:manager.prominent_groups.filter(g=>g.active)});
        result(await db.rpc('prominent_save_snapshot',{manager_id:manager.id,snapshot:s}));
        result(await db.from('prominent_sync_jobs').update({status:'complete',attempts:job.attempts+1,last_error:null,updated_at:new Date().toISOString()}).match({prominent_id:job.prominent_id,season,event:job.event}));processed++;
      } catch(e) {
        errors++;console.error('prominent-sync',manager.espn_entry_id,job.event,e.message);
        result(await db.from('prominent_sync_jobs').update({status:'error',attempts:job.attempts+1,last_error:String(e.message).slice(0,500),next_retry_at:new Date(Date.now()+Math.min(24*3600000,60000*2**Math.min(job.attempts,10))).toISOString(),updated_at:new Date().toISOString()}).match({prominent_id:job.prominent_id,season,event:job.event}));
      }
    }
    const pending=result(await db.from('prominent_sync_jobs').select('event').eq('season',season).in('status',['pending','error'])).length;
    const status=pending || warnings.length || errors ? 'partial' : 'complete';
    result(await db.from('prominent_sync_runs').update({season,event,status,processed,errors,pending,source_counts:counts,source_warnings:warnings,finished_at:new Date().toISOString()}).eq('id',run.id));
    return {status,season,event,processed,errors,pending,source_counts:counts,warnings};
  } catch(e) {
    if(run)await db.from('prominent_sync_runs').update({status:'error',errors:errors+1,source_warnings:[...warnings,e.message],finished_at:new Date().toISOString()}).eq('id',run.id);
    throw e;
  } finally { result(await db.rpc('prominent_release_lock',{lock_owner:owner})); }
}
