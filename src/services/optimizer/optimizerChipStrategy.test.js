import assert from 'node:assert/strict'
import {
  CHIP_IDS,
  canonicalizeChipState,
  consumeChip,
  createInitialChipState,
  evaluateChipStrategy,
  getRemainingChipUses,
  normalizeChipId,
  normalizeChipStrategy,
  validateChipStrategy,
} from './optimizerChipStrategy.js'
import { createManagerOptimizerRequest } from './managerOptimizerRequest.js'
import { planSeason } from './optimizerSeasonPlanner.js'
import { createSeasonPlanTimeline } from './optimizerSeasonTimeline.js'

function player(position, index) {
  return {
    id: `player-${index}`,
    name: `Speler ${index}`,
    club: `Club ${index % 5}`,
    fantasyPosition: position,
    currentPrice: 5,
    expectedPointsProjection: {
      rounds: Array.from({ length: 34 }, (_, roundIndex) => ({
        round: roundIndex + 1,
        expectedPoints: position === 'forward' && roundIndex === 8
          ? 10 - index / 100
          : 4 + ((roundIndex + index) % 4),
        expectedMinutes: 90,
        appearanceProbability: 1,
        fixtureCount: roundIndex === 8 ? 2 : 1,
        type: roundIndex === 8 ? 'double' : 'normal',
      })),
    },
  }
}

const positions = [
  ...Array(2).fill('goalkeeper'),
  ...Array(5).fill('defender'),
  ...Array(5).fill('midfielder'),
  ...Array(3).fill('forward'),
]
const squad = positions.map(player)

assert.equal(normalizeChipId('sugarDaddy'), 'sugar-daddy')
assert.equal(normalizeChipId('dynamicDuo'), 'dynamic-duo')
assert.equal(normalizeChipId('captainBoost'), null)

const initial = createInitialChipState()
assert.deepEqual(Object.keys(initial.usedRounds), CHIP_IDS)
const consumed = consumeChip(initial, 'wildcard', 4)
assert.equal(consumed.valid, true)
assert.equal(getRemainingChipUses(consumed.state, 'wildcard', 10), 0)
assert.equal(getRemainingChipUses(consumed.state, 'wildcard', 20), 1)
assert.deepEqual(canonicalizeChipState(consumed.state), consumed.state)

const conflict = validateChipStrategy({
  mode: 'manual',
  schedule: [
    { chipId: 'wildcard', round: 4 },
    { chipId: 'attacking', round: 4 },
  ],
})
assert.equal(conflict.valid, false)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'captainBoost', round: 5 }] }).valid, false)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'wildcard', round: '' }] }).valid, false)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'wildcard', round: 'abc' }] }).valid, false)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'wildcard', round: 0 }] }).valid, false)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'wildcard', round: 35 }] }).valid, false)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'wildcard', round: 4.5 }] }).valid, false)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'sugarDaddy', round: 4 }, { chipId: 'sugar-daddy', round: 8 }] }).valid, false)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [] }).valid, true)

const periodSchedule = normalizeChipStrategy({
  mode: 'manual',
  schedule: [
    { chipId: 'wildcard', round: 7 },
    { chipId: 'attacking', periodId: 'period-1', decision: 'skip', round: null },
    { chipId: 'attacking', periodId: 'period-2', decision: 'scheduled', round: 29 },
    { chipId: 'dynamicDuo', periodId: 'period-1', decision: 'scheduled', round: 16 },
  ],
})
assert.equal(periodSchedule.schedule.length, 8)
assert.deepEqual(periodSchedule.schedule.find((entry) => entry.chipId === 'wildcard' && entry.periodId === 'period-1'), { chipId: 'wildcard', periodId: 'period-1', round: 7, decision: 'scheduled' })
assert.equal(periodSchedule.schedule.find((entry) => entry.chipId === 'wildcard' && entry.periodId === 'period-2').decision, 'undecided')
assert.equal(periodSchedule.schedule.find((entry) => entry.chipId === 'attacking' && entry.periodId === 'period-1').decision, 'skip')
assert.equal(validateChipStrategy({ mode: 'manual', schedule: periodSchedule.schedule }).valid, true)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'wildcard', periodId: 'period-1', decision: 'scheduled', round: 18 }] }).valid, false)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'wildcard', periodId: 'period-1', decision: 'undecided', round: null }] }).valid, true)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'wildcard', periodId: 'period-1', decision: 'skip', round: null }] }).valid, true)
assert.equal(validateChipStrategy({ mode: 'manual', schedule: [{ chipId: 'sugarDaddy', round: 7 }, { chipId: 'sugar-daddy', periodId: 'period-1', decision: 'scheduled', round: 8 }] }).valid, false)

