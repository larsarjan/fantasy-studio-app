import { getEnrichedPlayers, getFixtures, getResults, getSyncStatus, getTeamRatings } from './database.js'
import { calculatePlayerExpectedPointsRange } from './expectedPoints/expectedPointsEngine.js'
import { calculatePlayerFixtureOutlook } from './fixtureIntelligenceEngine.js'
import { calculatePlayerForm } from './formIntelligenceEngine.js'
import { getAutomaticOutlookStartRound } from './fantasyOutlookComparisonEngine.js'

export const CAPTAIN_RADAR_CONFIG = Object.freeze({
  weights: Object.freeze({ expectedPoints: .35, availability: .20, fixture: .15, form: .10, captainProfile: .10, upside: .05, reliability: .05 }),
  safeCaptainWeights: Object.freeze({ availability: .30, reliability: .25, expectedPoints: .20, fixture: .10, form: .10, captainProfile: .05 }),
  differentialMaxSelectedPct: 10,
  differentialMinimumScore: 58,
  safeAlternativeMinimumScore: 55,
  minimumCandidateMinutesPerFixture: 25,
  expectedPointsExcellent: 9,
})

const cache = new Map()
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, finite(value)))
const round = (value, digits = 2) => Math.round((finite(value) + Number.EPSILON) * 10 ** digits) / 10 ** digits
const text = (value) => String(value ?? '').trim()

function normalizeRoundNumber(value, fallback = 1) {
  const direct = Number(value)
  if (Number.isFinite(direct) && direct >= 1) return direct
  const match = text(value).match(/(\d+)/)
  return match ? Number(match[1]) : fallback
}

export function resolveCaptainRoundProjection(player, selectedRound, calculatedProjection = null, fixtureRound = null) {
  const roundNumber = normalizeRoundNumber(selectedRound)
  const storedRounds = Array.isArray(player?.expectedPointsProjection?.rounds) ? player.expectedPointsProjection.rounds : []
  const storedRound = storedRounds.find((item) => normalizeRoundNumber(item?.round, 0) === roundNumber)
  const calculatedRound = calculatedProjection?.rounds?.find((item) => normalizeRoundNumber(item?.round, 0) === roundNumber) ?? calculatedProjection?.rounds?.[0] ?? null
  const source = storedRound ?? calculatedRound
  if (!source) return { round: roundNumber, type: 'blank', fixtureCount: 0, fixtures: [], expectedPoints: 0, expectedMinutes: 0, appearanceProbability: 0 }
  const fixtures = calculatedRound?.fixtures ?? fixtureRound?.fixtures ?? []
  return {
    ...source,
    round: roundNumber,
    type: source.type ?? fixtureRound?.type ?? (fixtures.length > 1 ? 'double' : fixtures.length ? 'single' : 'blank'),
    fixtureCount: finite(source.fixtureCount, fixtures.length),
    fixtures,
    expectedPoints: finite(source.expectedPoints),
    expectedMinutes: finite(source.expectedMinutes),
    appearanceProbability: finite(source.appearanceProbability),
    projectionSource: storedRound ? 'database-precompute' : 'expected-points-fallback',
  }
}

function xpScore(value, fixtureCount) {
  if (!fixtureCount) return 0
  // xP is deliberately round-total based: an extra DGW fixture raises the
  // captain ceiling, while minutes are still judged per individual fixture.
  return clamp((finite(value) / CAPTAIN_RADAR_CONFIG.expectedPointsExcellent) * 100)
}

function minutesScore(minutes, fixtureCount) {
  if (!fixtureCount) return 0
  const perFixture = finite(minutes) / fixtureCount
  if (perFixture >= 85) return 100
  if (perFixture >= 75) return 78 + (perFixture - 75) * 2.2
  if (perFixture >= 60) return 52 + (perFixture - 60) * 1.73
  if (perFixture >= 45) return 27 + (perFixture - 45) * 1.67
  return clamp(perFixture * .6)
}

