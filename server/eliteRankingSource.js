import {fetchSheet} from '../src/services/googleSheets.js';

const integer=value=>/^\d+$/.test(String(value))?Number(value):null;
const seasonOf=value=>String(value).replace('/','-');
const bool=value=>String(value).toUpperCase()==='TRUE';
let cached;
export async function loadEliteRankingSource(){
  if(cached&&Date.now()-cached.at<300000)return cached.promise;
  const promise=Promise.all([fetchSheet('ELITE_MANAGERS'),fetchSheet('ELITE_TEAM_SNAPSHOTS')]).then(([managers,picks])=>({managers,picks}));
  cached={at:Date.now(),promise};try{return await promise;}catch(error){cached=null;throw error;}
}

// A read projection of the two existing sheets. No sync, writes or replacement
// of immutable prominent snapshots. Public cohorts never exceed 100 per round.
export function projectEliteSource(source,bootstrap,season,event,existingManagers=[],detailEntry=0){
  for(const [rows,fields] of [[source.managers,['Seizoen','Gameweek','EntryId','StandingIndex','TotalPoints','EventPoints']],[source.picks,['Seizoen','Gameweek','EntryId','ESPNPlayerId','SquadPosition','IsCaptain','IsViceCaptain']]]){
    if(!Array.isArray(rows)||!rows.length||fields.some(k=>!(k in rows[0])))throw Error('Invalid elite source schema');
  }
  const metadata=new Map((bootstrap.players||[]).map(p=>[p.id,p]));
  const clubs=new Map((bootstrap.teams||[]).map(t=>[t.id,t.name]));
  const candidates=source.managers.filter(r=>seasonOf(r.Seizoen)===season&&integer(r.Gameweek)<=event&&integer(r.Gameweek)>0&&integer(r.EntryId)>0);
  const eligible=new Set(candidates.filter(r=>integer(r.StandingIndex)>0&&integer(r.StandingIndex)<=100).map(r=>integer(r.EntryId)));
  const counts=new Map();for(const r of candidates)if(integer(r.StandingIndex)>0&&integer(r.StandingIndex)<=100){const round=integer(r.Gameweek);counts.set(round,(counts.get(round)||0)+1);if(counts.get(round)>100)throw Error('Oversized public cohort');}
  const identities=new Map(existingManagers.map(m=>[m.espn_entry_id,m]));
  const managers=[],snapshots=[],byKey=new Map();
  for(const r of candidates){
    const entry=integer(r.EntryId),round=integer(r.Gameweek),index=integer(r.StandingIndex);
    // Retain history for known public entries, even when they were outside the
    // cohort in another round. Empty membership keeps those rows out of ranking.
    if(!eligible.has(entry))continue;
    const id=identities.get(entry)?.id||`elite-${entry}`;
    if(!identities.has(entry)){const m={id,espn_entry_id:entry,public_name:r.ManagerDisplayName||r.Managernaam||`Manager ${entry}`,fantasy_team_name:r.Teamnaam,active:true,prominent_groups:[{active:true,group_type:'TOP_100'}]};identities.set(entry,m);managers.push(m);}
    const key=`${entry}:${round}`;
    if(byKey.has(key))throw Error('Duplicate elite manager snapshot');
    const value=name=>r[name]!==''&&Number.isFinite(Number(r[name]))?Number(r[name]):null;
    const s={id:`elite-${entry}-${season}-${round}`,prominent_id:id,season,event:round,groups:index>0&&index<=100?['TOP_100']:[],event_points:value('EventPoints'),total_points:value('TotalPoints'),overall_rank:value('Rank'),active_chip:r.ActiveChip&&r.ActiveChip!=='none'?r.ActiveChip:null,team_value:null,bank:null,event_transfers:null,event_transfers_cost:null,points_on_bench:null,picks:[],fetched_at:null,fantasy_team_name:r.Teamnaam,source:'ELITE_MANAGERS',source_date:r.SnapshotDatum};
    byKey.set(key,s);snapshots.push(s);
  }
  for(const p of source.picks){
    if(seasonOf(p.Seizoen)!==season)continue;
    const s=byKey.get(`${integer(p.EntryId)}:${integer(p.Gameweek)}`);if(!s)continue;
    const id=integer(p.ESPNPlayerId),position=integer(p.SquadPosition),meta=metadata.get(id);
    if(!id||!position||position>15)throw Error('Invalid elite pick');
    s.picks.push({element_id:id,squad_position:position,multiplier:integer(p.Multiplier),is_captain:bool(p.IsCaptain),is_vice_captain:bool(p.IsViceCaptain),element_type:meta?.element_type??null,player_name:meta?`${meta.first_name} ${meta.second_name}`:`Speler ${id}`,web_name:meta?.web_name||`Speler ${id}`,club_name:clubs.get(meta?.team)||'',club_id:meta?.team??null});
  }
  for(const s of snapshots){
    s.picks.sort((a,b)=>a.squad_position-b.squad_position);
    if(s.picks.length!==15||new Set(s.picks.map(p=>p.element_id)).size!==15||new Set(s.picks.map(p=>p.squad_position)).size!==15||s.picks.filter(p=>p.is_captain).length!==1||s.picks.filter(p=>p.is_vice_captain).length!==1)s.picks=[];
  }
  return {managers,snapshots};
}

export function mergeEliteHistory(history,elite){
  const byKey=new Map(history.map(s=>[`${s.prominent_id}:${s.event}`,s]));
  for(const s of elite){const existing=byKey.get(`${s.prominent_id}:${s.event}`);if(existing){existing.groups=[...new Set([...existing.groups,...s.groups])];}else{history.push(s);byKey.set(`${s.prominent_id}:${s.event}`,s);}}
  return history;
}
