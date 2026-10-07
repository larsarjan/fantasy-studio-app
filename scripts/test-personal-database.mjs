import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite();let checks=0
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`)
await db.exec('alter default privileges in schema public grant all on tables to authenticated')
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&!f.includes('prominents_')).sort())await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'))
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002'
await db.exec(`insert into auth.users values('${a}'),('${b}')`)
for(const [user,other] of [[a,b],[b,a]]){
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`)
 await db.query(`update profiles set display_name='FVT test',favorite_club='Ajax' where id=$1`,[user]);checks++
 assert.equal((await db.query('select display_name,favorite_club from profiles')).rows.length,1);checks++
 assert.equal((await db.query('select favorite_club from profiles')).rows[0].favorite_club,'Ajax');checks++
 assert.equal((await db.query(`update profiles set display_name='Attack' where id=$1 returning id`,[other])).rows.length,0);checks++
 for(const sql of [`update profiles set role='admin'`,`update profiles set id='${other}'`,`update profiles set created_at=now()`,`update profiles set display_name=repeat('x',81)`]){await assert.rejects(db.query(sql));checks++}
 const state={importResult:{players:Array.from({length:15},(_,i)=>({player:{id:String(i)}})),lineupMetadata:{captainId:'3',viceCaptainId:'4',starters:Array.from({length:11},(_,i)=>String(i))}},bank:1}
 await db.query(`select save_fantasy_team('personal-check','Selectie',$1,'{}',0)`,[state]);checks++
 assert.deepEqual((await db.query(`select state from fantasy_teams where slug='personal-check'`)).rows[0].state,state);checks++
 await assert.rejects(db.query(`select save_fantasy_team('personal-check','Stale','{}','{}',0)`));checks++
 assert.equal((await db.query('select state from fantasy_teams where user_id=$1',[other])).rows.length,0);checks++
}
await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from profiles'));checks++
await db.close();console.log(`${checks} personal profile/selection PostgreSQL persistence, column grants, version conflicts and isolation checks passed`)
