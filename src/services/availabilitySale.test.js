import test from 'node:test'
import assert from 'node:assert/strict'
import {setAvailabilityRecords, availabilityPolicy, availabilitySaleDecision} from './availability.js'
import {classifyPrimaryAction} from './analysisEngine.js'
import {personalAdvice} from './personalSelection.js'

const owner={id:'owner',season:'2026/2027',club:'Ajax',position:'Middenvelder',endPrice:5,expectedPoints:10,expectedMinutes:90,fixtureCount:1,cautionScore:20,availability:90,qualityPercentile:70}
const alternative={...owner,id:'alternative',club:'PSV'}
const state={importResult:{players:[{player:owner,sellingPrice:5}]},freeTransfers:1,bankKnown:true,bank:0,plannedTransfers:[]}
const transfers=(incoming=alternative)=>personalAdvice({state,players:[owner,incoming],candidates:[owner,incoming]}).transfers
const date=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10)
for(const [label,type,pct,days,sell,factor] of [
 ['50% doubt','doubt',50,null,false,.4],['short OUT','injury',0,3,false,0],
 ['long OUT','injury',0,40,true,0],['75%','doubt',75,null,false,.85],
 ['100%','available',100,null,false,1],['25% short','injury',25,3,false,.1],
 ['25% unknown return','injury',25,null,false,.1],['suspension unknown','suspension',0,null,false,0],
]) test(`equal alternatives: shared sale decision for ${label}`,()=>{
 try {
  setAvailabilityRecords([{player_id:owner.id,season:owner.season,status_type:type,availability_percentage:pct,expected_return_date:days===null?null:date(days)}])
  assert.equal(availabilityPolicy(owner).factor,factor)
  assert.equal(classifyPrimaryAction(owner)==='sell',sell)
  assert.equal(transfers().length>0,sell)
  if(pct===25)assert.equal(availabilityPolicy(owner).buyEligible,false)
 } finally {setAvailabilityRecords([])}
})
test('independent improvement remains eligible, after transfer costs',()=>{
 try {
  setAvailabilityRecords([{player_id:owner.id,season:owner.season,status_type:'doubt',availability_percentage:50}])
  assert.equal(transfers({...alternative,expectedPoints:14}).length,1)
  const charged={...state,freeTransfers:0}
  assert.equal(personalAdvice({state:charged,players:[owner,alternative],candidates:[owner,{...alternative,expectedPoints:14}]}).transfers.length,0)
  assert.equal(availabilitySaleDecision({...owner,cautionScore:80}).sellAllowed,true)
 } finally {setAvailabilityRecords([])}
})
test('effective manual fit override defeats embedded long OUT in both paths',()=>{
 try {
  const embedded={...owner,availabilityStatus:{status_type:'injury',availability_percentage:0,expected_return_date:date(40)}}
  setAvailabilityRecords([{player_id:owner.id,season:owner.season,status_type:'available',availability_percentage:100,is_manual_override:true}])
  assert.equal(availabilityPolicy(embedded).factor,1)
  assert.notEqual(classifyPrimaryAction(embedded),'sell')
  assert.equal(personalAdvice({state,players:[embedded,alternative],candidates:[embedded,alternative]}).transfers.length,0)
 } finally {setAvailabilityRecords([])}
})
