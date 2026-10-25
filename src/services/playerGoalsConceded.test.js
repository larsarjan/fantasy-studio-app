import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {playerGoalsConceded} from './playerGoalsConceded.js'
import {buildPlayerMatch} from './playerMatchStatsEngine.js'
import {resolveHistoricalMatch} from './historicalMatchDetails.js'
const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../../docs/apps-script/EspnSync.gs',import.meta.url),'utf8'),context)
const resolve=vm.runInContext('resolveEspnMatchFacts',context)
const facts=(minutes,gc)=>({minutes,goals_scored:0,assists:0,clean_sheets:0,goals_conceded:gc,saves:0,penalties_saved:0,penalties_missed:0,own_goals:0,yellow_cards:0,red_cards:0,bonus:0})
const fixture={id:'f',season:'2026/2027',home:'Home',away:'Away'}
const player={id:'p',season:'2026/2027',club:'Home',name:'Player',position:'Verdediger'}
test('captured official SR10 facts: Utrecht five players concede one, Vesterlund zero, Willem II six/three',()=>{
 const captured=JSON.parse(fs.readFileSync(new URL('./goalsConcededSource.fixture.json',import.meta.url),'utf8').replace(/^\uFEFF/,''))
 for(const [id,gc] of [[597,1],[172,1],[578,1],[475,1],[170,1],[171,0],[454,6],[59,3]]) {
  const live=captured.find(p=>p.id===id)
  assert.equal(resolve(live,live.explain[0].fixture,()=>[]).goals_conceded,gc)
 }
})
// These are provider on-field facts, not a second event/minutes calculator.
for(const [name,minutes,gc] of [
 ['Utrecht full match',90,1],['Vesterlund before goal',61,0],['Horemans after goal',82,1],
 ['Willem II full match',90,6],['Dekker first half including 45+X',45,3],
 ['active during 90+X',90,1],['off before stoppage-time goal',88,0],
 ['substitute: only conceded after entry',20,1],['0–0',90,0],['clean sheet preserved after exit',61,0],
]) test(name+': same authoritative count in scoring model and detail',()=>{
 const source=resolve({stats:facts(minutes,gc),explain:[{fixture:1,stats:[{identifier:'minutes',value:minutes}]}]},1,()=>{throw Error('unexpected request')})
 const stat={playerId:'p',fixtureId:'f',season:player.season,status:'Basis',minutes:source.minutes,goalsConceded:source.goals_conceded}
 const match=resolveHistoricalMatch(fixture,[fixture],[player],[stat]).home[0].match
 assert.equal(match.recordedGoalsConceded,gc);assert.equal(match.statistieken.tegendoelpunten,gc);assert.equal(match.goalsConceded,gc)
 const old=buildPlayerMatch({player,fixture,matchStat:{...stat,goalsConceded:gc===1?0:gc}})
 assert.equal(match.punten.totaal,old.punten.totaal)
})
test('missing is unknown, explicit zero remains zero',()=>{
 for(const value of [null,undefined,'',' ',NaN,-1,'bad'])assert.equal(playerGoalsConceded(value),null)
 assert.equal(playerGoalsConceded(0),0)
 const match=buildPlayerMatch({player,fixture,matchStat:{minutes:90}})
 assert.equal(match.goalsConceded,null);assert.equal(match.statistieken.tegendoelpunten,null)
})
test('DGW never spreads aggregate goals across fixtures',()=>{
 const live={stats:facts(180,7),explain:[{fixture:1},{fixture:2}]}
 const history=[{fixture:1,...facts(90,1)},{fixture:2,...facts(90,6)}]
 assert.equal(resolve(live,1,()=>history).goals_conceded,1)
 assert.equal(resolve(live,2,()=>history).goals_conceded,6)
 assert.throws(()=>resolve(live,3,()=>history))
 assert.throws(()=>resolve(live,1,()=>[...history,history[0]]))
})
test('incomplete facts stop import instead of silently defaulting zero',()=>{
 const stats=facts(90,1);delete stats.goals_conceded
 assert.throws(()=>resolve({stats,explain:[{fixture:1}]},1,()=>[]))
})
test('all visuals use complete facts, including non-point-bearing saves and clean sheets',()=>{
 const stats={...facts(90,1),saves:2,clean_sheets:1,goals_scored:1,assists:2,penalties_saved:1,penalties_missed:1,own_goals:1,yellow_cards:1,red_cards:1,bonus:2}
 const result=resolve({stats,explain:[{fixture:1,stats:[]}]},1,()=>[])
 assert.deepEqual(JSON.parse(JSON.stringify(result)),stats)
})
