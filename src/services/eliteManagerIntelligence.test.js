import assert from 'node:assert/strict'
import {
  aggregateElitePlayerStats,
  calculateEliteTransfers,
  aggregateEliteChipUsage,
  chipName,
  chipUsageKey,
  createElitePlayerLookup,
  createEliteSnapshotKey,
  eliteCoverage,
  eliteNumericSort,
  exactCohort,
  formatEliteMetric,
  getAvailableLockedEliteRounds,
  getEliteRoundStatus,
  isEliteCohortControlVisible,
  normalizeElitePlayerStat,
  normalizeChipUsage,
  normalizeEliteClubExposure,
  normalizeEliteFormation,
  parseGlobalChipPlays,
  resolveGlobalChipDenominator,
  selectEliteView,
} from './eliteManagerIntelligence.js'

const managers = Array.from({ length: 60 }, (_, index) => ({ entry: String(index + 1), rank: index < 2 ? 1 : index + 1, standingIndex: index + 1, season: '2026/2027', gameweek: 3 }))
managers.splice(4, 0, { ...managers[0], standingIndex: 5 })
assert.equal(exactCohort(managers, 5).length, 5, 'ties mogen het cohort niet vergroten')
assert.deepEqual(exactCohort(managers, 5).map(x => x.entry), ['1', '2', '3', '4', '5'], 'dedupe gebruikt entry en ranglijstvolgorde')

const snapshots = exactCohort(managers, 5).flatMap((manager, index) => [
  { season: '2026/2027', gameweek: 3, entryId: manager.entry, playerId: 'p1', multiplier: index === 4 ? 0 : 1, isCaptain: index === 0, isViceCaptain: index === 1 },
  { season: '2026/2027', gameweek: 3, entryId: manager.entry, playerId: `p${index + 2}`, multiplier: 1 },
])
const aggregate = aggregateElitePlayerStats({ snapshots, managers, players: [{ id: 'p1', ownership: 20 }], season: '2026/2027', gameweek: 3, cohorts: [5] })
const p1 = aggregate.find(x => x.playerId === 'p1')
assert.equal(p1.selected.count, 5)
assert.equal(p1.starter.count, 4)
assert.equal(p1.bench.count, 1)
assert.equal(p1.captain.count, 1)
assert.equal(p1.vice.count, 1)
assert.equal(p1.eliteGapPercentagePoints, 80)
assert.equal(formatEliteMetric(p1.selected, p1.validTeams), '5 / 5 · 100%')
const numberOne = aggregateElitePlayerStats({ snapshots, managers, players: [], season: '2026/2027', gameweek: 3, cohorts: [1] })
assert.equal(numberOne.find(row => row.playerId === 'p1').validTeams, 1)
assert.equal(numberOne.find(row => row.playerId === 'p1').selected.percentage, 100)
assert.equal(numberOne.find(row => row.playerId === 'p1').captain.percentage, 100)

const previousManagers = [{ entry: 'a', standingIndex: 1 }, { entry: 'b', standingIndex: 2 }]
const currentManagers = [{ entry: 'b', standingIndex: 1 }, { entry: 'c', standingIndex: 2 }]
const transfers = calculateEliteTransfers({
  cohort: 2,
  previousManagers,
  currentManagers,
  previousSnapshots: [{ entryId: 'a', playerId: 'fake-out' }, { entryId: 'b', playerId: 'held' }, { entryId: 'b', playerId: 'sold' }],
  currentSnapshots: [{ entryId: 'b', playerId: 'held' }, { entryId: 'b', playerId: 'bought' }, { entryId: 'c', playerId: 'fake-in' }],
})
assert.equal(transfers.find(x => x.playerId === 'bought').boughtCount, 1)
assert.equal(transfers.find(x => x.playerId === 'sold').soldCount, 1)
assert.equal(transfers.find(x => x.playerId === 'held').heldCount, 1)
assert.equal(transfers.some(x => x.playerId === 'fake-in' || x.playerId === 'fake-out'), false, 'cohort movement is geen transfer')
assert.equal(transfers[0].comparisonManagers, 1)

assert.equal(eliteCoverage(2, 100).usableForEditorial, false)
assert.equal(eliteCoverage(997, 1000).percentage, 99.7)
assert.equal(createEliteSnapshotKey({ season: 's', gameweek: 2, entryId: 3, playerId: 4 }), 's|2|3|4')

const normalized = normalizeElitePlayerStat({ Seizoen: '2026/2027', Gameweek: 3, Cohort: 100, SpelerID: 'p1', RequestedTeams: 100, ValidTeams: 80, SelectedCount: 40, MarketSelectedPct: '' })
assert.equal(normalized.selected.percentage, 50)
assert.equal(normalized.marketSelectedPercentage, null)
assert.equal(selectEliteView([normalized], { season: '2026/2027', cohort: 100 })[0].playerId, 'p1')
assert.equal(normalizeElitePlayerStat({ Seizoen: '2026/2027', Gameweek: 3, Cohort: 7, SpelerID: 'p1' }), null)

assert.equal(createElitePlayerLookup([normalized], { season: '2026/2027', cohort: '100' }).get('p1').selected.count, 40, 'stringcohort en string-ID werken')
assert.equal(createElitePlayerLookup([], { season: '2026/2027', cohort: 100 }).size, 0)
assert.deepEqual(eliteNumericSort([{ playerId: 'null', value: null }, { playerId: 'two', value: 2 }, { playerId: 'one', value: 1 }], 'value', 'asc').map(row => row.playerId), ['one', 'two', 'null'])

