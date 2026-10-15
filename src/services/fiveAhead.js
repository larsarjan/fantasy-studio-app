import {COMPARE_CLUB_GROUPS,resolveCompareClubGroup} from './clubGroups.js'
import {fixtureViewForClub,clubSchemaSummary} from './clubSchedule.js'
import {roundWindows,clubWindowFixtures,kickoffTime,uniqueFixtures} from './fixtureWindows.js'
import {normalizeClubName} from './historyAnalytics.js'

// An editorial snapshot, prepared only by an explicit author action. Rendering
// never rewrites saved articles when the underlying cloud snapshot changes.
export function prepareFiveAhead({fixtures,other=[],results=[],teamRatings=[],season,startRound,sourceUpdatedAt=null}){
 if(!/^\d{4}\/\d{4}$/.test(season)||!Number.isInteger(startRound)||startRound<1||startRound>38)throw Error('Kies een geldig seizoen en startspeelronde.')
 const league=uniqueFixtures(fixtures.filter(f=>String(f.season).replace('-','/')===season)),windows=roundWindows(league)
 const available=[...new Set(league.flatMap(f=>[f.home,f.away]))],clubs={}
 for(const group of Object.keys(COMPARE_CLUB_GROUPS))for(const club of resolveCompareClubGroup(group,available)){
  if(!club||clubs[club])continue
  const list=league.filter(f=>Number(f.round)>=startRound&&[f.home,f.away].includes(club)&&!/cancel|afgelast/i.test(f.status||'')).sort((a,b)=>(kickoffTime(a)??Infinity)-(kickoffTime(b)??Infinity)||Number(a.round)-Number(b.round)).slice(0,5)
  if(!list.length)continue
  const first=windows.find(w=>w.round===startRound),last=windows.find(w=>w.round===Math.max(...list.map(f=>Number(f.round))))
  const context=first&&last?clubWindowFixtures({league:[],other:other.filter(f=>!f.season||String(f.season).replace('-','/')===season),club,window:{...first,end:last.end}}).map(x=>x.fixture):[]
  const matches=list.map(f=>{const v=fixtureViewForClub(f,club,{results,teamRatings});return {id:f.id,round:Number(f.round),date:f.date||'',time:f.time||'',kickoffAt:f.kickoffAt||f.kickoff_datetime||'',home:f.home,away:f.away,opponent:v.opponent,venue:v.venue,difficulty:v.difficulty,label:v.label}})
  clubs[club]={club,matches,context:context.map(f=>({id:f.id||f.europeMatchId||'',competition:f.competition||'',date:f.date||'',time:f.time||'',home:f.home||'',away:f.away||'',homeAway:f.homeAway||'',opponent:f.opponent||'',club:f.club||'',kickoffAt:f.kickoffAt||f.kickoff_datetime||''})),schemaValue:clubSchemaSummary(list,club,{results,teamRatings}).value,home:matches.filter(f=>f.venue==='T').length,away:matches.filter(f=>f.venue==='U').length,favourable:matches.filter(f=>f.difficulty<=2).length,difficult:matches.filter(f=>f.difficulty>=4).length}
 }
 if(!Object.keys(clubs).length)throw Error('Geen wedstrijden beschikbaar voor deze speelronde.')
 return {season,startRound,horizon:5,sourceUpdatedAt,preparedAt:new Date().toISOString(),clubs}
}
export function fiveAheadClubs(snapshot,category){return resolveCompareClubGroup(category,Object.keys(snapshot.clubs)).filter(Boolean).map(c=>snapshot.clubs[c])}
export function fiveAheadClubKey(club){return normalizeClubName(club)}
