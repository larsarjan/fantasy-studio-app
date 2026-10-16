import test from 'node:test';import assert from 'node:assert/strict';
import {verifiedOfficialDetails,createOfficialDetailsLoader} from './rankingOfficialDetails.js';
const bootstrap={events:[{id:2,deadline_time:'2026-08-21T16:00:00Z'}],elements:Array.from({length:15},(_,i)=>({id:i+1,element_type:i===0?1:i<5?2:i<10?3:4,first_name:'Player',second_name:String(i),web_name:String(i),team:1,now_cost:50})),teams:[{id:1,name:'Club'}]};
const response=()=>({entry_history:{event:2,points:50,total_points:100,bank:21,value:1028,event_transfers:2,event_transfers_cost:0,points_on_bench:11},picks:bootstrap.elements.map((p,i)=>({element:p.id,position:i+1,multiplier:i<11?1:0,is_captain:i===1,is_vice_captain:i===2}))});
const snapshot=()=>({source:'ELITE_MANAGERS',prominent_id:'a',season:'2026-2027',event:2,groups:['TOP_100'],picks:response().picks.map(p=>({element_id:p.element,squad_position:p.position,is_captain:p.is_captain,is_vice_captain:p.is_vice_captain})),team_value:null,points_on_bench:null,event_transfers_cost:null});
const manager={id:'a',espn_entry_id:123};
test('official historical values retain genuine zero; no reconstructed fee or current-price sum',()=>{
 const r=verifiedOfficialDetails(snapshot(),response(),bootstrap,manager);assert.equal(r.event_transfers_cost,0);assert.equal(r.points_on_bench,11);assert.equal(r.team_value,1028);assert.equal(r.bank,21);
 assert.throws(()=>verifiedOfficialDetails({...snapshot(),season:'2025-2026'},response(),bootstrap,manager));
 const changed=snapshot();changed.picks[0].element_id=999;assert.throws(()=>verifiedOfficialDetails(changed,response(),bootstrap,manager));
 assert.throws(()=>verifiedOfficialDetails(snapshot(),{...response(),entry_history:{...response().entry_history,event:3}},bootstrap,manager));
});
test('cache coalesces verified reads; existing values untouched; outage keeps unknown null',async()=>{
 let requests=0;const loader=createOfficialDetailsLoader({get:async path=>{requests++;return path==='bootstrap-static/'?bootstrap:response();}});
 const first=snapshot();first.bank=99;const second=snapshot();const status=await loader([first,second],[manager]);assert.equal(status.verified,2);assert.equal(requests,2);assert.equal(first.bank,99);assert.equal(second.bank,21);
 const missing=snapshot();const unavailable=await createOfficialDetailsLoader({get:async()=>{throw Error('Unavailable');}})([missing],[manager]);assert.equal(unavailable.unavailable,1);assert.equal(missing.team_value,null);assert.equal(missing.points_on_bench,null);
});
