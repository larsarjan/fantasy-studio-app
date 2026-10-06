/*
|--------------------------------------------------------------------------
| Fantasy Studio — Chip Strategy Engine
|--------------------------------------------------------------------------
|
| Centrale, pure strategie-laag voor chips. Deze module kiest geen reguliere
| transfers en muteert geen Season Planner-state. Zij normaliseert het
| chipcontract, beoordeelt alle relevante rondes en levert een begrensd,
| deterministisch adviescontract voor Manager, Worker en toekomstige
| chip-action providers.
|
*/

import { optimizeLineupForRound, getPlayerRoundProjection } from './optimizerLineup.js'
import { optimizeSquadForPeriod, optimizeSquadForRound } from './optimizerSquad.js'
import {
  FANTASY_CHIP_IDS,
  FANTASY_CHIP_PERIODS,
  FANTASY_CHIP_RULES,
  FANTASY_CHIP_RULES_VERSION,
} from '../fantasyChipRules.js'
import { getEffectiveSellingPrice } from '../fantasyGameRulesEngine.js'

export const CHIP_RULES_VERSION = FANTASY_CHIP_RULES_VERSION

export const CHIP_IDS = FANTASY_CHIP_IDS

export const CHIP_CONTRACT = Object.freeze({
  version: CHIP_RULES_VERSION,
  periods: FANTASY_CHIP_PERIODS,
  maximumPerRound: 1,
  chips: Object.freeze({
    wildcard: Object.freeze({
      ...FANTASY_CHIP_RULES.wildcard,
      effects: Object.freeze({ transferMode: 'unlimited', transferPointsCost: 'waived', budgetMode: 'normal', squadPersistence: 'permanent' }),
    }),
    'sugar-daddy': Object.freeze({
      ...FANTASY_CHIP_RULES['sugar-daddy'],
      effects: Object.freeze({ transferMode: 'unlimited', transferPointsCost: 'waived', budgetMode: 'unlimited', squadPersistence: 'restore-after-round' }),
    }),
    attacking: Object.freeze({
      ...FANTASY_CHIP_RULES.attacking,
      effects: Object.freeze({ forwardsMultiplier: 2, captainDisabled: true, squadPersistence: 'unchanged' }),
    }),
    'dynamic-duo': Object.freeze({
      ...FANTASY_CHIP_RULES['dynamic-duo'],
      effects: Object.freeze({ captainMultiplier: 3, viceCaptainMultiplier: 2, squadPersistence: 'unchanged' }),
    }),
  }),
})

const aliasMap = new Map(
  Object.values(CHIP_CONTRACT.chips)
    .flatMap((chip) => chip.aliases.map((alias) => [alias.toLowerCase(), chip.id])),
)

function round(value, digits = 2) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const factor = 10 ** digits
  return Math.round((number + Number.EPSILON) * factor) / factor
}

function playerId(player) {
  return String(player?.id ?? player?.playerId ?? '').trim()
}

export function normalizeChipId(value) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim().toLowerCase()
  return normalized ? aliasMap.get(normalized) ?? null : null
}

export function getChipPeriod(roundNumber) {
  const round = Number(roundNumber)
  return CHIP_CONTRACT.periods.find((period) => round >= period.startRound && round <= period.endRound) ?? null
}

export function createInitialChipState(source = {}) {
  const sourceUsedRounds = source?.usedRounds && typeof source.usedRounds === 'object'
    ? source.usedRounds
    : {}
  const usedRounds = Object.fromEntries(CHIP_IDS.map((id) => {
    const rounds = Array.isArray(sourceUsedRounds[id]) ? sourceUsedRounds[id] : []
    return [id, [...new Set(rounds.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 34))].sort((a, b) => a - b)]
  }))
  return { rulesVersion: CHIP_RULES_VERSION, usedRounds }
}

export function canonicalizeChipState(source) {
  return createInitialChipState(source)
}

export function getRemainingChipUses(state, chipId, round) {
  const id = normalizeChipId(chipId)
  const period = getChipPeriod(round)
  if (!id || !period) return 0
  const normalized = createInitialChipState(state)
  const used = normalized.usedRounds[id].filter((usedRound) => getChipPeriod(usedRound)?.id === period.id).length
  return Math.max(0, CHIP_CONTRACT.chips[id].usesPerPeriod - used)
}

