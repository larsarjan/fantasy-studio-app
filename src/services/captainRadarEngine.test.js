import assert from 'node:assert/strict'
import { calculateCaptainRadarScore, calculateSafeCaptainScore, compareCaptainCandidates, getCaptainRadarDefaultRound, resolveCaptainRoundProjection, selectCaptainRecommendations } from './captainRadarEngine.js'

const score = (overrides = {}) => calculateCaptainRadarScore({ fixtureCount: 1, expectedPoints: 7, expectedMinutes: 90, fixtureScore: 7, formScore: 7, captainScore: 75, upsideScore: 75, reliabilityScore: 85, ...overrides })
assert.ok(score({ expectedMinutes: 90 }).score > score({ expectedMinutes: 45 }).score, '90 minuten moet hoger scoren dan 45')
assert.ok(score({ fixtureScore: 9 }).score > score({ fixtureScore: 3 }).score, 'sterke fixture moet score verhogen')
assert.equal(score({ fixtureCount: 0 }).score, 0, 'blank scoort nul')
assert.ok(score({ fixtureCount: 2, expectedPoints: 14, expectedMinutes: 170 }).score > score({ expectedPoints: 7, expectedMinutes: 85 }).score, 'DGW telt beide fixtures mee')
assert.ok(Object.values(score().breakdown).every((item) => item.score >= 0 && item.score <= 100), 'componenten blijven begrensd')
assert.ok(score({ expectedPoints: null, expectedMinutes: undefined, captainScore: NaN }).score >= 0, 'ontbrekende data geeft geen NaN')
assert.ok(Math.abs(Object.values(score().breakdown).reduce((sum, item) => sum + item.contribution, 0) - score().score) < .1, 'breakdown telt op')

const candidate = (id, overrides = {}) => ({ id, radarScore: 75, expectedPoints: 7, expectedMinutes: 90, fixtureCount: 1, fixtureScore: 7.5, formScore: 7.5, captainScore: 75, selectedPct: 5, reliabilityScore: 80, currentPrice: 10, breakdown: { expectedPoints: { score: 78 }, availability: { score: 100 } }, ...overrides })
const pool = [candidate('risk', { radarScore: 82, expectedMinutes: 50, reliabilityScore: 35 }), candidate('safe', { radarScore: 78, reliabilityScore: 98 }), candidate('owned', { radarScore: 90, selectedPct: 25 }), candidate('blank', { radarScore: 100, fixtureCount: 0 })]
const advice = selectCaptainRecommendations(pool)
assert.notEqual(advice.bestCaptain?.id, 'blank', 'blank is nooit beste captain')
assert.equal(advice.safestCaptain?.id, 'safe', 'veiligste prioriteert minuten en betrouwbaarheid')
assert.notEqual(advice.safestCaptain?.id, advice.bestCaptain?.id, 'beste captain is nooit tevens veiligste alternatief')
assert.ok(advice.differentialCaptain?.selectedPct <= 10, 'differential respecteert grens')
assert.ok(advice.viceCaptain && advice.viceCaptain.id !== advice.bestCaptain.id, 'vice heeft geldige fallback')
assert.deepEqual([...pool].sort(compareCaptainCandidates).map((item) => item.id), [...pool].sort(compareCaptainCandidates).map((item) => item.id), 'ranking is deterministisch')

const higherRadarRisk = candidate('higher-radar-risk', { radarScore: 91, expectedPoints: 9, expectedMinutes: 62, reliabilityScore: 48, breakdown: { expectedPoints: { score: 100 }, availability: { score: 55 } } })
const lowerXpSafe = candidate('lower-xp-safe', { radarScore: 84, expectedPoints: 7.4, expectedMinutes: 90, reliabilityScore: 96, breakdown: { expectedPoints: { score: 82 }, availability: { score: 100 } } })
const independentAdvice = selectCaptainRecommendations([higherRadarRisk, lowerXpSafe])
assert.equal(independentAdvice.bestCaptain.id, 'higher-radar-risk', 'hogere Radar Score blijft beste captain')
assert.equal(independentAdvice.safestCaptain.id, 'lower-xp-safe', 'iets lagere xP met 90 minuten en hoge betrouwbaarheid kan veiligste winnen')
assert.ok(calculateSafeCaptainScore(lowerXpSafe).score > calculateSafeCaptainScore(higherRadarRisk).score, 'SafeCaptainScore werkt onafhankelijk van Radar Score')