const disabled = evaluateChipStrategy({ strategy: { mode: 'disabled' } })
assert.equal(disabled.valid, true)
assert.deepEqual(disabled.seasonSchedule, [])

const automatic = evaluateChipStrategy({
  squad,
  playerPool: squad,
  startRound: 1,
  roundCount: 10,
  strategy: { mode: 'automatic' },
})
assert.equal(automatic.valid, true)
assert.equal(automatic.periods.length, 2)
assert.equal(automatic.seasonSchedule.length, 8)
for (const period of automatic.periods) {
  const rounds = automatic.seasonSchedule
    .filter((entry) => entry.periodId === period.id)
    .map((entry) => entry.round)
  assert.equal(new Set(rounds).size, rounds.length)
  assert.equal(period.recommendations.every((entry) => entry.alternatives.length <= 2), true)
}
const attacking = automatic.seasonSchedule.find((entry) => entry.chipId === 'attacking' && entry.periodId === 'period-1')
assert.equal(attacking.round, 9)
const duoRecommendation = automatic.periods[0].recommendations.find((entry) => entry.chipId === 'dynamic-duo').recommended
assert.equal(duoRecommendation.netValue, duoRecommendation.evidence.captain.expectedPoints + duoRecommendation.evidence.viceCaptain.expectedPoints)
assert.equal(duoRecommendation.grossValue, duoRecommendation.netValue)
const wildcardRecommendation = automatic.periods[0].recommendations.find((entry) => entry.chipId === 'wildcard').recommended
assert.equal(wildcardRecommendation.grossValue, wildcardRecommendation.netValue)
assert.equal(wildcardRecommendation.evidence.budgetMode, 'normal')
assert.equal(wildcardRecommendation.evidence.scenarioBudget, 75)

const repeatedAutomatic = evaluateChipStrategy({ squad, playerPool: squad, startRound: 1, roundCount: 10, strategy: { mode: 'automatic' } })
assert.deepEqual(repeatedAutomatic.seasonSchedule, automatic.seasonSchedule)

const usedWildcard = evaluateChipStrategy({
  squad, playerPool: squad, startRound: 1, roundCount: 10,
  state: { usedRounds: { wildcard: [4] } },
  strategy: { mode: 'automatic' },
})
assert.equal(usedWildcard.periods[0].recommendations.find((entry) => entry.chipId === 'wildcard').recommended, null)
assert.notEqual(usedWildcard.periods[1].recommendations.find((entry) => entry.chipId === 'wildcard').recommended, null)

const secondPeriodOnly = evaluateChipStrategy({ squad, playerPool: squad, startRound: 20, roundCount: 3, strategy: { mode: 'automatic' } })
assert.deepEqual(secondPeriodOnly.periods.map((period) => period.id), ['period-2'])
assert.equal(secondPeriodOnly.seasonSchedule.every((entry) => entry.round >= 20), true)

const manual = evaluateChipStrategy({
  squad,
  playerPool: squad,
  startRound: 1,
  roundCount: 3,
  strategy: {
    mode: 'manual',
    allowedChips: CHIP_IDS,
    schedule: [{ chipId: 'wildcard', round: 12 }],
  },
})
assert.equal(manual.valid, true)
assert.equal(manual.periods[0].recommendations.find((entry) => entry.chipId === 'wildcard').recommended.round, 12)
assert.deepEqual(manual.seasonSchedule.map((entry) => [entry.chipId, entry.round]), [['wildcard', 12]])
assert.equal(manual.periods.flatMap((period) => period.recommendations).filter((entry) => entry.chipId !== 'wildcard').every((entry) => entry.recommended === null), true)
assert.equal(manual.periods[0].recommendations.find((entry) => entry.chipId === 'attacking').localRecommendation !== null, true)
assert.equal(manual.periods[0].recommendations.find((entry) => entry.chipId === 'wildcard').alternatives.every((entry) => !Object.hasOwn(entry.evidence, 'squad')), true)
assert.equal(manual.periods[0].recommendations.find((entry) => entry.chipId === 'wildcard').recommended.explanation.includes('hoogste'), false)
assert.equal(manual.warnings.some((warning) => warning.includes('buiten de uitgevoerde Season Planner-horizon')), true)