export function validateChipActivation({ chipId, round, state, scheduled = [] } = {}) {
  const id = normalizeChipId(chipId)
  const period = getChipPeriod(round)
  const errors = []
  if (!id) errors.push('Onbekende chip.')
  if (!period || !Number.isInteger(Number(round))) errors.push('Ongeldige speelronde voor een chip.')
  if (id && period && getRemainingChipUses(state, id, round) < 1) errors.push(`${CHIP_CONTRACT.chips[id].label} is in deze periode al gebruikt.`)
  if (period) {
    const sameRound = scheduled.filter((entry) => Number(entry?.round) === Number(round))
    if (sameRound.length > 1 || (sameRound.length === 1 && normalizeChipId(sameRound[0]?.chipId) !== id)) {
      errors.push('Er kan maximaal één chip per speelronde worden gebruikt.')
    }
  }
  return { valid: errors.length === 0, errors, chip: id ? CHIP_CONTRACT.chips[id] : null, period }
}

export function consumeChip(state, chipId, round) {
  const validation = validateChipActivation({ chipId, round, state })
  if (!validation.valid) return { valid: false, errors: validation.errors, state: createInitialChipState(state) }
  const next = createInitialChipState(state)
  next.usedRounds[validation.chip.id] = [...next.usedRounds[validation.chip.id], Number(round)].sort((a, b) => a - b)
  return { valid: true, errors: [], state: next }
}

function normalizeMode(value) {
  return ['disabled', 'manual', 'automatic'].includes(value) ? value : 'disabled'
}

export function normalizeChipStrategy(source = {}) {
  const mode = normalizeMode(source?.mode)
  const allowedChips = [...new Set((Array.isArray(source?.allowedChips) ? source.allowedChips : CHIP_IDS)
    .map(normalizeChipId).filter(Boolean))]
  const normalizedRecords = (Array.isArray(source?.schedule) ? source.schedule : [])
    .map((entry) => {
      const chipId = normalizeChipId(entry?.chipId)
      const rawRound = entry?.round
      const roundNumber = rawRound === null || rawRound === undefined || (typeof rawRound === 'string' && !rawRound.trim())
        ? null
        : Number(rawRound)
      const inferredPeriod = getChipPeriod(roundNumber)
      const periodId = CHIP_CONTRACT.periods.some((period) => period.id === entry?.periodId)
        ? entry.periodId
        : inferredPeriod?.id ?? null
      const decision = ['scheduled', 'undecided', 'skip'].includes(entry?.decision)
        ? entry.decision
        : inferredPeriod && Number.isInteger(roundNumber)
          ? 'scheduled'
          : 'undecided'
      return { chipId, periodId, round: decision === 'scheduled' ? roundNumber : null, decision }
    })
    .filter((entry) => entry.chipId && entry.periodId)
  const byChipPeriod = new Map()
  normalizedRecords.forEach((entry) => {
    const key = `${entry.chipId}:${entry.periodId}`
    if (!byChipPeriod.has(key)) byChipPeriod.set(key, entry)
  })
  const schedule = mode === 'manual'
    ? CHIP_IDS.flatMap((chipId) => CHIP_CONTRACT.periods.map((period) => (
      byChipPeriod.get(`${chipId}:${period.id}`) ?? {
        chipId, periodId: period.id, round: null, decision: 'undecided',
      }
    )))
    : []
  return { mode, allowedChips, schedule }
}

