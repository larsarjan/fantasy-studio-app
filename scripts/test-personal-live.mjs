import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {resolveHistoricalMatch} from '../src/services/historicalMatchDetails.js'
const env=loadEnv('production',process.cwd(),'');assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co')
const accounts=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')).filter(a=>['a','b'].includes(a.role))
const clients=[],checks=[]
const ok=(r,label)=>{assert.equal(r.error,null,`${label}: ${r.error?.code}`);checks.push(label);return r.data}
for(const account of accounts){const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});ok(await client.auth.signInWithPassword({email:account.email,password:account.password}),'Test account login');clients.push(client)}
for(let i=0;i<2;i++){
 const c=clients[i],other=accounts[1-i].id,own=accounts[i].id
 const saved=ok(await c.from('profiles').update({display_name:`FVT acceptatie ${i+1}`,favorite_club:'Ajax'}).eq('id',own).select().single(),'Save own profile')
 assert.equal(ok(await c.from('profiles').select('display_name,favorite_club').eq('id',own).single(),'Reload profile').favorite_club,'Ajax')
 assert.equal(ok(await c.from('profiles').select('id').eq('id',other),'Profile read isolation').length,0)
 assert.equal(ok(await c.from('profiles').update({display_name:'forbidden'}).eq('id',other).select(),'Profile write isolation').length,0)
 assert((await c.from('profiles').update({role:'admin'}).eq('id',own)).error);checks.push('Privilege escalation denied')
 assert.equal(ok(await c.from('profiles').update({display_name:'stale'}).eq('id',own).eq('updated_at','2000-01-01T00:00:00Z').select(),'Stale profile conflict').length,0)
 assert.equal(ok(await c.from('fantasy_teams').select('id').eq('user_id',other),'Selection isolation').length,0)
}
const db={}
for(const table of ['players','historical_players','fixtures','results','player_match_stats']){db[table]=[];for(let offset=0;;offset+=1000){const rows=ok(await clients[0].from(table).select('payload').order('id').range(offset,offset+999),`Read ${table} page`);db[table].push(...rows.map(r=>r.payload));if(rows.length<1000)break}}
const sourcePlayers=[...db.players,...db.historical_players]
const matches=db.results.map(r=>resolveHistoricalMatch(r,db.fixtures,sourcePlayers,db.player_match_stats))
const details=matches.flatMap(m=>[...m.home,...m.away,...m.unassigned]);console.log(JSON.stringify({stats:db.player_match_stats.length,played:db.player_match_stats.filter(s=>s.minutes>0).length,details:details.length,matches:matches.filter(m=>m.home.length+m.away.length).length}));assert.equal(details.length,db.player_match_stats.filter(s=>s.minutes>0).length);assert(details.every(r=>r.match.minutes>0&&Number.isFinite(r.match.punten.totaal)));checks.push(`${details.length} real player-match scores resolve from live storage`)
assert(matches.some(m=>!m.home.length&&!m.away.length));checks.push('Historical missing data remains empty')
writeFileSync('test-results/personal-source.json',JSON.stringify(db))
writeFileSync('test-results/personal-live.json',JSON.stringify({checks,details:details.length,withDetails:matches.filter(m=>m.home.length+m.away.length).length},null,2))
for(const c of clients)await c.auth.signOut({scope:'local'})
console.log(`${checks.length} personal live checks passed; ${details.length} real player-match scores available`)
