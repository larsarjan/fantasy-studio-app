import assert from 'node:assert/strict'
import { generatePlannerActions } from './optimizerTransferPlanner.js'
import { simulateSeasonRound } from './optimizerSeasonEngine.js'
import { planSeason } from './optimizerSeasonPlanner.js'
import { generateChipSquadAction } from './optimizerChipActionProvider.js'
import { createInitialChipState, getRemainingChipUses } from './optimizerChipStrategy.js'
import { createSeasonPlanTimeline } from './optimizerSeasonTimeline.js'
import { createExecutedChipAnalysis } from './optimizerChipExecutionAnalysis.js'
import { createUiResult } from '../../workers/managerOptimizer.worker.js'

const positions = [
  ...Array(2).fill('goalkeeper'),
  ...Array(5).fill('defender'),
  ...Array(5).fill('midfielder'),
  ...Array(3).fill('forward'),
]

function player(fantasyPosition, index, variant = 0) {
  return {
    id: `p-${index}-${variant}`,
    name: `Speler ${index}-${variant}`,
    club: `Club ${(index + variant) % 5}`,
    fantasyPosition,
    currentPrice: 5 + variant * 0.1,
    expectedPointsProjection: {
      rounds: Array.from({ length: 34 }, (_, roundIndex) => ({
        round: roundIndex + 1,
        expectedPoints: (fantasyPosition === 'forward' ? 5 + variant : 4 + variant) + (roundIndex === 1 ? 3 : 0),
        expectedMinutes: variant === 5 ? 0 : 90,
        appearanceProbability: variant === 5 ? 0 : 1,
        fixtureCount: roundIndex === 1 ? 2 : 1,
        type: roundIndex === 1 ? 'double' : 'normal',
      })),
    },
  }
}

const pool = positions.flatMap((position, index) => (
  Array.from({ length: 6 }, (_, variant) => player(position, index, variant))
))
const squad = positions.map((_, index) => pool[index * 6])
const state = {
  squad,
  bank: 25,
  freeTransfers: 1,
  purchasePrices: Object.fromEntries(squad.map((entry) => [entry.id, entry.currentPrice])),
  manualSellingPrices: Object.fromEntries(squad.map((entry) => [entry.id, entry.currentPrice])),
  round: 1,
  chipState: createInitialChipState(),
}
const generated = generatePlannerActions({
  currentSquad: squad,
  playerPool: pool,
  bank: state.bank,
  availableFreeTransfers: state.freeTransfers,
  startRound: 1,
  roundCount: 1,
  purchasePrices: state.purchasePrices,
  maximumActions: 3,
})
assert.equal(generated.valid, true)
const noTransfer = generated.result.validOptions.find((option) => option.actionType === 'no-transfer')
assert.ok(noTransfer)

