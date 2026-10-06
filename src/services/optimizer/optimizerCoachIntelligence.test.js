import assert from 'node:assert/strict'
import { createManagerCoachAnalysis } from './optimizerCoachIntelligence.js'

const player = (id, name, expectedPoints = 5) => ({ id, name, expectedPoints })
const baseTimeline = [
  {
    round: 1,
    action: { actionType: 'no-transfer', transfersMade: 0, transferPairs: [] },
    points: { expectedPoints: 55, netExpectedPoints: 55, transferPointsCost: 0 },
    transfers: { freeTransfersBefore: 1, nextFreeTransfers: 2 },
    finance: { bankChange: 0 }, changes: { squadChanged: false },
    lineup: { captain: player('c', 'Captain', 8), viceCaptain: player('v', 'Vice', 6) }, chip: null,
  },
  {
    round: 2,
    action: { actionType: 'double-transfer', transfersMade: 2, transferPairs: [{ playerOut: player('o1', 'Uit 1'), playerIn: player('i1', 'In 1') }, { playerOut: player('o2', 'Uit 2'), playerIn: player('i2', 'In 2') }] },
    points: { expectedPoints: 62, netExpectedPoints: 58, transferPointsCost: 4 },
    transfers: { freeTransfersBefore: 1, nextFreeTransfers: 1 },
    finance: { bankChange: -1 }, changes: { squadChanged: true },
    lineup: { captain: player('c', 'Captain', 9), viceCaptain: player('v', 'Vice', 7) }, chip: null,
  },
]

const managerAnalysis = {
  teamScore: { value: 8, coverage: { level: 'high' } },
  strengths: [{ key: 'xp', title: 'Sterke basis', text: 'De basis projecteert 55 xP.', severity: 'positive', evidence: [{ label: 'xP', value: '55' }] }],
  weaknesses: [], risk: [],
}
const seasonPlan = { valid: true, period: { startRound: 1, endRound: 5 }, timeline: baseTimeline, summary: { terminalScore: 120, totalExpectedPoints: 117, totalTransferPointsCost: 4, totalChipIncrementalPoints: 0, terminalFreeTransfers: 1 } }

const differingChips = {
  mode: 'automatic', globalSchedule: [{ chipId: 'wildcard', round: 4 }],
  periods: [{ id: 'period-1', visibleInPrimaryResult: true, recommendations: [{ chipId: 'wildcard', label: 'Wildcard', visibleInPrimaryResult: true, localRecommendation: { round: 3, localValue: 10 }, globalRecommendation: { round: 4 }, executionStatus: 'executed-in-season-planner', evaluationScope: 'full-planner-path', localOpportunity: { confidence: 'high' } }] }],
  comparisons: [{
    chipId: 'wildcard', periodId: 'period-1', localRecommendation: { round: 3, localChipValue: 10 }, globalRecommendation: { round: 4, globalChipValue: null }, fullPathScore: 120, counterfactualPathScore: 114, strategyDifference: 6, counterfactualExecuted: true,
    affectedChipSchedule: { global: [{ chipId: 'wildcard', round: 4 }], counterfactual: [{ chipId: 'wildcard', round: 3 }] },
    affectedTransfers: { global: [{ round: 2, playerOutId: 'o1', playerInId: 'i1' }], counterfactual: [] },
  }],
}

const differing = createManagerCoachAnalysis({ request: { period: { startRound: 1, roundCount: 5 } }, seasonPlan, chipExecutionAnalysis: differingChips, managerAnalysis })
assert.equal(differing.version, 'coach-intelligence-v1')
assert.equal(differing.keyDecision.type, 'chip')
assert.equal(differing.keyDecision.localChoice.round, 3)
assert.equal(differing.keyDecision.globalChoice.round, 4)
assert.equal(differing.keyDecision.counterfactual.difference, 6)
assert.equal(differing.headline.summary.includes('6 punten'), true)
assert.equal(differing.scope.fullSeasonEvaluated, false)
assert.equal(differing.caveats.some((item) => item.includes('speelronde 1 tot en met 5')), true)
assert.equal(differing.transferNarrative[0].transferCost, 4)
assert.equal(differing.transferNarrative[0].netExpectedPoints, 58)
assert.equal(differing.roundNarrative.some((item) => item.action === 'no-transfer'), true)
assert.equal(differing.priorities.length <= 3, true)
assert.doesNotThrow(() => structuredClone(differing))
assert.equal(differing.diagnostics.payloadBytes < 50_000, true)
assert.equal(JSON.stringify(differing).includes('expectedPointsProjection'), false)

const sameChips = structuredClone(differingChips)
sameChips.comparisons[0].localRecommendation.round = 4
sameChips.comparisons[0].counterfactualExecuted = false
sameChips.comparisons[0].strategyDifference = null
const same = createManagerCoachAnalysis({ seasonPlan, chipExecutionAnalysis: sameChips, managerAnalysis })
assert.equal(same.keyDecision.conclusion.short.includes('beide SR4'), true)
assert.equal(same.keyDecision.counterfactual.available, false)

const noCounterfactual = structuredClone(differingChips)
noCounterfactual.comparisons[0].counterfactualExecuted = false
noCounterfactual.comparisons[0].strategyDifference = null
const honest = createManagerCoachAnalysis({ seasonPlan, chipExecutionAnalysis: noCounterfactual, managerAnalysis })
assert.equal(honest.keyDecision.conclusion.explanation.includes('geen exact totaalverschil'), true)
assert.equal(honest.keyDecision.conclusion.explanation.includes('6 punten'), false)

const waiting = createManagerCoachAnalysis({ seasonPlan: { ...seasonPlan, timeline: [baseTimeline[0]] }, managerAnalysis })
assert.equal(waiting.keyDecision.type, 'wait')
assert.equal(waiting.keyDecision.evidence[0].value, 2)

const insufficient = createManagerCoachAnalysis({ seasonPlan: { valid: true, period: { startRound: 1, endRound: 5 }, timeline: [], summary: {} }, managerAnalysis: { teamScore: { coverage: { level: 'low' } } } })
assert.equal(insufficient.headline.confidence, 'low')
assert.equal(JSON.stringify(insufficient).includes('undefined'), false)

const preseason = createManagerCoachAnalysis({ seasonPlan, managerAnalysis, preseason: { valid: true, changesMade: 11 } })
assert.equal(preseason.preseason.transferPointsCost, 0)
assert.equal(preseason.preseason.freeTransfersUsed, 0)
assert.equal(preseason.preseason.headline.includes('11'), true)

const fullSeason = createManagerCoachAnalysis({ seasonPlan: { ...seasonPlan, period: { startRound: 1, endRound: 34 } }, managerAnalysis })
assert.equal(fullSeason.scope.fullSeasonEvaluated, true)
assert.equal(fullSeason.caveats.some((item) => item.includes('uitsluitend')), false)
assert.equal(differing.diagnostics.runtimeMs < 100, true)

console.log('optimizerCoachIntelligence tests: OK')
