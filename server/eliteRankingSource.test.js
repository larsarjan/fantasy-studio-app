import test from 'node:test';
import assert from 'node:assert/strict';
import {projectEliteSource,mergeEliteHistory} from './eliteRankingSource.js';
import {createSheetUrl} from '../src/services/googleSheets.js';
const manager=(entry,round,index)=>({Seizoen:'2026/2027',Gameweek:String(round),EntryId:String(entry),StandingIndex:String(index),TotalPoints:'100',EventPoints:'50',Rank:String(index),Teamnaam:'Team',Managernaam:'Manager',ActiveChip:'none'});
const picks=(entry,round)=>Array.from({length:15},(_,i)=>({Seizoen:'2026/2027',Gameweek:String(round),EntryId:String(entry),ESPNPlayerId:String(i+1),SquadPosition:String(i+1),Multiplier:i<11?'1':'0',IsCaptain:String(i===0),IsViceCaptain:String(i===1)}));
test('only the two explicit existing sheet gids use the known spreadsheet export',()=>{
 for(const [name,gid] of [['ELITE_MANAGERS','1065866082'],['ELITE_TEAM_SNAPSHOTS','1228402931']]){const u=new URL(createSheetUrl(name));assert.equal(u.searchParams.get('gid'),gid);assert(u.pathname.includes('1OqFPkXS200cj2l1C9Gz0q9IMMpRyn_ElBcBqDuHUXE4'));}
 assert.throws(()=>createSheetUrl('OTHER'));assert(createSheetUrl('ELITE_PLAYER_STATS').includes('/d/e/'));
});
test('historical top100 membership; excluded deeper cohorts; no invented missing metrics',()=>{
 const source={managers:[manager(1,2,100),manager(2,2,101),manager(1,3,101),manager(2,3,1)],picks:[...picks(1,2),...picks(2,2),...picks(1,3),...picks(2,3)]};
 const result=projectEliteSource(source,{},'2026-2027',3);
 assert.equal(result.snapshots.length,4);assert.equal(result.snapshots.filter(s=>s.groups.includes('TOP_100')).length,2);assert.equal(result.snapshots[0].picks.length,15);assert.equal(result.snapshots[0].team_value,null);assert.equal(result.snapshots[0].event_transfers_cost,null);
 const detail=projectEliteSource(source,{},'2026-2027',3,[],1);assert.equal(detail.snapshots.length,4);assert.deepEqual(detail.snapshots.find(s=>s.event===3&&s.prominent_id==='elite-1').groups,[]);
});
test('existing identity and immutable history values win on overlap; only membership union changes projection',()=>{
 const source={managers:[manager(1,2,1)],picks:picks(1,2)};
 const elite=projectEliteSource(source,{},'2026-2027',2,[{id:'central',espn_entry_id:1}]);assert.equal(elite.managers.length,0);
 const original={prominent_id:'central',event:2,groups:['ESPN'],event_points:123};
 const result=mergeEliteHistory([structuredClone(original)],elite.snapshots);
 assert.equal(result.length,1);assert.equal(result[0].event_points,123);assert.deepEqual(result[0].groups,['ESPN','TOP_100']);assert.deepEqual(original.groups,['ESPN']);
});
