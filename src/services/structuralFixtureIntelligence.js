import { calculatePlayerFixtureOutlook } from './fixtureIntelligenceEngine.js'
import { canonicalClubKey, canonicalClubName, clamp, mean, round } from './intelligenceHelpers.js'

export const STRUCTURAL_FIXTURE_CONFIG = Object.freeze({ blockSize: 5, minimumPrevious: 3, minimumNext: 4, swingThreshold: 15, runAverage: 72, runFixture: 68, runCount: 4, cliffThreshold: 20 })

const validScores = (values) => (values ?? []).map((item) => typeof item === 'object' ? item?.score : item).filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map((value) => clamp(Number(value)))

export function analyzeStructuralFixtureBlocks({ previous = [], next = [], following = [] }, config = STRUCTURAL_FIXTURE_CONFIG) {
  const previousScores = validScores(previous).slice(-config.blockSize), nextScores = validScores(next).slice(0,config.blockSize), followingScores = validScores(following).slice(0,config.blockSize)
  const previousAverage = previousScores.length ? round(mean(previousScores)) : null
  const nextAverage = nextScores.length ? round(mean(nextScores)) : null
  const followingAverage = followingScores.length ? round(mean(followingScores)) : null
  const validSwingSample = previousScores.length >= config.minimumPrevious && nextScores.length >= config.minimumNext
  const delta = validSwingSample ? round(nextAverage - previousAverage) : null
  const structuralSwing = delta !== null && Math.abs(delta) >= config.swingThreshold ? delta : null
  const favorable = nextScores.filter((score) => score >= config.runFixture).length
  const unfavorable = nextScores.filter((score) => score <= 38).length
  const greenRun = nextScores.length >= config.minimumNext && (favorable >= config.runCount || nextAverage >= config.runAverage)
  const afterFirst = nextScores.slice(1, 5)
  const greenRunStart = nextScores.length >= 5 && nextScores[0] < config.runFixture && afterFirst.filter((score) => score >= config.runFixture).length >= 3 && mean(afterFirst) >= config.runAverage
  const redRun = nextScores.length >= config.minimumNext && (unfavorable >= config.runCount || nextAverage <= 38)
  const scheduleCliffDelta = nextScores.length >= config.minimumNext && followingScores.length >= config.minimumNext ? round(followingAverage - nextAverage) : null
  const scheduleCliff = scheduleCliffDelta !== null && scheduleCliffDelta <= -config.cliffThreshold
  const confidenceScore = round(clamp(previousScores.length * 9 + nextScores.length * 10 + Math.min(20, Math.abs(delta ?? 0) * .5)))
  return { previousScores, nextScores, followingScores, previousAverage, nextAverage, followingAverage, delta, structuralSwing, greenRun, greenRunStart, redRun, scheduleCliff, scheduleCliffDelta, sample: `${previousScores.length} vs ${nextScores.length}`, confidence: { score: confidenceScore, level: confidenceScore >= 78 ? 'hoog' : confidenceScore >= 50 ? 'middel' : 'laag' } }
}

