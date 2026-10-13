import test from 'node:test'
import assert from 'node:assert/strict'
import { createReferenceSyncHandler } from './referenceSyncHandler.js'
import { referenceTables, validateReferenceCounts, hashSheets } from './referenceSync.js'

const env = { VITE_SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'server-only' }
const datasets = () => Object.fromEntries(Object.values(referenceTables).map(table => [table, ['players','fixtures','results','team_ratings'].includes(table) ? [{}] : []]))
function fixture({ permissions = ['data.correct','sync.run'], busy = false, unchanged = false, fetchFails = false, prepareFails = false, rpcFails = false } = {}) {
  const calls = [], sheets = { source: [{ id: 'real-source-contract' }] }, data = datasets()
  const clientFactory = (_url, key) => ({
    auth: { getUser: async () => ({ data: { user: { id: 'member-id' } } }) },
    rpc: async (name, args) => {
      calls.push({ key, name, args })
      if (name === 'current_access') return { data: { permissions } }
      if (name === 'reference_check_scheduler') return { data: args.supplied_token === 'valid-scheduler-token' }
      if (name === 'reference_sync_claim') return { data: busy ? null : { id: 'lease-id', counts: {}, source_hash: unchanged ? hashSheets(sheets) : null } }
      if (rpcFails && args.outcome === 'success') return { error: { code: '57014' } }
      return { data: { id: 'snapshot', created_at: '2026-10-13T00:00:00Z', counts: Object.fromEntries(Object.entries(data).map(([k,v]) => [k,v.length])) } }
    },
  })
  const handle = createReferenceSyncHandler({ env, clientFactory,
    collect: async () => { calls.push({ name: 'collect' }); if (fetchFails) throw Error('Bron niet beschikbaar.'); return sheets },
    prepare: async () => { calls.push({ name: 'prepare' }); if (prepareFails) throw Error('Ongeldige bron.'); return Object.fromEntries(Object.entries(referenceTables).map(([key,table]) => [key,data[table]])) },
  })
  const request = (headers = { Authorization: 'Bearer test-session' }, body = '{}') => new Request('https://example.invalid/api/reference-sync', { method: 'POST', headers, body })
  return { calls, handle, request }
}
test('unauthenticated and normal member cannot fetch or publish any source', async () => {
  for (const headers of [{}, { Authorization: 'Bearer test-session' }]) {
    const f = fixture({ permissions: [] }), r = await f.handle(f.request(headers))
    assert.ok([401,403].includes(r.status)); assert.equal(f.calls.some(c => c.name === 'collect'), false)
  }
})
test('both import permissions are required', async () => {
  for (const permissions of [['data.correct'],['sync.run']]) {
    const f = fixture({ permissions }); assert.equal((await f.handle(f.request())).status,403)
  }
})
test('malicious payload and cross-origin calls cannot select another actor or source', async () => {
  const f = fixture()
  assert.equal((await f.handle(f.request(undefined,'{"actor_id":"other"}'))).status,400)
  assert.equal((await f.handle(f.request({ Authorization:'Bearer test-session',Origin:'https://attacker.invalid' }))).status,403)
  assert.equal(f.calls.some(c => c.name === 'reference_sync_claim'),false)
})
test('invalid scheduler token is denied', async () => {
  const f = fixture(); assert.equal((await f.handle(f.request({'x-sync-token':'invalid'}))).status,403)
  assert.equal(f.calls.some(c => c.name === 'collect'),false)
})
test('concurrent request does not download or publish', async () => {
  const f = fixture({busy:true}); assert.equal((await f.handle(f.request())).status,409)
  assert.equal(f.calls.some(c => c.name === 'collect'),false)
})
test('unchanged source skips model computation and new publication', async () => {
  const f = fixture({unchanged:true}), r = await f.handle(f.request())
  assert.equal(r.status,200);assert.equal((await r.json()).unchanged,true)
  assert.equal(f.calls.some(c => c.name === 'prepare'),false)
  assert.equal(f.calls.at(-1).args.outcome,'unchanged')
})
test('changed valid source is published only using the server client', async () => {
  const f = fixture(), r = await f.handle(f.request());assert.equal(r.status,200)
  const finish = f.calls.at(-1);assert.equal(finish.key,'server-only');assert.equal(finish.args.outcome,'success')
  assert.equal(f.calls.find(c=>c.name==='reference_sync_claim').args.actor_id,'member-id')
})
test('source, processing and publication errors fail closed and record failure', async () => {
  for (const options of [{fetchFails:true},{prepareFails:true},{rpcFails:true}]) {
    const f = fixture(options), r = await f.handle(f.request());assert.equal(r.status,503)
    assert.equal(f.calls.at(-1).args.outcome,'error')
    assert.equal(JSON.stringify(await r.json()).includes('server-only'),false)
  }
})
test('missing, empty or suspiciously shrinking datasets are rejected', () => {
  assert.doesNotThrow(()=>validateReferenceCounts(datasets()))
  const missing = datasets();delete missing.elite_formations
  assert.throws(()=>validateReferenceCounts(missing),/ontbreekt/)
  assert.throws(()=>validateReferenceCounts({...datasets(),players:[]}),/leeg/)
  assert.throws(()=>validateReferenceCounts(datasets(),{players:10}),/gekrompen/)
})
