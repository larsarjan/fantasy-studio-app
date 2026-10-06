import { getDatabaseSummary, getPlayerProfiles } from '../database.js'
import { validateSquad } from '../fantasyGameRulesEngine.js'
import { createManagerOptimizerRequest } from './managerOptimizerRequest.js'
import { resolveManagerCurrentTeam } from './managerTeamResolver.js'
import { optimizeSquadForPeriod, optimizeSquadForRound } from './optimizerSquad.js'
import { optimizeLineupForRound } from './optimizerLineup.js'
import { generatePlannerActions, planSingleTransfers } from './optimizerTransferPlanner.js'
import { planSeason } from './optimizerSeasonPlanner.js'
import { createSeasonPlanTimeline } from './optimizerSeasonTimeline.js'
import { createManagerAnalysis } from './optimizerManagerAnalysis.js'
import { optimizePreseasonTeam } from './optimizerPreseason.js'
import { evaluateChipStrategy } from './optimizerChipStrategy.js'
import { createExecutedChipAnalysis } from './optimizerChipExecutionAnalysis.js'
import { createManagerCoachAnalysis } from './optimizerCoachIntelligence.js'
import { analyzeWildcardMoments, } from './optimizerWildcardAdvisor.js'

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeInteger(value, minimum, maximum, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.floor(number)))
}

function getPlayerId(player) {
  return String(player?.id ?? player?.playerId ?? '').trim()
}

function createInitialPlannerActionResult(transferPlannerResult, maximumActions) {
  const validOptions = transferPlannerResult?.result?.validOptions ?? []
  const noTransfer = validOptions.find((option) => option?.actionType === 'no-transfer')
  const singles = validOptions.filter((option) => option?.actionType === 'transfer')
  const doubles = validOptions.filter((option) => option?.actionType === 'double-transfer')
  const selected = noTransfer ? [noTransfer] : []
  const seen = new Set(selected.map((option) => option.id))
  const add = (option) => {
    if (!option || seen.has(option.id) || selected.length >= maximumActions) return
    seen.add(option.id)
    selected.push(option)
  }
  singles.slice(0, 3).forEach(add)
  doubles.slice(0, 3).forEach(add)
  ;[...singles, ...doubles]
    .sort((left, right) =>
      Number(right.decisionScore ?? 0) - Number(left.decisionScore ?? 0) ||
      String(left.id ?? '').localeCompare(String(right.id ?? ''), 'en'))
    .forEach(add)

  return {
    valid: transferPlannerResult?.valid === true,
    errors: transferPlannerResult?.errors ?? [],
    result: transferPlannerResult?.result
      ? {
          ...transferPlannerResult.result,
          validOptions: selected,
          statistics: {
            ...(transferPlannerResult.result.statistics ?? {}),
            fullyEvaluatedActions:
              1 +
              Number(transferPlannerResult.result.statistics?.generatedSingleTransferOptions ?? 0) +
              Number(transferPlannerResult.result.statistics?.generatedDoubleTransferOptions ?? 0),
            returnedValidOptions: selected.length,
          },
        }
      : null,
  }
}

function normalizeMaximumPlayersPerClub(hardRules = {}) {
  const rule = hardRules?.maxPlayersPerClub
  return rule?.enabled
    ? normalizeInteger(rule.value, 1, 3, 3)
    : 3
}

function createTransferStrategy(request) {
  const source = request.strategy ?? {}
  const rules = request.hardRules ?? {}
  const minimumBankRule = rules.minMoneyInBank
  const maximumHitRule = rules.maxTransferHit

  return {
    ...source,
    hardRules: {
      ...(source.hardRules ?? {}),
      ...(rules.minimumBank === undefined ? {} : { minimumBank: rules.minimumBank }),
      ...(rules.maximumPointsCost === undefined ? {} : { maximumPointsCost: rules.maximumPointsCost }),
      ...(minimumBankRule?.enabled
        ? { minimumBank: Math.max(0, toNumber(minimumBankRule.value)) }
        : {}),
      ...(maximumHitRule?.enabled
        ? { maximumPointsCost: Math.abs(toNumber(maximumHitRule.value)) }
        : {}),
    },
  }
}

function createInvalidResult(request, errors, warnings = []) {
  return {
    valid: false,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    request,
    inputSummary: null,
    seasonPlannerResult: null,
    seasonPlan: null,
    chipStrategyResult: null,
    wildcardAdvisory: null,
  }
}

