import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const db = new PGlite()
let checks = 0
const a = '00000000-0000-4000-8000-000000000001'
const b = '00000000-0000-4000-8000-000000000002'
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;`)
for (const file of readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
await db.exec(`insert into auth.users values ('${a}'),('${b}')`)
async function asUser(id) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`); }
async function equal(sql, expected) { assert.deepEqual((await db.query(sql)).rows, expected); checks++ }
async function denied(sql) { await assert.rejects(db.query(sql)); checks++ }
for (const [user, other] of [[a,b],[b,a]]) {
  await asUser(user)
  await equal('select count(*)::int n from public.profiles', [{n:1}])
  await denied(`update public.profiles set role='admin' where id='${user}'`)
  await db.query('insert into user_preferences(user_id,settings) values ($1,$2)',[user,{displayName:user}])
  await equal(`select count(*)::int n from user_preferences where user_id='${other}'`,[{n:0}])
  await denied(`insert into user_preferences(user_id) values('${other}')`)
  await denied(`update user_preferences set user_id='${other}' where user_id='${user}'`)
  await db.query(`select save_fantasy_team('primary','Mijn team','{"mode":"existing"}','{}',0)`)
  checks++
  await equal(`select version from fantasy_teams where user_id='${user}'`,[{version:1}])
  await denied(`select save_fantasy_team('primary','Stale','{}','{}',0)`)
  await db.query(`select save_fantasy_team('primary','Mijn team','{"bank":5}','{}',1)`)
  await equal(`select version from fantasy_teams where user_id='${user}'`,[{version:2}])
  await equal(`select count(*)::int n from team_versions where user_id='${user}'`,[{n:2}])
  await equal(`select count(*)::int n from fantasy_teams where user_id='${other}'`,[{n:0}])
  await equal(`with changed as (update fantasy_teams set name='hacked' where user_id='${other}' returning id) select count(*)::int n from changed`,[{n:0}])
  await denied(`select publish_reference_data('{"players":[{"name":"Test"}],"fixtures":[{"round":1}]}')`)
  await db.query(`insert into transfer_editorial(user_id,kind,key,payload) values($1,'club','Ajax','{"note":"private"}')`,[user])
  await equal(`select count(*)::int n from transfer_editorial where user_id='${other}'`,[{n:0}])
  await denied(`update transfer_editorial set user_id='${other}' where user_id='${user}'`)
}
await db.exec(`reset role; insert into user_roles(user_id,role_key) values('${a}','admin')`)
await asUser(a)
await db.query(`select publish_reference_data('{"players":[{"name":"Test"}],"fixtures":[{"round":1}]}')`)
checks++
await asUser(b)
await equal(`select payload->>'name' name from players`,[{name:'Test'}])
await equal(`with changed as (update players set payload='{}' returning id) select count(*)::int n from changed`,[{n:0}])
await equal(`select payload->>'name' name from players`,[{name:'Test'}])
await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub','',false)`)
await denied('select * from fantasy_teams')
await denied('select * from players')
await denied(`select save_fantasy_team('primary','Attack','{}','{}',0)`)
await db.exec('reset role')
await equal(`select count(*)::int n from pg_tables where schemaname='public' and not rowsecurity`,[{n:0}])
await db.close()
console.log(`${checks} PostgreSQL schema/RLS/persistence checks passed (local PGlite; not live Supabase).`)
