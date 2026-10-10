import test from 'node:test'
import assert from 'node:assert/strict'
import {setAvailabilityRecords,availabilityPolicy,playerAvailability,availabilityAdjustedPoints,availabilityRound,collectAvailabilitySource,setAvailabilityUnavailable} from './availability.js'
import {selectCaptainRecommendations,buildCaptainRadar} from './captainRadarEngine.js'
import {personalAdvice} from './personalSelection.js'
import {classifyPrimaryAction} from './analysisEngine.js'
const player=(id,extra={})=>({id,season:'2026/2027',name:'Zelfde naam',club:'Ajax',position:'Middenvelder',currentPrice:5,endPrice:5,radarScore:90,expectedPoints:10,expectedMinutes:90,fixtureCount:1,fixtureScore:7,formScore:7,captainScore:80,reliabilityScore:90,selectedPct:10,...extra})
test('stable IDs separate names, seasons and unmapped ESPN players',()=>{
 setAvailabilityRecords([{player_id:'a',season:'2026/2027',status_type:'injury',availability_percentage:0}])
 assert(availabilityPolicy(player('a')).out);assert.equal(playerAvailability(player('b')),null)
 assert.equal(playerAvailability(player('a',{season:'2025/2026'})),null)
 assert.equal(playerAvailability(player('a'),{namespace:'espn'}),null)
 assert(availabilityPolicy(player('a',{club:'PSV'})).out)
 setAvailabilityRecords([])
})
test('OUT, suspensions and 25% never become captain; 50/75 lower scores',()=>{
 const players=[0,25,50,75,100].map(p=>player(String(p),{expectedPointsProjection:{rounds:[{round:1,expectedPoints:10,expectedMinutes:90,fixtureCount:1,appearanceProbability:1,type:'single'}]}}))
 setAvailabilityRecords(players.map(p=>({player_id:p.id,season:p.season,status_type:'injury',availability_percentage:Number(p.id)})))
 const radar=buildCaptainRadar({season:'2026/2027',round:1,players,fixtures:[{season:'2026/2027',round:1,home:'Ajax',away:'PSV'}],results:[],teamRatings:[]})
 const score=id=>radar.candidates.find(p=>p.id===id).radarScore
 assert(score('50')<score('75'));assert(score('75')<score('100'))
 assert.equal(selectCaptainRecommendations(players.slice(0,2)).bestCaptain,null)
 assert.equal(radar.recommendations.bestCaptain.id,'100')
 setAvailabilityRecords([{player_id:'100',season:'2026/2027',status_type:'suspension',availability_percentage:100}])
 assert.equal(selectCaptainRecommendations([players[4]]).bestCaptain,null)
 setAvailabilityUnavailable();assert.equal(selectCaptainRecommendations([player('safe')]).bestCaptain,null)
 setAvailabilityRecords([])
})
test('transfer buying excludes OUT and suspension, respects ownership and protects short recovery holds',()=>{
 const owned=player('owned'),out=player('out'),susp=player('susp'),healthy=player('healthy',{expectedPoints:14,club:'PSV'})
 const soon=new Date(Date.now()+3*86400000).toISOString().slice(0,10)
 setAvailabilityRecords([{player_id:'out',season:owned.season,status_type:'injury',availability_percentage:0},{player_id:'susp',season:owned.season,status_type:'suspension',availability_percentage:100},{player_id:'owned',season:owned.season,status_type:'injury',availability_percentage:0,expected_return_date:soon}])
 const state={importResult:{players:[{player:owned,sellingPrice:5}]},plannedTransfers:[],freeTransfers:1,bankKnown:true,bank:2}
 const result=personalAdvice({state,players:[owned,out,susp,healthy],candidates:[owned,out,susp,healthy]})
 assert(result.transfers.every(t=>t.out.id==='owned'&&t.incoming.id==='healthy'));assert(result.transfers.length)
 assert.equal(availabilityAdjustedPoints(owned),8);assert.equal(classifyPrimaryAction(owned),'hold')
 setAvailabilityRecords([])
})
test('return badges expire, missing return stays unknown, rounds derive only from real fixtures',()=>{
 const p=player('a');setAvailabilityRecords([{player_id:p.id,season:p.season,status_type:'available',availability_percentage:100,returned_date:'2026-10-01'}])
 assert(availabilityPolicy(p,new Date('2026-10-03')).recent);assert(!availabilityPolicy(p,new Date('2026-10-10')).recent)
 assert.equal(availabilityRound({},[],p),'')
 assert.equal(availabilityRound({expected_return_date:'2026-10-10'},[{season:p.season,round:10,date:'2026-10-11',home:'Ajax',away:'PSV'}],p),' · vanaf SR10')
 setAvailabilityRecords([])
})
test('connector interface submits proposals, never name-based guesses',async()=>{
 const calls=[];await collectAvailabilitySource({key:'club',fetch:async()=>[1],normalize:async()=>({external_id:'1',player_id:'a',season:'2026/2027'})},{proposeUpdate:async(...args)=>calls.push(args)})
 assert.equal(calls.length,1)
 await assert.rejects(()=>collectAvailabilitySource({fetch:async()=>[1],normalize:async()=>({name:'Guess'})},{proposeUpdate:async()=>{throw Error('must not run')}}),/Expliciete/)
})
