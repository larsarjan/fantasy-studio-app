import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../../docs/apps-script/EspnSync.gs', import.meta.url), 'utf8')
const context = vm.createContext({ console })
vm.runInContext(source, context)
const helpers = vm.runInContext('({ getFinishedEspnFixtures, createEspnFixtureStats, selectAutomaticMatchStatsRounds, createMatchStatsKey })', context)

const fixtures = [
  { id: 10, event: 1, finished: true },
  { id: 11, event: 1, finished: true },
  { id: 30, event: 3, finished: false, finished_provisional: true, started: true },
  { id: 31, event: 3, finished: false, started: true },
  { id: 40, event: 4, finished: true },
  { id: 50, event: 5, finished: false },
]
assert.deepEqual(Array.from(helpers.getFinishedEspnFixtures(fixtures), item => item.id), [10, 11, 30, 40], 'definitief en provisional-finished fixtures worden individueel verwerkt')
const selection = helpers.selectAutomaticMatchStatsRounds(fixtures, [{ id: 5, is_current: true }], { 1: '10', 3: '30', 4: '40' }, 3)
assert.deepEqual(Array.from(selection.rounds), [1, 3, 4], 'oude inhaalwedstrijd plus recente relevante rondes')
const repeated = helpers.selectAutomaticMatchStatsRounds(fixtures, [{ id: 5, is_current: true }], selection.signatures, 3)
assert.equal(Array.from(repeated.rounds).includes(1), false, 'ongewijzigde oudere ronde wordt niet zwaar herhaald')
assert.equal(Array.from(repeated.rounds).includes(3), true, 'recente ronde blijft controleerbaar voor ESPN-correcties')
assert.equal(Array.from(repeated.rounds).includes(5), false, 'toekomstige/onafgeronde fixture maakt geen ronde')
const firstRun = helpers.selectAutomaticMatchStatsRounds(fixtures, [{ id: 5, is_current: true }], {}, 3)
assert.deepEqual(Array.from(firstRun.rounds), [3, 4], 'eerste run verwerkt niet onnodig het volledige seizoen')
const postponedBefore = helpers.selectAutomaticMatchStatsRounds([{ id: 20, event: 2, finished: false }], [{ id: 5, is_current: true }], {}, 3)
assert.equal(postponedBefore.signatures[2], '', 'oudere onafgeronde fixture wordt licht als lege signature onthouden')
const postponedAfter = helpers.selectAutomaticMatchStatsRounds([{ id: 20, event: 2, finished: true }], [{ id: 5, is_current: true }], postponedBefore.signatures, 3)
assert.deepEqual(Array.from(postponedAfter.rounds), [2], 'later afgeronde inhaalwedstrijd wordt alsnog geselecteerd')
assert.deepEqual(JSON.parse(JSON.stringify(helpers.createEspnFixtureStats([{ identifier: 'minutes', value: 60 }, { identifier: 'goals_scored', value: 1 }, { identifier: 'goals_scored', value: 1 }]))), { minutes: 60, goals_scored: 2 }, 'live fixturestats blijven fixturegebonden en tellen dubbele records op')
assert.equal(helpers.createMatchStatsKey('p1', '2026/2027', 3, 'f1'), helpers.createMatchStatsKey('p1', '2026/2027', 3, 'f1'), 'bestaande upsertkey blijft deterministisch')
assert.match(source, /if \(existingStatus\) \{\s*status =\s*existingStatus/s, 'bestaande handmatige Status blijft behouden')
assert.match(source, /note =\s*existing\.values\[\s*msNoteColumn\s*\]/s, 'bestaande Notitie blijft behouden')
assert.match(source, /function syncEverythingAutomatic\(\) \{\s*syncEspnPlayerData\(false\)\s*syncLatestCompletedEspnRound\(false\)/s, 'bestaande dagelijkse flow blijft intact')
console.log('EspnSync Apps Script-tests geslaagd.')
