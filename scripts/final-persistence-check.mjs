import {readFileSync,writeFileSync} from 'node:fs'
import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import assert from 'node:assert/strict'
const env=loadEnv('production',process.cwd(),'')
const accounts=JSON.parse(readFileSync('test-results/staging-accounts.json'))
const expected=JSON.parse(readFileSync('test-results/imported-selection.json'))
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const a=accounts.find(a=>a.role==='a'),b=accounts.find(a=>a.role==='b')
assert.equal((await client.auth.signInWithPassword(a)).error,null)
const response=await client.from('fantasy_teams').select('*').eq('slug','primary').single()
assert.equal(response.error,null)
const team=response.data, records=team.state.importResult.players
assert.equal(records.length,15)
for(const p of expected) {
 const record=records.find(r=>r.player.id===p.id)
 assert(record)
 assert(Math.abs(record.purchasePrice-(p.endPrice-0.2))<1e-6)
 assert(Math.abs(record.sellingPrice-(p.endPrice-0.1))<1e-6)
}
const conflict=await client.rpc('save_fantasy_team',{team_slug:team.slug,team_name:team.name,team_state:team.state,manager_settings:team.settings,expected_version:team.version-1})
assert(conflict.error,'Stale writer must fail')
await client.auth.signOut({scope:'local'})
assert.equal((await client.auth.signInWithPassword(b)).error,null)
const foreign=await client.from('fantasy_teams').select('id').eq('id',team.id)
assert.equal(foreign.error,null);assert.equal(foreign.data.length,0)
await client.auth.signOut({scope:'local'})
const report={players:15,identityAndPrices:'PASS',crossSession:'PASS',staleVersion:'REJECTED',otherUser:'ISOLATED',stateBytes:Buffer.byteLength(JSON.stringify(team.state)),version:team.version}
writeFileSync('test-results/final-persistence.json',JSON.stringify(report,null,2))
console.log(report)
