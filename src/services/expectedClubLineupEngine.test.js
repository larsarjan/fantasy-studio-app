import assert from 'node:assert/strict'
import { getRecentStarterEstimate, resolveExpectedClubLineup } from './expectedClubLineupEngine.js'

const match = (status, minutes, played = true) => ({ status, statusLabel: status === 'starter' ? 'Basis' : 'Wissel', started: status === 'starter', played, minutes })
const profile = recentMatches => ({ matchProfile: { recentMatches } })

const regularStarter = getRecentStarterEstimate(profile([
  match('starter', 90), match('starter', 90), match('starter', 90), match('starter', 85), match('starter', 90),
]))
assert.equal(regularStarter.chance, 98)
assert.equal(regularStarter.starts, 5)
assert.equal(regularStarter.expectedMinutes, 89)

const regularSubstitute = getRecentStarterEstimate(profile([
  match('substitute', 18), match('substitute', 22), match('substitute', 15), match('substitute', 25), match('substitute', 20),
]))
assert.ok(regularSubstitute.chance < 25)
assert.equal(regularSubstitute.starts, 0)
assert.equal(regularSubstitute.appearances, 5)

const mixed = getRecentStarterEstimate(profile([
  match('starter', 90), match('substitute', 30), match('starter', 75), match('substitute', 20), match('substitute', 25),
]))
assert.ok(mixed.chance >= 45 && mixed.chance <= 65)

const insufficient = getRecentStarterEstimate(profile([match('starter', 90), match('starter', 90)]))
assert.equal(insufficient, null)

const manualUnavailable = profile([
  match('starter', 90), match('starter', 90), match('starter', 90), match('starter', 90), match('starter', 90),
])
const lineup = resolveExpectedClubLineup({
  club: 'Ajax',
  players: [{
    id: 'manual-unavailable',
    name: 'Manual unavailable',
    club: 'Ajax',
    position: 'middenvelder',
    expectedStarter: false,
    matchProfile: manualUnavailable,
  }],
})
assert.equal(lineup.starters.length, 1)
assert.equal(lineup.starters[0].chanceSource, 'model')
assert.ok(lineup.starters[0].estimatedChance < 50)

console.log('Expected Club Lineup-tests geslaagd.')