function createCurrentTeamSquadResult({ squad, bank, validation, period }) {
  return {
    valid: true,
    errors: [],
    warnings: validation.warnings ?? [],
    result: {
      squad,
      totalPrice: validation.totalPrice,
      remainingBudget: bank,
      positionCounts: validation.positionCounts,
      clubCounts: validation.clubCounts,
    },
    validation,
    period: {
      startRound: period.startRound,
      endRound: period.startRound + period.roundCount - 1,
      roundCount: period.roundCount,
      rounds: Array.from(
        { length: period.roundCount },
        (_, index) => period.startRound + index,
      ),
    },
  }
}

function validateConfiguredClubLimit(squad, maximumPlayersPerClub) {
  if (maximumPlayersPerClub >= 3) return []
  const counts = new Map()
  squad.forEach((player) => {
    const club = String(player?.club ?? '').trim()
    if (club) counts.set(club, (counts.get(club) ?? 0) + 1)
  })
  return [...counts.entries()]
    .filter(([, count]) => count > maximumPlayersPerClub)
    .map(([club, count]) => (
      `De selectie bevat ${count} spelers van ${club}; volgens de ingestelde limiet zijn maximaal ${maximumPlayersPerClub} toegestaan.`
    ))
}

function emitProgress(onProgress, progress) {
  if (typeof onProgress !== 'function') return
  try {
    onProgress(progress)
  } catch {
    // Voortgang mag de deterministische optimizer nooit onderbreken.
  }
}

function createPublicPreseason(preseason) {
  if (!preseason) return null
  const {
    squadResult: _squadResult,
    lineupResult: _lineupResult,
    initialLineupResult: _initialLineupResult,
    ...publicPreseason
  } = preseason
  return publicPreseason
}

