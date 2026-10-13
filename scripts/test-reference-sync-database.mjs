import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
import {referenceTables} from '../server/referenceSync.js'
const db=new PGlite();let checks=0
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`)
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))
 const query=async(sql,args=[]) => (await db.query(sql,args)).rows
 const ok=(actual,expected)=>{assert.deepEqual(actual,expected);checks++}
 const denied=async(sql,args=[])=>{await assert.rejects(()=>query(sql,args));checks++}
 const actor='00000000-0000-4000-8000-000000000001'
 await db.exec(`insert into auth.users values('${actor}');set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false)`)
 await denied(`select reference_sync_claim('manual')`)
 await denied(`select reference_sync_finish(gen_random_uuid(),'error')`)
 await denied(`select reference_check_scheduler('guess')`)
 await denied(`select private.publish_reference_snapshot('{}',null,null)`)
 ok(await query('select count(*)::int n from reference_sync_runs'),[{n:0}])
 await db.exec('reset role;set role service_role')
 const claim=async()=> (await query(`select reference_sync_claim('scheduled') r`))[0].r
 const first=await claim();ok(Boolean(first.id),true);ok(await claim(),null)
 const data=Object.fromEntries(Object.values(referenceTables).map(k=>[k,['players','fixtures','results','team_ratings'].includes(k)?Array.from({length:5},(_,id)=>({id,name:'Local-only test'})):[]]))
 const finish=async(id,outcome,datasets=data,hash='a'.repeat(64))=>(await query(`select reference_sync_finish($1,$2,$3,$4) r`,[id,outcome,datasets,hash]))[0].r
 await denied(`select reference_sync_finish($1,'success',$2,$3)`,[first.id,{players:[{}]},'a'.repeat(64)])
 ok(await query('select count(*)::int n from reference_imports'),[{n:0}])
 const published=await finish(first.id,'success');ok(published.counts.players,5)
 await denied(`select reference_sync_finish($1,'success',$2,$3)`,[first.id,data,'a'.repeat(64)])
 const next=await claim();ok(next.source_hash,'a'.repeat(64))
 await denied(`select reference_sync_finish($1,'success',$2,$3)`,[next.id,{...data,players:[{}]},'b'.repeat(64)])
 ok(await query('select count(*)::int n from players'),[{n:5}]);ok(await query('select count(*)::int n from reference_imports'),[{n:1}])
 const unchanged=await finish(next.id,'unchanged',null);ok(unchanged.id,published.id)
 ok(await query('select count(*)::int n from reference_imports'),[{n:1}])
 const failure=await claim();await finish(failure.id,'error',null,null)
 ok(await query('select count(*)::int n from players'),[{n:5}])
 const expired=await claim();await db.query(`update reference_sync_runs set expires_at=now()-interval '1 second' where id=$1`,[expired.id])
 await denied(`select reference_sync_finish($1,'success',$2,$3)`,[expired.id,data,'a'.repeat(64)])
 const replacement=await claim();ok(Boolean(replacement.id&&replacement.id!==expired.id),true)
 await finish(replacement.id,'error',null,null)
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false)`)
 ok(await query('select count(*)::int n from players'),[{n:5}])
 ok(await query('select count(*)::int n from reference_sync_runs'),[{n:0}])
 await db.exec('reset role;set role anon');await denied('select * from reference_sync_runs')
 console.log(`${checks} local sync lease/atomicity/RLS checks passed; no production writes.`)
} catch(e){console.error(e.message,e.code);process.exitCode=1}finally{await db.close()}
