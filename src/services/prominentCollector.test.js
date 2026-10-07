import test from 'node:test';
import assert from 'node:assert/strict';
import {syncProminents} from './prominentCollector.js';
class Query {
 constructor(db,table){this.db=db;this.table=table;this.conditions=[];this.sorts=[];this.operation='read';this.low=0;this.high=Infinity;}
 select(){this.selected=true;return this;} insert(payload){this.operation='insert';this.payload=payload;return this;} upsert(payload,options={}){this.operation='upsert';this.payload=payload;this.options=options;return this;} update(payload){this.operation='update';this.payload=payload;return this;}
 eq(k,v){this.conditions.push(r=>r[k]===v);return this;} in(k,v){this.conditions.push(r=>v.includes(r[k]));return this;} lte(k,v){this.conditions.push(r=>r[k]<=v);return this;} not(k,_op,v){this.conditions.push(r=>r[k]!==v&&r[k]!==undefined);return this;} match(fields){for(const [k,v]of Object.entries(fields))this.eq(k,v);return this;}
 order(k,{ascending=true}={}){this.sorts.push([k,ascending]);return this;}limit(n){this.high=n-1;return this;}range(a,b){this.low=a;this.high=b;return this;}single(){this.singleResult=true;return this;}maybeSingle(){this.singleResult=true;return this;}
 then(resolve,reject){return this.execute().then(resolve,reject);}
 async execute(){
  const table=this.db.tables[this.table] ||= [];
  let data;
  if(this.operation==='read')data=table.filter(r=>this.conditions.every(fn=>fn(r)));
  else if(this.operation==='update'){data=table.filter(r=>this.conditions.every(fn=>fn(r)));data.forEach(r=>Object.assign(r,this.payload));}
  else{
   data=[];for(const value of Array.isArray(this.payload)?this.payload:[this.payload]){
    const keys=(this.options?.onConflict || 'id').split(',');const old=this.operation==='upsert'?table.find(r=>keys.every(k=>r[k]===value[k])):null;
    if(old){if(!this.options.ignoreDuplicates)Object.assign(old,value);data.push(old);continue;}
    const row={id:`row-${++this.db.counter}`,active:true,started_at:new Date().toISOString(),status:this.table==='prominent_sync_runs'?'running':'pending',attempts:0,next_retry_at:new Date(0).toISOString(),source_warnings:[],...value};table.push(row);data.push(row);
   }
  }
  data=data.map(r=>({...r}));
  if(this.table==='prominents')data=data.map(r=>({...r,prominent_groups:(this.db.tables.prominent_groups||[]).filter(g=>g.prominent_id===r.id)}));
  if(this.table==='prominent_groups')data=data.map(r=>({...r,prominents:this.db.tables.prominents.find(m=>m.id===r.prominent_id)}));
  data.sort((a,b)=>{for(const [k,asc]of this.sorts){if(a[k]!==b[k])return(a[k]>b[k]?1:-1)*(asc?1:-1);}return 0;});data=data.slice(this.low,this.high+1);
  return {data:this.singleResult?(data[0]||null):data,error:null};
 }
}
function memoryDatabase(){return {tables:{},counter:0,locked:false,from(table){return new Query(this,table);},async rpc(name,args){if(name==='prominent_acquire_lock'){if(this.locked)return {data:false,error:null};this.locked=true;return {data:true,error:null};}if(name==='prominent_release_lock'){this.locked=false;return {data:null,error:null};}if(name==='prominent_save_snapshot'){const rows=this.tables.prominent_round_snapshots||=[];let old=rows.find(s=>s.prominent_id===args.manager_id&&s.season===args.snapshot.season&&s.event===args.snapshot.event);if(!old){old={id:`snapshot-${rows.length+1}`,prominent_id:args.manager_id,...structuredClone(args.snapshot)};rows.push(old);}return {data:old.id,error:null};}throw Error(name);}};}
const boot={events:[1,2].map(id=>({id,finished:true,data_checked:true,deadline_time:`2026-08-${id===1?'07':'14'}T17:55:00Z`})),elements:Array.from({length:15},(_,i)=>({id:i+1,first_name:'P',second_name:String(i),web_name:`P${i}`,element_type:i===0?1:i<5?2:i<10?3:4,team:1,now_cost:50})),teams:[{id:1,name:'Ajax'}],element_types:[],chips:[],game_settings:{squad_squadsize:15}};
function api(){let fail=null;const calls=[];return {calls,setFailure(v){fail=v;},async get(path){calls.push(path);if(path==='bootstrap-static/')return structuredClone(boot);if(path.includes('standings')){const id=Number(path.match(/classic\/(\d+)/)[1]);return {league:{id},standings:{page:1,has_next:false,results:id===7302?[]:[{entry:260,player_name:'Lars',entry_name:'FVT'}]}};}const id=Number(path.match(/entry\/(\d+)/)[1]);if(!path.includes('/event/'))return {id,name:`Team ${id}`,player_manager_display_name:`Manager ${id}`,started_event:1};const event=Number(path.match(/event\/(\d+)/)[1]);if(fail===`${id}:${event}`)throw Error('Upstream unavailable');return {active_chip:event===2?'frush':null,entry_history:{event,points:50+event,total_points:51*event,rank:100,overall_rank:100,bank:5,value:1000,event_transfers:event-1,event_transfers_cost:0,points_on_bench:3},picks:boot.elements.map((e,i)=>({element:e.id,position:i+1,multiplier:i<11?1:0,is_captain:i===3,is_vice_captain:i===4,element_type:e.element_type}))};}};}
test('collector backfills ordered rounds, keeps successful history on failure, retries, and resumes idempotently',async()=>{
 const db=memoryDatabase(),upstream=api();upstream.setFailure('260:2');
 // No 7302 seeds found in control => warning is transparent but seeds still imported.
 let r=await syncProminents(db,{get:upstream.get.bind(upstream),limit:100,budgetMs:100000});
 assert.equal(db.tables.prominents.length,19);assert.equal(db.tables.prominent_groups.filter(g=>g.prominent_id===db.tables.prominents.find(m=>m.espn_entry_id===260).id).length,2);
 assert.equal(r.errors,1);assert.equal(r.pending,1);assert.equal(db.tables.prominent_round_snapshots.length,37);
 const previous=structuredClone(db.tables.prominent_round_snapshots);
 assert.equal(db.tables.prominent_sync_jobs.find(j=>j.status==='error').attempts,1);assert(r.warnings[0].includes('7302'));
 upstream.setFailure(null);db.tables.prominent_sync_jobs.find(j=>j.status==='error').next_retry_at=new Date(0).toISOString();
 r=await syncProminents(db,{get:upstream.get.bind(upstream),limit:100});assert.equal(r.processed,1);assert.equal(db.tables.prominent_round_snapshots.length,38);
 for(const s of previous)assert.deepEqual(db.tables.prominent_round_snapshots.find(x=>x.id===s.id),s);
 r=await syncProminents(db,{get:upstream.get.bind(upstream),limit:100});assert.equal(r.processed,0);assert.equal(db.tables.prominent_round_snapshots.length,38);assert.equal(db.locked,false);
 const picks=upstream.calls.filter(p=>p.includes('/picks/'));assert(picks.findIndex(p=>p.includes('/event/2/'))>picks.findLastIndex(p=>p.includes('/event/1/')));
});
test('collector lock prevents concurrent work, and bootstrap outage releases lock without changing snapshots',async()=>{
 const db=memoryDatabase();db.locked=true;assert.deepEqual(await syncProminents(db,{get:async()=>{throw Error('Must not fetch');}}),{status:'busy'});
 db.locked=false;db.tables.prominent_round_snapshots=[{id:'valid'}];await assert.rejects(syncProminents(db,{get:async()=>{throw Error('ESPN offline');}}));assert.equal(db.locked,false);assert.deepEqual(db.tables.prominent_round_snapshots,[{id:'valid'}]);assert.equal(db.tables.prominent_sync_runs[0].status,'error');
});
