import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
import {createPriceState,processPriceBatch} from '../src/services/priceModel.js'
const db=new PGlite()
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
for(const f of readdirSync('supabase/migrations').filter(f=>f.includes('_price_')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
// Ten complete days, stable controls, exact feature changes, counter reset, and event.
await db.exec(`
insert into price_snapshots(season,player_id,captured_at,gameweek,price,ownership,transfers_in,transfers_out,transfers_in_event,transfers_out_event)
select '2026-2027',p,t,9,
case when p=1 and t>=date_trunc('day',now())-interval '5 days'+interval '2 hours 35 minutes' then 51 else 50 end,
10,case when t>=date_trunc('day',now())-interval '6 days' then 110 else 100 end,20,10,2
from generate_series(date_trunc('day',now())-interval '10 days',date_trunc('day',now()),interval '5 minutes')t cross join generate_series(1,2)p;
insert into price_predictions select season,player_id,captured_at,'test','live',
jsonb_build_object('player_id',player_id,'predicted_at',captured_at,'direction',case when transfers_in=110 then 'rise' else 'stable' end,
'price_pressure_percentage',case when transfers_in=110 then 101 else 99 end,'model_version','test','historical_marker',captured_at)
from price_snapshots;
insert into price_change_events
select season,player_id,captured_at,gameweek,'rise','test',jsonb_build_object(
'previous_seen_at',captured_at-interval '5 minutes','reset',jsonb_build_object('captured_at',date_trunc('day',now())-interval '10 days'),
'prediction',jsonb_build_object('predicted_at',captured_at-interval '5 minutes','model_version','test'))
from price_snapshots where player_id=1 and captured_at=date_trunc('day',now())-interval '5 days'+interval '2 hours 35 minutes';
`)
await db.exec(`insert into price_snapshots(season,player_id,captured_at,gameweek,price,ownership,transfers_in,transfers_out,transfers_in_event,transfers_out_event)
values('2026-2027',2,date_trunc('day',now())-interval '8 days'+interval '12 hours 1 minute 0.123456 seconds',9,50,10,100,20,10,2)`)
const before=(await db.query('select * from price_snapshots order by captured_at,player_id')).rows
const predBefore=(await db.query('select * from price_predictions order by predicted_at,player_id')).rows
await db.exec('select price_retention()')
assert.equal((await db.query('select count(*)::int n from price_snapshots')).rows[0].n,before.length)
await db.exec('update price_retention_control set enabled=true')
await db.exec(`create function fail_coverage() returns trigger language plpgsql as $$begin raise exception 'test archive failure';end$$;
create trigger fail_archive before insert on price_snapshot_coverage for each row execute function fail_coverage();`)
await assert.rejects(db.exec('select price_retention()'))
assert.equal((await db.query('select count(*)::int n from price_snapshots')).rows[0].n,before.length)
await db.exec('drop trigger fail_archive on price_snapshot_coverage;drop function fail_coverage();select price_retention()')
const after=(await db.query('select * from price_replay_snapshots order by captured_at,player_id')).rows
assert.deepEqual(after,before,'lossless source timestamps and features')
assert.equal((await db.query(`select count(*)::int n from price_replay_snapshots where player_id=2 and captured_at=date_trunc('day',now())-interval '8 days'+interval '12 hours 1 minute 0.123456 seconds'`)).rows[0].n,1,'microseconds survive JSON storage')
const predAfter=(await db.query(`select * from price_predictions union all
select a.season,a.player_id,(p->>'predicted_at')::timestamptz,a.model_version,a.origin,p->'data'
from price_prediction_archive a cross join lateral jsonb_array_elements(a.predictions)p
order by predicted_at,player_id`)).rows
assert.deepEqual(predAfter,predBefore,'all non-reproducible model information preserved')
const counts=(await db.query('select (select count(*)::int from price_snapshots) snapshots,(select count(*)::int from price_predictions) predictions')).rows[0]
assert(counts.snapshots<before.length)
assert(counts.predictions<predBefore.length)
for(const condition of [
"captured_at>=now()-interval '72 hours'",
"(captured_at at time zone 'UTC')::time between time '01:30' and time '03:00'",
"player_id=1 and captured_at between date_trunc('day',now())-interval '6 days'+interval '2 hours 35 minutes' and date_trunc('day',now())-interval '5 days'+interval '8 hours 35 minutes'"
]){
const full=(await db.query('select * from price_replay_snapshots where '+condition+' order by captured_at,player_id')).rows
const raw=(await db.query('select * from price_snapshots where '+condition+' order by captured_at,player_id')).rows
assert.deepEqual(raw,full,'protected raw observations')
}
const replay=rows=>{
const state=createPriceState('2026-2027'),groups=new Map()
for(const r of rows){const key=new Date(r.captured_at).toISOString();const list=groups.get(key)||[];list.push({...r,ownership:Number(r.ownership),name:'Player '+r.player_id,club:'Club'});groups.set(key,list)}
const outputs=[]
for(const [captured_at,players]of groups)outputs.push(processPriceBatch(state,{season:'2026-2027',captured_at,gameweek:9,total_players:60000,events:[],players,source:'archive'}))
return {state,outputs}
}
assert.deepEqual(replay(after),replay(before),'predictions, confidence, evaluations and model state exactly equal')
await db.exec('select price_retention()')
assert.deepEqual((await db.query('select * from price_replay_snapshots order by captured_at,player_id')).rows,before,'repeat retention loses nothing')
for(const role of ['anon','authenticated']){
await db.exec('set role '+role)
for(const table of ['price_snapshot_coverage','price_prediction_archive','price_retention_control','price_replay_snapshots'])await assert.rejects(db.query('select * from '+table))
await assert.rejects(db.exec('select price_retention()'))
await db.exec('reset role')
}
console.log(JSON.stringify({before:{snapshots:before.length,predictions:predBefore.length},after:counts,coverage:'exact',forecasts:'exact',modelReplay:'exact',rollback:'passed',publicIsolation:'passed'}))
await db.close()

