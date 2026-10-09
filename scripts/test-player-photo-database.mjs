import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite(),admin='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002'
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create table public.profiles(id uuid primary key,role text);grant select on public.profiles to authenticated;
insert into profiles values('${admin}','admin'),('${member}','member');`)
const file=readdirSync('supabase/migrations').find(f=>f.endsWith('_central_player_photos.sql'))
await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))
let checks=0
const as=async(role,id='')=>db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${id}',false)`)
const sql="insert into player_photos(player_key,override_url) values('studio:2026/2027:20260001','https://cdn.example.com/manual.webp')"
await as('anon');await assert.rejects(db.query(sql));checks++
await as('authenticated',member);await assert.rejects(db.query(sql));checks++
await as('authenticated',admin);await db.query(sql);checks++
await db.query("update player_photos set source_url='https://cdn.example.com/source.webp',source_status='approved',source_enabled=true where player_key='studio:2026/2027:20260001'")
assert.equal((await db.query('select override_url from player_photos')).rows[0].override_url,'https://cdn.example.com/manual.webp');checks++
await assert.rejects(db.query("update player_photos set override_url='javascript:alert(1)'"));checks++
await assert.rejects(db.query("insert into player_photos(player_key) values('Baas')"));checks++
await as('authenticated',member)
assert.equal((await db.query("update player_photos set override_url='https://evil.example/a' returning *")).rows.length,0);checks++
assert.equal((await db.query('delete from player_photos returning *')).rows.length,0);checks++
await as('anon');assert.equal((await db.query('select * from player_photos')).rows.length,1);checks++
await assert.rejects(db.query('delete from player_photos'));checks++
await as('authenticated',admin);assert.equal((await db.query('delete from player_photos returning *')).rows.length,1);checks++
await db.close();console.log(`${checks} photo registry/RLS checks passed (isolated PGlite; no production test content).`)
