function round(value, digits = 2) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const factor = 10 ** digits
  return Math.round((number + Number.EPSILON) * factor) / factor
}

function transferSignature(timeline = []) {
  return timeline.flatMap((entry) => (entry.action?.transferPairs ?? []).map((pair) => ({
    round: entry.round,
    playerOutId: pair.playerOut?.id ?? null,
    playerInId: pair.playerIn?.id ?? null,
  })))
}

function chipSchedule(timeline = []) {
  return timeline.filter((entry) => entry.chip?.used).map((entry) => ({
    chipId: entry.chip.id,
    round: entry.round,
    incrementalPoints: round(entry.chip.incrementalPoints),
  }))
}

function finiteOrNull(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? round(number) : null
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return Number.isInteger(leftStart) && Number.isInteger(leftEnd) &&
    Math.max(leftStart, rightStart) <= Math.min(leftEnd, rightEnd)
}

export function createExecutedChipAnalysis({
  opportunity,
  seasonPlan,
  counterfactualPlan = null,
  counterfactualChipId = null,
} = {}) {
  if (!opportunity || opportunity.mode === 'disabled') return opportunity
  const globalSchedule = chipSchedule(seasonPlan?.timeline)
  const plannerStart = Number(seasonPlan?.period?.startRound)
  const plannerEnd = Number(seasonPlan?.period?.endRound)
  const fullSeasonEvaluated = plannerStart === 1 && plannerEnd === 34
  const counterfactualSchedule = chipSchedule(counterfactualPlan?.timeline)
  const comparisons = []
  const periods = (opportunity.periods ?? []).map((period) => {
    const overlapStart = Math.max(plannerStart, Number(period.startRound))
    const overlapEnd = Math.min(plannerEnd, Number(period.endRound))
    const overlapsPlannerHorizon = rangesOverlap(Number(period.startRound), Number(period.endRound), plannerStart, plannerEnd)
    const scanOnly = Number(period.analysisEndRound) > overlapEnd || Number(period.analysisStartRound) < overlapStart
    return {
    ...period,
    plannerRange: overlapsPlannerHorizon ? { startRound: overlapStart, endRound: overlapEnd } : null,
    overlapsPlannerHorizon,
    fullySimulated: overlapsPlannerHorizon,
    scanOnly,
    visibleInPrimaryResult: overlapsPlannerHorizon,
    recommendations: (period.recommendations ?? []).map((entry) => {
      const selected = entry.recommended
      const localRound = Number(entry.localRecommendation?.round ?? selected?.round)
      const local = Number.isInteger(localRound) ? {
        round: localRound,
        netValue: finiteOrNull(entry.localRecommendation?.localValue ?? selected?.netValue),
      } : null
      const global = globalSchedule.find((item) => item.chipId === entry.chipId && item.round >= period.startRound && item.round <= period.endRound)
      const counterfactualExecuted = counterfactualChipId === entry.chipId && counterfactualPlan?.valid
      const comparison = local && global ? {
        chipId: entry.chipId,
        periodId: period.id,
        localRecommendation: { round: local.round, localChipValue: finiteOrNull(local.netValue) },
        globalRecommendation: { round: global.round, globalChipValue: finiteOrNull(global.incrementalPoints) },
        fullPathScore: finiteOrNull(seasonPlan?.summary?.terminalScore),
        counterfactualPathScore: counterfactualExecuted ? finiteOrNull(counterfactualPlan.summary?.terminalScore) : null,
        strategyDifference: counterfactualExecuted
          ? round(Number(seasonPlan?.summary?.terminalScore) - Number(counterfactualPlan.summary?.terminalScore))
          : null,
        affectedChipSchedule: counterfactualExecuted ? { global: globalSchedule, counterfactual: counterfactualSchedule } : null,
        affectedTransfers: counterfactualExecuted ? {
          global: transferSignature(seasonPlan.timeline),
          counterfactual: transferSignature(counterfactualPlan.timeline),
        } : null,
        whyLocalWins: `Speelronde ${local.round} heeft de hoogste afzonderlijk gemeten ${entry.label}-opportunity binnen het onderzochte venster.`,
        whyGlobalWins: counterfactualExecuted
          ? `De volledige gesimuleerde combinatie eindigt ${Math.abs(round(Number(seasonPlan?.summary?.terminalScore) - Number(counterfactualPlan.summary?.terminalScore)))} punt(en) ${Number(seasonPlan?.summary?.terminalScore) >= Number(counterfactualPlan.summary?.terminalScore) ? 'hoger' : 'lager'} dan het pad waarin de lokale ronde is vastgezet.`
          : null,
        counterfactualExecuted,
      } : null
      if (comparison) comparisons.push(comparison)
      const localInsidePlanner = local && local.round >= plannerStart && local.round <= plannerEnd
      const executionStatus = global
        ? 'executed-in-season-planner'
        : !overlapsPlannerHorizon
          ? 'outside-planner-horizon'
          : localInsidePlanner
            ? 'not-selected'
            : local
              ? 'scan-only'
              : 'not-evaluated'
      const evaluationScope = global
        ? 'full-planner-path'
        : counterfactualExecuted
          ? 'counterfactual-path'
          : localInsidePlanner
            ? 'opportunity-scan'
            : local
              ? 'outside-horizon'
              : 'not-evaluated'
      return {
        ...entry,
        localRecommendation: local ? {
  round: local.round,
  localValue: finiteOrNull(local.netValue),

  executed: false,
  displayOnly: true,
  recommendationType: 'local-opportunity',
} : null,
        globalRecommendation: global ? {

  executed: true,
  displayOnly: false,
  recommendationType: 'season-planner',

          round: global.round,
          ...(entry.chipId !== 'wildcard'
  ? {
      globalValue:
        finiteOrNull(
          global.incrementalPoints,
        ),
    }
  : {}),

valueSemantics:
  entry.chipId === 'wildcard'
    ? 'embedded-in-squad-path'
    : 'direct-chip-increment',
        } : null,
        executionStatus,
        evaluationScope,
        visibleInPrimaryResult:
  overlapsPlannerHorizon &&
  entry.available !== false,
        strategyComparison: comparison,
      }
    }),
  }} )
  return {
    ...opportunity,
    warnings: [
      ...(opportunity.warnings ?? []).filter((warning) => !warning.includes('nog niet samen met alle transfers')),
      fullSeasonEvaluated
        ? 'De zichtbare globale chipmomenten zijn uitgevoerd in het volledige Season Planner-pad.'
        : 'Chips binnen de gekozen plannerhorizon zijn samen met transfers uitgevoerd. Ronden daarbuiten blijven alleen een opportunity-scan.',
    ],
    executionStatus: 'executed-with-season-planner',
    scheduleType: 'beam-search-executed-path',
    periods,
    globalSchedule,
    comparisons,
    horizon: {
      plannerHorizon: { startRound: plannerStart, endRound: plannerEnd },
      opportunityScanHorizon: opportunity.periods?.map((period) => ({ startRound: period.analysisStartRound, endRound: period.analysisEndRound })) ?? [],
      chipOpportunityHorizon: opportunity.periods?.map((period) => ({ startRound: period.analysisStartRound, endRound: period.analysisEndRound })) ?? [],
      counterfactualHorizon: counterfactualPlan ? { startRound: plannerStart, endRound: plannerEnd } : null,
      fullSeasonEvaluated,
      scanOnlyRounds: (opportunity.periods ?? []).flatMap((period) => {
        const start = Math.max(period.analysisStartRound, plannerEnd + 1)
        return start <= period.analysisEndRound
          ? Array.from({ length: period.analysisEndRound - start + 1 }, (_, index) => start + index)
          : []
      }),
    },
  }
}

export default createExecutedChipAnalysis
