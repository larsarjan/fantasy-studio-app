import { buildPlayerMatch } from './playerMatchStatsEngine.js'

const seasonKey = value => String(value ?? '').replace(/\D/g, '')
const clubKey = value => String(value ?? '').toLocaleLowerCase('nl').replace(/[^\p{L}\p{N}]/gu, '')

// Read persisted match facts directly. Raw player records do not have matchHistory.
export function resolveHistoricalMatch(result, fixtures, players, stats) {
  const same = fixtures.filter(f => seasonKey(f.season) === seasonKey(result.season) && clubKey(f.home) === clubKey(result.home) && clubKey(f.away) === clubKey(result.away))
  const fixture = same.find(f => f.id === result.fixtureId) ?? same.find(f => result.date && f.date === result.date) ?? same.find(f => result.round && Number(f.round) === Number(result.round)) ?? (same.length === 1 ? same[0] : null)
  const groups = { fixture, home: [], away: [], unassigned: [] }
  if (!fixture) return groups
  const byId = new Map(players.filter(p => seasonKey(p.season) === seasonKey(result.season)).map(p => [String(p.id ?? p.playerId), p]))
  const seen = new Set()
  for (const stat of stats) {
    if (String(stat.fixtureId) !== String(fixture.id) || seasonKey(stat.season) !== seasonKey(result.season) || !(Number(stat.minutes) > 0)) continue
    const player = byId.get(String(stat.playerId))
    if (!player || seen.has(String(stat.playerId))) continue
    // Use the club recorded for the match if the source provides it (transfers).
    const club = stat.club || stat.playerClub || player.club
    const side = clubKey(club) === clubKey(fixture.home) ? 'home' : clubKey(club) === clubKey(fixture.away) ? 'away' : null
    const match = buildPlayerMatch({ player: { ...player, club: side ? club : '' }, matchStat: stat, fixture })
    match.fixture.venue = side
    match.recordedGoalsConceded = stat.goalsConceded == null ? null : Number(stat.goalsConceded)
    if (!match.played) continue
    seen.add(String(stat.playerId))
    groups[side ?? 'unassigned'].push({ player: { ...player, club: side ? club : '' }, match })
  }
  return groups
}
