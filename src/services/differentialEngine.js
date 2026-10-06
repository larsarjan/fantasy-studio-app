import { buildPlayerIntelligence, clamp, createIntelligenceContext, finite, mean, percentile, rankDeterministic, round, text } from './intelligenceHelpers.js'

export const DIFFERENTIAL_CONFIG = Object.freeze({
  weights: Object.freeze({ expectedPoints: .30, ownership: .20, fixture: .15, availability: .15, form: .10, value: .10 }),
  safeWeights: Object.freeze({ availability: .30, reliability: .25, expectedPoints: .20, fixture: .15, form: .10 }),
  qualityFloor: 52,
  heroFloor: 60,
})

const cache = new Map()
const ownershipAdvantage = (pct, threshold) => clamp((1 - Math.sqrt(clamp(pct, 0, threshold) / Math.max(1, threshold))) * 100)

export function calculateDifferentialScore(input, config = DIFFERENTIAL_CONFIG) {
  const scores = {
    expectedPoints: clamp(input.xpScore), ownership: ownershipAdvantage(input.ownership, input.threshold), fixture: clamp(input.fixtureScore),
    availability: clamp(input.availability * .6 + input.reliability * .4), form: clamp(input.formScore), value: clamp(input.valueScore),
  }
  const breakdown = Object.fromEntries(Object.entries(config.weights).map(([key, weight]) => [key, { score: round(scores[key]), weight, contribution: round(scores[key] * weight, 2) }]))
  return { score: round(clamp(Object.values(breakdown).reduce((sum, item) => sum + item.contribution, 0))), breakdown }
}

export function calculateSafeDifferentialScore(item, config = DIFFERENTIAL_CONFIG) {
  const scores = { availability: item.availability, reliability: item.reliability, expectedPoints: item.xpScore, fixture: item.fixtureScore, form: item.formScore }
  return round(clamp(Object.entries(config.safeWeights).reduce((sum, [key, weight]) => sum + clamp(scores[key]) * weight, 0)))
}

export function buildDifferentialAnalysis(options = {}) {
  const context = createIntelligenceContext(options), threshold = [5, 10, 15].includes(finite(options.threshold)) ? finite(options.threshold) : 10
  const key = `${context.season}|${context.startRound}|${context.horizon}|${threshold}|${context.syncVersion}`
  if (!options.players && cache.has(key)) return cache.get(key)
  const metrics = context.players.map((player) => buildPlayerIntelligence(player, context))
  const xpValues = metrics.map((item) => item.expectedPoints), valueValues = metrics.map((item) => item.value)
  const candidates = metrics.filter((item) => item.ownership !== null && item.ownership < threshold && item.fixtureCount > 0).map((item) => {
    const xpScore = percentile(xpValues, item.expectedPoints), valueScore = percentile(valueValues, item.value)
    const result = calculateDifferentialScore({ ...item, xpScore, valueScore, threshold })
    const qualityScore = round(clamp(xpScore * .45 + item.availability * .25 + item.fixtureScore * .15 + item.formScore * .15))
    return { ...item, xpScore, valueScore, edgeScore: result.score, edgeBreakdown: result.breakdown, qualityScore }
  }).filter((item) => item.qualityScore >= DIFFERENTIAL_CONFIG.qualityFloor).map((item) => ({ ...item, safeDifferentialScore: calculateSafeDifferentialScore(item) }))
  const ranking = rankDeterministic(candidates, 'edgeScore'), best = ranking.find((item) => item.edgeScore >= DIFFERENTIAL_CONFIG.heroFloor) ?? null
  const safe = rankDeterministic(ranking.filter((item) => item.id !== best?.id && item.edgeScore >= DIFFERENTIAL_CONFIG.heroFloor), 'safeDifferentialScore')[0] ?? null
  const positions = [...new Set(ranking.map((item) => item.position))].map((position) => ({ position, player: ranking.find((item) => item.position === position) })).filter((item) => item.player)
  const positionPrices = Object.groupBy(metrics, (item) => item.position)
  const budget = ranking.filter((item) => item.price <= mean((positionPrices[item.position] ?? []).map((p) => p.price)) && item.valueScore >= 60).sort((a, b) => b.valueScore - a.valueScore || b.edgeScore - a.edgeScore)[0] ?? null
  const clubs = Object.entries(Object.groupBy(ranking.filter((item) => item.edgeScore >= 60), (item) => item.club)).map(([club, players]) => ({ club, count: players.length, averageOwnership: round(mean(players.map((p) => p.ownership))), averageEdge: round(mean(players.map((p) => p.edgeScore))), players })).filter((item) => item.count >= 2).sort((a, b) => b.count - a.count || b.averageEdge - a.averageEdge)
  const result = { ...context, threshold, ranking, heroes: { best, safe, budget }, positions, clubs, matrix: ranking.map((item) => ({ id: item.id, name: item.name, club: item.club, position: item.position, x: item.ownership, y: item.expectedPoints, size: item.price, fixture: item.fixtureScore, edge: item.edgeScore })) }
  if (!options.players) cache.set(key, result)
  return result
}

export function clearDifferentialCache() { cache.clear() }
