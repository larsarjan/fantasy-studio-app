import assert from 'node:assert/strict'
import { compareResultsChronologically, filterEliteLineupRows, getHistoryPlayerProfileId, getLatestProcessedRound } from './historyPresentation.js'

assert.equal(getLatestProcessedRound([{ season: 'S', round: 1 }, { season: 'S', round: 3 }, { season: 'X', round: 9 }], 'S'), 3)
assert.equal(getLatestProcessedRound([], 'S'), '')
const fixtures = [{ season: 'S', round: 3, home: 'B', away: 'C', date: '2026-08-22', time: '18:45' }, { season: 'S', round: 3, home: 'A', away: 'D', date: '2026-08-21', time: '20:00' }]
const results = fixtures.map(({ time, ...result }) => result).reverse().sort((a, b) => compareResultsChronologically(a, b, fixtures))
assert.deepEqual(results.map((result) => result.home), ['A', 'B'])
const profiles = new Map([['1', { name: 'Van Bergen', club: 'PSV' }], ['2', { name: 'Til', club: 'PSV' }], ['3', { name: 'Goes', club: 'AZ' }]])
const rows = [{ playerId: 1 }, { playerId: 2 }, { playerId: 3 }]
assert.deepEqual(filterEliteLineupRows(rows, profiles, 'berg', 'PSV').map((row) => row.playerId), [1])
assert.deepEqual(filterEliteLineupRows(rows, profiles, '', 'AZ').map((row) => row.playerId), [3])
assert.equal(getHistoryPlayerProfileId({ id: 20260001, name: 'Naamvariant' }), '20260001')
assert.equal(getHistoryPlayerProfileId({ name: 'Dezelfde zichtbare naam' }), '')
console.log('historyPresentation tests passed')