const median = (values) => { const sorted = [...values].sort((a,b)=>a-b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null }

export function scanUpcomingSwingPoints(timeline, { currentRound, scanRounds = 12, config = STRUCTURAL_FIXTURE_CONFIG } = {}) {
  const valid = (timeline ?? []).filter((item) => Number.isFinite(Number(item.round)) && Number.isFinite(Number(item.score))).map((item) => ({ round: Number(item.round), score: clamp(item.score) })).sort((a,b)=>a.round-b.round)
  const candidates = []
  for (let startRound = Number(currentRound) + 1; startRound <= Number(currentRound) + scanRounds; startRound += 1) {
    const before = valid.filter((item) => item.round < startRound).slice(-5).map((item) => item.score)
    const after = valid.filter((item) => item.round >= startRound).slice(0,5).map((item) => item.score)
    if (before.length < config.minimumPrevious || after.length < config.minimumNext) continue
    const beforeAverage = round(mean(before)), afterAverage = round(mean(after)), delta = round(afterAverage - beforeAverage)
    const medianDelta = round(median(after) - median(before))
    const firstAfterDelta = round(after[0] - beforeAverage)
    if (Math.abs(delta) < config.swingThreshold || Math.abs(medianDelta) < 8 || Math.abs(firstAfterDelta) < 8 || Math.sign(firstAfterDelta) !== Math.sign(delta)) continue
    const distance = startRound - Number(currentRound)
    const confidenceScore = round(clamp(before.length * 9 + after.length * 10 + Math.min(18, Math.abs(delta) * .45) - Math.max(0, distance - 3) * 2.5))
    candidates.push({ startRound, beforeAverage, afterAverage, delta, type: delta > 0 ? 'positive' : 'negative', before, after, sample: `${before.length} vs ${after.length}`, distance, relevance: round(clamp(Math.abs(delta) * 1.8 + confidenceScore * .45 + Math.max(0, 30 - distance * 3))), confidence: { score: confidenceScore, level: confidenceScore >= 78 ? 'hoog' : confidenceScore >= 50 ? 'middel' : 'laag' } })
  }
  const clustered = []
  for (const candidate of candidates) {
    const previous = clustered.at(-1)
    if (previous && previous.type === candidate.type && candidate.startRound - previous.startRound <= 2) continue
    clustered.push(candidate)
  }
  return clustered
}

export function findUpcomingGreenRunStart(timeline, { currentRound, maxDistance = 3, config = STRUCTURAL_FIXTURE_CONFIG } = {}) {
  const valid = (timeline ?? []).filter((item) => Number.isFinite(Number(item.round)) && Number.isFinite(Number(item.score))).map((item) => ({ round:Number(item.round), score:clamp(item.score) })).sort((a,b)=>a.round-b.round)
  const current = valid.filter((item)=>item.round>=currentRound).slice(0,5).map((item)=>item.score)
  const currentGreen = current.length >= config.minimumNext && (current.filter((score)=>score>=config.runFixture).length>=config.runCount || mean(current)>=config.runAverage)
  for (let distance=1; distance<=maxDistance; distance+=1) {
    const startRound=Number(currentRound)+distance, scores=valid.filter((item)=>item.round>=startRound).slice(0,5).map((item)=>item.score)
    if (scores.length>=config.minimumNext && (scores.filter((score)=>score>=config.runFixture).length>=config.runCount || mean(scores)>=config.runAverage) && (!currentGreen || current[0] < config.runFixture)) return { startRound, distance, average:round(mean(scores)), scores }
  }
  return null
}

const fixtureScores = (report) => (report?.fixtures ?? []).map((fixture) => Number(fixture?.score)).filter(Number.isFinite).map((score) => score <= 10 ? score * 10 : score)

export function buildStructuralFixtureIntelligence({ players, startRound, fixtures, results, teamRatings }) {
  const representatives = Object.values(Object.groupBy(players, (player) => canonicalClubKey(player.club))).map((assets) => assets[0]).filter(Boolean)
  return representatives.map((player) => {
    const previousStart = Math.max(1, Number(startRound) - 5)
    const previousCount = Math.max(0, Number(startRound) - previousStart)
    const report = (round, count) => count > 0 ? calculatePlayerFixtureOutlook({ player, startRound: round, roundCount: count, fixtures, results, teamRatings }) : { fixtures: [] }
    const previous = fixtureScores(report(previousStart, previousCount))
    const next = fixtureScores(report(startRound, 5))
    const following = fixtureScores(report(Number(startRound) + 5, 5))
    const scanReport = report(Math.max(1, Number(startRound) - 5), 18)
    const timeline = (scanReport.fixtures ?? []).map((fixture) => ({ round:Number(fixture.round), score:Number(fixture.score) <= 10 ? Number(fixture.score) * 10 : Number(fixture.score) })).filter((item)=>Number.isFinite(item.round)&&Number.isFinite(item.score))
    return { club: canonicalClubName(player.club), clubKey: canonicalClubKey(player.club), ...analyzeStructuralFixtureBlocks({ previous, next, following }), upcomingSwings: scanUpcomingSwingPoints(timeline,{currentRound:startRound}), upcomingGreenRunStart: findUpcomingGreenRunStart(timeline,{currentRound:startRound}), timeline }
  }).sort((a, b) => Math.abs(b.structuralSwing ?? 0) - Math.abs(a.structuralSwing ?? 0) || a.club.localeCompare(b.club, 'nl'))
}