export function validateChipStrategy(source = {}, state = {}) {
  const strategy = normalizeChipStrategy(source)
  const errors = []
  const rawAllowedChips = Array.isArray(source?.allowedChips) ? source.allowedChips : []
  rawAllowedChips.forEach((chipId) => {
    if (chipId !== null && chipId !== undefined && String(chipId).trim() && !normalizeChipId(chipId)) {
      errors.push(`Onbekende beschikbare chip: ${String(chipId).trim()}.`)
    }
  })
  if (strategy.mode === 'manual') {
    const rawSchedule = Array.isArray(source?.schedule) ? source.schedule : []
    const rawKeys = new Set()
    rawSchedule.forEach((entry) => {
      const rawChipId = entry?.chipId
      const rawRound = entry?.round
      if (!normalizeChipId(rawChipId)) errors.push('Onbekende chip in de handmatige planning.')
      const decision = ['scheduled', 'undecided', 'skip'].includes(entry?.decision)
        ? entry.decision
        : getChipPeriod(Number(rawRound)) ? 'scheduled' : 'undecided'
      const period = CHIP_CONTRACT.periods.find((item) => item.id === entry?.periodId) ?? getChipPeriod(Number(rawRound))
      if (entry?.periodId && !CHIP_CONTRACT.periods.some((item) => item.id === entry.periodId)) errors.push('Onbekende chipperiode in de handmatige planning.')
      if (decision === 'scheduled' && (rawRound === null || rawRound === undefined || (typeof rawRound === 'string' && !rawRound.trim()) || !Number.isInteger(Number(rawRound)))) {
        errors.push('De handmatige chipplanning bevat een ongeldige speelronde.')
      }
      if (entry?.decision === undefined && !getChipPeriod(Number(rawRound))) errors.push('De oude handmatige chipplanning bevat een ongeldige speelronde.')
      if (decision === 'scheduled' && period?.id !== getChipPeriod(Number(rawRound))?.id) errors.push('De gekozen speelronde valt niet binnen de opgegeven chipperiode.')
      if (normalizeChipId(rawChipId) && period) {
        const key = `${normalizeChipId(rawChipId)}:${period.id}`
        if (rawKeys.has(key)) errors.push(`${CHIP_CONTRACT.chips[normalizeChipId(rawChipId)].label} heeft dubbele records voor dezelfde periode.`)
        rawKeys.add(key)
      }
    })
    const seenChipPeriods = new Set()
    strategy.schedule.filter((entry) => entry.decision === 'scheduled').forEach((entry) => {
      if (!strategy.allowedChips.includes(entry.chipId)) errors.push(`${CHIP_CONTRACT.chips[entry.chipId].label} is handmatig gepland maar niet beschikbaar gesteld.`)
      const validation = validateChipActivation({ ...entry, state, scheduled: strategy.schedule })
      errors.push(...validation.errors)
      const period = getChipPeriod(entry.round)
      const key = `${entry.chipId}:${period?.id ?? 'invalid'}`
      if (seenChipPeriods.has(key)) errors.push(`${CHIP_CONTRACT.chips[entry.chipId].label} is meer dan eenmaal in dezelfde periode gepland.`)
      seenChipPeriods.add(key)
    })
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], strategy }
}

function projectionValue(player, roundNumber) {
  const projection = getPlayerRoundProjection(player, roundNumber)
  if (['postponed', 'cancelled', 'canceled', 'abandoned', 'suspended', 'not-finished', 'unfinished', 'gestaakt', 'afgelast', 'uitgesteld']
    .includes(String(projection?.type ?? '').trim().toLowerCase())) return 0
  return round(projection?.expectedPoints ?? projection?.points ?? 0)
}

function getLineupEntries(lineup, key) {
  const value = lineup?.result?.[key]
  return Array.isArray(value) ? value : value ? [value] : []
}

function entryPlayer(entry) {
  return entry?.player ?? entry
}

function entryPoints(entry, roundNumber) {
  const direct = Number(entry?.expectedPoints)
  return Number.isFinite(direct) ? direct : projectionValue(entryPlayer(entry), roundNumber)
}

function scoreAttacking(lineup, squad, roundNumber) {
  const forwards = (Array.isArray(squad) ? squad : []).filter((player) => {
    const position = String(player?.fantasyPosition ?? player?.position ?? '').toLowerCase()
    return ['forward', 'fwd', 'attacker', 'aanvaller', 'spits'].includes(position)
  })
  const forwardBonus = forwards.reduce((sum, player) => sum + projectionValue(player, roundNumber), 0)
  const normalCaptainBonus = Number(lineup?.result?.captainBonus ?? 0)
  const projections = forwards.map((player) => getPlayerRoundProjection(player, roundNumber))
  return {
    grossValue: forwardBonus,
    netValue: forwardBonus - normalCaptainBonus,
    riskAdjustment: 0,
    relevantCosts: { removedNormalCaptainBonus: normalCaptainBonus },
    evidenceCount: projections.filter((projection) => projection.hasProjection).length,
    expectedEvidenceCount: 3,
    averageAppearanceProbability: projections.length
      ? projections.reduce((sum, projection) => sum + Number(projection.appearanceProbability ?? 0), 0) / projections.length
      : 0,
    evidence: {
      assumptions: FANTASY_CHIP_RULES.attacking.assumptions,
      forwards: forwards.map((player, index) => ({
        id: playerId(player), name: player?.name ?? null,
        expectedPoints: round(projections[index]?.expectedPoints),
        expectedMinutes: round(projections[index]?.expectedMinutes, 1),
        appearanceProbability: round(projections[index]?.appearanceProbability, 4),
        fixtureCount: projections[index]?.fixtureCount ?? 0,
        hasProjection: projections[index]?.hasProjection === true,
      })),
      removedNormalCaptainBonus: round(normalCaptainBonus),
    },
  }
}

