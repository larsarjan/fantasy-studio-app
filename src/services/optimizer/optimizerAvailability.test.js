import test from 'node:test'
import assert from 'node:assert/strict'
import { optimizeSquadForPeriod } from './optimizerSquad.js'
import {optimizeLineupForRound} from './optimizerLineup.js'
import {setAvailabilityRecords, availabilityPolicy} from '../availability.js'
import {initializeWorkerAvailability} from '../../workers/managerOptimizer.worker.js'
const positions=[...Array(2).fill('goalkeeper'),...Array(5).fill('defender'),...Array(5).fill('midfielder'),...Array(3).fill('forward')]
const players=positions.map((position,index)=>({id:String(index),name:`Speler ${index}`,club:`Club ${index%5}`,fantasyPosition:position,currentPrice:5,chanceOfPlaying:null,expectedPointsProjection:{rounds:[{round:9,expectedPoints:5,expectedMinutes:81,appearanceProbability:0.9,fixtureCount:1,type:'single'}]}}))
const run=pool=>optimizeSquadForPeriod({players:pool,startRound:9,roundCount:1,budget:100,minimumAvailability:75})

test('worker restores structured-cloned central statuses and resets them between jobs',()=>{
 const pool=players.map(p=>({...p,season:'2026/2027'}))
 initializeWorkerAvailability(structuredClone({ready:true,records:[{player_id:'0',season:'2026/2027',status_type:'injury',availability_percentage:0}]}))
 assert.equal(run(pool).valid,false)
 initializeWorkerAvailability({ready:false,records:[]})
 assert.equal(run(pool).valid,false)
 initializeWorkerAvailability({ready:true,records:[]})
 assert.equal(run(pool).valid,true)
})

for (const [label,status_type,pct,factor] of [
 ['OUT','injury',0,0],['25%','doubt',25,.1],['50%','doubt',50,.4],
 ['75%','doubt',75,.85],['100%','available',100,1],['suspension','suspension',100,0],
 ['manual override','available',100,1],
]) test(`main thread and worker produce identical policy and lineup for ${label}`,()=>{
 const pool=players.map(p=>({...p,season:'2026/2027',availabilityStatus:{status_type:'injury',availability_percentage:0}}))
 // Effective RPC records already resolve manual precedence; stale embedded data must lose.
 const records=pool.map(p=>({player_id:p.id,season:p.season,status_type:'available',availability_percentage:100}))
 records[0]={...records[0],status_type,availability_percentage:pct,is_manual_override:label==='manual override'}
 setAvailabilityRecords(records)
 const policy=availabilityPolicy(pool[0]), preview=optimizeLineupForRound({squad:pool,round:9})
 assert.equal(policy.factor,factor)
 assert.equal(preview.valid,true)
 setAvailabilityRecords([])
 initializeWorkerAvailability(structuredClone({records,ready:true}))
 assert.deepEqual(availabilityPolicy(pool[0]),policy)
 assert.deepEqual(optimizeLineupForRound({squad:structuredClone(pool),round:9}),preview)
 const candidate=[...preview.result.starters,...preview.result.bench.ordered].find(p=>p.playerId==='0')
 assert.ok(candidate)
 assert.equal(candidate.expectedPoints,5*factor)
 setAvailabilityRecords([])
})
test('minimum availability uses the existing projection when manual sheet values are absent',()=>assert.equal(run(players).valid,true))
test('explicit zero availability is never replaced by the projection',()=>assert.equal(run(players.map((p,i)=>i===0?{...p,chanceOfPlaying:0}:p)).valid,false))
test('missing projections are not treated as certainty',()=>assert.equal(run(players.map((p,i)=>i===0?{...p,expectedPointsProjection:null}:p)).valid,false))
test('central status overrides projection certainty; OUT/25 cannot be optimizer captain or normal purchase',()=>{
 const pool=players.map(p=>({...p,season:'2026/2027'}))
 for(const pct of [0,25,50]){
  setAvailabilityRecords([{player_id:'0',season:'2026/2027',status_type:'injury',availability_percentage:pct}])
  assert.equal(run(pool).valid,false)
  const lineup=optimizeLineupForRound({squad:pool,round:9})
  assert.equal(lineup.valid,true)
  assert.ok(lineup.result?.captain?.playerId, 'a real eligible captain must be selected')
  if(pct<=25)assert.notEqual(lineup.result.captain.playerId,'0')
 }
 setAvailabilityRecords([]);assert.equal(run(pool).valid,true)
})
