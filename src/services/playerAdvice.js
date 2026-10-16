import {buildAnalysis} from './analysisEngine.js'
import {buildDifferentialAnalysis} from './differentialEngine.js'
import {fixtureViewForClub,clubSchemaSummary} from './clubSchedule.js'
import {kickoffTime} from './fixtureWindows.js'
import {normalizeClubName} from './historyAnalytics.js'
export function prepareAdvice(options){
 const {subtype='purchase',season,startRound,horizon=5,fixtures=[],results=[],teamRatings=[]}=options
 const analysis=buildAnalysis({...options,players:options.players||[],results,teamRatings}),all=analysis.players
 const eligible=all.filter(p=>p.fixtureCount>0&&p.expectedMinutes>=45)
 const ranked=subtype==='differential'?buildDifferentialAnalysis({...options,players:options.players||[],threshold:10,results,teamRatings}).ranking:subtype==='budget'?eligible.filter(p=>p.price>0&&p.price<=(analysis.budget.positions.find(x=>x.position===p.position)?.averagePrice??0)).sort((a,b)=>b.value-a.value||String(a.id).localeCompare(String(b.id))):[...eligible].sort((a,b)=>b.buyScore-a.buyScore||String(a.id).localeCompare(String(b.id)))
 const rankMap=new Map(ranked.map((p,i)=>[String(p.id),{rank:i+1,score:subtype==='differential'?p.edgeScore:subtype==='budget'?p.value:p.buyScore}]))
 const catalog=all.map(p=>{
  const list=fixtures.filter(f=>f.season===season&&Number(f.round)>=startRound&&Number(f.round)<startRound+horizon&&[f.home,f.away].some(c=>normalizeClubName(c)===normalizeClubName(p.club))).sort((a,b)=>(kickoffTime(a)??Infinity)-(kickoffTime(b)??Infinity)).slice(0,15)
  const rank=rankMap.get(String(p.id));return {season,startRound,horizon,id:String(p.id),name:String(p.name||p.id),club:p.club,position:p.position,price:p.price||null,expectedPoints:p.expectedPoints,formScore:p.formScore,ownership:p.ownership,score:rank?.score??null,rank:rank?.rank??null,scoreLabel:subtype==='budget'?'xP per miljoen':subtype==='differential'?'Differentialscore':'Aankoopscore',schemaValue:list.length?clubSchemaSummary(list,p.club,{results,teamRatings}).value:null,matches:list.map(f=>{const v=fixtureViewForClub(f,p.club,{results,teamRatings});return {round:Number(f.round),opponent:v.opponent,venue:v.venue,date:f.date||'',time:f.time||'',difficulty:v.difficulty}})}
 })
 const byId=new Map(catalog.map(p=>[p.id,p]));return {catalog,snapshot:{subtype,season,startRound,horizon,preparedAt:new Date().toISOString(),sourceUpdatedAt:options.sourceUpdatedAt||null,candidates:ranked.slice(0,10).map(p=>byId.get(String(p.id)))}}
}