const dynamic = simulateSeasonRound({
  state,
  action: { ...noTransfer, chip: { id: 'dynamic-duo', source: 'manual' } },
})
assert.equal(dynamic.valid, true)
const captainXp = Number(noTransfer.lineup.captain.expectedPoints)
const viceXp = Number(noTransfer.lineup.viceCaptain.expectedPoints)
assert.equal(dynamic.chipIncrementalPoints, captainXp + viceXp)
assert.equal(dynamic.expectedPoints, noTransfer.lineup.expectedPoints + captainXp + viceXp)
assert.equal(getRemainingChipUses(dynamic.stateAfter.chipState, 'dynamic-duo', 1), 0)
assert.equal(getRemainingChipUses(dynamic.stateAfter.chipState, 'dynamic-duo', 18), 1)
const round2Options = generatePlannerActions({
  currentSquad: squad, playerPool: pool, bank: dynamic.stateAfter.bank,
  availableFreeTransfers: dynamic.stateAfter.freeTransfers, startRound: 2, roundCount: 1,
  purchasePrices: dynamic.stateAfter.purchasePrices, maximumActions: 2,
})
const round2NoTransfer = round2Options.result.validOptions.find((option) => option.actionType === 'no-transfer')
const duplicateDynamic = simulateSeasonRound({
  state: dynamic.stateAfter,
  action: { ...round2NoTransfer, chip: { id: 'dynamic-duo', source: 'manual' } },
})
assert.equal(duplicateDynamic.valid, false)
const round18State = { ...dynamic.stateAfter, round: 18 }
const round18Options = generatePlannerActions({
  currentSquad: squad, playerPool: pool, bank: round18State.bank,
  availableFreeTransfers: round18State.freeTransfers, startRound: 18, roundCount: 1,
  purchasePrices: round18State.purchasePrices, maximumActions: 2,
})
const round18NoTransfer = round18Options.result.validOptions.find((option) => option.actionType === 'no-transfer')
const secondPeriodDynamic = simulateSeasonRound({
  state: round18State,
  action: { ...round18NoTransfer, chip: { id: 'dynamic-duo', source: 'manual' } },
})
assert.equal(secondPeriodDynamic.valid, true)
const postponedSquad = squad.map((entry) => ({
  ...entry,
  expectedPointsProjection: {
    rounds: entry.expectedPointsProjection.rounds.map((projection) => (
      projection.round === 3 ? { ...projection, expectedPoints: 20, type: 'postponed' } : projection
    )),
  },
}))
const postponedOptions = generatePlannerActions({
  currentSquad: postponedSquad, playerPool: postponedSquad, bank: 25,
  availableFreeTransfers: 1, startRound: 3, roundCount: 1,
  purchasePrices: Object.fromEntries(postponedSquad.map((entry) => [entry.id, entry.currentPrice])), maximumActions: 2,
})
const postponedNoTransfer = postponedOptions.result.validOptions.find((option) => option.actionType === 'no-transfer')
const postponedDynamic = simulateSeasonRound({
  state: { ...state, squad: postponedSquad, round: 3 },
  action: { ...postponedNoTransfer, chip: { id: 'dynamic-duo', source: 'manual' } },
})
assert.equal(postponedDynamic.valid, true)
assert.equal(postponedDynamic.chipIncrementalPoints, 0)

const attacking = simulateSeasonRound({
  state,
  action: { ...noTransfer, chip: { id: 'attacking', source: 'manual' } },
})
const threeForwardXp = squad.filter((entry) => entry.fantasyPosition === 'forward').reduce((sum) => sum + 5, 0)
assert.equal(attacking.valid, true)
assert.equal(attacking.chipIncrementalPoints, threeForwardXp - noTransfer.lineup.captainBonus)
assert.equal(attacking.expectedPoints, noTransfer.lineup.expectedPoints + threeForwardXp - noTransfer.lineup.captainBonus)
assert.equal(attacking.chip.effects.forwards.length, 3)

const wildcardAction = generateChipSquadAction({
  chipId: 'wildcard', source: 'manual', state, playerPool: pool, horizon: 3,
  hardRules: { lockedPlayerIds: [squad[0].id], bannedPlayerIds: [pool[5].id] },
})
assert.ok(wildcardAction)
assert.equal(wildcardAction.persistentSquad.some((entry) => entry.id === squad[0].id), true)
assert.equal(wildcardAction.persistentSquad.some((entry) => entry.id === pool[5].id), false)
assert.equal(wildcardAction.bankAfter >= 0, true)
const wildcard = simulateSeasonRound({ state, action: wildcardAction })
assert.equal(wildcard.valid, true)
assert.deepEqual(wildcard.stateAfter.squad.map((entry) => entry.id), wildcardAction.persistentSquad.map((entry) => entry.id))
assert.equal(wildcard.transferPointsCost, 0)
assert.equal(wildcard.stateAfter.freeTransfers, state.freeTransfers)
assert.equal(Object.keys(wildcard.stateAfter.purchasePrices).length, 15)
const retainedWildcardIds = new Set(wildcard.stateAfter.squad.map((entry) => entry.id))
assert.deepEqual(Object.keys(wildcard.stateAfter.manualSellingPrices).sort(), squad.map((entry) => entry.id).filter((id) => retainedWildcardIds.has(id)).sort())

const sugarAction = generateChipSquadAction({
  chipId: 'sugar-daddy', source: 'manual', state, playerPool: pool,
})
assert.ok(sugarAction)
const sugar = simulateSeasonRound({ state, action: sugarAction })
assert.equal(sugar.valid, true)
assert.deepEqual(sugar.stateAfter.squad.map((entry) => entry.id), state.squad.map((entry) => entry.id))
assert.deepEqual(sugar.stateAfter.purchasePrices, state.purchasePrices)
assert.deepEqual(sugar.stateAfter.manualSellingPrices, state.manualSellingPrices)
assert.equal(sugar.stateAfter.bank, state.bank)
assert.notDeepEqual(sugar.roundSquad.map((entry) => entry.id), state.squad.map((entry) => entry.id))
assert.equal(sugarAction.scenario.unlimitedBudget, true)

