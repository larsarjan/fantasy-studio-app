/* Pure, deterministic explanation layer. It reads completed optimizer output only. */

export const COACH_INTELLIGENCE_VERSION = 'coach-intelligence-v1'

function finite(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function rounded(value, digits = 1) {
  const number = finite(value)
  if (number === null) return null
  const factor = 10 ** digits
  return Math.round((number + Number.EPSILON) * factor) / factor
}

function playerRef(source) {
  const player = source?.player ?? source
  const id = String(player?.id ?? player?.playerId ?? '').trim() || null
  const name = String(player?.name ?? '').trim() || null
  return id || name ? { playerId: id, playerName: name } : null
}

function confidenceFrom({ managerAnalysis, horizon, keyDecision }) {
  const coverage = managerAnalysis?.teamScore?.coverage?.level
  if (coverage === 'low') return 'low'
  if (keyDecision?.counterfactual?.available && horizon.roundsEvaluated >= 3 && coverage === 'high') return 'high'
  if (coverage === 'high' || coverage === 'medium') return 'medium'
  return 'insufficient-data'
}

function comparisonEvidence(comparison) {
  const evidence = []
  if (comparison?.localRecommendation?.localChipValue !== null && comparison?.localRecommendation?.localChipValue !== undefined) evidence.push({ key: 'local-chip-value', value: rounded(comparison.localRecommendation.localChipValue), unit: 'xP' })
  if (comparison?.globalRecommendation?.globalChipValue !== null && comparison?.globalRecommendation?.globalChipValue !== undefined) evidence.push({ key: 'global-chip-value', value: rounded(comparison.globalRecommendation.globalChipValue), unit: 'xP' })
  if (comparison?.counterfactualExecuted) {
    evidence.push({ key: 'full-path-score', value: rounded(comparison.fullPathScore), unit: 'points' })
    evidence.push({ key: 'counterfactual-path-score', value: rounded(comparison.counterfactualPathScore), unit: 'points' })
    evidence.push({ key: 'strategy-difference', value: rounded(comparison.strategyDifference), unit: 'points' })
  }
  return evidence.filter((item) => item.value !== null)
}

function createChipDecision(chipExecutionAnalysis) {
  const comparisons = (chipExecutionAnalysis?.comparisons ?? []).filter((item) => item.localRecommendation && item.globalRecommendation)
  const differing = comparisons.filter((item) => item.localRecommendation.round !== item.globalRecommendation.round)
  const comparison = [...differing, ...comparisons][0]
  if (!comparison) return null
  const label = chipExecutionAnalysis.periods?.flatMap((period) => period.recommendations ?? []).find((item) => item.chipId === comparison.chipId)?.label ?? comparison.chipId
  const differs = comparison.localRecommendation.round !== comparison.globalRecommendation.round
  const counterfactualAvailable = comparison.counterfactualExecuted === true && finite(comparison.strategyDifference) !== null
  const affectedChips = comparison.affectedChipSchedule?.global ?? []
  const affectedTransfers = comparison.affectedTransfers?.global ?? []
  return {
    type: 'chip',
    decisionType: comparison.chipId,
    round: comparison.globalRecommendation.round,
    title: differs ? `${label} later of eerder spelen dan lokaal optimaal` : `${label}: lokaal en globaal dezelfde ronde`,
    localChoice: { round: comparison.localRecommendation.round, value: rounded(comparison.localRecommendation.localChipValue), label: `Beste losse ${label}` },
    globalChoice: { round: comparison.globalRecommendation.round, value: rounded(comparison.globalRecommendation.globalChipValue), pathScore: rounded(comparison.fullPathScore), label: 'Complete strategie binnen de gekozen horizon' },
    counterfactual: { available: counterfactualAvailable, pathScore: counterfactualAvailable ? rounded(comparison.counterfactualPathScore) : null, difference: counterfactualAvailable ? rounded(comparison.strategyDifference) : null },
    conclusion: {
      short: differs ? `SR${comparison.localRecommendation.round} wint ${label} afzonderlijk. SR${comparison.globalRecommendation.round} wint binnen de strategie.` : `Kansanalyse en complete strategie kiezen beide SR${comparison.globalRecommendation.round}.`,
      explanation: differs
        ? counterfactualAvailable
          ? `Het volledige plannerpad eindigt ${Math.abs(rounded(comparison.strategyDifference))} punten ${comparison.strategyDifference >= 0 ? 'hoger' : 'lager'} dan het doorgerekende lokale vergelijkingspad.`
          : `De planner kiest SR${comparison.globalRecommendation.round}, maar voor deze afwijking is geen volledig vergelijkingspad uitgevoerd. Daarom tonen we geen exact totaalverschil.`
        : 'De losse chipanalyse en het volledige plannerpad ondersteunen dezelfde keuze.',
    },
    affectedDecisions: { chips: affectedChips.slice(0, 4), transfers: affectedTransfers.slice(0, 6), captains: [] },
    evidence: comparisonEvidence(comparison),
  }
}

function transferPairs(entry) {
  return (entry?.action?.transferPairs ?? []).map((pair) => ({
    playerOut: playerRef(pair.playerOut), playerIn: playerRef(pair.playerIn),
  })).filter((pair) => pair.playerOut || pair.playerIn)
}

function createTransferNarrative(timeline = []) {
  return timeline.filter((entry) => Number(entry?.action?.transfersMade) > 0).map((entry) => {
    const cost = finite(entry.points?.transferPointsCost) ?? 0
    const gross = finite(entry.points?.expectedPoints)
    const net = finite(entry.points?.netExpectedPoints)
    const pairs = transferPairs(entry)
    return {
      round: entry.round,
      actionType: entry.action.actionType,
      transfers: pairs,
      transferCost: cost,
      grossExpectedPoints: rounded(gross),
      netExpectedPoints: rounded(net),
      bankChange: rounded(entry.finance?.bankChange),
      headline: `${pairs.map((pair) => `${pair.playerOut?.playerName ?? 'Speler'} naar ${pair.playerIn?.playerName ?? 'speler'}`).join(' en ')}${cost > 0 ? ` voor ${cost} transferpunten` : ''}.`,
      explanation: cost > 0
        ? `De planner accepteert ${cost} transferpunten omdat dit pad na kosten de hoogste gevonden cumulatieve uitkomst heeft.`
        : `Deze wissel past zonder puntenaftrek in de beste gevonden route voor de gekozen horizon.`,
      evidence: [
        gross === null ? null : { key: 'round-expected-points', value: rounded(gross), unit: 'xP' },
        net === null ? null : { key: 'round-net-points', value: rounded(net), unit: 'xP' },
        { key: 'transfer-cost', value: cost, unit: 'points' },
      ].filter(Boolean),
      confidence: gross === null || net === null ? 'low' : 'medium',
    }
  })
}

function createRoundNarrative(timeline = []) {
  let previousCaptain = null
  return timeline.flatMap((entry, index) => {
    const captain = playerRef(entry.lineup?.captain)
    const captainChanged = previousCaptain && captain?.playerId !== previousCaptain.playerId
    previousCaptain = captain
    const important = entry.chip?.used || Number(entry.action?.transfersMade) > 0 || Number(entry.points?.transferPointsCost) > 0 || captainChanged || (entry.action?.actionType === 'no-transfer' && index === 0)
    if (!important) return []
    const noTransfer = entry.action?.actionType === 'no-transfer' && !entry.chip?.used
    const headline = entry.chip?.used
      ? `${entry.chip.label ?? entry.chip.id} als onderdeel van het plannerpad.`
      : noTransfer
        ? `Geen transfer; ${entry.transfers?.nextFreeTransfers > entry.transfers?.freeTransfersBefore ? 'vrije transfer bewaren' : 'huidige selectie behouden'}.`
        : `${entry.action.transfersMade} transfer${entry.action.transfersMade === 1 ? '' : 's'} uitgevoerd.`
    return [{
      round: entry.round,
      action: entry.chip?.used ? 'chip' : entry.action?.actionType,
      headline,
      explanation: noTransfer
        ? `De ronde wordt met ${entry.points?.netExpectedPoints ?? entry.points?.expectedPoints} xP doorgerekend zonder transferkosten.`
        : `Deze beslissing levert ${entry.points?.netExpectedPoints ?? entry.points?.expectedPoints} netto xP in deze ronde binnen het gekozen pad.`,
      evidence: [
        { key: 'net-round-xp', value: rounded(entry.points?.netExpectedPoints), unit: 'xP' },
        { key: 'transfer-cost', value: rounded(entry.points?.transferPointsCost, 0), unit: 'points' },
        { key: 'free-transfers-after', value: finite(entry.transfers?.nextFreeTransfers), unit: 'FT' },
      ].filter((item) => item.value !== null),
      consequence: entry.chip?.used ? 'De chipstate wordt voor deze periode verbruikt.' : entry.changes?.squadChanged ? 'De selectie verandert structureel.' : 'De selectie blijft ongewijzigd.',
    }]
  })
}

function createCaptainNarrative(timeline = []) {
  let previousId = null
  return timeline.flatMap((entry, index) => {
    const captain = playerRef(entry.lineup?.captain)
    const vice = playerRef(entry.lineup?.viceCaptain)
    const changed = captain?.playerId && captain.playerId !== previousId
    previousId = captain?.playerId ?? null
    if (!captain || (!changed && index > 0 && !entry.chip?.used)) return []
    const captainEntry = entry.lineup?.captain
    const viceEntry = entry.lineup?.viceCaptain
    return [{
      round: entry.round,
      captain,
      viceCaptain: vice,
      captainExpectedPoints: rounded(captainEntry?.expectedPoints),
      viceCaptainExpectedPoints: rounded(viceEntry?.expectedPoints),
      expectedPointDifference: finite(captainEntry?.expectedPoints) !== null && finite(viceEntry?.expectedPoints) !== null ? rounded(finite(captainEntry.expectedPoints) - finite(viceEntry.expectedPoints)) : null,
      chipId: entry.chip?.id ?? null,
      explanation: entry.chip?.id === 'dynamic-duo'
        ? `${captain.playerName} en ${vice?.playerName ?? 'de vice-captain'} tellen beide actief mee in Dynamisch Duo.`
        : `${captain.playerName} is captain in het beste plannerpad voor speelronde ${entry.round}.`,
      confidence: finite(captainEntry?.expectedPoints) === null ? 'low' : 'medium',
    }]
  })
}

function createLineupNarrative(timeline = []) {
  return timeline.flatMap((entry) => {
    if (!entry.changes?.formationChanged && !entry.changes?.benchChanged && !(entry.changes?.startersAdded?.length)) return []
    const added = (entry.changes?.startersAdded ?? []).map(playerRef).filter(Boolean).slice(0, 3)
    const removed = (entry.changes?.startersRemoved ?? []).map(playerRef).filter(Boolean).slice(0, 3)
    return [{
      round: entry.round,
      formation: entry.lineup?.formation ?? null,
      startersAdded: added,
      startersRemoved: removed,
      benchChanged: entry.changes?.benchChanged === true,
      explanation: entry.changes?.formationChanged
        ? `De formatie verandert naar ${entry.lineup?.formation ?? 'een andere geldige vorm'} binnen het beste plannerpad.`
        : 'De basis en bank worden aangepast aan de projecties van deze ronde.',
      evidence: [{ key: 'lineup-xp', value: rounded(entry.points?.lineupExpectedPoints), unit: 'xP' }].filter((item) => item.value !== null),
    }]
  })
}

function compactAnalysisItems(items = [], maximum = 3) {
  return items.slice(0, maximum).map((item) => ({ key: item.key, title: item.title, text: item.text, severity: item.severity, evidence: (item.evidence ?? []).slice(0, 3) }))
}

function createPriorities({ timeline, managerAnalysis, chipStrategy }) {
  const priorities = []
  const costly = timeline.find((entry) => Number(entry.points?.transferPointsCost) > 0)
  if (costly) priorities.push({ urgency: 'high', round: costly.round, action: 'Controleer de betaalde transfer voor de deadline.', reason: `${costly.points.transferPointsCost} transferpunten worden afgetrokken.`, evidence: [{ key: 'transfer-cost', value: costly.points.transferPointsCost, unit: 'points' }] })
  const lowRisk = (managerAnalysis?.risk ?? []).find((item) => item.severity === 'warning')
  if (lowRisk) priorities.push({ urgency: 'medium', round: timeline[0]?.round ?? null, action: lowRisk.title ?? 'Controleer beschikbaarheid.', reason: lowRisk.text, evidence: (lowRisk.evidence ?? []).slice(0, 2) })
  const firstChip = chipStrategy?.globalSchedule?.[0]
  if (firstChip) priorities.push({ urgency: 'medium', round: firstChip.round, action: `Bereid ${firstChip.chipId} in speelronde ${firstChip.round} voor.`, reason: 'Dit moment is onderdeel van het beste volledige plannerpad.', evidence: [{ key: 'chip-round', value: firstChip.round, unit: 'round' }] })
  return priorities.slice(0, 3)
}

function preseasonNarrative(preseason) {
  if (!preseason?.valid) return null
  const changes = Number(preseason.changesMade ?? preseason.transfers?.length ?? 0)
  return {
    changesMade: changes,
    transferPointsCost: 0,
    freeTransfersUsed: 0,
    headline: changes ? `${changes} onbeperkte wijziging${changes === 1 ? '' : 'en'} voor de eerste deadline.` : 'Het huidige startteam blijft behouden.',
    explanation: 'Preseasonwijzigingen kosten geen transferpunten en verbruiken geen vrije transfers.',
  }
}

export function createManagerCoachAnalysis({ request, preseason, seasonPlan, chipExecutionAnalysis, managerAnalysis, diagnostics } = {}) {
  const startedAt = Date.now()
  const timeline = Array.isArray(seasonPlan?.timeline) ? seasonPlan.timeline : []
  const startRound = Number(seasonPlan?.period?.startRound ?? request?.period?.startRound)
  const endRound = Number(seasonPlan?.period?.endRound ?? (startRound + Number(request?.period?.roundCount ?? 1) - 1))
  const horizon = {
    startRound,
    endRound,
    roundsEvaluated: Number.isInteger(startRound) && Number.isInteger(endRound) ? Math.max(0, endRound - startRound + 1) : timeline.length,
    fullPlannerPath: seasonPlan?.valid === true,
    fullSeasonEvaluated: startRound === 1 && endRound === 34,
  }
  const chipDecision = createChipDecision(chipExecutionAnalysis)
  const transfers = createTransferNarrative(timeline)
  const firstTransfer = transfers[0]
  const firstNoTransfer = timeline.find((entry) => entry.action?.actionType === 'no-transfer' && !entry.chip?.used)
  const keyDecision = chipDecision ?? (firstTransfer ? {
    type: firstTransfer.transferCost > 0 ? 'hit' : 'transfer', round: firstTransfer.round,
    title: firstTransfer.headline, localChoice: null, globalChoice: { round: firstTransfer.round, label: 'Beste complete plannerpad' }, counterfactual: { available: false, pathScore: null, difference: null },
    conclusion: { short: firstTransfer.headline, explanation: firstTransfer.explanation }, affectedDecisions: { chips: [], transfers: firstTransfer.transfers, captains: [] }, evidence: firstTransfer.evidence,
  } : firstNoTransfer ? {
    type: 'wait', round: firstNoTransfer.round, title: 'Geen transfer en flexibiliteit behouden', localChoice: null, globalChoice: { round: firstNoTransfer.round, label: 'Geen transfer' }, counterfactual: { available: false, pathScore: null, difference: null }, conclusion: { short: `Geen transfer in SR${firstNoTransfer.round}.`, explanation: `De selectie blijft staan en eindigt de ronde met ${firstNoTransfer.transfers?.nextFreeTransfers ?? '?'} vrije transfer(s).` }, affectedDecisions: { chips: [], transfers: [], captains: [] }, evidence: [{ key: 'free-transfers-after', value: firstNoTransfer.transfers?.nextFreeTransfers, unit: 'FT' }],
  } : null)
  const confidence = confidenceFrom({ managerAnalysis, horizon, keyDecision })
  const differs = keyDecision?.localChoice && keyDecision?.globalChoice && keyDecision.localChoice.round !== keyDecision.globalChoice.round
  const headline = {
    title: differs ? 'Sterke strategie met een bewust compromis' : keyDecision ? 'De lokale analyse en complete route vormen één plan' : 'Beperkte coachanalyse beschikbaar',
    verdict: managerAnalysis?.teamScore?.value >= 7.5 ? 'strong' : managerAnalysis?.teamScore?.value >= 5 ? 'balanced' : 'attention',
    summary: keyDecision?.conclusion?.explanation ?? `Binnen speelronde ${startRound} tot en met ${endRound} is geen afzonderlijke sleutelbeslissing met voldoende evidence gevonden.`,
    confidence,
  }
  const result = {
    version: COACH_INTELLIGENCE_VERSION,
    scope: horizon,
    headline,
    keyDecision,
    strengths: compactAnalysisItems(managerAnalysis?.strengths),
    concerns: compactAnalysisItems([...(managerAnalysis?.weaknesses ?? []), ...(managerAnalysis?.risk ?? [])]),
    priorities: createPriorities({ timeline, managerAnalysis, chipStrategy: chipExecutionAnalysis }),
    roundNarrative: createRoundNarrative(timeline),
    chipNarrative: (chipExecutionAnalysis?.periods ?? []).filter((period) => period.visibleInPrimaryResult).flatMap((period) => (period.recommendations ?? []).filter((item) => item.visibleInPrimaryResult).map((item) => ({ chipId: item.chipId, label: item.label, periodId: period.id, localRecommendation: item.localRecommendation, globalRecommendation: item.globalRecommendation, executionStatus: item.executionStatus, evaluationScope: item.evaluationScope, confidence: item.localOpportunity?.confidence ?? 'insufficient-data' }))),
    transferNarrative: transfers,
    captainNarrative: createCaptainNarrative(timeline),
    lineupNarrative: createLineupNarrative(timeline),
    preseason: preseasonNarrative(preseason),
    counterfactuals: keyDecision?.counterfactual?.available ? [{ type: keyDecision.type, round: keyDecision.round, ...keyDecision.counterfactual }] : [],
    caveats: [
      !horizon.fullSeasonEvaluated ? `Deze analyse geldt uitsluitend voor speelronde ${startRound} tot en met ${endRound}.` : null,
      confidence === 'insufficient-data' || confidence === 'low' ? 'De beschikbare projectie- of vergelijkingsdata beperkt de betrouwbaarheid.' : null,
      keyDecision && !keyDecision.counterfactual?.available && differs ? 'Voor de belangrijkste afwijking is geen volledig counterfactual pad uitgevoerd.' : null,
    ].filter(Boolean),
    technical: {
      fullPathScore: rounded(seasonPlan?.summary?.terminalScore, 2),
      cumulativeExpectedPoints: rounded(seasonPlan?.summary?.totalExpectedPoints, 2),
      transferPointsCost: rounded(seasonPlan?.summary?.totalTransferPointsCost, 0),
      chipIncrementalPoints: rounded(seasonPlan?.summary?.totalChipIncrementalPoints, 2),
      terminalFreeTransfers: finite(seasonPlan?.summary?.terminalFreeTransfers),
      sourceDiagnosticsPresent: Boolean(diagnostics),
    },
    diagnostics: { runtimeMs: Date.now() - startedAt },
  }
  result.diagnostics.payloadBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength
  return result
}

export default createManagerCoachAnalysis