function scoreDynamicDuo(lineup, roundNumber) {
  const captain = lineup?.result?.captain
  const viceCaptain = lineup?.result?.viceCaptain
  const captainXp = entryPoints(captain, roundNumber)
  const viceXp = entryPoints(viceCaptain, roundNumber)
  const entries = [captain, viceCaptain]
  const complete = entries.filter((entry) => entry?.hasProjection === true).length
  const averageAppearanceProbability = entries.reduce((sum, entry) => sum + Number(entry?.appearanceProbability ?? 0), 0) / 2
  return {
    grossValue: captainXp + viceXp,
    netValue: captainXp + viceXp,
    riskAdjustment: 0,
    relevantCosts: {},
    evidenceCount: complete,
    expectedEvidenceCount: 2,
    averageAppearanceProbability,
    evidence: {
      formula: 'captainRoundXp + viceCaptainRoundXp',
      captain: { id: playerId(entryPlayer(captain)), name: entryPlayer(captain)?.name ?? null, expectedPoints: round(captainXp), expectedMinutes: round(captain?.expectedMinutes, 1), appearanceProbability: round(captain?.appearanceProbability, 4), fixtureCount: captain?.fixtureCount ?? 0, hasProjection: captain?.hasProjection === true },
      viceCaptain: { id: playerId(entryPlayer(viceCaptain)), name: entryPlayer(viceCaptain)?.name ?? null, expectedPoints: round(viceXp), expectedMinutes: round(viceCaptain?.expectedMinutes, 1), appearanceProbability: round(viceCaptain?.appearanceProbability, 4), fixtureCount: viceCaptain?.fixtureCount ?? 0, hasProjection: viceCaptain?.hasProjection === true },
    },
  }
}

function confidenceFor(value) {
  const coverage = value.expectedEvidenceCount > 0
    ? value.evidenceCount / value.expectedEvidenceCount
    : 0
  const availability = Number(value.averageAppearanceProbability ?? 0)
  if (coverage >= 0.9 && availability >= 0.8) return 'high'
  if (coverage >= 0.6 && availability >= 0.55) return 'medium'
  return 'low'
}

function candidateExplanation(chipId, candidate) {
  const roundNumber = candidate.round
  if (chipId === 'attacking') return `Voor speelronde ${roundNumber} is de gezamenlijke netto meerwaarde van de drie scorende aanvallers gemeten.`
  if (chipId === 'dynamic-duo') return `Voor speelronde ${roundNumber} is de gecombineerde verwachte waarde van captain en vice-captain gemeten.`
  if (chipId === 'wildcard') return `Voor een herbouw vanaf speelronde ${roundNumber} is de gemeten horizonverbetering berekend.`
  return `Voor speelronde ${roundNumber} is het verschil tussen het tijdelijke onbeperkte team en de persistente selectie gemeten.`
}

function serializeCandidate(chipId, value, rank, bestValue, { compactEvidence = false } = {}) {
  const netValue = round(value.netValue)
  const evidence = { ...(value.evidence ?? {}) }
  if (compactEvidence) delete evidence.squad
  return {
    rank,
    chipId,
    round: value.round,
    grossValue: round(value.grossValue),
    netValue,
    riskAdjustment: round(value.riskAdjustment),
    relevantCosts: Object.fromEntries(Object.entries(value.relevantCosts ?? {}).map(([key, cost]) => [key, round(cost)])),
    valueDifferenceFromBest: round(bestValue - netValue),
    risk: value.risk ?? (confidenceFor(value) === 'high' ? 'low' : confidenceFor(value) === 'medium' ? 'medium' : 'high'),
    confidence: value.confidence ?? confidenceFor(value),
    explanation: candidateExplanation(chipId, value),
    evidence,
  }
}

function scoreRoundChips({ squad, startRound, endRound }) {
  const result = { attacking: [], 'dynamic-duo': [] }
  for (let roundNumber = startRound; roundNumber <= endRound; roundNumber += 1) {
    const lineup = optimizeLineupForRound({ squad, round: roundNumber })
    if (!lineup.valid) continue
    result.attacking.push({ round: roundNumber, ...scoreAttacking(lineup, squad, roundNumber) })
    result['dynamic-duo'].push({ round: roundNumber, ...scoreDynamicDuo(lineup, roundNumber) })
  }
  return result
}

function shortlistRounds(values, count = 3) {
  return [...values].sort((left, right) => right.netValue - left.netValue || left.round - right.round).slice(0, count).map((entry) => entry.round)
}

function valueFromMap(source, id) {
  if (source instanceof Map) return source.get(id)
  return source && typeof source === 'object' ? source[id] : undefined
}

