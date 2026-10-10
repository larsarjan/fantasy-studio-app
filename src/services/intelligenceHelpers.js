import { getFixtures, getPlayerProfiles, getResults, getSyncStatus, getTeamRatings } from './database.js'
import { availabilityPolicy, availabilityVersion } from './availability.js'
import { calculatePlayerExpectedPointsRange } from './expectedPoints/expectedPointsEngine.js'
import { calculatePlayerFixtureOutlook } from './fixtureIntelligenceEngine.js'
import { getAutomaticOutlookStartRound } from './fantasyOutlookComparisonEngine.js'
import { getPlayerMatchHistory } from './playerMatchStatsEngine.js'
import { normalizeClubName } from './historyAnalytics.js'
import { normalizePosition } from './positionNormalization.js'

export const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
export const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, finite(value)))
export const round = (value, digits = 1) => Math.round((finite(value) + Number.EPSILON) * 10 ** digits) / 10 ** digits
export const text = (value) => String(value ?? '').trim()
export const mean = (values) => values.length ? values.reduce((sum, value) => sum + finite(value), 0) / values.length : 0
export const currentPrice = (player) => finite(player?.endPrice, finite(player?.startPrice))
export const playerPosition = (player) => normalizePosition(player?.fantasyPosition || player?.position)
const CANONICAL_CLUB_LABELS = Object.freeze({ nec: 'N.E.C.', heerenveen: 'sc Heerenveen', 'go ahead eagles': 'Go Ahead Eagles' })
export const canonicalClubKey = (club) => normalizeClubName(club)
export const canonicalClubName = (club) => CANONICAL_CLUB_LABELS[canonicalClubKey(club)] || text(club)
export const percentile = (values, value) => {
  const valid = values.filter((item) => item !== null && item !== undefined && item !== '').map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!valid.length || value === null || value === undefined || value === '') return 0
  return clamp((valid.filter((item) => item <= finite(value)).length / valid.length) * 100)
}

export function getIntelligenceRound(season, fixtures = getFixtures(), results = getResults()) {
  return getAutomaticOutlookStartRound({
    fixtures: fixtures.filter((item) => !season || text(item.season) === text(season)),
    results: results.filter((item) => !season || text(item.season) === text(season)),
  })
}

export function getIntelligenceRounds(season, fixtures = getFixtures()) {
  return [...new Set(fixtures.filter((item) => !season || text(item.season) === text(season)).map((item) => finite(item.round)).filter(Boolean))].sort((a, b) => a - b)
}

function storedRound(player, roundNumber) {
  return player?.expectedPointsProjection?.rounds?.find((item) => finite(item?.round) === finite(roundNumber)) ?? null
}

export function getPlayerHorizonProjection(player, { startRound, horizon, fixtures, results, teamRatings } = {}) {
  const rounds = Array.from({ length: Math.max(1, finite(horizon, 3)) }, (_, index) => finite(startRound, 1) + index)
  const stored = rounds.map((roundNumber) => storedRound(player, roundNumber))
  let projections = stored
  if (stored.some((item) => !item)) {
    const calculated = calculatePlayerExpectedPointsRange(player, fixtures ?? getFixtures(), { startRound, roundCount: horizon, results, teamRatings, useCache: true })
    projections = rounds.map((roundNumber, index) => stored[index] ?? calculated?.rounds?.find((item) => finite(item.round) === roundNumber) ?? { round: roundNumber, type: 'blank', fixtureCount: 0, expectedPoints: 0, expectedMinutes: 0, appearanceProbability: 0 })
  }
  return {
    rounds: projections,
    expectedPoints: round(projections.reduce((sum, item) => sum + finite(item?.expectedPoints), 0), 2),
    expectedMinutes: round(projections.reduce((sum, item) => sum + finite(item?.expectedMinutes), 0), 1),
    fixtureCount: projections.reduce((sum, item) => sum + finite(item?.fixtureCount), 0),
    dgwCount: projections.filter((item) => item?.type === 'double').length,
    blankCount: projections.filter((item) => item?.type === 'blank').length,
    appearanceProbability: mean(projections.filter((item) => finite(item?.fixtureCount) > 0).map((item) => finite(item?.appearanceProbability))),
  }
}