const zeroRoundSquad = squad.map((source) => ({
  ...source,
  expectedPointsProjection: {
    rounds: source.expectedPointsProjection.rounds.map((projection) => (
      projection.round === 5
        ? { ...projection, expectedPoints: 0, expectedMinutes: 0, appearanceProbability: 0, fixtureCount: 0, type: 'cancelled' }
        : projection
    )),
  },
}))
const cancelled = evaluateChipStrategy({
  squad: zeroRoundSquad,
  playerPool: zeroRoundSquad,
  startRound: 1,
  roundCount: 5,
  strategy: {
    mode: 'manual',
    allowedChips: CHIP_IDS,
    schedule: [{ chipId: 'dynamic-duo', round: 5 }],
  },
})
assert.equal(cancelled.periods[0].recommendations.find((entry) => entry.chipId === 'dynamic-duo').recommended.netValue, 0)
assert.equal(cancelled.periods[0].recommendations.find((entry) => entry.chipId === 'dynamic-duo').recommended.confidence, 'low')

const lowAvailabilitySquad = squad.map((source) => ({
  ...source,
  expectedPointsProjection: {
    rounds: source.expectedPointsProjection.rounds.map((projection) => ({ ...projection, appearanceProbability: 0.2, expectedMinutes: 18 })),
  },
}))
const lowAvailability = evaluateChipStrategy({
  squad: lowAvailabilitySquad, playerPool: lowAvailabilitySquad, startRound: 1, roundCount: 1,
  strategy: { mode: 'manual', allowedChips: CHIP_IDS, schedule: [{ chipId: 'dynamic-duo', round: 1 }] },
})
assert.equal(lowAvailability.periods[0].recommendations.find((entry) => entry.chipId === 'dynamic-duo').recommended.confidence, 'low')

const squadSnapshot = structuredClone(squad)
evaluateChipStrategy({ squad, playerPool: squad, startRound: 1, roundCount: 2, strategy: { mode: 'automatic' } })
assert.deepEqual(squad, squadSnapshot)

const normalPlan = planSeason({ currentSquad: squad, playerPool: squad, startRound: 1, roundCount: 2, maximumRounds: 2, maximumOptionsPerState: 3 })
const disabledPlan = planSeason({ currentSquad: squad, playerPool: squad, startRound: 1, roundCount: 2, maximumRounds: 2, maximumOptionsPerState: 3, chipState: createInitialChipState() })
assert.equal(normalPlan.valid, true)
assert.equal(disabledPlan.valid, true)
assert.equal(normalPlan.initialState.stateKey, disabledPlan.initialState.stateKey)
assert.equal(normalPlan.bestTerminalState.terminalScore, disabledPlan.bestTerminalState.terminalScore)
assert.deepEqual(normalPlan.bestPath.map((state) => state.action.id), disabledPlan.bestPath.map((state) => state.action.id))
assert.deepEqual(createSeasonPlanTimeline({ plannerResult: normalPlan }).timeline, createSeasonPlanTimeline({ plannerResult: disabledPlan }).timeline)
const usedPlan = planSeason({ currentSquad: squad, playerPool: squad, startRound: 1, roundCount: 1, maximumRounds: 1, chipState: consumed.state })
assert.notEqual(normalPlan.initialState.stateKey, usedPlan.initialState.stateKey)

const request = createManagerOptimizerRequest({
  managerTeamState: {
    mode: 'current-team',
    seasonStatus: { phase: 'in-season' },
    chipStrategy: {
      mode: 'manual',
      allowedChips: CHIP_IDS,
      schedule: [{ chipId: 'attacking', round: 9 }],
      state: { usedRounds: { wildcard: [4] } },
    },
  },
})
assert.equal(request.chips.mode, 'manual')
assert.deepEqual(request.chips.schedule, [{ chipId: 'attacking', round: 9 }])
assert.deepEqual(request.chips.state.usedRounds, { wildcard: [4] })
const periodRequest = createManagerOptimizerRequest({
  managerTeamState: {
    mode: 'current-team', seasonStatus: { phase: 'in-season' },
    chipStrategy: { mode: 'manual', allowedChips: CHIP_IDS, schedule: periodSchedule.schedule },
  },
})
assert.deepEqual(periodRequest.chips.schedule, periodSchedule.schedule)
assert.deepEqual(structuredClone(periodRequest.chips.schedule), periodRequest.chips.schedule)

console.log('optimizerChipStrategy tests: OK')