export function runManagerOptimizerCore({
  request: sourceRequest,
  players: sourcePlayers = [],
  databaseSummary = {},
  onProgress,
} = {}) {
  const request = structuredClone(sourceRequest ?? {})
  emitProgress(onProgress, { phase: 'request-validation' })
  const seasonPhase = request.seasonStatus?.phase ?? request.seasonPhase
  if (!['preseason', 'in-season'].includes(seasonPhase)) {
    return createInvalidResult(request, ['De actuele seizoensfase is ongeldig of ontbreekt.'])
  }
  request.seasonPhase = seasonPhase
  request.seasonStatus = {
    phase: seasonPhase,
    firstPlayableRound: 1,
  }
  const activeSeason = databaseSummary?.activeSeason
  const players = sourcePlayers.filter(
    (player) => !activeSeason || player?.season === activeSeason,
  )
  const startRound = request.seasonPhase === 'preseason'
    ? 1
    : normalizeInteger(request.period.startRound, 1, 34, 1)
  const roundCount = normalizeInteger(request.period.roundCount, 1, 35 - startRound, 1)
  const period = { startRound, roundCount }
  const maximumPlayersPerClub = normalizeMaximumPlayersPerClub(request.hardRules)
  const warnings = []
  let currentSquad
  let bank
  let purchasePrices
  let manualSellingPrices
  let squadResult
  let preseason = null

  request.period = { ...period }

  if (
    request.seasonPhase === 'in-season' &&
    request.team.mode !== 'current-team'
  ) {
    return createInvalidResult(request, [
      'Tijdens het seizoen moet “Mijn huidige team verbeteren” als echte startselectie worden gebruikt.',
    ])
  }

  if (!players.length) {
    return createInvalidResult(request, [
      'Er zijn geen actuele spelers beschikbaar voor de FVT Manager.',
    ])
  }

  if (request.team.mode === 'current-team') {
    emitProgress(onProgress, { phase: 'resolving-current-team' })
    const resolved = resolveManagerCurrentTeam({
      importResult: request.team.importResult,
      players,
      bank: request.team.bank,
      purchasePrices: request.team.purchasePrices,
      manualSellingPrices: request.team.manualSellingPrices,
      maximumPlayersPerClub: request.seasonPhase === 'preseason'
        ? 3
        : maximumPlayersPerClub,
    })

    if (!resolved.valid) {
      return createInvalidResult(request, resolved.errors, resolved.warnings)
    }

    currentSquad = resolved.squad
    bank = resolved.bank
    purchasePrices = resolved.purchasePrices
    manualSellingPrices = resolved.manualSellingPrices
    warnings.push(...resolved.warnings)
    squadResult = createCurrentTeamSquadResult({
      squad: currentSquad,
      bank,
      validation: resolved.validation,
      period,
    })
  } else if (request.seasonPhase !== 'preseason') {
    emitProgress(onProgress, {
      phase: 'building-new-team',
      stage: 'candidate-preparation',
    })
    const minimumBankRule = request.hardRules?.minMoneyInBank
    const minimumBank = minimumBankRule?.enabled
      ? Math.max(0, toNumber(minimumBankRule.value))
      : 0
    const budget = Math.max(0, 100 - minimumBank)

    squadResult = roundCount === 1
      ? optimizeSquadForRound({
          players,
          round: startRound,
          budget,
          philosophy: request.strategy,
          onProgress: (progress) => emitProgress(onProgress, {
            phase: 'building-new-team',
            ...progress,
          }),
        })
      : optimizeSquadForPeriod({
          players,
          startRound,
          roundCount,
          budget,
          philosophy: request.strategy,
          onProgress: (progress) => emitProgress(onProgress, {
            phase: 'building-new-team',
            ...progress,
          }),
        })

    if (!squadResult.valid || !squadResult.result?.squad) {
      return createInvalidResult(
        request,
        squadResult.errors ?? ['Er kon geen geldige nieuwe selectie worden gebouwd.'],
        squadResult.warnings ?? [],
      )
    }

    currentSquad = squadResult.result.squad
    // optimizerSquad rekent de vrije ruimte binnen het verlaagde
    // selectiebudget uit. De gereserveerde bank hoort daar nog bij.
    bank = Math.round(
      (minimumBank + toNumber(squadResult.result.remainingBudget)) * 10,
    ) / 10
    squadResult = {
      ...squadResult,
      result: {
        ...squadResult.result,
        remainingBudget: bank,
      },
    }
    // Een nieuw gebouwd team heeft geen historische aankoop- of handmatige
    // verkoopprijzen uit een eerder geïmporteerd current-team.
    purchasePrices = {}
    manualSellingPrices = {}
    warnings.push(...(squadResult.warnings ?? []))

    const clubErrors = validateConfiguredClubLimit(currentSquad, maximumPlayersPerClub)
    if (clubErrors.length) {
      return createInvalidResult(request, clubErrors, warnings)
    }
  }

  if (request.seasonPhase === 'preseason') {
    emitProgress(onProgress, { phase: 'preparing-preseason' })
    if (request.team.mode === 'current-team') {
      emitProgress(onProgress, { phase: 'evaluating-current-team' })
    }
    preseason = optimizePreseasonTeam({
      mode: request.team.mode,
      currentSquad: currentSquad ?? [],
      playerPool: players,
      bank: bank ?? request.team.bank,
      purchasePrices: purchasePrices ?? request.team.purchasePrices,
      manualSellingPrices: manualSellingPrices ?? request.team.manualSellingPrices,
      strategy: request.strategy,
      hardRules: request.hardRules,
      startRound: 1,
      roundCount,
      onProgress: (progress) => emitProgress(onProgress, progress),
    })
    if (!preseason.valid) {
      return createInvalidResult(request, preseason.errors, preseason.warnings)
    }
    currentSquad = preseason.finalTeam
    bank = preseason.bankAfter
    purchasePrices = preseason.purchasePrices
    manualSellingPrices = preseason.manualSellingPrices
    squadResult = preseason.squadResult
    warnings.push(...preseason.warnings)
  }

  const validation = validateSquad(currentSquad, { unlimitedBudget: true })
  if (!validation.valid) {
    return createInvalidResult(request, validation.errors, [
      ...warnings,
      ...validation.warnings,
    ])
  }

  bank = Math.round(toNumber(bank) * 10) / 10
  const freeTransfers = preseason
    ? 0
    : normalizeInteger(request.team.freeTransfers, 0, 5, 1)
  request.team = {
    ...request.team,
    squad: currentSquad,
    bank,
    freeTransfers,
    purchasePrices: { ...purchasePrices },
    manualSellingPrices: { ...manualSellingPrices },
  }
  const transferStrategy = createTransferStrategy(request)
  emitProgress(onProgress, { phase: 'evaluating-chip-strategy' })

const wildcardPlanning =
  request.chips?.wildcardPlanning ?? {
    mode: 'advisory',
    round: null,
  }

const wildcardAdvisory =
  wildcardPlanning.mode === 'advisory'
    ? analyzeWildcardMoments({
        squad: currentSquad,

        startRound,

        roundCount,

        maximumRecommendations: 3,

        lookAheadRounds: 3,
      })
    : {
        valid: true,

        errors: [],

        warnings: [],

        mode:
          wildcardPlanning.mode,

        recommendations: [],

        rounds: [],
      }

  const chipStrategyResult = evaluateChipStrategy({
    squad: currentSquad,
    playerPool: players,
    startRound,
    roundCount,
    strategy: request.chips,
    state: request.chips?.state,
    philosophy: request.strategy,
    bank,
    purchasePrices,
    manualSellingPrices,
    hardRules: request.hardRules,
    onProgress: (progress) => emitProgress(onProgress, {
      phase: 'evaluating-chip-strategy',
      ...progress,
    }),
  })

  if (!chipStrategyResult.valid) {
    return createInvalidResult(request, chipStrategyResult.errors, [
      ...warnings,
      ...(chipStrategyResult.warnings ?? []),
    ])
  }

  emitProgress(onProgress, {
    phase: preseason ? 'optimizing-round-1-lineup' : 'optimizing-lineup',
  })
  const planningLineupResult = preseason?.lineupResult ??
    optimizeLineupForRound({ squad: currentSquad, round: startRound })

  if (!planningLineupResult.valid) {
    return createInvalidResult(request, planningLineupResult.errors, [
      ...warnings,
      ...(planningLineupResult.warnings ?? []),
    ])
  }

  const displayedLineupResult = preseason?.mode === 'current-team'
    ? preseason.initialLineupResult
    : planningLineupResult

  emitProgress(onProgress, { phase: 'generating-first-transfer-advice' })
  const transferPlannerResult = planSingleTransfers({
    currentSquad,
    playerPool: players,
    bank,
    availableFreeTransfers: freeTransfers,
    startRound,
    roundCount: 1,
    purchasePrices,
    manualSellingPrices,
    strategy: transferStrategy,
  })
  let initialOptionsAvailable = true
  const initialSquadIds = currentSquad.map(getPlayerId).join('|')
  const actionProvider = (options) => {
    const optionSquadIds = (options.currentSquad ?? [])
      .map(getPlayerId)
      .join('|')
    const isInitialState = (
      initialOptionsAvailable &&
      options.startRound === startRound &&
      options.roundCount === 1 &&
      toNumber(options.bank, -1) === bank &&
      Number(options.availableFreeTransfers) === freeTransfers &&
      optionSquadIds === initialSquadIds
    )

    if (isInitialState) {
      initialOptionsAvailable = false
      return createInitialPlannerActionResult(
        transferPlannerResult,
        preseason ? 1 : Number(options.maximumActions) || 10,
      )
    }

    return generatePlannerActions(options)
  }
  emitProgress(onProgress, {
    phase: preseason ? 'planning-regular-season' : 'planning-season',
    currentGeneration: 0,
    totalGenerations: roundCount,
    processedStates: 0,
    selectedActions: 0,
  })
  const seasonPlannerResult = planSeason({
    currentSquad,
    playerPool: players,
    bank,
    availableFreeTransfers: freeTransfers,
    startRound,
    roundCount,
    maximumRounds: roundCount,
    purchasePrices,
    chipState: request.chips?.state,
    chipStrategy: {
  ...request.chips,

  forcedSchedule:
    wildcardPlanning.mode === 'forced' &&
    Number.isInteger(
      Number(
        wildcardPlanning.round,
      ),
    )
      ? [
          {
            chipId: 'wildcard',

            round:
              Number(
                wildcardPlanning.round,
              ),
          },
        ]
      : [],
},
    chipOpportunity: chipStrategyResult,
    hardRules: request.hardRules,
    manualSellingPrices,
    strategy: transferStrategy,
    actionProvider,
    onProgress: (progress) => emitProgress(onProgress, {
      phase: preseason ? 'planning-regular-season' : 'planning-season',
      ...progress,
    }),
  })
  emitProgress(onProgress, { phase: 'building-timeline' })
  const regularSeasonPlan = createSeasonPlanTimeline({ plannerResult: seasonPlannerResult })
  const seasonPlan = regularSeasonPlan.valid && preseason
    ? {
        ...regularSeasonPlan,
        seasonPhase: 'preseason',
        preseason: createPublicPreseason(preseason),
        timeline: regularSeasonPlan.timeline.map((entry, index) => ({
          ...entry,
          preseasonOpeningRound: index === 0,
        })),
      }
    : regularSeasonPlan

  if (!seasonPlannerResult.valid || !seasonPlan.valid) {
    return createInvalidResult(
      request,
      [...(seasonPlannerResult.errors ?? []), ...(seasonPlan.errors ?? [])],
      [
        ...warnings,
        ...(seasonPlannerResult.warnings ?? []),
        ...(seasonPlan.warnings ?? []),
      ],
    )
  }

  let counterfactualPlan = null
  let counterfactualChipId = null
  if (request.chips?.mode === 'automatic') {
    const globalSchedule = seasonPlan.timeline.filter((entry) => entry.chip?.used)
    const differingLocal = chipStrategyResult.periods.flatMap((period) => (
      period.recommendations.map((entry) => ({ entry, period }))
    )).find(({ entry, period }) => {
        const global = globalSchedule.find((item) => item.chip?.id === entry.chipId && item.round >= period.startRound && item.round <= period.endRound)
        return entry.recommended && global && entry.recommended.round !== global.round &&
          entry.recommended.round >= startRound && entry.recommended.round < startRound + roundCount
      })
    if (differingLocal) {
      const localEntry = differingLocal.entry
      counterfactualChipId = localEntry.chipId
      emitProgress(onProgress, { phase: 'planning-chip-counterfactual', chipId: counterfactualChipId })
      const counterfactualPlanner = planSeason({
        currentSquad,
        playerPool: players,
        bank,
        availableFreeTransfers: freeTransfers,
        startRound,
        roundCount,
        maximumRounds: roundCount,
        purchasePrices,
        chipState: request.chips?.state,
        chipStrategy: {
          ...request.chips,
          forcedSchedule: [{ chipId: localEntry.chipId, round: localEntry.recommended.round }],
        },
        chipOpportunity: chipStrategyResult,
        hardRules: request.hardRules,
        manualSellingPrices,
        strategy: transferStrategy,
        actionProvider: generatePlannerActions,
        onProgress: (progress) => emitProgress(onProgress, {
          phase: 'planning-chip-counterfactual',
          chipId: counterfactualChipId,
          ...progress,
        }),
      })
      if (counterfactualPlanner.valid) {
        const timelineResult = createSeasonPlanTimeline({ plannerResult: counterfactualPlanner })
        if (timelineResult.valid) counterfactualPlan = timelineResult
      }
    }
  }
  const executedChipStrategyResult = createExecutedChipAnalysis({
    opportunity: chipStrategyResult,
    seasonPlan,
    counterfactualPlan,
    counterfactualChipId,
  })

  const managerAnalysis = createManagerAnalysis({
    seasonPlan,
    lineupResult: displayedLineupResult,
    optimizedLineupResult: planningLineupResult,
    transferPlannerResult,
    seasonPlannerResult,
    preseason,
  })
  const coachIntelligence = createManagerCoachAnalysis({
    request,
    initialState: seasonPlannerResult.initialState,
    preseason,
    seasonPlan,
    bestPath: seasonPlannerResult.bestPath,
    chipStrategy: request.chips,
    chipExecutionAnalysis: executedChipStrategyResult,
    managerAnalysis,
    horizon: executedChipStrategyResult?.horizon,
    diagnostics: seasonPlannerResult.statistics,
  })

  const inputSummary = {
    seasonPhase: request.seasonPhase,
    teamMode: request.team.mode,
    squadIds: (preseason?.initialTeam?.length
      ? preseason.initialTeam
      : currentSquad).map(getPlayerId),
    squadNames: (preseason?.initialTeam?.length
      ? preseason.initialTeam
      : currentSquad).map((player) => player?.name ?? null),
    finalSquadIds: currentSquad.map(getPlayerId),
    finalSquadNames: currentSquad.map((player) => player?.name ?? null),
    bank,
    freeTransfers,
    startRound,
    roundCount,
  }

  const result = {
    ...displayedLineupResult,
    valid: true,
    errors: [],
    warnings: [...new Set([
      ...warnings,
      ...(displayedLineupResult.warnings ?? []),
      ...(transferPlannerResult.warnings ?? []),
      ...(seasonPlannerResult.warnings ?? []),
      ...(seasonPlan.warnings ?? []),
    ])],
    request,
    inputSummary,
    squadResult,
    transferPlannerResult,
    seasonPlannerResult,
    seasonPlan,
    chipStrategyResult: executedChipStrategyResult,
    wildcardAdvisory,
    managerAnalysis,
    coachIntelligence,
    period: {
      startRound,
      endRound: startRound + roundCount - 1,
      roundCount,
      rounds: Array.from(
        { length: roundCount },
        (_, index) => startRound + index,
      ),
    },
  }
  emitProgress(onProgress, { phase: 'completed' })
  return result
}

export function runManagerOptimizer({ managerSettings, managerTeamState, onProgress } = {}) {
  const request = createManagerOptimizerRequest({ managerSettings, managerTeamState })
  return runManagerOptimizerCore({
    request,
    players: getPlayerProfiles(),
    databaseSummary: getDatabaseSummary(),
    onProgress,
  })
}

export default runManagerOptimizer