export function classifyMinutesTrend(values, threshold = 18) {
  const minutes = (values ?? []).map(Number).filter(Number.isFinite)
  if (minutes.length < 3) return { values: minutes, delta: 0, previous: 0, recent: 0, sample: minutes.length, signal: 'insufficient' }
  const split = Math.max(1, Math.floor(minutes.length / 2))
  const previous = mean(minutes.slice(0, split)), recent = mean(minutes.slice(split))
  const delta = round(recent - previous)
  return { values: minutes, delta, previous: round(previous), recent: round(recent), sample: minutes.length, signal: delta >= threshold ? 'breakout' : delta <= -threshold ? 'decline' : 'stable' }
}

function minutesTrend(player, season) {
  const history = getPlayerMatchHistory(player, { season }).filter((item) => finite(item?.minutes) > 0 || item?.played).slice(-5)
  return classifyMinutesTrend(history.map((item) => finite(item.minutes)))
}

export function buildPlayerIntelligence(player, context) {
  const { season, startRound, horizon, fixtures, results, teamRatings } = context
  const normalizedPlayer = { ...player, club: canonicalClubName(player.club), clubKey: canonicalClubKey(player.club) }
  const projection = getPlayerHorizonProjection(normalizedPlayer, { startRound, horizon, fixtures, results, teamRatings })
  const fixture = calculatePlayerFixtureOutlook({ player: normalizedPlayer, startRound, roundCount: horizon, fixtures, results, teamRatings })
  const priorStart = Math.max(1, startRound - horizon)
  const previousFixture = calculatePlayerFixtureOutlook({ player: normalizedPlayer, startRound: priorStart, roundCount: horizon, fixtures, results, teamRatings })
  const price = currentPrice(normalizedPlayer), ownership = normalizedPlayer?.selectedPct === null || normalizedPlayer?.selectedPct === undefined || normalizedPlayer?.selectedPct === '' || !Number.isFinite(Number(normalizedPlayer.selectedPct)) ? null : clamp(normalizedPlayer.selectedPct)
  const form = finite(player?.outlook?.form, finite(player?.profile?.fantasy?.outlook?.scores?.form, 5))
  const fixtureScore = clamp(finite(fixture?.score, 5) * 10)
  const minutesTarget = 90 * Math.max(1, projection.fixtureCount)
  const availability = projection.fixtureCount ? clamp((projection.expectedMinutes / minutesTarget) * 100) * availabilityPolicy(player).factor : 0
  const reliability = clamp(availability * .65 + projection.appearanceProbability * 100 * .25 + (player?.rotationRisk ? 0 : 10) - (player?.injuryRisk ? 20 : 0))
  const value = price > 0 ? projection.expectedPoints / price : 0
  const trend = minutesTrend(normalizedPlayer, season)
  const trajectoryScore = round(clamp(projection.expectedPoints * 7 + fixtureScore * .2 + form * 4 + availability * .15))
  return {
    ...normalizedPlayer, price, ownership, position: playerPosition(normalizedPlayer), projection,
    expectedPoints: projection.expectedPoints, expectedMinutes: projection.expectedMinutes,
    fixtureCount: projection.fixtureCount, fixtureScore, fixtureSwing: round((finite(fixture?.score, 5) - finite(previousFixture?.score, 5)) * 10),
    fixture, formScore: clamp(form * 10), reliability, availability, value, minutesTrend: trend,
    trajectoryScore, trajectory: trajectoryScore >= 70 ? 'rising' : trajectoryScore < 45 ? 'falling' : 'stable',
  }
}

export function createIntelligenceContext({ season, startRound, horizon = 3, players, fixtures, results, teamRatings } = {}) {
  const sourcePlayers = players ?? getPlayerProfiles()
  const sourceFixtures = fixtures ?? getFixtures()
  const selectedSeason = text(season) || text(sourcePlayers[0]?.season)
  return {
    season: selectedSeason,
    startRound: finite(startRound, getIntelligenceRound(selectedSeason, sourceFixtures, results ?? getResults())),
    horizon: [1, 3, 5].includes(finite(horizon)) ? finite(horizon) : 3,
    players: sourcePlayers.filter((item) => !selectedSeason || text(item.season) === selectedSeason),
    fixtures: sourceFixtures,
    results: results ?? getResults(),
    teamRatings: teamRatings ?? getTeamRatings(),
    syncVersion: `${getSyncStatus()?.lastSync || 'local'}|${availabilityVersion()}`,
  }
}

export function rankDeterministic(items, scoreKey) {
  return [...items].sort((a, b) => finite(b[scoreKey]) - finite(a[scoreKey]) || finite(b.expectedPoints) - finite(a.expectedPoints) || text(a.id || a.club).localeCompare(text(b.id || b.club), 'nl'))
}