assert.equal(chipName('2capt'), 'Dynamisch Duo')
assert.equal(chipName('frush'), 'Aanvalluh!!')
assert.match(chipName('mystery'), /Onbekende chip/)
const chipManagers = Array.from({ length: 10 }, (_, index) => ({ entry: String(index + 1), standingIndex: index + 1, activeChip: index === 0 ? 'wildcard' : index < 4 ? '2capt' : '' }))
const chipAggregate = aggregateEliteChipUsage(chipManagers, ['#1', 'Top 5', 'Top 10'])
assert.equal(chipAggregate.find(row => row.group === '#1' && row.chipCode === 'wildcard').percentage, 100)
assert.equal(chipAggregate.find(row => row.group === 'Top 5' && row.chipCode === '2capt').count, 3)
assert.equal(chipAggregate.find(row => row.group === 'Top 10' && row.chipCode === 'rich').count, 0)
assert.equal(chipAggregate.find(row => row.group === 'Top 10' && row.chipCode === 'none').count, 6)
const globalChips = parseGlobalChipPlays([{ id: 3, is_current: true, chip_plays: [{ chip_name: 'rich', num_played: 8000 }, { chip_name: 'rich', num_played: 259 }] }])
assert.equal(globalChips[0].count, 8259, 'dubbele chipdefinities worden geaggregeerd')
assert.equal(globalChips[0].percentage, null, 'zonder historische denominator geen percentage')
assert.equal(globalChips[0].status, 'Lopend')
assert.equal(parseGlobalChipPlays([{ id: 2, finished: true, chip_plays: [{ chip_name: '2capt', num_played: 10 }] }], { denominatorByRound: { 2: 100 } })[0].percentage, 10)
const liveGlobalChips = parseGlobalChipPlays([{ id: 3, is_current: true, chip_plays: [{ chip_name: 'rich', num_played: 8259 }] }], { currentManagers: 64159 })
assert.equal(liveGlobalChips[0].managers, 64159, 'globale denominator wordt centraal doorgegeven')
assert.ok(Math.abs(liveGlobalChips[0].percentage - 8259 / 64159 * 100) < 1e-12, 'globaal chippercentage gebruikt de algemene ranking')
assert.equal(resolveGlobalChipDenominator({ id: 3, is_current: true }, { existingUsage: [{ Seizoen: '2026/2027', Speelronde: 3, ChipCode: 'rich', Groep: 'Hele spel', Managers: 63000, ChipAantal: 1 }], currentManagers: 64159 }), 64159, 'lopende ronde mag vernieuwen')
assert.equal(resolveGlobalChipDenominator({ id: 2, finished: true }, { existingUsage: [{ Seizoen: '2026/2027', Speelronde: 2, ChipCode: 'rich', Groep: 'Hele spel', Managers: 62000, ChipAantal: 1 }], currentManagers: 64159 }), 62000, 'definitieve ronde bevriest de opgeslagen denominator')
assert.equal(resolveGlobalChipDenominator({ id: 1, finished: true }, { currentManagers: 64159 }), null, 'historische denominator wordt niet verzonnen')
assert.equal(chipAggregate.find(row => row.group === 'Top 5' && row.chipCode === '2capt').percentage, 60, 'Topmanager-percentages blijven cohortgebaseerd')
const normalizedChip = normalizeChipUsage({ Seizoen: '2026/2027', Speelronde: 2, Status: 'Locked', ChipCode: 'wildcard', Groep: 'Top 100', Managers: 100, ChipAantal: 3 })
assert.equal(normalizedChip.percentage, 3)
assert.equal(chipUsageKey(normalizedChip), '2026/2027|2|wildcard|Top 100')
assert.equal(normalizeEliteFormation({ Seizoen: '2026/2027', Gameweek: 2, Cohort: 100, ValidTeams: 100, Formation: '3-4-3', FormationCount: 40, FormationPct: 40 }).formation, '3-4-3')
assert.equal(normalizeEliteFormation({ Seizoen: '2026/2027', Gameweek: 3, Cohort: 100, Formation: '6-0-4' }), null)
assert.equal(normalizeEliteClubExposure({ Seizoen: '2026/2027', Gameweek: 2, Cohort: 100, Club: 'Ajax', ValidTeams: 100, AverageSquadPlayers: 2.1, TeamsWith2Count: 70, TeamsWith2Pct: 70 }).teamsWith2.count, 70)

const roundRows = [2, 3, 4].map(gameweek => normalizeElitePlayerStat({ Seizoen: '2026/2027', Gameweek: gameweek, Cohort: 100, SpelerID: `p${gameweek}`, RequestedTeams: 100, ValidTeams: 100, SelectedCount: 1 }))
assert.deepEqual(getAvailableLockedEliteRounds([], { season: '2026/2027' }), [])
assert.deepEqual(getAvailableLockedEliteRounds(roundRows.slice(0, 1), { season: '2026/2027' }).map(item => item.round), [2])
assert.deepEqual(getAvailableLockedEliteRounds(roundRows, { season: '2026/2027', chipUsage: [{ season: '2026/2027', round: 3, status: 'Definitief' }, { season: '2026/2027', round: 4, status: 'Lopend' }] }).map(item => [item.round, item.status]), [[3, 'Definitief'], [4, 'Lopend']])
assert.equal(getEliteRoundStatus(5, [{ round: 5, status: 'Lopend' }]), 'Lopend')
assert.equal(getEliteRoundStatus(5, [{ season: '2025/2026', round: 5, status: 'Lopend' }, { season: '2026/2027', round: 5, status: 'Definitief' }], '2026/2027'), 'Definitief', 'rondestatus blijft binnen het geselecteerde seizoen')
assert.equal(isEliteCohortControlVisible('elite'), true)
for (const group of ['general', 'fantasy', 'expectation', 'profile', 'attack', 'defence', 'discipline']) assert.equal(isEliteCohortControlVisible(group), false)

console.log('Elite Manager Intelligence-tests geslaagd.')
