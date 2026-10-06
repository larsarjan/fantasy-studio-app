// Only the existing isolated acceptance account; never prints credentials.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import assert from 'node:assert/strict'
const env = loadEnv('production', process.cwd(), '')
const account = JSON.parse(readFileSync('test-results/staging-accounts.json')).find(a => a.role === 'a')
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}})
assert.equal((await client.auth.signInWithPassword(account)).error, null)
const result = await client.from('players').select('payload').limit(1000)
assert.equal(result.error,null)
const players = result.data.map(r=>r.payload)
console.log('Player field names:',Object.keys(players[0]??{}))
writeFileSync('test-results/acceptance-players.json',JSON.stringify(players))
await client.auth.signOut({scope:'local'})
