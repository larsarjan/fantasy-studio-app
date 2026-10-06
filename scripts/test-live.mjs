import { createClient } from '@supabase/supabase-js'
import { readFileSync,writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { loadEnv } from 'vite'
const env=loadEnv('production',process.cwd(),'')
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co','Only the authorized Fantasy Studio project may be tested')
const accounts=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8'))
const client=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
const clients={};const report=[]
function ok(result,label) { assert.equal(result.error,null,`${label}: ${result.error?.code ?? result.error?.message}`); report.push(label);return result.data }
function expect(value,label) { assert(value,label);report.push(label) }
for(const account of accounts) { const c=client();ok(await c.auth.signInWithPassword({email:account.email,password:account.password}),`${account.role}: live password login`); clients[account.role]=c }
for(const [role,otherRole] of [['a','b'],['b','a']]) {
 const c=clients[role],owner=accounts.find(a=>a.role===role).id,other=accounts.find(a=>a.role===otherRole).id
 const ownProfile=ok(await c.from('profiles').select('*').single(),`${role}: own profile`)
 expect(ownProfile.role==='viewer',`${role}: registration defaults to viewer`)
 expect(ok(await c.from('profiles').select('*').eq('id',other),`${role}: profile isolation`).length===0,`${role}: no other profile visible`)
 const escalation=await c.from('profiles').update({role:'admin'}).eq('id',owner).select()
 expect(Boolean(escalation.error)||escalation.data.length===0,`${role}: role escalation blocked`)
 ok(await c.auth.updateUser({data:{role:'admin'}}),`${role}: user metadata is writable but not authority`)
 expect((await c.rpc('publish_reference_data',{datasets:{players:[{id:'fake'}],fixtures:[{id:'fake'}]}})).error,`${role}: metadata cannot grant editor permission`)
 let p=ok(await c.from('user_preferences').select('*').maybeSingle(),`${role}: preference read`)
 const saved=ok(await c.rpc('save_preferences',{new_settings:{displayName:`Staging ${role}`},expected_version:p?.version??0}),`${role}: preference persistence`)
 expect((await c.rpc('save_preferences',{new_settings:{displayName:'stale'},expected_version:saved.version-1})).error,`${role}: stale preference rejected`)
 expect((await c.from('user_preferences').insert({user_id:other,settings:{}})).error,`${role}: foreign preference insert blocked`)
 expect((await c.from('user_preferences').update({user_id:other}).eq('user_id',owner)).error,`${role}: ownership transfer blocked`)
 const slug=`security-${Date.now()}`
 const team=ok(await c.rpc('save_fantasy_team',{team_slug:slug,team_name:'Staging test',team_state:{mode:'current-team',bank:5},manager_settings:{planning:{startRound:8,roundCount:3}},expected_version:0}),`${role}: team creation`)
 const otherClient=clients[otherRole]
 expect(ok(await otherClient.from('fantasy_teams').select('*').eq('id',team.id),`${otherRole}: foreign team read`).length===0,`${otherRole}: team invisible`)
 expect(ok(await otherClient.from('fantasy_teams').update({name:'attack'}).eq('id',team.id).select(),`${otherRole}: foreign team update`).length===0,`${otherRole}: update affected no foreign rows`)
 expect(ok(await otherClient.from('fantasy_teams').delete().eq('id',team.id).select(),`${otherRole}: foreign team delete`).length===0,`${otherRole}: delete affected no foreign rows`)
 const concurrent=await Promise.all([5,6].map(bank=>c.rpc('save_fantasy_team',{team_slug:slug,team_name:'Staging concurrent',team_state:{bank},manager_settings:{},expected_version:1})))
 expect(concurrent.filter(r=>!r.error).length===1,`${role}: concurrent writes accept exactly one`)
 expect(concurrent.filter(r=>r.error?.code==='P0001').length===1,`${role}: stale concurrent writer gets version conflict`)
 expect(ok(await c.from('team_versions').select('*').eq('team_id',team.id),`${role}: team history`).length===2,`${role}: both accepted versions retained`)
 expect(ok(await otherClient.from('team_versions').select('*').eq('team_id',team.id),`${otherRole}: version isolation`).length===0,`${otherRole}: no foreign history`)
 let revision=ok(await c.from('editorial_revisions').select('version').maybeSingle(),`${role}: editorial revision`)
 const version=ok(await c.rpc('save_transfer_editorial',{records:[{kind:'club',key:'Ajax',payload:{note:`Private ${role}`}}],expected_version:revision?.version??0}),`${role}: editorial save`)
 expect((await c.rpc('save_transfer_editorial',{records:[],expected_version:version-1})).error,`${role}: stale editorial rejected`)
 expect(ok(await otherClient.from('transfer_editorial').select('*').eq('user_id',owner),`${otherRole}: editorial isolation`).length===0,`${otherRole}: no foreign notes`)
 const fresh=client(); const account=accounts.find(a=>a.role===role)
 ok(await fresh.auth.signInWithPassword({email:account.email,password:account.password}),`${role}: new session login`)
 expect(ok(await fresh.from('fantasy_teams').select('version').eq('id',team.id).single(),`${role}: cross-session persistence`).version===2,`${role}: persisted version after new login`)
 ok(await fresh.auth.refreshSession(),`${role}: refresh session`)
 ok(await fresh.auth.signOut(),`${role}: logout`)
 expect((await fresh.from('fantasy_teams').select('*')).error,`${role}: anonymous access after logout denied`)
 ok(await c.from('fantasy_teams').delete().eq('id',team.id),`${role}: own test-team cleanup`)
}
for(const role of ['admin','editor']) {
 const c=clients[role],who=ok(await c.from('profiles').select('role').single(),`${role}: database role`)
 expect(who.role===role,`${role}: assigned role preserved`)
 expect(ok(await c.from('fantasy_teams').select('user_id'),`${role}: private teams isolation`).every(row=>row.user_id===accounts.find(a=>a.role===role).id),`${role}: shared-data role has no private-user bypass`)
 const insert=ok(await c.from('reference_imports').insert({imported_by:accounts.find(a=>a.role===role).id,source:'RLS acceptance test',counts:{}}).select().single(),`${role}: shared import permission`)
 ok(await c.from('team_ratings').insert({id:`test-${role}`,import_id:insert.id,payload:{club:'RLS test'}}),`${role}: shared insert`)
 ok(await c.from('team_ratings').update({payload:{club:'RLS tested'}}).eq('id',`test-${role}`).select().single(),`${role}: shared update`)
 expect(ok(await clients.a.from('team_ratings').select('*').eq('id',`test-${role}`),'viewer: shared read').length===1,'viewer: reference data accessible')
 expect(ok(await clients.a.from('team_ratings').update({payload:{}}).eq('id',`test-${role}`).select(),'viewer: shared update denied').length===0,'viewer: reference unchanged')
 ok(await c.from('team_ratings').delete().eq('id',`test-${role}`),`${role}: shared test row cleanup`)
}
for(const c of Object.values(clients)) await c.auth.signOut({scope:'local'})
writeFileSync('test-results/live-security.json',JSON.stringify({project:'rzunbquzffdivlpuomjc',at:new Date().toISOString(),passed:report.length,checks:report},null,2))
console.log(`${report.length} LIVE Supabase authentication, RLS, roles, persistence and concurrency checks passed.`)