const manualPlan = planSeason({
  currentSquad: squad,
  playerPool: pool,
  bank: state.bank,
  availableFreeTransfers: 1,
  startRound: 1,
  roundCount: 2,
  maximumRounds: 2,
  purchasePrices: state.purchasePrices,
  chipState: state.chipState,
  chipStrategy: {
    mode: 'manual',
    allowedChips: ['dynamic-duo'],
    schedule: [{ chipId: 'dynamic-duo', round: 1 }],
  },
  maximumOptionsPerState: 3,
})
assert.equal(manualPlan.valid, true)
assert.equal(manualPlan.result.bestPath[0].action.chip.id, 'dynamic-duo')
assert.equal(manualPlan.result.bestPath[1].action.chip, null)
assert.equal(manualPlan.result.bestTerminalState.cumulativeChipIncrementalPoints > 0, true)
const manualTimeline = createSeasonPlanTimeline({ plannerResult: manualPlan })
assert.equal(manualTimeline.valid, true)
assert.equal(manualTimeline.timeline[0].chip.id, 'dynamic-duo')
assert.equal(manualTimeline.timeline[0].points.chipIncrementalPoints > 0, true)
assert.equal(manualTimeline.timeline[0].points.expectedPoints, manualTimeline.timeline[0].points.lineupExpectedPoints + manualTimeline.timeline[0].points.chipIncrementalPoints)
assert.equal(manualTimeline.summary.chipRounds, 1)

const undecidedPlan = planSeason({
  currentSquad: squad, playerPool: pool, bank: state.bank, availableFreeTransfers: 1,
  startRound: 1, roundCount: 2, maximumRounds: 2, purchasePrices: state.purchasePrices,
  chipState: state.chipState, maximumOptionsPerState: 3,
  chipStrategy: {
    mode: 'manual', allowedChips: ['dynamic-duo'],
    schedule: [
      { chipId: 'dynamic-duo', periodId: 'period-1', round: null, decision: 'undecided' },
      { chipId: 'dynamic-duo', periodId: 'period-2', round: null, decision: 'skip' },
    ],
  },
})
assert.equal(undecidedPlan.valid, true)
assert.equal(undecidedPlan.result.bestPath.every((entry) => !entry.action.chip), true)

const wildcardPlan = planSeason({
  currentSquad: squad, playerPool: pool, bank: state.bank, availableFreeTransfers: 1,
  startRound: 1, roundCount: 1, maximumRounds: 1, purchasePrices: state.purchasePrices,
  manualSellingPrices: state.manualSellingPrices, chipState: state.chipState,
  chipStrategy: { mode: 'manual', allowedChips: ['wildcard'], schedule: [{ chipId: 'wildcard', round: 1 }] },
  maximumOptionsPerState: 2,
})
assert.equal(wildcardPlan.valid, true)
const wildcardTimeline = createSeasonPlanTimeline({ plannerResult: wildcardPlan })
assert.equal(wildcardTimeline.valid, true)
assert.equal(wildcardTimeline.timeline[0].chip.id, 'wildcard')
assert.equal(wildcardTimeline.timeline[0].action.transfersMade > 2, true)
assert.equal(wildcardTimeline.timeline[0].points.transferPointsCost, 0)