function reliabilityScore({ minutes, fixtureCount, appearanceProbability, player, form }) {
  if (!fixtureCount) return 0
  const minuteBase = minutesScore(minutes, fixtureCount)
  const appearance = clamp(finite(appearanceProbability) * 100)
  const continuity = clamp(finite(form?.continuityScore, 5) * 10)
  let riskPenalty = player?.rotationRisk ? 18 : 0
  riskPenalty += player?.injuryRisk ? 22 : 0
  return clamp(minuteBase * .5 + appearance * .3 + continuity * .2 - riskPenalty)
}

export function calculateCaptainRadarScore(input, config = CAPTAIN_RADAR_CONFIG) {
  const fixtureCount = Math.max(0, finite(input.fixtureCount))
  if (!fixtureCount) return { score: 0, breakdown: createBreakdown({}, config.weights) }
  const components = {
    expectedPoints: xpScore(input.expectedPoints, fixtureCount),
    availability: minutesScore(input.expectedMinutes, fixtureCount),
    fixture: clamp(finite(input.fixtureScore, 5) * 10),
    form: clamp(finite(input.formScore, 5) * 10),
    captainProfile: clamp(input.captainScore),
    upside: clamp(finite(input.upsideScore, input.captainScore)),
    reliability: clamp(input.reliabilityScore),
  }
  const breakdown = createBreakdown(components, config.weights)
  return { score: clamp(Object.values(breakdown).reduce((sum, item) => sum + item.contribution, 0)), breakdown }
}

export function calculateSafeCaptainScore(candidate, config = CAPTAIN_RADAR_CONFIG) {
  if (!finite(candidate?.fixtureCount)) return { score: 0, breakdown: createBreakdown({}, config.safeCaptainWeights) }
  const fixture = finite(candidate.fixtureScore, 5)
  const form = finite(candidate.formScore, 5)
  const components = {
    availability: candidate.breakdown?.availability?.score ?? minutesScore(candidate.expectedMinutes, candidate.fixtureCount),
    reliability: candidate.reliabilityScore,
    expectedPoints: candidate.breakdown?.expectedPoints?.score ?? xpScore(candidate.expectedPoints, candidate.fixtureCount),
    fixture: fixture <= 10 ? fixture * 10 : fixture,
    form: form <= 10 ? form * 10 : form,
    captainProfile: candidate.captainScore,
  }
  const breakdown = createBreakdown(components, config.safeCaptainWeights)
  return { score: clamp(Object.values(breakdown).reduce((sum, item) => sum + item.contribution, 0)), breakdown }
}

function createBreakdown(components, weights) {
  return Object.fromEntries(Object.entries(weights).map(([key, weight]) => {
    const score = clamp(components[key])
    return [key, { score: round(score, 1), weight, contribution: round(score * weight, 2) }]
  }))
}

function makeReasons(candidate, leaders) {
  const reasons = []
  if (candidate.expectedPoints >= leaders.maxXp * .95) reasons.push('Heeft één van de hoogste expected-pointsprojecties van deze speelronde.')
  if (candidate.breakdown.availability.score >= 90) reasons.push(`Wordt voor circa ${Math.round(candidate.expectedMinutes)} minuten verwacht en heeft daardoor weinig minutenrisico.`)
  else if (candidate.breakdown.availability.score < 55) reasons.push('Het verwachte aantal minuten zorgt voor duidelijk captainrisico.')
  if (candidate.breakdown.fixture.score >= 72) reasons.push(`Treft een relatief gunstige tegenstander${candidate.fixtures.some((fixture) => fixture.isHome) ? ' in eigen huis' : ''}.`)
  if (candidate.breakdown.form.score >= 70) reasons.push('De recente vorm ondersteunt de sterke projectie.')
  if (candidate.selectedPct <= CAPTAIN_RADAR_CONFIG.differentialMaxSelectedPct && candidate.radarScore >= CAPTAIN_RADAR_CONFIG.differentialMinimumScore) reasons.push('Het lage gekozen percentage maakt hem interessant als offensieve differential.')
  if (candidate.roundType === 'double') reasons.push('De dubbele speelronde vergroot zowel het minutenvolume als het puntenplafond.')
  return reasons.slice(0, 4)
}

