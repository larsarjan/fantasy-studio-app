import assert from 'node:assert/strict'
import { test } from 'node:test'
import { updateSelection, validateSelection, selectionPlayers, personalAdvice, canAddPlayer } from './personalSelection.js'
import { resolveManagerCurrentTeam } from './optimizer/managerTeamResolver.js'
const positions=['Doelman','Doelman',...Array(5).fill('Verdediger'),...Array(5).fill('Middenvelder'),...Array(3).fill('Spits')]
const players=positions.map((position,i)=>({id:String(i+1),name:`Fixture ${i+1}`,season:'2026/2027',club:`Club ${Math.floor(i/3)}`,position,endPrice:5}))
const starters=['1','3','4','5','6','8','9','10','11','13','14']
const state=updateSelection({bank:1,bankKnown:true,purchasePrices:{},manualSellingPrices:{}},players,{starters,captainId:'8',viceCaptainId:'9'})
test('15-player selection preserves C/VC and prices through JSON and existing Manager resolver',()=>{
 const loaded=JSON.parse(JSON.stringify(state));assert.equal(validateSelection(loaded,players).valid,true);assert.equal(loaded.importResult.lineupMetadata.captainId,'8');assert.equal(selectionPlayers(loaded,players).length,15);assert.equal(resolveManagerCurrentTeam({importResult:loaded.importResult,players,bank:1}).valid,true)
})
test('invalid roster, duplicate player, bench captain and same C/VC fail explicitly',()=>{
 assert.equal(validateSelection(updateSelection(state,players.slice(0,14)),players).valid,false)
 assert(canAddPlayer(players,players[0]))
 for(const lineup of [{starters,captainId:'2',viceCaptainId:'9'},{starters,captainId:'8',viceCaptainId:'8'}])assert.equal(validateSelection(updateSelection(state,players,lineup),players).valid,false)
 assert.equal(validateSelection(state,players.slice(1)).valid,false)
})
test('personal captain/sale use only owned players; buys exclude owned and respect price, position, club and plans',()=>{
 const candidates=[...players,{id:'outside',name:'Outside',position:'Middenvelder',club:'Other',endPrice:5.5},{id:'expensive',name:'Expensive',position:'Middenvelder',club:'Other',endPrice:99}].map((p,i)=>({...p,expectedPoints:i+1,expectedMinutes:90,radarScore:i+1,fixtureCount:1}))
 const advice=personalAdvice({state,players,candidates});assert(advice.captains.every(p=>players.some(o=>o.id===p.id)));assert(advice.sales.every(p=>players.some(o=>o.id===p.id)));assert(advice.transfers.length>0);assert(advice.transfers.every(t=>t.incoming.id==='outside'&&t.out.position==='Middenvelder'&&t.cost<=1));assert.equal(personalAdvice({state:{...state,plannedTransfers:[{inId:'outside'}]},players,candidates}).transfers.length,0)
})
