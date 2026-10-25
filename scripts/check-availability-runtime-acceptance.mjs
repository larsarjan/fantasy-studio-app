import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {availabilitySaleDecision} from '../src/services/availability.js'
// Read-only acceptance probe. No database, network, or production writes.
import {setAvailabilityRecords} from '../src/services/availability.js'
import {personalAdvice} from '../src/services/personalSelection.js'
import {classifyPrimaryAction} from '../src/services/analysisEngine.js'
const owned={id:'accept-owned',season:'2026/2027',name:'Owned',club:'Ajax',position:'Middenvelder',endPrice:5,currentPrice:5,expectedPoints:10,expectedMinutes:90,cautionScore:20,radarScore:90,fixtureCount:1,fixtureScore:7,formScore:7,captainScore:80,reliabilityScore:90,selectedPct:10}
const incoming={...owned,id:'accept-other',name:'Other',club:'PSV'}
const state={importResult:{players:[{player:owned,sellingPrice:5}]},plannedTransfers:[],freeTransfers:1,bankKnown:true,bank:0}
const results=[]
try {
 for(const [label,status] of [['baseline',null],['doubt50',{status_type:'doubt',availability_percentage:50}],['shortOUT',{status_type:'injury',availability_percentage:0,expected_return_date:new Date(Date.now()+3*86400000).toISOString().slice(0,10)}]]){
  setAvailabilityRecords(status?[{...status,player_id:owned.id,season:owned.season}]:[])
  const result=personalAdvice({state,players:[owned,incoming],candidates:[owned,incoming]})
  results.push({label,action:classifyPrimaryAction(owned),transfers:result.transfers.length,gain:result.transfers[0]?.gain??null})
 }
 console.log(JSON.stringify(results,null,2))
 const violations=results.filter(r=>r.label!=='baseline'&&r.action==='hold'&&r.transfers>0)
 console.log(violations.length?'NO-GO: status alone creates a personal sale recommendation for otherwise equal players.':'PASS: no status-only sale for these hold cases.')
 if(process.argv[2]) {
  const snapshot=JSON.parse(readFileSync(process.argv[2],'utf8'))
  assert.equal(snapshot.length,84,'Expected original 84-row Supabase acceptance snapshot')
  setAvailabilityRecords(snapshot)
  let checked=0
  for(const row of snapshot){
   const player={...owned,id:row.player_id,season:row.season,club:row.club,availability:90,qualityPercentile:70}
   const other={...incoming,season:row.season}
   const testState={...state,importResult:{players:[{player,sellingPrice:5}]}}
   const decision=availabilitySaleDecision(player)
   const advice=personalAdvice({state:testState,players:[player,other],candidates:[player,other]})
   assert.equal(classifyPrimaryAction(player)==='sell',decision.standaloneSell)
   assert.equal(advice.transfers.length>0,decision.standaloneSell)
   checked++
  }
  console.log('Supabase snapshot: '+checked+' original statuses agree across both sale paths for equal alternatives.')
 }
 process.exitCode=violations.length?1:0
} finally {setAvailabilityRecords([])}