function currentPrice(player) {
  for (const value of [player?.currentPrice, player?.endPrice, player?.price, player?.startPrice]) {
    if (value !== null && value !== undefined && String(value).trim() && Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value)
  }
  return null
}

function calculateWildcardBudget({ squad, bank, purchasePrices, manualSellingPrices, minimumBank }) {
  const sellable = squad.reduce((sum, player) => {
    const id = playerId(player)
    const sellingPrice = getEffectiveSellingPrice({
      manualSellingPrice: valueFromMap(manualSellingPrices, id),
      purchasePrice: valueFromMap(purchasePrices, id),
      currentPrice: currentPrice(player),
    })
    return sum + (Number.isFinite(Number(sellingPrice)) ? Number(sellingPrice) : 0)
  }, 0)
  return Math.max(0, sellable + Number(bank || 0) - Number(minimumBank || 0))
}

function scoreSquadChip({ chipId, roundNumber, squad, playerPool, periodEnd, philosophy, constraints, onProgress }) {
  const horizon = Math.max(1, Math.min(10, periodEnd - roundNumber + 1))
  const wildcardBudget = calculateWildcardBudget({ squad, ...constraints })
  const optimized = chipId === 'wildcard'
    ? optimizeSquadForPeriod({
        players: playerPool, startRound: roundNumber, roundCount: horizon,
        budget: wildcardBudget, philosophy,
        maximumPlayersPerClub: constraints.maximumPlayersPerClub,
        lockedPlayerIds: constraints.lockedPlayerIds,
        bannedPlayerIds: constraints.bannedPlayerIds,
        minimumAvailability: constraints.minimumAvailability,
        onProgress,
      })
    : optimizeSquadForRound({
        players: playerPool, round: roundNumber, unlimitedBudget: true, philosophy,
        maximumPlayersPerClub: constraints.maximumPlayersPerClub,
        lockedPlayerIds: constraints.lockedPlayerIds,
        bannedPlayerIds: constraints.bannedPlayerIds,
        minimumAvailability: constraints.minimumAvailability,
        onProgress,
      })
  if (!optimized.valid || !optimized.result?.squad) return null
  const baseline = chipId === 'wildcard'
    ? Array.from({ length: horizon }, (_, index) => optimizeLineupForRound({ squad, round: roundNumber + index }))
    : [optimizeLineupForRound({ squad, round: roundNumber })]
  const alternative = chipId === 'wildcard'
    ? Array.from({ length: horizon }, (_, index) => optimizeLineupForRound({ squad: optimized.result.squad, round: roundNumber + index }))
    : [optimizeLineupForRound({ squad: optimized.result.squad, round: roundNumber })]
  if ([...baseline, ...alternative].some((entry) => !entry.valid)) return null
  const basePoints = baseline.reduce((sum, entry) => sum + Number(entry.result.expectedPoints ?? 0), 0)
  const alternativePoints = alternative.reduce((sum, entry) => sum + Number(entry.result.expectedPoints ?? 0), 0)
  const netValue = alternativePoints - basePoints
  const lineupEntries = alternative.flatMap((lineup) => getLineupEntries(lineup, 'starters'))
  const evidenceCount = lineupEntries.filter((entry) => entry?.hasProjection === true).length
  const averageAppearanceProbability = lineupEntries.length
    ? lineupEntries.reduce((sum, entry) => sum + Number(entry?.appearanceProbability ?? 0), 0) / lineupEntries.length
    : 0
  const baselineIds = new Set(squad.map(playerId))
  const changedPlayers = optimized.result.squad.filter((player) => !baselineIds.has(playerId(player))).length
  return {
    round: roundNumber,
    grossValue: netValue,
    netValue,
    riskAdjustment: 0,
    relevantCosts: {},
    evidenceCount,
    expectedEvidenceCount: lineupEntries.length,
    averageAppearanceProbability,
    evidence: {
      scenarioType: chipId === 'wildcard' ? 'permanent-squad-opportunity' : 'temporary-round-squad-opportunity',
      horizonRounds: horizon,
      baselineExpectedPoints: round(basePoints),
      optimizedExpectedPoints: round(alternativePoints),
      opportunityValue: round(netValue),
      budgetMode: chipId === 'wildcard' ? 'normal' : 'unlimited',
      scenarioBudget: chipId === 'wildcard' ? round(wildcardBudget, 1) : null,
      minimumBankReserved: chipId === 'wildcard' ? round(constraints.minimumBank, 1) : null,
      maximumPlayersPerClub: constraints.maximumPlayersPerClub,
      changedPlayers,
      squad: optimized.result.squad.map((player) => ({ id: playerId(player), name: player?.name ?? null })),
      persistentSquadPreserved: chipId === 'sugar-daddy',
    },
  }
}

