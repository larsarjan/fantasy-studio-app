import fs from 'node:fs'
import vm from 'node:vm'
import {buildPlayerMatch} from '../src/services/playerMatchStatsEngine.js'
const read=name=>JSON.parse(fs.readFileSync(`test-results/goals-conceded-${name}.json`,'utf8').replace(/^\uFEFF/,''))
const db=read('db'), bootstrap=read('bootstrap'), fixtures=read('fixtures')
const context=vm.createContext({});vm.runInContext(fs.readFileSync('docs/apps-script/EspnSync.gs','utf8'),context)
const resolve=vm.runInContext('resolveEspnMatchFacts',context)
const fields={minutes:'minutes',goals:'goals_scored',assists:'assists',cleanSheet:'clean_sheets',goalsConceded:'goals_conceded',saves:'saves',penaltiesSaved:'penalties_saved',penaltiesMissed:'penalties_missed',ownGoals:'own_goals',yellowCards:'yellow_cards',redCards:'red_cards',optaBonus:'bonus'}
const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const club=s=>({sccambuur:'cambuur',cambuurleeuwarden:'cambuur',nec:'nec',necnijmegen:'nec'}[norm(s)]||norm(s))
const reports=[],changes=[],unmatched=[]
for(const round of [1,5,9,10]) {
 const live=read(`live-round${round}`), counts={round,checked:0,changed:0,goalsConceded:0,keeperDefenderDisplays:0,pointsChanged:0,fields:{}}
 for(const old of db.stats.filter(s=>s.round===round&&s.minutes>0)) {
  const player=db.players.find(p=>p.id===old.playerId),fixture=db.fixtures.find(f=>f.id===old.fixtureId)
  const ids=[...new Set(db.mappings.filter(m=>m.playerId===old.playerId&&m.season===old.season).map(m=>Number(m.espnPlayerId)))]
  const candidates=ids.length?bootstrap.elements.filter(p=>ids.includes(p.id)):bootstrap.elements.filter(p=>norm(p.web_name)===norm(player?.name)&&club(bootstrap.teams.find(t=>t.id===p.team)?.name)===club(player?.club))
  if(candidates.length!==1){unmatched.push({round,player:old.playerName,reason:'identity'});continue}
  const item=live.elements.find(p=>p.id===candidates[0].id)
  const matches=(item?.explain||[]).filter(e=>fixtures.some(f=>f.id===e.fixture&&f.kickoff_time?.slice(0,10)===fixture?.date))
  if(matches.length!==1){unmatched.push({round,player:old.playerName,reason:'fixture'});continue}
  let facts
  try{facts=resolve(item,matches[0].fixture,()=>{throw Error('DGW needs history')})}catch{unmatched.push({round,player:old.playerName,reason:'DGW'});continue}
  const corrected={...old},diff={}
  for(const [key,source] of Object.entries(fields)){corrected[key]=key==='cleanSheet'?Boolean(facts[source]):facts[source];if(Number(old[key])!==Number(corrected[key])){diff[key]=[old[key],corrected[key]];counts.fields[key]=(counts.fields[key]||0)+1}}
  counts.checked++
  const before=buildPlayerMatch({player,matchStat:old,fixture}),after=buildPlayerMatch({player,matchStat:corrected,fixture})
  if(before.punten.totaal!==after.punten.totaal)counts.pointsChanged++
  if(Object.keys(diff).length){counts.changed++;changes.push({id:old.id,round,player:old.playerName,position:player.position,espnPlayerId:candidates[0].id,fixture:matches[0].fixture,diff,points:[before.punten.totaal,after.punten.totaal]})}
  if(diff.goalsConceded){counts.goalsConceded++;if(['Doelman','Verdediger'].includes(player.position))counts.keeperDefenderDisplays++}
 }
 reports.push(counts)
}
fs.writeFileSync('test-results/goals-conceded-audit.json',JSON.stringify({reports,changes,unmatched},null,2))
console.log(JSON.stringify({reports,unmatched:unmatched.length},null,2))
