import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();let checks=0;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
// Scheduler's hosted extensions are tested live; schema and immutability are real PostgreSQL here.
for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&!f.includes('prominents_scheduler')).sort())await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
const a='00000000-0000-4000-8000-000000000001',admin='00000000-0000-4000-8000-000000000002';
await db.exec(`insert into auth.users values('${a}'),('${admin}');update profiles set role='admin' where id='${admin}';insert into prominent_bootstrap(season,events,players,teams,element_types,chips,game_settings) values('2026-2027','[]','[]','[]','[]','[]','{}');`);
const manager=(await db.query(`insert into prominents(espn_entry_id,public_name) values(20124,'Kees Kwakman') returning id`)).rows[0];
const s={season:'2026-2027',event:1,active_chip:'frush',event_points:60,total_points:60,event_rank:500,overall_rank:100,percentile_rank:1,overall_rank_percentage:1,bank:5,team_value:1000,event_transfers:0,event_transfers_cost:0,points_on_bench:7,fantasy_team_name:'Team',groups:['ESPN'],raw_json:{original:true},picks:Array.from({length:15},(_,i)=>({element_id:i+1,squad_position:i+1,multiplier:i<11?1:0,is_captain:i===3,is_vice_captain:i===4,element_type:i===0||i===11?1:2,player_name:'Player',web_name:'P',club_name:'Ajax',club_id:1,price_at_fetch:50}))};
const save=async snapshot=>(await db.query('select prominent_save_snapshot($1,$2) id',[manager.id,snapshot])).rows[0].id;
await db.exec('set role service_role');const first=await save(s);checks++;
assert.equal(await save({...s,event_points:999}),first);assert.equal((await db.query('select event_points from prominent_round_snapshots')).rows[0].event_points,60);checks++;
await save({...s,event:2,event_points:70,total_points:130});checks++;
assert.equal((await db.query('select count(*)::int n from prominent_round_picks')).rows[0].n,30);checks++;
await assert.rejects(save({...s,event:3,picks:s.picks.slice(0,14)}));checks++;
await assert.rejects(save({...s,event:3,picks:s.picks.map((p,i)=>i===14?{...p,player_name:null}:p)}));checks++;
assert.equal((await db.query('select count(*)::int n from prominent_round_snapshots')).rows[0].n,2);checks++;
for(const table of ['prominent_round_snapshots','prominent_round_picks']){await assert.rejects(db.query(`delete from ${table}`));checks++;}
await assert.rejects(db.query('update prominent_round_snapshots set event_points=0'));checks++;
const lock='00000000-0000-4000-8000-000000000005';assert.equal((await db.query('select prominent_acquire_lock($1) acquired',[lock])).rows[0].acquired,true);assert.equal((await db.query('select prominent_acquire_lock($1) acquired',[a])).rows[0].acquired,false);await db.query('select prominent_release_lock($1)',[lock]);checks++;
await db.exec(`reset role;set role anon`);
assert.equal((await db.query('select count(*)::int n from prominent_round_snapshots')).rows[0].n,2);checks++;
for(const sql of ['select * from prominent_sync_jobs','select * from private.prominent_raw_snapshots','insert into prominents(espn_entry_id,public_name)values(2,\'Attack\')',`select prominent_save_snapshot('${manager.id}','{}')`,`select prominent_acquire_lock('${lock}')`]){await assert.rejects(db.query(sql));checks++;}
for(const [user,expected] of [[a,0],[admin,1]]){await db.exec(`reset role;insert into prominent_sync_runs(trigger_type)select 'test' where not exists(select 1 from prominent_sync_runs);set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`);assert.equal((await db.query('select count(*)::int n from prominent_sync_runs')).rows[0].n,expected);await assert.rejects(save(s));checks+=2;}
await db.close();console.log(`${checks} prominent PostgreSQL atomicity, immutable history, retry safety, lock and RLS checks passed.`);
