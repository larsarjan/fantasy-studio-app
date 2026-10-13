import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesReferenceSnapshot } from './referenceCache.js'

const tables = { players: 'players', fixtures: 'fixtures', history: 'history' }
const snapshot = { id: 'snapshot-a', counts: { players: 1, fixtures: 1, history: 0 } }
const cache = () => ({ database: { players: [{}], fixtures: [{}], history: [] }, syncStatus: { snapshotId: 'snapshot-a', source: 'Studio Cloud' } })
test('complete unchanged snapshot is reusable, including empty optional datasets', () => {
  assert.equal(matchesReferenceSnapshot(cache(), snapshot, tables), true)
})
test('changed, legacy and missing snapshots always download fresh data', () => {
  for (const value of [null, {}, { ...cache(), syncStatus: { source: 'Studio Cloud' } }]) assert.equal(matchesReferenceSnapshot(value, snapshot, tables), false)
  assert.equal(matchesReferenceSnapshot(cache(), { ...snapshot, id: 'snapshot-b' }, tables), false)
  assert.equal(matchesReferenceSnapshot(cache(), null, tables), false)
})
test('partial and malformed cached datasets cannot masquerade as a complete snapshot', () => {
  for (const key of Object.keys(tables)) {
    const value = cache()
    delete value.database[key]
    assert.equal(matchesReferenceSnapshot(value, snapshot, tables), false)
  }
  const value = cache()
  value.database.players.push({})
  assert.equal(matchesReferenceSnapshot(value, snapshot, tables), false)
  assert.equal(matchesReferenceSnapshot(cache(), { id: snapshot.id, counts: {} }, tables), false)
})