function makeBadges(candidate) {
  const badges = []
  if (candidate.breakdown.upside.score >= 75) badges.push({ icon: '🔥', label: 'Hoge upside' })
  if (candidate.expectedPoints >= 7) badges.push({ icon: '🎯', label: 'Hoge xP' })
  if (candidate.fixtures.some((fixture) => fixture.isHome) && candidate.breakdown.fixture.score >= 65) badges.push({ icon: '🏠', label: 'Sterke thuiswedstrijd' })
  if (candidate.breakdown.availability.score < 60) badges.push({ icon: '⚠', label: 'Minutenrisico' })
  if (candidate.selectedPct <= CAPTAIN_RADAR_CONFIG.differentialMaxSelectedPct && candidate.radarScore >= CAPTAIN_RADAR_CONFIG.differentialMinimumScore) badges.push({ icon: '💎', label: 'Differential' })
  return badges.slice(0, 3)
}

export function compareCaptainCandidates(a, b) {
  return b.radarScore - a.radarScore || b.expectedPoints - a.expectedPoints || b.reliabilityScore - a.reliabilityScore || b.fixtureScore - a.fixtureScore || b.captainScore - a.captainScore || a.currentPrice - b.currentPrice || text(a.id).localeCompare(text(b.id), 'nl')
}

export function selectCaptainRecommendations(candidates, config = CAPTAIN_RADAR_CONFIG) {
  const eligible = candidates.filter((item) => item.fixtureCount > 0 && item.expectedMinutes / item.fixtureCount >= config.minimumCandidateMinutesPerFixture).sort(compareCaptainCandidates)
  const bestCaptain = eligible[0] ?? null
  eligible.forEach((candidate) => {
    const safeResult = calculateSafeCaptainScore(candidate, config)
    candidate.safeCaptainScore = round(safeResult.score, 1)
    candidate.safeCaptainBreakdown = safeResult.breakdown
  })
  const safeRank = eligible.filter((candidate) => candidate.id !== bestCaptain?.id && candidate.safeCaptainScore >= config.safeAlternativeMinimumScore).sort((a, b) => b.safeCaptainScore - a.safeCaptainScore || b.reliabilityScore - a.reliabilityScore || b.breakdown.availability.score - a.breakdown.availability.score || b.expectedPoints - a.expectedPoints || compareCaptainCandidates(a, b))
  const safestCaptain = safeRank[0] ?? null
  const differentialCaptain = eligible.filter((item) => item.selectedPct <= config.differentialMaxSelectedPct && item.radarScore >= config.differentialMinimumScore)[0] ?? null
  const viceCaptain = eligible.filter((item) => item.id !== bestCaptain?.id).sort((a, b) => (b.reliabilityScore * .45 + b.breakdown.availability.score * .3 + b.expectedPoints * 2.5) - (a.reliabilityScore * .45 + a.breakdown.availability.score * .3 + a.expectedPoints * 2.5) || compareCaptainCandidates(a, b))[0] ?? safestCaptain ?? bestCaptain
  return { bestCaptain, safestCaptain, differentialCaptain, viceCaptain }
}

