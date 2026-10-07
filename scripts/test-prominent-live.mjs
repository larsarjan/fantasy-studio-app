import {createClient} from '@supabase/supabase-js';
import {loadEnv} from 'vite';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createEspnClient,fetchLeague,allRows} from '../src/services/prominentCollector.js';
import {ESPN_SEEDS,normalizeSnapshot,seasonOf} from '../src/services/prominentModel.js';
const env=loadEnv('production',process.cwd(),'');assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co');
const db=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}}),get=createEspnClient();
const bootstrap=await get('bootstrap-static/'),season=seasonOf(bootstrap),last=Math.max(...bootstrap.events.filter(e=>e.finished&&e.data_checked).map(e=>e.id));
const managers=await allRows(()=>db.from('prominents').select('*,prominent_groups(*)').order('espn_entry_id'));
const snapshots=await allRows(()=>db.from('prominent_round_snapshots').select('*,picks:prominent_round_picks(*)').eq('season',season).order('event').order('id'));
const checks=[];function ok(value,label){assert(value,label);checks.push(label);}
ok(new Set(managers.map(m=>m.espn_entry_id)).size===managers.length,'Central ESPN identity has no duplicates');
for(const [league,group] of [[369,'FVT_SUBLEAGUE'],[1182,'CONTENT_CREATOR']]){const rows=await fetchLeague(get,league);for(const row of rows)ok(managers.some(m=>m.espn_entry_id===row.entry&&m.prominent_groups.some(g=>g.group_type===group&&g.active)),`${league}: ${row.entry} imported`);}
for(const seed of ESPN_SEEDS)ok(managers.some(m=>m.espn_entry_id===seed.espn_entry_id&&m.public_name===seed.public_name&&m.prominent_groups.some(g=>g.group_type==='ESPN')),`Curated ${seed.public_name}`);
ok(managers.filter(m=>m.prominent_groups.some(g=>g.group_type==='ESPN')).length===18,'ESPN imports exactly curated 18, not all 7302 members');
const lars=managers.find(m=>m.espn_entry_id===260);ok(lars.prominent_groups.some(g=>g.group_type==='CONTENT_CREATOR'&&g.manual_override),'Lars manual Creator tag preserved');
const fvt=managers.find(m=>m.espn_entry_id!==260&&m.prominent_groups.some(g=>g.group_type==='FVT_SUBLEAGUE'));
for(const id of [20124,3810,23430,4280,42488,fvt.espn_entry_id]){
 const m=managers.find(m=>m.espn_entry_id===id),entry=await get(`entry/${id}/`);
 for(const event of [...new Set([1,4,last])]){
  if(event<entry.started_event)continue;
  const raw=await get(`entry/${id}/event/${event}/picks/`),expected=normalizeSnapshot(raw,bootstrap,event,{fantasy_team_name:entry.name,groups:m.prominent_groups}),stored=snapshots.find(s=>s.prominent_id===m.id&&s.event===event);
  assert(stored,`Missing snapshot ${id} SR${event}`);
  for(const field of ['event_points','total_points','event_rank','overall_rank','bank','team_value','event_transfers','event_transfers_cost','points_on_bench','active_chip'])assert.equal(stored[field],expected[field],`${id} SR${event} ${field}`);
  const fields=['element_id','squad_position','multiplier','is_captain','is_vice_captain','element_type'];
  assert.deepEqual(stored.picks.sort((a,b)=>a.squad_position-b.squad_position).map(p=>fields.map(k=>p[k])),expected.picks.map(p=>fields.map(k=>p[k])),`${id} SR${event} all 15 picks`);
  checks.push(`ESPN ${id} SR${event}: authoritative points, total, ranks, team value, bank, transfers, costs, chip, captain, vice, starters and bench match`);
 }
}
for(const s of snapshots)ok(s.picks.length===15,`Complete atomic squad ${s.id}`);
ok((await db.from('prominent_sync_runs').select('*')).error,'Anonymous sync logs are private');
ok((await db.rpc('prominent_save_snapshot',{manager_id:managers[0].id,snapshot:{}})).error,'Anonymous snapshot writes rejected');
const denied=await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/prominent-sync`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});ok(denied.status===401,'Unauthenticated admin sync rejected');
const forged=await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/prominent-sync`,{method:'POST',headers:{'Content-Type':'application/json','x-sync-token':'forged'},body:'{}'});ok(forged.status===401,'Forged scheduler token rejected');
const accounts=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8'));
for(const account of accounts.filter(a=>['a','editor','admin'].includes(a.role))){
 const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
 const login=await client.auth.signInWithPassword({email:account.email,password:account.password});assert.equal(login.error,null,'Controlled test login');
 try{
  const response=await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/prominent-sync`,{method:'POST',headers:{Authorization:`Bearer ${login.data.session.access_token}`,'Content-Type':'application/json'},body:'{}'});
  ok(response.status===(account.role==='admin'?200:403),`${account.role}: sync is admin-only`);
  if(account.role==='admin'){const result=await response.json();ok(result.status==='complete'&&result.processed===0&&result.pending===0,'Admin sync is idempotent after full backfill');}
 }finally{await client.auth.signOut({scope:'local'});}
}
const report={project:'rzunbquzffdivlpuomjc',season,event:last,managers:managers.length,snapshots:snapshots.length,picks:snapshots.reduce((n,s)=>n+s.picks.length,0),checks:checks.length,at:new Date().toISOString(),details:checks};
writeFileSync('test-results/prominent-live-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,details:undefined}));
