import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
for(const file of readdirSync('supabase/migrations').filter(f=>f.includes('_price_')).sort())await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'))
let checks=0
const payload={season:'2026-2027',snapshots:[{player_id:1,captured_at:'2026-09-09T02:30:00Z',gameweek:5,price:50,ownership:10,transfers_in:100,transfers_out:20,transfers_in_event:10,transfers_out_event:2}],events:[],predictions:[{player_id:1,predicted_at:'2026-09-09T02:30:00Z',model_version:'test',origin:'backtest'}],evaluations:[],state:{last_at:'2026-09-09T02:30:00Z'},current:{players:[]}}
await db.exec('set role service_role');const saved=await db.query('select price_commit($1,null) result',[payload]);assert.equal(saved.rows[0].result.snapshots,1);checks++
const {state,current,...repeat}=payload;repeat.snapshots[0].price=99;const duplicate=await db.query('select price_commit($1,null) result',[repeat]);assert.equal(duplicate.rows[0].result.snapshots,0);assert.equal((await db.query('select price from price_snapshots')).rows[0].price,50);checks+=2
await assert.rejects(db.query('select price_commit($1,null)',[payload]));checks++
assert.equal((await db.query('select count(*)::int n from price_predictions')).rows[0].n,1);checks++
const versionTwo=structuredClone(repeat);versionTwo.predictions[0].model_version='test-v2';versionTwo.predictions[0].confidence_score=42;await db.query('select price_commit($1,null)',[versionTwo]);assert.equal((await db.query('select count(*)::int n from price_predictions')).rows[0].n,2);checks++;assert.equal((await db.query("select data->>'confidence_score' score from price_predictions where model_version='test-v2'")).rows[0].score,'42');checks++
for(const role of ['anon','authenticated']){await db.exec(`reset role;set role ${role}`);assert.equal((await db.query('select count(*)::int n from price_current')).rows[0].n,1);checks++;for(const sql of ['select * from price_snapshots','select * from price_predictions','select * from price_model_calibration',"delete from price_current",'select price_retention()',"select price_commit('{}',null)"]){await assert.rejects(db.query(sql));checks++}}
await db.close();console.log(`${checks} price storage, deduplication, concurrency and public/write isolation checks passed`)
