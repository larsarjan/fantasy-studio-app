import test from 'node:test';
import assert from 'node:assert/strict';
import { ESPN_SEEDS, mergeManagers, normalizeSnapshot, completedEvents, seasonOf, deriveTransfers, rankManagers, roundAnalytics, chipLabel } from './prominentModel.js';
import { fetchLeague, createEspnClient } from './prominentCollector.js';
const bootstrap={events:[{id:1,deadline_time:'2026-08-07T17:55:00Z',finished:true,data_checked:true},{id:2,deadline_time:'2026-08-14T17:55:00Z',finished:true,data_checked:false}],elements:Array.from({length:17},(_,i)=>({id:i+1,first_name:'Speler',second_name:String(i+1),web_name:`S${i+1}`,element_type:i===0||i===11?1:i<5?2:i<10?3:4,team:1,now_cost:50})),teams:[{id:1,name:'Ajax'}],game_settings:{squad_squadsize:15}};
const response=()=>({active_chip:'2capt',entry_history:{event:1,points:60,total_points:60,rank:1,overall_rank:2,percentile_rank:1,overall_rank_percentage:'1',bank:5,value:1000,event_transfers:0,event_transfers_cost:0,points_on_bench:7},picks:Array.from({length:15},(_,i)=>({element:i+1,position:i+1,multiplier:i===3?3:i===4?2:i<11?1:0,is_captain:i===3,is_vice_captain:i===4,element_type:bootstrap.elements[i].element_type})),automatic_subs:[]});
const manager={fantasy_team_name:'<Team & café>',groups:[{group_type:'ESPN'},{group_type:'CONTENT_CREATOR'}]};
export const fixtureSnapshot=()=>normalizeSnapshot(response(),bootstrap,1,manager);
test('curated ESPN identities, deduplication and overlapping/manual groups',()=>{
 assert.equal(ESPN_SEEDS.length,18);assert.equal(new Set(ESPN_SEEDS.map(s=>s.espn_entry_id)).size,18);
 const sources=[{id:369,group:'FVT_SUBLEAGUE',rows:[{entry:260,player_name:'Lars',entry_name:'FVT'},{entry:20124,player_name:'cjw kwakman'}]},{id:1182,group:'CONTENT_CREATOR',rows:[{entry:260,entry_name:'FVT'}]}];
 const m=mergeManagers(sources);assert.equal(m.length,19);assert.equal(m.find(x=>x.espn_entry_id===260).groups.length,2);assert.equal(m.find(x=>x.espn_entry_id===260).groups.find(g=>g.group_type==='CONTENT_CREATOR').manual_override,true);assert.equal(m.find(x=>x.espn_entry_id===20124).public_name,'Kees Kwakman');assert.equal(m.find(x=>x.espn_entry_id===20124).groups.length,2);
});
test('league pagination validates pages, has_next, identities and all source leagues',async()=>{
 for(const id of [369,1182,7302]){const paths=[];const rows=await fetchLeague(async path=>{paths.push(path);const page=paths.length;return {league:{id},standings:{page,has_next:page===1,results:[{entry:page}]}};},id);assert.equal(rows.length,2);assert.match(paths[1],/page_standings=2&phase=1/);}
 await assert.rejects(fetchLeague(async()=>({league:{id:369},standings:{page:1,has_next:true,results:[]}}),369));
 await assert.rejects(fetchLeague(async path=>({league:{id:369},standings:{page:Number(path.match(/page_standings=(\d+)/)[1]),has_next:true,results:[{entry:1}]}}),369));
});
test('server ESPN client retries transient failures, rejects null, never retries missing entry',async()=>{
 let calls=0;const waits=[];const get=createEspnClient({delay:0,wait:async ms=>waits.push(ms),fetcher:async()=>{calls++;return calls<3?new Response('',{status:503}):Response.json({ok:true});}});
 assert.deepEqual(await get('entry/260/'),{ok:true});assert.equal(calls,3);assert(waits.includes(2000));
 let notFound=0;await assert.rejects(createEspnClient({delay:0,wait:async()=>{},fetcher:async()=>{notFound++;return new Response('',{status:404});}})('entry/260/'));assert.equal(notFound,1);
 await assert.rejects(createEspnClient({delay:0,wait:async()=>{},fetcher:async()=>Response.json(null)})('entry/260/'));
 await assert.rejects(get('https://evil.test/'));await assert.rejects(get('entry/../'));
});
test('normalization preserves all authoritative values, picks, captain, vice, bench, chip and metadata',()=>{
 const s=fixtureSnapshot();assert.equal(s.season,'2026-2027');assert.equal(s.event_points,60);assert.equal(s.team_value,1000);assert.equal(s.bank,5);assert.equal(s.active_chip,'2capt');assert.equal(s.picks.length,15);assert.equal(s.picks.filter(p=>p.squad_position<=11).length,11);assert.equal(s.picks.filter(p=>p.squad_position>11).length,4);assert.equal(s.picks.find(p=>p.is_captain).element_id,4);assert.equal(s.picks.find(p=>p.is_vice_captain).multiplier,2);assert.deepEqual(s.groups,['ESPN','CONTENT_CREATOR']);assert.equal(s.picks[0].club_name,'Ajax');assert.deepEqual(completedEvents(bootstrap).map(e=>e.id),[1]);assert.equal(seasonOf(bootstrap),'2026-2027');assert.equal(chipLabel('rich'),'Suikeroom');assert.equal(chipLabel('2capt',{'2capt':'2capt'}),'Dynamisch Duo');assert.equal(chipLabel('wildcard'),'Wildcard');assert.equal(chipLabel('frush'),'Aanvalluh!');
 for(const mutate of [r=>r.picks.pop(),r=>r.picks[0].element=2,r=>r.picks[0].position=2,r=>r.entry_history.event=2,r=>r.entry_history.points=null,r=>r.picks[0].is_captain=true,r=>r.picks[3].is_vice_captain=true,r=>r.picks[0].element=99]){const r=response();mutate(r);assert.throws(()=>normalizeSnapshot(r,bootstrap,1,manager));}
});
test('transfer sets are unpaired; missing previous and temporary chips stay explicit',()=>{
 const previous=fixtureSnapshot(),current={...previous,event:2,picks:previous.picks.map(p=>[2,3].includes(p.element_id)?{...p,element_id:p.element_id+14}:p)};
 const t=deriveTransfers(current,previous);assert.deepEqual(t.outgoing.map(p=>p.element_id),[2,3]);assert.deepEqual(t.incoming.map(p=>p.element_id),[16,17]);assert.equal(t.available,true);assert(!('pairs' in t));assert.equal(deriveTransfers(current,null).available,false);assert.equal(deriveTransfers({...current,active_chip:'rich'},previous).temporary,true);
});
test('historical group ranks, movement, ties and analytics use stored round memberships',()=>{
 const managers=[{id:'a',espn_entry_id:1},{id:'b',espn_entry_id:2},{id:'c',espn_entry_id:3}];
 const s=fixtureSnapshot();const snaps=[{...s,prominent_id:'a',total_points:50},{...s,prominent_id:'b',total_points:60},{...s,prominent_id:'c',total_points:50},...['a','b','c'].map((id,i)=>({...s,event:2,prominent_id:id,total_points:i===2?90:100,event_points:i===0?70:60,groups:['ESPN'],event_transfers:i}))];
 const rows=rankManagers(managers,snaps,s.season,2,'ESPN');assert.deepEqual(rows.map(r=>r.position),[1,1,3]);assert.equal(rows[0].movement,1);assert.equal(rankManagers(managers,snaps,s.season,2,'CONTENT_CREATOR').length,0);assert.equal(rankManagers(managers,snaps,s.season,1,'CONTENT_CREATOR').length,3);
 const a=roundAnalytics(rows,snaps,s.season,2);assert.equal(a.managerOfRound.id,'a');assert.equal(a.transferKing.id,'c');assert.equal(a.players[0].ownership,100);assert.equal(a.captains[0].captains,3);
});