const opportunity = {
  valid: true,
  mode: 'automatic',
  warnings: [],
  periods: [{
    id: 'period-1', startRound: 1, endRound: 17, analysisStartRound: 1, analysisEndRound: 17,
    recommendations: [{
      chipId: 'dynamic-duo', label: 'Dynamisch Duo', available: true,
      recommended: { round: 1, netValue: 10, confidence: 'high' },
      alternatives: [{ round: 2, netValue: 9, confidence: 'high' }],
    }],
  }],
}
const automaticPlan = planSeason({
  currentSquad: squad, playerPool: pool, bank: state.bank, availableFreeTransfers: 1,
  startRound: 1, roundCount: 2, maximumRounds: 2, purchasePrices: state.purchasePrices,
  chipState: state.chipState,
  chipStrategy: { mode: 'automatic', allowedChips: ['dynamic-duo'], schedule: [] },
  chipOpportunity: opportunity, maximumOptionsPerState: 3,
})
assert.equal(automaticPlan.valid, true)
const automaticTimeline = createSeasonPlanTimeline({ plannerResult: automaticPlan })
assert.equal(automaticTimeline.valid, true)
assert.equal(automaticTimeline.timeline.find((entry) => entry.chip)?.round, 2)
const counterfactualPlanner = planSeason({
  currentSquad: squad, playerPool: pool, bank: state.bank, availableFreeTransfers: 1,
  startRound: 1, roundCount: 2, maximumRounds: 2, purchasePrices: state.purchasePrices,
  chipState: state.chipState,
  chipStrategy: { mode: 'automatic', allowedChips: ['dynamic-duo'], forcedSchedule: [{ chipId: 'dynamic-duo', round: 1 }] },
  chipOpportunity: opportunity, maximumOptionsPerState: 3,
})
const counterfactualTimeline = createSeasonPlanTimeline({ plannerResult: counterfactualPlanner })
assert.equal(counterfactualTimeline.valid, true)
const executedAnalysis = createExecutedChipAnalysis({
  opportunity, seasonPlan: automaticTimeline, counterfactualPlan: counterfactualTimeline, counterfactualChipId: 'dynamic-duo',
})
const globalComparison = executedAnalysis.comparisons[0]
assert.equal(globalComparison.localRecommendation.round, 1)
assert.equal(globalComparison.globalRecommendation.round, 2)
assert.equal(globalComparison.counterfactualExecuted, true)
assert.equal(globalComparison.strategyDifference > 0, true)
assert.notDeepEqual(globalComparison.affectedChipSchedule.global, globalComparison.affectedChipSchedule.counterfactual)

const horizonOpportunity = {
  valid: true, mode: 'automatic', warnings: [],
  periods: [
    { id: 'period-1', startRound: 1, endRound: 17, analysisStartRound: 1, analysisEndRound: 17, recommendations: [{ chipId: 'attacking', label: 'Aanvalluh!', localRecommendation: { round: 5, localValue: 0 }, recommended: { round: 5, netValue: 0 }, alternatives: [] }] },
    { id: 'period-2', startRound: 18, endRound: 34, analysisStartRound: 18, analysisEndRound: 34, recommendations: [{ chipId: 'attacking', label: 'Aanvalluh!', localRecommendation: null, recommended: null, alternatives: [] }] },
  ],
}
const horizonCases = [
  [1, 5, ['period-1']], [1, 17, ['period-1']], [1, 34, ['period-1', 'period-2']],
  [10, 17, ['period-1']], [10, 19, ['period-1', 'period-2']], [20, 24, ['period-2']],
]
horizonCases.forEach(([startRound, endRound, visible]) => {
  const analysis = createExecutedChipAnalysis({
    opportunity: horizonOpportunity,
    seasonPlan: { valid: true, timeline: [], period: { startRound, endRound }, summary: { terminalScore: 0 } },
  })
  assert.deepEqual(analysis.periods.filter((period) => period.visibleInPrimaryResult).map((period) => period.id), visible)
  assert.deepEqual(analysis.horizon.plannerHorizon, { startRound, endRound })
})
const shortHorizon = createExecutedChipAnalysis({ opportunity: horizonOpportunity, seasonPlan: { valid: true, timeline: [], period: { startRound: 1, endRound: 17 }, summary: { terminalScore: 0 } } })
assert.equal(shortHorizon.periods[1].scanOnly, true)
assert.equal(shortHorizon.periods[1].recommendations[0].evaluationScope, 'not-evaluated')
assert.equal(shortHorizon.periods[0].recommendations[0].localRecommendation.localValue, 0)
assert.equal(shortHorizon.periods[1].recommendations[0].localRecommendation, null)
const compactWorkerResult = createUiResult({
  valid: true,
  chipStrategyResult: executedAnalysis,
  transferPlannerResult: { result: { validOptions: [{ large: true }], blockedOptions: [{ large: true }], bestOption: { id: 'x' } } },
  seasonPlannerResult: automaticPlan,
  seasonPlan: automaticTimeline,
})
assert.doesNotThrow(() => structuredClone(compactWorkerResult))
assert.equal('validOptions' in compactWorkerResult.transferPlannerResult.result, false)
assert.equal('squad' in compactWorkerResult.seasonPlannerResult.result.bestTerminalState, false)
assert.deepEqual(compactWorkerResult.seasonPlannerResult.result.bestTerminalState.chipState, automaticPlan.bestTerminalState.chipState)

console.log('optimizerChipExecution tests: OK')