function recommendationsFor(chipId, candidates, state, strategy, period, automaticRound = null, plannerEndRound = 34) {
  const available = getRemainingChipUses(state, chipId, period.startRound) > 0 && strategy.allowedChips.includes(chipId)
  const sorted = [...candidates].sort((left, right) => right.netValue - left.netValue || left.round - right.round)
  const plannerCandidates = sorted.filter((entry) => entry.round <= plannerEndRound)
  const periodChoice = strategy.mode === 'manual'
    ? strategy.schedule.find((entry) => entry.chipId === chipId && entry.periodId === period.id)
    : null
  const selected = periodChoice?.decision === 'scheduled' ? periodChoice : null
  const recommended = !available || (strategy.mode === 'manual' && !selected)
    ? null
    : selected
    ? sorted.find((entry) => entry.round === selected.round) ?? null
    : automaticRound !== null
      ? sorted.find((entry) => entry.round === automaticRound) ?? null
      : sorted[0] ?? null
  const localBest = plannerCandidates[0] ?? null
  const bestValue = selected?.round > plannerEndRound ? sorted[0]?.netValue ?? 0 : localBest?.netValue ?? 0
  const comparisonRound = localBest?.round ?? selected?.round ?? recommended?.round
  const earlier = comparisonRound ? plannerCandidates.find((entry) => entry.round < comparisonRound) : null
  const later = comparisonRound ? plannerCandidates.find((entry) => entry.round > comparisonRound) : null
  const alternatives = available && (strategy.mode !== 'manual' || periodChoice?.decision === 'undecided' || selected)
    ? [earlier, later].filter(Boolean).slice(0, 2)
    : []
  return {
    chipId,
    label: CHIP_CONTRACT.chips[chipId].label,
    periodId: period.id,
    decision: periodChoice?.decision ?? null,
    available,
    source: selected ? 'manual' : strategy.mode,
    recommended: recommended ? serializeCandidate(chipId, recommended, 1, bestValue) : null,
    alternatives: alternatives.map((entry, index) => serializeCandidate(chipId, entry, index + 2, bestValue, { compactEvidence: true })),
    manualAssessment: selected ? {
      requestedRound: selected.round,
      bestRound: sorted[0]?.round ?? null,
      valueDifferenceFromBest: round(bestValue - (recommended?.netValue ?? 0)),
    } : null,
    localRecommendation: periodChoice?.decision === 'skip' ? null : localBest ? { round: localBest.round, localValue: round(localBest.netValue) } : null,
    localOpportunity: periodChoice?.decision === 'skip' || !localBest
      ? null
      : serializeCandidate(chipId, localBest, 1, localBest.netValue),
    scanOnlyRecommendation: sorted[0] && sorted[0].round > plannerEndRound
      ? { round: sorted[0].round, localValue: round(sorted[0].netValue) }
      : null,
    globalRecommendation: null,
  }
}

function optimizePeriodSchedule(scores, chipIds) {
  let best = { value: -Infinity, rounds: {} }
  const visit = (index, usedRounds, value, rounds) => {
    if (index >= chipIds.length) {
      const signature = Object.entries(rounds).sort().map(([id, roundNumber]) => `${id}:${roundNumber}`).join('|')
      const bestSignature = Object.entries(best.rounds).sort().map(([id, roundNumber]) => `${id}:${roundNumber}`).join('|')
      if (value > best.value || (value === best.value && signature.localeCompare(bestSignature, 'en') < 0)) best = { value, rounds: { ...rounds } }
      return
    }
    const chipId = chipIds[index]
    const candidates = [...(scores[chipId] ?? [])]
      .sort((left, right) => right.netValue - left.netValue || left.round - right.round)
      .slice(0, 6)
    if (!candidates.length) {
      visit(index + 1, usedRounds, value, rounds)
      return
    }
    candidates.forEach((candidate) => {
      if (usedRounds.has(candidate.round)) return
      const nextUsed = new Set(usedRounds)
      nextUsed.add(candidate.round)
      visit(index + 1, nextUsed, value + candidate.netValue, { ...rounds, [chipId]: candidate.round })
    })
  }
  visit(0, new Set(), 0, {})
  return best.rounds
}