const dominant = candidate('dominant', { radarScore: 94, expectedPoints: 9, reliabilityScore: 98, breakdown: { expectedPoints: { score: 100 }, availability: { score: 100 } } })
const runnerUp = candidate('runner-up', { radarScore: 82, expectedPoints: 7, reliabilityScore: 82, breakdown: { expectedPoints: { score: 78 }, availability: { score: 88 } } })
const sharedWinnerAdvice = selectCaptainRecommendations([dominant, runnerUp])
assert.equal(sharedWinnerAdvice.bestCaptain.id, 'dominant', 'dominante speler wint Radar-ranking')
assert.equal(sharedWinnerAdvice.safestCaptain.id, 'runner-up', 'hoogste SafeCaptainScore na uitsluiting van beste captain wordt gekozen')

const singleCandidateAdvice = selectCaptainRecommendations([dominant])
assert.equal(singleCandidateAdvice.safestCaptain, null, 'één geldige captainkandidaat levert geen veilig alternatief op')

const fixtures = [1, 2, 3].flatMap((round) => [{ season: 'S', round, home: `H${round}a`, away: `A${round}a` }, { season: 'S', round, home: `H${round}b`, away: `A${round}b` }])
const result = (fixture) => ({ season: fixture.season, home: fixture.home, away: fixture.away })
assert.equal(getCaptainRadarDefaultRound('S', fixtures, fixtures.filter((fixture) => fixture.round < 3).map(result)), 3, 'na volledig afgeronde ronde 2 opent ronde 3')
assert.equal(getCaptainRadarDefaultRound('S', fixtures, [result(fixtures[0])]), 1, 'gedeeltelijk gespeelde ronde blijft actief')
assert.equal(getCaptainRadarDefaultRound('S', fixtures, fixtures.map(result)), 3, 'na seizoenseinde blijft laatste ronde actief')

const starterWithRounds = {
  expectedMinutes: 5,
  expectedPointsProjection: {
    rounds: [
      { round: 1, type: 'single', fixtureCount: 1, expectedPoints: 5.8, expectedMinutes: 86, appearanceProbability: .96 },
      { round: 2, type: 'single', fixtureCount: 1, expectedPoints: 6.1, expectedMinutes: 88, appearanceProbability: .98 },
      { round: 3, type: 'single', fixtureCount: 1, expectedPoints: 6.4, expectedMinutes: 90, appearanceProbability: 1 },
    ],
  },
}
assert.equal(resolveCaptainRoundProjection(starterWithRounds, 1).expectedMinutes, 86, 'SR1 gebruikt de expliciete rondeprojectie')
assert.equal(resolveCaptainRoundProjection(starterWithRounds, '2').expectedMinutes, 88, 'numerieke string SR2 matcht op gameweeknummer')
const sr3Projection = resolveCaptainRoundProjection(starterWithRounds, 'Speelronde 3')
assert.equal(sr3Projection.expectedMinutes, 90, 'valide basisspeler in SR3 valt niet terug naar generieke 5 minuten')
assert.equal(sr3Projection.expectedPoints, 6.4, 'SR3 gebruikt xP uit dezelfde canonieke rondeprojectie')
assert.equal(sr3Projection.projectionSource, 'database-precompute', 'vooraf berekende databaseprojectie heeft voorrang')
console.log('Captain Radar Engine: 28 controles geslaagd.')
