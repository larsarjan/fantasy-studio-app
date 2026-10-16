import { rankManagers, roundAnalytics, deriveTransfers } from './prominentModel.js';

export const PUBLIC_GROUPS = Object.freeze({ TOP_100: 'Top 100', CONTENT_CREATOR: 'Content Creators', ESPN: 'ESPN-medewerkers', FVT_SUBLEAGUE: 'FVT Subleague' });

// Membership is round-specific. The union is keyed by ESPN entry, never by
// membership count. Missing picks must not dilute ownership percentages.
export function rankingAnalytics(managers, snapshots, season, event, group = '') {
  const identities = new Map(managers.map(m => [m.id, String(m.espn_entry_id)]));
  const unique = new Map();
  for (const s of snapshots.filter(s => s.season === season && s.event <= event)) {
    const entry = identities.get(s.prominent_id);
    if (!entry) continue;
    const key = `${entry}:${s.event}`, old = unique.get(key);
    if (old) old.groups = [...new Set([...old.groups, ...s.groups])];
    else unique.set(key, {...s, groups:[...s.groups]});
  }
  const history = [...unique.values()];
  const rows = rankManagers(managers, history, season, event, group);
  for(const row of rows)row.view_group=group;
  const analytics = roundAnalytics(rows, history, season, event);
  const valid = rows.filter(r => r.snapshot.picks?.length === 15 && new Set(r.snapshot.picks.map(p => p.element_id)).size === 15);
  const players = new Map();
  for (const r of valid) for (const p of r.snapshot.picks) {
    const v = players.get(p.element_id) || {...p, owners:0, starters:0, bench:0, captains:0, vice:0};
    v.owners++; v.starters += Number(p.squad_position <= 11); v.bench += Number(p.squad_position > 11);
    v.captains += Number(p.is_captain); v.vice += Number(p.is_vice_captain); players.set(p.element_id,v);
  }
  analytics.players = [...players.values()].map(p => ({...p, ownership:p.owners/valid.length*100})).sort((a,b) => b.owners-a.owners || a.element_id-b.element_id);
  analytics.captains = analytics.players.filter(p=>p.captains).sort((a,b)=>b.captains-a.captains);
  analytics.validTeams = valid.length;
  analytics.netScoresAvailable = rows.every(r=>r.snapshot.event_transfers_cost!=null);
  analytics.managerOfRound = [...rows].sort((a,b)=>(b.snapshot.event_points-(analytics.netScoresAvailable?b.snapshot.event_transfers_cost:0))-(a.snapshot.event_points-(analytics.netScoresAvailable?a.snapshot.event_transfers_cost:0)))[0];
  for(const r of analytics.stats){
    const rounds=history.filter(s=>s.prominent_id===r.id);
    for(const [field,source] of [['bench','points_on_bench'],['transfers','event_transfers'],['costs','event_transfers_cost']])if(rounds.some(s=>s[source]==null))r[field]=null;
  }
  const leader=key=>analytics.stats.every(r=>r[key]!=null)?[...analytics.stats].sort((a,b)=>b[key]-a[key]):[];
  analytics.transferKing=leader('transfers')[0];analytics.benchKing=leader('bench')[0];analytics.efficientBench=leader('bench').at(-1);
  analytics.roundBenchComplete = rows.every(r=>r.snapshot.points_on_bench!=null);
  analytics.roundBenchKing = [...rows].filter(r=>r.snapshot.points_on_bench!=null).sort((a,b)=>b.snapshot.points_on_bench-a.snapshot.points_on_bench)[0];
  // Existing transfer definition identifies temporary chip selections explicitly.
  // Keep them separate instead of presenting them as permanent purchases/sales.
  const trends = new Map(); let comparisonTeams=0, temporaryTeams=0;
  for (const r of valid) {
    const previous=history.find(s=>s.prominent_id===r.id && s.event===event-1);
    if(previous?.picks?.length!==15) continue;
    const t=deriveTransfers(r.snapshot,previous);
    if(!t.available) continue;
    if(t.temporary){temporaryTeams++;continue;}
    comparisonTeams++;
    for(const [list,field] of [[t.incoming,'bought'],[t.outgoing,'sold']]) for(const p of list){const v=trends.get(p.element_id)||{...p,bought:0,sold:0};v[field]++;trends.set(p.element_id,v);}
  }
  analytics.trends=[...trends.values()].sort((a,b)=>(b.bought-b.sold)-(a.bought-a.sold));
  analytics.comparisonTeams=comparisonTeams; analytics.temporaryTeams=temporaryTeams;
  analytics.roundChips=rows.filter(r=>r.snapshot.active_chip).map(r=>r.snapshot);
  // Select a real, legal stored XI with the highest sum of actual XI frequencies.
  // This avoids inventing a squad from possession counts or current player scores.
  const legal=valid.filter(r=>{
    const xi=r.snapshot.picks.filter(p=>p.squad_position<=11),counts=[1,2,3,4].map(t=>xi.filter(p=>p.element_type===t).length);
    const clubs=new Map();for(const p of xi)clubs.set(p.club_id,(clubs.get(p.club_id)||0)+1);
    return xi.length===11&&counts[0]===1&&counts[1]>=3&&counts[1]<=5&&counts[2]>=2&&counts[2]<=5&&counts[3]>=1&&counts[3]<=3&&[...clubs.values()].every(n=>n<=3);
  });
  const score=r=>r.snapshot.picks.filter(p=>p.squad_position<=11).reduce((n,p)=>n+(players.get(p.element_id)?.starters||0),0);
  const consensus=legal.sort((a,b)=>score(b)-score(a)||a.espn_entry_id-b.espn_entry_id)[0];
  analytics.consensus=consensus?consensus.snapshot.picks.filter(p=>p.squad_position<=11).map(p=>({...p,starters:players.get(p.element_id).starters})):[];
  const average=key=>{const values=rows.map(r=>r.snapshot[key]).filter(v=>v!=null&&Number.isFinite(v));return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
  return {rows,analytics,summary:{coverage:Object.fromEntries(['event_points','total_points','overall_rank','team_value'].map(k=>[k,rows.filter(r=>r.snapshot[k]!=null).length])),count:rows.length,validTeams:valid.length,event_points:average('event_points'),total_points:average('total_points'),overall_rank:average('overall_rank'),team_value:average('team_value'),chips:analytics.roundChips.length}};
}

export function compactRanking(result) {
  // Picks are used only on the server. Player frequency aggregates remain public.
  const copy=JSON.parse(JSON.stringify(result,(key,value)=>key==='picks'||key==='raw_json'||key==='automatic_subs'?undefined:value));
  if(copy.analytics){
    copy.analytics.stats=copy.analytics.stats.filter(r=>r.snapshot.event_transfers>0&&r.snapshot.event_transfers_cost!=null).sort((a,b)=>(b.snapshot.event_points-b.snapshot.event_transfers_cost)-(a.snapshot.event_points-a.snapshot.event_transfers_cost)).slice(0,1);
    copy.analytics.chips=copy.analytics.chips.map(({event,active_chip,event_points})=>({event,active_chip,event_points}));
    copy.analytics.roundChips=copy.analytics.roundChips.map(({active_chip})=>({active_chip}));
  }
  return copy;
}