export function evaluateChipStrategy({
  squad = [], playerPool = [], startRound = 1, roundCount = 1,
  strategy: sourceStrategy = {}, state: sourceState = {}, philosophy = {},
  bank = 0, purchasePrices = {}, manualSellingPrices = {}, hardRules = {},
  onProgress,
} = {}) {
  const startedAt = Date.now()
  const emitProgress = (progress) => {
    if (typeof onProgress !== 'function') return
    try { onProgress(progress) } catch { /* voortgang verandert het resultaat niet */ }
  }
  const validation = validateChipStrategy(sourceStrategy, sourceState)
  const strategy = validation.strategy
  const state = createInitialChipState(sourceState)
  const pastManualRounds = strategy.mode === 'manual'
    ? strategy.schedule.filter((entry) => entry.decision === 'scheduled' && entry.round < Number(startRound))
    : []
  const validationErrors = [
    ...validation.errors,
    ...pastManualRounds.map((entry) => `${CHIP_CONTRACT.chips[entry.chipId].label} is gepland in een verstreken speelronde.`),
  ]
  if (validationErrors.length) return { valid: false, errors: [...new Set(validationErrors)], warnings: [], rulesVersion: CHIP_RULES_VERSION, executionStatus: 'advisory', mode: strategy.mode, state, periods: [], seasonSchedule: [], diagnostics: { runtimeMs: Date.now() - startedAt, evaluatedRounds: 0, fullSquadOptimizations: 0, prunedFullSquadCandidates: 0 } }
  if (strategy.mode === 'disabled') return { valid: true, errors: [], warnings: [], rulesVersion: CHIP_RULES_VERSION, executionStatus: 'disabled', mode: 'disabled', state, periods: [], seasonSchedule: [], diagnostics: { runtimeMs: Date.now() - startedAt, evaluatedRounds: 0, fullSquadOptimizations: 0, prunedFullSquadCandidates: 0 } }
  const requestedEndRound = Math.min(34, Number(startRound) + Math.max(1, Number(roundCount)) - 1)
  const relevantPeriods = CHIP_CONTRACT.periods.filter((period) => period.endRound >= startRound)
  const warnings = [
    'Deze chipanalyse vergelijkt kansrijke speelrondes. De chips zijn nog niet samen met alle transfers door de seizoensplanner uitgevoerd.',
  ]
  const periodResults = []
  let evaluatedRounds = 0
  let fullSquadOptimizations = 0
  const minimumBank = hardRules?.minMoneyInBank?.enabled
    ? Math.max(0, Number(hardRules.minMoneyInBank.value) || 0)
    : Math.max(0, Number(philosophy?.hardRules?.minimumBank) || 0)
  const constraints = {
    bank: Math.max(0, Number(bank) || 0),
    purchasePrices,
    manualSellingPrices,
    minimumBank,
    maximumPlayersPerClub: hardRules?.maxPlayersPerClub?.enabled
      ? Math.max(1, Math.min(3, Math.floor(Number(hardRules.maxPlayersPerClub.value) || 3)))
      : 3,
    minimumAvailability: hardRules?.minPlayingChance?.enabled
      ? Number(hardRules.minPlayingChance.value)
      : null,
    lockedPlayerIds: Array.isArray(hardRules?.lockedPlayerIds) ? hardRules.lockedPlayerIds : [],
    bannedPlayerIds: Array.isArray(hardRules?.bannedPlayerIds) ? hardRules.bannedPlayerIds : [],
  }
  for (const period of relevantPeriods) {
    const analysisStart = Math.max(Number(startRound), period.startRound)
    const analysisEnd = period.endRound
    const scores = scoreRoundChips({ squad, startRound: analysisStart, endRound: analysisEnd })
    evaluatedRounds += analysisEnd - analysisStart + 1
    emitProgress({ stage: 'lineup-chip-scan', periodId: period.id, evaluatedRounds })
    const manualChoiceFor = (chipId) => strategy.schedule.find((entry) => (
      entry.chipId === chipId && entry.periodId === period.id
    ))
    const manualRoundFor = (chipId) => manualChoiceFor(chipId)?.decision === 'scheduled'
      ? manualChoiceFor(chipId).round
      : null
    const shouldAdvise = (chipId) => manualChoiceFor(chipId)?.decision !== 'skip'
    /*
|--------------------------------------------------------------------------
| Squadchip-kandidaten
|--------------------------------------------------------------------------
|
| Wildcard en Suikeroom mogen niet worden afgeleid van scoringchips.
|
| Binnen de werkelijk uitgevoerde plannerhorizon onderzoeken we iedere
| speelronde. Buiten die horizon bewaren we slechts een beperkte vooruitblik,
| omdat die rondes niet samen met alle transfers worden gesimuleerd.
|
*/

const squadChipPlannerEnd =
  Math.min(
    analysisEnd,
    requestedEndRound,
  )

const plannerRounds =
  squadChipPlannerEnd >= analysisStart
    ? Array.from(
        {
          length:
            squadChipPlannerEnd -
            analysisStart +
            1,
        },
        (
          _,
          index,
        ) =>
          analysisStart +
          index,
      )
    : []

const wildcardPreviewRounds =
  shortlistRounds(
    scores['dynamic-duo'].filter(
      (entry) =>
        entry.round >
        squadChipPlannerEnd,
    ),
    3,
  )

const sugarPreviewRounds =
  shortlistRounds(
    scores.attacking.filter(
      (entry) =>
        entry.round >
        squadChipPlannerEnd,
    ),
    3,
  )

const wildcardSeed =
  strategy.mode === 'automatic' ||
  (
    strategy.mode === 'manual' &&
    shouldAdvise('wildcard')
  )
    ? [
        ...new Set(
          [
            ...plannerRounds,
            ...wildcardPreviewRounds,

            manualRoundFor(
              'wildcard',
            ),
          ].filter(Boolean),
        ),
      ]
    : []

const sugarSeed =
  strategy.mode === 'automatic' ||
  (
    strategy.mode === 'manual' &&
    shouldAdvise('sugar-daddy')
  )
    ? [
        ...new Set(
          [
            ...plannerRounds,
            ...sugarPreviewRounds,

            manualRoundFor(
              'sugar-daddy',
            ),
          ].filter(Boolean),
        ),
      ]
    : []

    for (const [chipId, candidateRounds] of [['wildcard', wildcardSeed], ['sugar-daddy', sugarSeed]]) {
      scores[chipId] = []
      if (!strategy.allowedChips.includes(chipId) || getRemainingChipUses(state, chipId, period.startRound) === 0) continue
      for (const roundNumber of candidateRounds) {
        const candidate = scoreSquadChip({ chipId, roundNumber, squad, playerPool, periodEnd: analysisEnd, philosophy, constraints, onProgress: emitProgress })
        fullSquadOptimizations += 1
        if (candidate) scores[chipId].push(candidate)
      }
    }

    const schedulableChipIds = CHIP_IDS.filter((chipId) => (
      strategy.allowedChips.includes(chipId) && getRemainingChipUses(state, chipId, period.startRound) > 0
    ))
    const automaticSchedule = strategy.mode === 'automatic'
      ? optimizePeriodSchedule(scores, schedulableChipIds)
      : {}
    const recommendations = CHIP_IDS.map((chipId) => recommendationsFor(
      chipId,
      scores[chipId] ?? [],
      state,
      strategy,
      period,
      automaticSchedule[chipId] ?? null,
      requestedEndRound,
    ))
    periodResults.push({ ...period, analysisStartRound: analysisStart, analysisEndRound: analysisEnd, recommendations })
  }
  if (requestedEndRound < relevantPeriods.at(-1)?.endRound) warnings.push('De chipanalyse scant de volledige relevante chipperiode; reguliere transfers buiten de ingestelde planningshorizon zijn niet gezamenlijk geoptimaliseerd.')
  if (strategy.mode === 'manual') {
    strategy.schedule
      .filter((entry) => entry.decision === 'scheduled' && entry.round > requestedEndRound)
      .forEach((entry) => warnings.push(`${CHIP_CONTRACT.chips[entry.chipId].label} in speelronde ${entry.round} ligt buiten de uitgevoerde Season Planner-horizon en is alleen met de opportunity-scan beoordeeld.`))
  }
  const seasonSchedule = periodResults.flatMap((period) => period.recommendations
    .filter((item) => item.available && item.recommended)
    .map((item) => ({ periodId: period.id, chipId: item.chipId, label: item.label, round: item.recommended.round, netValue: item.recommended.netValue, confidence: item.recommended.confidence, source: item.source })))
    .sort((left, right) => left.round - right.round || left.chipId.localeCompare(right.chipId, 'en'))
  return {
    valid: true, errors: [], warnings, rulesVersion: CHIP_RULES_VERSION,
    executionStatus: 'advisory', scheduleType: 'advisory-opportunity-composition',
    mode: strategy.mode, state, periods: periodResults, seasonSchedule,
    diagnostics: {
      runtimeMs: Date.now() - startedAt,
      evaluatedRounds,
      fullSquadOptimizations,
      prunedFullSquadCandidates: Math.max(0, evaluatedRounds * 2 - fullSquadOptimizations),
    },
  }
}

export default evaluateChipStrategy
