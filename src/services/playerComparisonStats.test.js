import test from 'node:test'
import assert from 'node:assert/strict'
import { getPlayerMatchStats, getFixtures } from './database.js'
import { calculatePlayerMatchProfile } from './playerMatchStatsEngine.js'
import { withComparisonStats, comparisonNumber } from './playerComparisonStats.js'

test('comparison uses central season history, including old club, and separates player identities', () => {
  const season = '2026/2027'
  const player = { id: 'comparison-a', espnPlayerId: 'external-a', season, name: 'A', club: 'PSV', position: 'Spits', minutes: 0, points: 0 }
  const other = { ...player, id: 'comparison-b', club: 'Ajax' }
  getFixtures().push({ id: 'comparison-old-club', season, home: 'Ajax', away: 'AZ', round: 1 })
  getPlayerMatchStats().push(
    { playerId: player.id, season, fixtureId: 'comparison-old-club', matchStatus: true, status: 'basis', minutes: 90, goals: 2, assists: 1, optaBonus: 3 },
    { playerId: player.id, season, fixtureId: 'comparison-new-club', matchStatus: true, status: 'basis', minutes: 80, goals: 0, assists: 1 },
    { playerId: player.id, season: '2025/2026', matchStatus: true, minutes: 999, goals: 99 },
    { playerId: player.id, season, matchStatus: false, minutes: 999 },
    { playerId: other.id, season, matchStatus: true, status: 'wissel', minutes: 10, goals: 0, assists: 0 },
  )
  const profile = calculatePlayerMatchProfile(player, { season })
  const result = withComparisonStats(player, profile)
  assert.equal(result.minutes, 170)
  assert.equal(result.goals, 2)
  assert.equal(result.assists, 2)
  assert.equal(result.points, profile.punten.totaal)
  assert.ok(result.points > 0)
  assert.equal(result.minutePoints, profile.punten.speelminuten)
  assert.equal(result.optaBonus, 3)
  const second = withComparisonStats(other, calculatePlayerMatchProfile(other, { season }))
  assert.equal(second.minutes, 10)
  assert.equal(second.goals, 0)
  assert.equal(player.minutes, 0, 'base data stays untouched')
  assert.deepEqual(withComparisonStats(player, calculatePlayerMatchProfile(player, { season })), result, 'switching back cannot retain other player statistics')
})

test('missing history is unknown, genuine zero remains zero and unknown never wins as zero', () => {
  const absent = withComparisonStats({ points: 0, minutes: 0 }, { wedstrijden: [], punten: { totaal: 0 } })
  assert.equal(absent.points, null)
  assert.equal(absent.minutes, null)
  for (const value of [null, undefined, '', ' ', NaN]) assert.equal(comparisonNumber(value), null)
  assert.equal(comparisonNumber(0), 0)
  assert.equal(comparisonNumber('0'), 0)
  const partial = withComparisonStats({}, { wedstrijden: [{}], statistieken: { goals: 0 } })
  assert.equal(partial.goals, 0)
  assert.equal(partial.assists, null)
})