export function buildCaptainRadar({ season, round: roundNumber, players, fixtures, results, teamRatings, syncVersion = '' } = {}) {
  const sourcePlayers = players ?? getEnrichedPlayers()
  const sourceFixtures = fixtures ?? getFixtures()
  const selectedSeason = text(season) || text(sourcePlayers[0]?.season)
  const selectedRound = normalizeRoundNumber(roundNumber)
  const key = `${selectedSeason}|${selectedRound}|${syncVersion || getSyncStatus()?.lastSync || 'local'}`
  if (!players && !fixtures && cache.has(key)) return cache.get(key)
  const seasonFixtures = sourceFixtures.filter((fixture) => (!selectedSeason || text(fixture.season) === selectedSeason) && finite(fixture.round) === selectedRound)
  const candidates = sourcePlayers.filter((player) => !selectedSeason || text(player.season) === selectedSeason).map((player) => {
    const fixtureOutlook = calculatePlayerFixtureOutlook({ player, startRound: selectedRound, roundCount: 1, fixtures: sourceFixtures, results, teamRatings })
    const fixtureRound = fixtureOutlook?.rounds?.find((item) => finite(item?.round) === selectedRound) ?? fixtureOutlook?.rounds?.[0] ?? null
    const hasStoredRound = player?.expectedPointsProjection?.rounds?.some((item) => normalizeRoundNumber(item?.round, 0) === selectedRound)
    const projection = hasStoredRound ? null : calculatePlayerExpectedPointsRange(player, sourceFixtures, { startRound: selectedRound, roundCount: 1, results, teamRatings, useCache: true })
    const projectedRound = resolveCaptainRoundProjection(player, selectedRound, projection, fixtureRound)
    const form = calculatePlayerForm({ player })
    const fixtureScore = finite(fixtureOutlook?.rounds?.[0]?.score, projectedRound.type === 'blank' ? 0 : 5)
    const reliability = reliabilityScore({ minutes: projectedRound.expectedMinutes, fixtureCount: projectedRound.fixtureCount, appearanceProbability: projectedRound.appearanceProbability, player, form })
    const upside = clamp(finite(player.bonusScore, player.captainScore) * .6 + finite(player.captainScore, 50) * .4)
    const scoreResult = calculateCaptainRadarScore({ fixtureCount: projectedRound.fixtureCount, expectedPoints: projectedRound.expectedPoints, expectedMinutes: projectedRound.expectedMinutes, fixtureScore, formScore: form?.score, captainScore: player.captainScore, upsideScore: upside, reliabilityScore: reliability })
    return { ...player, id: text(player.id), season: text(player.season), currentPrice: finite(player.endPrice, finite(player.startPrice)), selectedPct: clamp(player.selectedPct), round: selectedRound, roundType: projectedRound.type, fixtureCount: finite(projectedRound.fixtureCount), fixtures: projectedRound.fixtures ?? [], expectedPoints: finite(projectedRound.expectedPoints), expectedMinutes: finite(projectedRound.expectedMinutes), appearanceProbability: finite(projectedRound.appearanceProbability), fixtureScore, formScore: finite(form?.score, 5), form, captainScore: clamp(player.captainScore), upsideScore: upside, reliabilityScore: reliability, radarScore: round(scoreResult.score, 1), breakdown: scoreResult.breakdown }
  }).sort(compareCaptainCandidates)
  const leaders = { maxXp: Math.max(0, ...candidates.map((item) => item.expectedPoints)) }
  candidates.forEach((candidate) => { candidate.reasons = makeReasons(candidate, leaders); candidate.badges = makeBadges(candidate) })
  const result = { season: selectedSeason, round: selectedRound, fixtures: seasonFixtures, candidates, recommendations: selectCaptainRecommendations(candidates), generatedAt: new Date().toISOString() }
  if (!players && !fixtures) cache.set(key, result)
  return result
}

export function getCaptainRadarAvailableRounds(season, fixtures = getFixtures()) {
  return [...new Set(fixtures.filter((fixture) => !season || text(fixture.season) === text(season)).map((fixture) => finite(fixture.round)).filter(Boolean))].sort((a, b) => a - b)
}

export function getCaptainRadarDefaultRound(season, fixtures = getFixtures(), results = getResults()) {
  const seasonFixtures = fixtures.filter((fixture) => !season || text(fixture.season) === text(season))
  const seasonResults = results.filter((result) => !season || text(result.season) === text(season))
  return getAutomaticOutlookStartRound({ fixtures: seasonFixtures, results: seasonResults })
}

export function clearCaptainRadarCache() { cache.clear() }
