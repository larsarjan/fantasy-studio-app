import test from 'node:test';
import assert from 'node:assert/strict';
import {rankingAnalytics,compactRanking} from './publicRankingModel.js';
const season='2026-2027';
const picks=()=>Array.from({length:15},(_,i)=>({element_id:i+1,squad_position:i+1,is_captain:i===1,is_vice_captain:i===2,element_type:i===0?1:i<5?2:i<10?3:4}));
const managers=[{id:'a',espn_entry_id:1},{id:'b',espn_entry_id:2},{id:'c',espn_entry_id:3}];
const snapshot=(id,event,groups,extra={})=>({id:`${id}-${event}`,prominent_id:id,season,event,groups,total_points:event*50,event_points:50,event_transfers_cost:0,event_transfers:0,points_on_bench:5,team_value:1000,picks:picks(),...extra});
test('memberships count within each group; union counts unique ESPN entries',()=>{
  const snapshots=[snapshot('a',1,['ESPN','FVT_SUBLEAGUE']),snapshot('b',1,['FVT_SUBLEAGUE']),snapshot('c',1,['CONTENT_CREATOR'])];
  assert.equal(rankingAnalytics(managers,snapshots,season,1).rows.length,3);
  assert.equal(rankingAnalytics(managers,snapshots,season,1,'FVT_SUBLEAGUE').rows.length,2);
  assert.equal(rankingAnalytics(managers,snapshots,season,1,'ESPN').rows.length,1);
  const duplicate=[...managers,{id:'other',espn_entry_id:1}];
  assert.equal(rankingAnalytics(duplicate,[...snapshots,snapshot('other',1,['CONTENT_CREATOR'])],season,1).rows.length,3);
});
test('ownership denominator excludes incomplete picks and separates actual XI, bench, captain and vice',()=>{
  const a=rankingAnalytics(managers,[snapshot('a',1,['ESPN']),snapshot('b',1,['ESPN'],{picks:[]})],season,1).analytics;
  assert.equal(a.validTeams,1);assert.equal(a.players[0].ownership,100);
  assert.equal(a.players.find(p=>p.element_id===15).bench,1);
  assert.equal(a.players.find(p=>p.element_id===15).starters,0);
  assert.equal(a.players.find(p=>p.element_id===2).captains,1);
  assert.equal(a.players.find(p=>p.element_id===3).vice,1);
});
test('historical membership, net round winner and selected-round transfer comparison',()=>{
  const old=snapshot('a',1,['ESPN']),next=snapshot('a',2,['FVT_SUBLEAGUE'],{event_points:80,event_transfers_cost:8,picks:picks().map((p,i)=>i===14?{...p,element_id:20}:p)});
  const snapshots=[old,next,snapshot('b',2,['FVT_SUBLEAGUE'],{event_points:75})];
  assert.equal(rankingAnalytics(managers,snapshots,season,1,'ESPN').rows.length,1);
  assert.equal(rankingAnalytics(managers,snapshots,season,2,'ESPN').rows.length,0);
  const a=rankingAnalytics(managers,snapshots,season,2).analytics;
  assert.equal(a.managerOfRound.id,'b');assert.equal(a.comparisonTeams,1);
  assert.equal(a.trends.find(p=>p.element_id===20).bought,1);
  assert.equal(a.trends.find(p=>p.element_id===15).sold,1);
  assert.equal(rankingAnalytics(managers,[old,{...next,active_chip:'rich'}],season,2).analytics.trends.length,0);
});
test('compact public response contains aggregates but no individual picks or raw snapshots',()=>{
  const result=compactRanking(rankingAnalytics(managers,[snapshot('a',1,['ESPN'])],season,1));
  assert.equal(result.analytics.players.length,15);assert(!JSON.stringify(result).includes('"picks"'));
  assert.equal(result.summary.total_points,50);
});
