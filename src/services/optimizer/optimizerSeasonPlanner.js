/*
|--------------------------------------------------------------------------
| Fantasy Studio — Season Planner
|--------------------------------------------------------------------------
|
| De Season Planner zoekt met Beam Search naar het beste pad over meerdere
| speelrondes. De Transfer Planner blijft de beslismotor voor de acties die
| vanuit één state beschikbaar zijn. Deze module beheert uitsluitend de
| zoekruimte, cumulatieve scores, state merging en padreconstructie.
|
*/

import {
  generatePlannerActions,
} from './optimizerTransferPlanner.js'

import {
  simulateSeasonRound,
} from './optimizerSeasonEngine.js'

import { canonicalizeChipState } from './optimizerChipStrategy.js'
import {
  getRemainingChipUses,
  normalizeChipId,
} from './optimizerChipStrategy.js'
import { generateChipSquadAction } from './optimizerChipActionProvider.js'

export const DEFAULT_SEASON_PLANNER = {
  beamWidth: 50,
  scoreWindow: 2,
  maximumRounds: 10,
  maximumOptionsPerState: 10,
  mergeIdenticalStates: true,
  terminalFreeTransferValuePerTransfer: null,
  maximumChipActionsPerState: 4,
  maximumSquadChipStatesPerGeneration: 2,
}

function toNumber(value, fallback = 0) {
  const number = Number(value)

  return Number.isFinite(number)
    ? number
    : fallback
}

function isMissingValue(value) {
  return (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  )
}

function round(value, digits = 2) {
  const factor = 10 ** digits

  return Math.round(
    (
      toNumber(value) +
      Number.EPSILON
    ) * factor,
  ) / factor
}

function clampInteger(
  value,
  minimum,
  maximum,
  fallback,
) {
  if (isMissingValue(value)) {
    return fallback
  }

  return Math.max(
    minimum,
    Math.min(
      maximum,
      Math.floor(
        toNumber(value, fallback),
      ),
    ),
  )
}

function normalizeBoolean(value, fallback) {
  if (isMissingValue(value)) {
    return fallback
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()

    if (normalized === 'true') {
      return true
    }

    if (normalized === 'false') {
      return false
    }
  }

  return fallback
}

function normalizeConfig(config = {}, strategy = {}) {
  const configuredTerminalTransferValue =
    config.terminalFreeTransferValuePerTransfer

  const strategyTerminalTransferValue =
    strategy?.preferences?.estimatedValuePerStoredTransfer

  return {
    beamWidth:
      clampInteger(
        config.beamWidth,
        1,
        1000,
        DEFAULT_SEASON_PLANNER.beamWidth,
      ),

    scoreWindow:
      isMissingValue(config.scoreWindow)
        ? DEFAULT_SEASON_PLANNER.scoreWindow
        : Math.max(
            0,
            toNumber(
              config.scoreWindow,
              DEFAULT_SEASON_PLANNER.scoreWindow,
            ),
          ),

    maximumRounds:
      clampInteger(
        config.maximumRounds,
        1,
        34,
        DEFAULT_SEASON_PLANNER.maximumRounds,
      ),

    maximumOptionsPerState:
      clampInteger(
        config.maximumOptionsPerState,
        2,
        1000,
        DEFAULT_SEASON_PLANNER.maximumOptionsPerState,
      ),

    maximumChipActionsPerState:
      clampInteger(
        config.maximumChipActionsPerState,
        1,
        4,
        DEFAULT_SEASON_PLANNER.maximumChipActionsPerState,
      ),

    maximumSquadChipStatesPerGeneration:
      clampInteger(
        config.maximumSquadChipStatesPerGeneration,
        1,
        20,
        DEFAULT_SEASON_PLANNER.maximumSquadChipStatesPerGeneration,
      ),

    mergeIdenticalStates:
      normalizeBoolean(
        config.mergeIdenticalStates,
        DEFAULT_SEASON_PLANNER.mergeIdenticalStates,
      ),

    terminalFreeTransferValuePerTransfer:
      Math.max(
        0,
        isMissingValue(configuredTerminalTransferValue)
          ? toNumber(strategyTerminalTransferValue, 0)
          : toNumber(configuredTerminalTransferValue, 0),
      ),
  }
}

function readPriceEntries(source) {
  if (source instanceof Map) {
    return [...source.entries()]
  }

  if (source && typeof source === 'object') {
    return Object.entries(source)
  }

  return []
}

function normalizePurchasePrices(source, squad = null) {
  const relevantPlayerIds = Array.isArray(squad)
    ? new Set(
        squad
          .map(normalizePlayerId)
          .filter(Boolean),
      )
    : null

  return Object.fromEntries(
    readPriceEntries(source)
      .map(([playerId, price]) => ({
        playerId: String(playerId).trim(),
        rawPrice: price,
        price: Number(price),
      }))
      .filter(({ playerId, rawPrice, price }) =>
        playerId &&
        !isMissingValue(rawPrice) &&
        Number.isFinite(price) &&
        price >= 0 &&
        (
          !relevantPlayerIds ||
          relevantPlayerIds.has(playerId)
        ),
      )
      .map(({ playerId, price }) => [
        playerId,
        round(price, 1),
      ])
      .sort(([leftId], [rightId]) =>
        leftId.localeCompare(rightId, 'en'),
      ),
  )
}

function normalizePlayerId(player) {
  const directId =
    player?.id ??
    player?.playerId

  if (
    directId !== null &&
    directId !== undefined &&
    String(directId).trim()
  ) {
    return String(directId).trim()
  }

  const name =
    String(player?.name ?? '').trim()

  const club =
    String(player?.club ?? '').trim()

  return [name, club]
    .filter(Boolean)
    .join('@')
}

function createStateKey({
  round: roundNumber,
  squad,
  bank,
  freeTransfers,
  purchasePrices,
  manualSellingPrices,
  chipState,
}) {
  const squadIds = (
    Array.isArray(squad)
      ? squad
      : []
  )
    .map(normalizePlayerId)
    .sort((left, right) =>
      left.localeCompare(right, 'en'),
    )

  // JSON voorkomt dubbelzinnige keys wanneer een speler-ID scheidingstekens
  // bevat. Geld wordt op één decimaal gecanonicaliseerd, conform de regels.
  return JSON.stringify([
    Number(roundNumber),
    squadIds,
    round(bank, 1),
    Math.max(0, Math.floor(toNumber(freeTransfers))),
    Object.entries(normalizePurchasePrices(purchasePrices, squad))
      .map(([playerId, price]) => [
        playerId,
        Math.round(price * 10),
      ]),
    Object.entries(normalizePurchasePrices(manualSellingPrices, squad))
      .map(([playerId, price]) => [playerId, Math.round(price * 10)]),
    canonicalizeChipState(chipState),
  ])
}

function createStateId(depth, sequence) {
  return `season-state-${String(depth).padStart(2, '0')}-${String(
    sequence,
  ).padStart(8, '0')}`
}

function createPlannerState({
  id,
  round: roundNumber,
  squad,
  bank,
  freeTransfers,
  purchasePrices = {},
  manualSellingPrices = {},
  chipState = {},
  cumulativeExpectedPoints = 0,
  cumulativeTransferPointsCost = 0,
  cumulativeNetExpectedPoints = 0,
  cumulativeChipIncrementalPoints = 0,
  parentStateId = null,
  action = null,
  depth = 0,
  warnings = [],
}) {
  const state = {
    id,
    round: roundNumber,
    squad: Array.isArray(squad) ? [...squad] : [],
    bank: round(bank, 1),
    freeTransfers:
      Math.max(0, Math.floor(toNumber(freeTransfers))),
    purchasePrices:
      normalizePurchasePrices(purchasePrices, squad),
    manualSellingPrices:
      normalizePurchasePrices(manualSellingPrices, squad),
    chipState: canonicalizeChipState(chipState),
    cumulativeExpectedPoints:
      round(cumulativeExpectedPoints, 2),
    cumulativeTransferPointsCost:
      round(cumulativeTransferPointsCost, 0),
    cumulativeNetExpectedPoints:
      round(cumulativeNetExpectedPoints, 2),
    cumulativeChipIncrementalPoints:
      round(cumulativeChipIncrementalPoints, 2),
    plannerScore:
      round(cumulativeNetExpectedPoints, 2),
    score:
      round(cumulativeNetExpectedPoints, 2),
    stateKey: '',
    parentStateId,
    action,
    depth,
    warnings: Array.isArray(warnings) ? [...warnings] : [],
  }

  state.stateKey = createStateKey(state)

  return state
}

function getOptionId(option) {
  if (option?.id) {
    return String(option.id)
  }

  const playersOut = Array.isArray(option?.playersOut)
    ? option.playersOut
    : option?.playerOut
      ? [option.playerOut]
      : []
  const playersIn = Array.isArray(option?.playersIn)
    ? option.playersIn
    : option?.playerIn
      ? [option.playerIn]
      : []

  return JSON.stringify([
    option?.actionType ?? 'unknown',
    playersOut.map(normalizePlayerId).sort(),
    playersIn.map(normalizePlayerId).sort(),
  ])
}

function compareOptions(left, right) {
  return (
    toNumber(right?.decisionScore) -
      toNumber(left?.decisionScore) ||
    toNumber(right?.netExpectedPointsGain) -
      toNumber(left?.netExpectedPointsGain) ||
    toNumber(right?.expectedPointsAfter) -
      toNumber(left?.expectedPointsAfter) ||
    toNumber(right?.nextFreeTransfers) -
      toNumber(left?.nextFreeTransfers) ||
    toNumber(right?.bankAfter) -
      toNumber(left?.bankAfter) ||
    getOptionId(left).localeCompare(
      getOptionId(right),
      'en',
    )
  )
}

function selectOptions(options, maximumOptionsPerState) {
  const validOptions = options
    .filter((option) => option?.valid !== false)

  const noTransferOption = validOptions.find(
    (option) => option.actionType === 'no-transfer',
  )

  const otherOptions = validOptions
    .filter((option) => option !== noTransferOption)
    .sort(compareOptions)

  if (!noTransferOption) {
    return otherOptions.slice(0, maximumOptionsPerState)
  }

  return [
    noTransferOption,
    ...otherOptions.slice(
      0,
      Math.max(0, maximumOptionsPerState - 1),
    ),
  ]
}

function serializeCompactPlayer(playerOrEntry) {
  const player = playerOrEntry?.player ?? playerOrEntry
  if (!player) return null

  const priceCandidates = [
    player.currentPrice,
    player.endPrice,
    player.price,
    player.startPrice,
  ]
  const price = priceCandidates.find((value) =>
    value !== null && value !== undefined && value !== '' &&
    Number.isFinite(Number(value)) && Number(value) >= 0,
  )

  return {
    id: normalizePlayerId(player) || null,
    name: player.name ?? null,
    club: player.club ?? null,
    position: player.fantasyPosition ?? player.position ?? null,
    price: price === undefined ? null : round(price, 1),
  }
}

function createCompactAction(option, transition) {
  const playersOut = Array.isArray(option.playersOut)
    ? option.playersOut
    : option.playerOut
      ? [option.playerOut]
      : []
  const playersIn = Array.isArray(option.playersIn)
    ? option.playersIn
    : option.playerIn
      ? [option.playerIn]
      : []

  return {
    id: getOptionId(option),
    round: transition.round,
    actionType: option.actionType,
    chip: transition.chip ? structuredClone(transition.chip) : null,
    chipScenario: option.scenario ? structuredClone(option.scenario) : null,
    playerOutId: normalizePlayerId(option.playerOut) || null,
    playerOutName: option.playerOut?.name ?? null,
    playerInId: normalizePlayerId(option.playerIn) || null,
    playerInName: option.playerIn?.name ?? null,
    playersOut: playersOut.map(serializeCompactPlayer),
    playersIn: playersIn.map(serializeCompactPlayer),
    transferPairs: (option.transferPairs ?? []).map((pair) => ({
      playerOut: serializeCompactPlayer(pair.playerOut),
      playerIn: serializeCompactPlayer(pair.playerIn),
    })),
    transfers: (option.transfers ?? option.transferPairs ?? []).map((transfer) => ({
      playerOut: serializeCompactPlayer(transfer.playerOut),
      playerIn: serializeCompactPlayer(transfer.playerIn),
    })),
    sellingPrices: Array.isArray(option.sellingPrices)
      ? [...option.sellingPrices]
      : option.sellingPrice === null || option.sellingPrice === undefined
        ? []
        : [option.sellingPrice],
    buyingPrices: Array.isArray(option.buyingPrices)
      ? [...option.buyingPrices]
      : option.buyingPrice === null || option.buyingPrice === undefined
        ? []
        : [option.buyingPrice],
    transfersMade: Number(option.transfersMade) || 0,
    bankBefore: transition.stateBefore.bank,
    bankAfter: transition.stateAfter.bank,
    freeTransfersBefore:
      transition.stateBefore.freeTransfers,
    freeTransfersAfterMove:
      option.freeTransfersAfterMove,
    nextFreeTransfers:
      transition.stateAfter.freeTransfers,
    expectedPoints: transition.expectedPoints,
    lineupExpectedPoints: transition.lineupExpectedPoints,
    normalCaptainBonus: transition.normalCaptainBonus,
    chipIncrementalPoints: transition.chipIncrementalPoints,
    transferPointsCost: transition.transferPointsCost,
    netExpectedPoints: transition.netExpectedPoints,
    decisionScore: round(option.decisionScore, 2),
    expectedPointsGain:
      round(option.expectedPointsGain, 2),
    netExpectedPointsGain:
      round(option.netExpectedPointsGain, 2),
    formation: option.lineup?.formation ?? null,
    lineup: {
      formation: option.lineup?.formation ?? null,
      captain: serializeCompactPlayer(option.lineup?.captain),
      viceCaptain: serializeCompactPlayer(option.lineup?.viceCaptain),
      starters: (option.lineup?.starters ?? [])
        .map(serializeCompactPlayer)
        .filter(Boolean),
      bench: (
        Array.isArray(option.lineup?.bench)
          ? option.lineup.bench
          : option.lineup?.bench?.ordered ?? []
      )
        .map(serializeCompactPlayer)
        .filter(Boolean),
    },
    persistentSquad: (transition.persistentSquad ?? transition.stateAfter.squad)
      .map(serializeCompactPlayer).filter(Boolean),
    roundSquad: (transition.roundSquad ?? transition.stateAfter.squad)
      .map(serializeCompactPlayer).filter(Boolean),
  }
}

function opportunityChipIdsForRound(opportunity, roundNumber) {
  return (opportunity?.periods ?? []).flatMap((period) => period.recommendations ?? [])
    .filter((entry) => [entry.recommended, ...(entry.alternatives ?? [])]
      .some((candidate) => Number(candidate?.round) === Number(roundNumber)))
    .sort((left, right) => {
      const leftValue = [left.recommended, ...(left.alternatives ?? [])]
        .find((candidate) => Number(candidate?.round) === Number(roundNumber))?.netValue ?? -Infinity
      const rightValue = [right.recommended, ...(right.alternatives ?? [])]
        .find((candidate) => Number(candidate?.round) === Number(roundNumber))?.netValue ?? -Infinity
      return rightValue - leftValue || left.chipId.localeCompare(right.chipId, 'en')
    })
    .map((entry) => entry.chipId)
}

function chipIdsForState({
  state,
  chipStrategy,
  chipOpportunity,
  maximum,
} = {}) {
  if (
    !chipStrategy ||
    chipStrategy.mode === 'disabled'
  ) {
    return {
      mandatory: false,
      chipIds: [],
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Expliciet geforceerde chip
  |--------------------------------------------------------------------------
  |
  | Dit wordt onder andere gebruikt wanneer de gebruiker zelf een
  | Wildcardronde heeft gekozen.
  |
  */

  const forced =
    (
      chipStrategy.forcedSchedule ??
      []
    ).find(
      (entry) =>
        Number(entry.round) ===
        Number(state.round),
    )

  if (forced) {
    const forcedChipId =
      normalizeChipId(
        forced.chipId,
      )

    return {
      mandatory:
        Boolean(forcedChipId),

      chipIds:
        forcedChipId
          ? [forcedChipId]
          : [],
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Handmatige chipplanning
  |--------------------------------------------------------------------------
  */

  if (
    chipStrategy.mode === 'manual'
  ) {
    const selected =
      (
        chipStrategy.schedule ??
        []
      ).find(
        (entry) =>
          (
            entry.decision === undefined ||
            entry.decision === 'scheduled'
          ) &&
          Number(entry.round) ===
            Number(state.round),
      )

    const selectedChipId =
      normalizeChipId(
        selected?.chipId,
      )

    return {
      mandatory:
        Boolean(selectedChipId),

      chipIds:
        selectedChipId
          ? [selectedChipId]
          : [],
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Automatische chipplanning
  |--------------------------------------------------------------------------
  */

  const allowed =
    new Set(
      chipStrategy.allowedChips ??
      [],
    )

  const isAvailable = (
    chipId,
  ) =>
    allowed.has(chipId) &&
    getRemainingChipUses(
      state.chipState,
      chipId,
      state.round,
    ) > 0

  const chipIds = []

  /*
  |--------------------------------------------------------------------------
  | Suikeroom
  |--------------------------------------------------------------------------
  |
  | Suikeroom wordt in iedere speelronde als mogelijk alternatief
  | aangeboden. De waarde is afhankelijk van de concrete plannerstate:
  | het huidige team, de transfers en de spelers met een vrije ronde.
  |
  | Daarom mag Suikeroom niet afhankelijk zijn van een vooraf berekende
  | opportunity-shortlist.
  |
  */

  if (
    isAvailable(
      'sugar-daddy',
    )
  ) {
    chipIds.push(
      'sugar-daddy',
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Scoringchips
  |--------------------------------------------------------------------------
  |
  | Aanvalluh! en Dynamisch Duo worden alleen aangeboden in rondes die
  | door de goedkope opportunity-analyse kansrijk zijn bevonden.
  |
  */

  opportunityChipIdsForRound(
    chipOpportunity,
    state.round,
  )
    .filter(
      (chipId) =>
        [
          'attacking',
          'dynamic-duo',
        ].includes(
          chipId,
        ),
    )
    .filter(
      isAvailable,
    )
    .forEach(
      (chipId) => {
        if (
          !chipIds.includes(
            chipId,
          )
        ) {
          chipIds.push(
            chipId,
          )
        }
      },
    )

  /*
  |--------------------------------------------------------------------------
  | Wildcard
  |--------------------------------------------------------------------------
  |
  | Wildcard wordt hier bewust niet automatisch toegevoegd.
  | Hij komt alleen binnen via forcedSchedule nadat de gebruiker zelf
  | een ronde heeft gekozen.
  |
  */

  return {
    mandatory: false,

    chipIds:
      chipIds.slice(
        0,
        Math.max(
          1,
          Number(maximum) || 1,
        ),
      ),
  }
}

function addChipToOption(option, chipId, source) {
  return {
    ...option,
    id: `${getOptionId(option)}|chip:${chipId}`,
    chip: { id: chipId, source },
  }
}

function compareStates(left, right) {
  return (
    right.cumulativeNetExpectedPoints -
      left.cumulativeNetExpectedPoints ||
    right.cumulativeExpectedPoints -
      left.cumulativeExpectedPoints ||
    left.cumulativeTransferPointsCost -
      right.cumulativeTransferPointsCost ||
    right.freeTransfers - left.freeTransfers ||
    right.bank - left.bank ||
    left.id.localeCompare(right.id, 'en')
  )
}

function createTerminalState(state, config) {
  const terminalValue =
    state.freeTransfers *
    config.terminalFreeTransferValuePerTransfer

  return {
    ...state,
    terminalFreeTransferValue:
      round(terminalValue, 2),
    terminalScore:
      round(
        state.cumulativeNetExpectedPoints + terminalValue,
        2,
      ),
  }
}

function compareTerminalStates(left, right) {
  return (
    right.terminalScore - left.terminalScore ||
    compareStates(left, right)
  )
}

function addStateWarning(state, warning) {
  return {
    ...state,
    warnings: [
      ...state.warnings,
      warning,
    ],
  }
}

function mergeStates(states, enabled) {
  if (!enabled) {
    return {
      states: [...states],
      mergedAway: 0,
    }
  }

  const bestByKey = new Map()

  states.forEach((state) => {
    const current = bestByKey.get(state.stateKey)

    if (!current || compareStates(state, current) < 0) {
      bestByKey.set(state.stateKey, state)
    }
  })

  return {
    states: [...bestByKey.values()],
    mergedAway: states.length - bestByKey.size,
  }
}

function reconstructPath(terminalState, stateRepository) {
  const path = []
  let current = terminalState

  while (current?.parentStateId) {
    path.push({
      round: current.action?.round ?? current.round - 1,
      action: current.action,
      resultingState: current,
    })

    current = stateRepository.get(current.parentStateId)
  }

  return path.reverse()
}

function createInvalidResult({
  errors,
  config,
  startRound,
  roundCount,
}) {
  const period = {
    startRound,
    endRound: startRound + roundCount - 1,
    roundCount,
  }

  const result = {
    plannerType: 'season-planner',
    period,
    config,
    initialState: null,
    bestPath: [],
    bestTerminalState: null,
    currentStates: [],
    completedPaths: 0,
    completedStates: [],
    deadEndStates: [],
    terminalStates: [],
    finalBeam: [],
    retainedTerminalStates: [],
    statistics: {
      generations: [],
      exploredStates: 0,
      exploredActions: 0,
      totalValidOptionsAvailable: 0,
      selectedOptions: 0,
      blockedOptionsAvailable: 0,
      optionsRemovedByMaximumOptionsPerState: 0,
      completedDepth: 0,
      stopReason: 'invalid-input',
    },
  }

  return {
    valid: false,
    errors,
    warnings: [],
    ...result,
    result,
  }
}

export function planSeason({
  currentSquad,
  playerPool,
  strategy = {},
  bank = 0,
  availableFreeTransfers = 1,
  startRound = 1,
  roundCount = 1,
  manualSellingPrices = {},
  purchasePrices = {},
  chipState = {},
  config = {},
  plannerConfig = {},
  beamWidth,
  scoreWindow,
  maximumRounds,
  maximumOptionsPerState,
  mergeIdenticalStates,
  terminalFreeTransferValuePerTransfer,
  chipStrategy = { mode: 'disabled' },
  chipOpportunity = null,
  hardRules = {},
  actionProvider = generatePlannerActions,
  onProgress,
} = {}) {
  const progressStartedAt = Date.now()
  const emitProgress = (progress) => {
    if (typeof onProgress !== 'function') return
    try { onProgress(progress) } catch { /* voortgang verandert geen zoekresultaat */ }
  }
  const normalizedConfig = normalizeConfig({
    ...plannerConfig,
    ...config,
    ...(beamWidth === undefined ? {} : { beamWidth }),
    ...(scoreWindow === undefined ? {} : { scoreWindow }),
    ...(maximumRounds === undefined ? {} : { maximumRounds }),
    ...(maximumOptionsPerState === undefined
      ? {}
      : { maximumOptionsPerState }),
    ...(mergeIdenticalStates === undefined
      ? {}
      : { mergeIdenticalStates }),
    ...(terminalFreeTransferValuePerTransfer === undefined
      ? {}
      : { terminalFreeTransferValuePerTransfer }),
  }, strategy)

  const normalizedStartRound =
    clampInteger(startRound, 1, 34, 1)

  const requestedRoundCount =
    clampInteger(roundCount, 1, 34, 1)

  const seasonRoundsRemaining = 35 - normalizedStartRound
  const normalizedRoundCount = Math.min(
    requestedRoundCount,
    seasonRoundsRemaining,
  )

  const plannedRoundCount = Math.min(
    normalizedRoundCount,
    normalizedConfig.maximumRounds,
  )

  const inputErrors = []

  if (!Array.isArray(currentSquad) || currentSquad.length !== 15) {
    inputErrors.push(
      'De Season Planner heeft een squad van precies vijftien spelers nodig.',
    )
  }

  if (!Array.isArray(playerPool) || playerPool.length === 0) {
    inputErrors.push(
      'De Season Planner heeft een niet-lege spelerspool nodig.',
    )
  }

  if (!Number.isFinite(Number(bank)) || Number(bank) < 0) {
    inputErrors.push('De bank moet een geldig positief bedrag zijn.')
  }

  if (
    !Number.isFinite(Number(availableFreeTransfers)) ||
    Number(availableFreeTransfers) < 0
  ) {
    inputErrors.push(
      'Het aantal vrije transfers moet een geldig positief getal zijn.',
    )
  }

  if (typeof actionProvider !== 'function') {
    inputErrors.push('De Season Planner heeft een geldige action provider nodig.')
  }

  if (inputErrors.length) {
    return createInvalidResult({
      errors: inputErrors,
      config: normalizedConfig,
      startRound: normalizedStartRound,
      roundCount: plannedRoundCount,
    })
  }

  let stateSequence = 0

  const initialState = createPlannerState({
    id: createStateId(0, stateSequence),
    round: normalizedStartRound,
    squad: currentSquad,
    bank,
    freeTransfers: availableFreeTransfers,
    purchasePrices,
    manualSellingPrices,
    chipState,
  })

  const stateRepository = new Map([
    [initialState.id, initialState],
  ])
  const chipSquadActionCache = new Map()

  let beam = [initialState]
  const deadEndStates = []
  const plannerWarnings = []
  const generations = []
  let exploredStates = 0
  let exploredActions = 0
  let completedDepth = 0
  let stopReason = 'horizon-reached'

  for (let depth = 0; depth < plannedRoundCount; depth += 1) {

    /*
|--------------------------------------------------------------------------
| Adaptieve zoekruimte
|--------------------------------------------------------------------------
|
| De eerste speelrondes worden ruimer onderzocht, omdat vroege transfers
| en chips grote gevolgen hebben voor alle vervolgrondes.
|
| Naarmate het plan verder gevorderd is, wordt de zoekruimte stapsgewijs
| verkleind om de rekentijd beheersbaar te houden.
|
*/

const roundsFromStart =
  depth + 1

const generationConfig =
  roundsFromStart <= 5
    ? {
        beamWidth: Math.max(
          normalizedConfig.beamWidth,
          150,
        ),

        scoreWindow: Math.max(
          normalizedConfig.scoreWindow,
          6,
        ),

        maximumOptionsPerState: Math.max(
          normalizedConfig.maximumOptionsPerState,
          20,
        ),

        maximumSquadChipStatesPerGeneration: Math.max(
          normalizedConfig.maximumSquadChipStatesPerGeneration,
          12,
        ),
      }
    : roundsFromStart <= 10
      ? {
          beamWidth: Math.max(
            normalizedConfig.beamWidth,
            100,
          ),

          scoreWindow: Math.max(
            normalizedConfig.scoreWindow,
            4,
          ),

          maximumOptionsPerState: Math.max(
            normalizedConfig.maximumOptionsPerState,
            16,
          ),

          maximumSquadChipStatesPerGeneration: Math.max(
            normalizedConfig.maximumSquadChipStatesPerGeneration,
            8,
          ),
        }
      : {
          beamWidth:
            normalizedConfig.beamWidth,

          scoreWindow:
            normalizedConfig.scoreWindow,

          maximumOptionsPerState:
            normalizedConfig.maximumOptionsPerState,

          maximumSquadChipStatesPerGeneration: Math.max(
            normalizedConfig.maximumSquadChipStatesPerGeneration,
            4,
          ),
        }

    const generation = {
      depth: depth + 1,
      round: normalizedStartRound + depth,
      inputStates: beam.length,
      generatedOptions: 0,
      totalValidOptionsAvailable: 0,
      blockedOptionsAvailable: 0,
      selectedOptions: 0,
      optionsRemovedByMaximumOptionsPerState: 0,
      invalidOptions: 0,
      statesBeforeMerge: 0,
      mergedAway: 0,
      removedByScoreWindow: 0,
      removedByBeamWidth: 0,
      outputStates: 0,
      bestScore: null,
      worstRetainedScore: null,
      rawSingleCombinations: 0,
      rawDoubleCombinations: 0,
      cheaplyRankedCandidates: 0,
      fullyEvaluatedActions: 0,
      skippedBeforeLineupOptimization: 0,
      actionProviderTimeMs: 0,
      stateProfiles: [],
    }

    const childStates = []

    for (const [stateIndex, state] of beam.entries()) {
      exploredStates += 1

      const transferResult = actionProvider({
        currentSquad: state.squad,
        playerPool,
        bank: state.bank,
        availableFreeTransfers: state.freeTransfers,
        startRound: state.round,
        roundCount: 1,
        manualSellingPrices: state.manualSellingPrices,
        purchasePrices: state.purchasePrices,
        strategy,
        maximumActions:generationConfig.maximumOptionsPerState,
      })

      if (!transferResult?.valid || !transferResult?.result) {
        generation.invalidOptions += 1
        const warning =
          `State ${state.id} kon in speelronde ${state.round} niet worden uitgebreid: ${(
            transferResult?.errors ?? ['onbekende fout']
          ).join(' ')}`

        plannerWarnings.push(warning)
        deadEndStates.push(
          addStateWarning(state, warning),
        )
        continue
      }

      if (!Array.isArray(transferResult.result.validOptions)) {
        generation.invalidOptions += 1
        const warning =
          `Action-providercontract ontbreekt voor state ${state.id}: result.validOptions is geen array.`

        plannerWarnings.push(warning)
        deadEndStates.push(
          addStateWarning(state, warning),
        )
        continue
      }

      const availableOptions = transferResult.result.validOptions
      const providerStatistics = transferResult.result.statistics ?? {}
      generation.generatedOptions += availableOptions.length
      generation.totalValidOptionsAvailable += availableOptions.length
      generation.blockedOptionsAvailable += Math.max(
        0,
        toNumber(
          transferResult.result.statistics?.totalBlockedOptions,
          0,
        ),
      )
      generation.rawSingleCombinations += Math.max(0, toNumber(providerStatistics.rawSingleCombinations, 0))
      generation.rawDoubleCombinations += Math.max(0, toNumber(providerStatistics.rawDoubleCombinations, 0))
      generation.cheaplyRankedCandidates += Math.max(0, toNumber(providerStatistics.cheaplyRankedCandidates, 0))
      generation.fullyEvaluatedActions += Math.max(0, toNumber(providerStatistics.fullyEvaluatedActions, availableOptions.length))
      generation.skippedBeforeLineupOptimization += Math.max(0, toNumber(providerStatistics.skippedBeforeLineupOptimization, 0))
      generation.actionProviderTimeMs = round(
        generation.actionProviderTimeMs + Math.max(0, toNumber(providerStatistics.timings?.totalMs, 0)),
        3,
      )
      generation.stateProfiles.push({
        stateId: state.id,
        returnedValidOptions: availableOptions.length,
        rawSingleCombinations: Math.max(0, toNumber(providerStatistics.rawSingleCombinations, 0)),
        rawDoubleCombinations: Math.max(0, toNumber(providerStatistics.rawDoubleCombinations, 0)),
        cheaplyRankedCandidates: Math.max(0, toNumber(providerStatistics.cheaplyRankedCandidates, 0)),
        fullyEvaluatedActions: Math.max(0, toNumber(providerStatistics.fullyEvaluatedActions, availableOptions.length)),
        skippedBeforeLineupOptimization: Math.max(0, toNumber(providerStatistics.skippedBeforeLineupOptimization, 0)),
        heapDeltaBytes: Number.isFinite(Number(providerStatistics.heapDeltaBytes))
          ? Number(providerStatistics.heapDeltaBytes)
          : null,
        timings: providerStatistics.timings ?? null,
      })

      const baseSelectedOptions = selectOptions(
  availableOptions,
  generationConfig.maximumOptionsPerState,
)
      const chipSelection = chipIdsForState({
        state,
        chipStrategy,
        chipOpportunity,
        maximum: normalizedConfig.maximumChipActionsPerState,
      })
      const scoringChipIds = chipSelection.chipIds.filter((id) => ['attacking', 'dynamic-duo'].includes(id))
      const squadChipIds = chipSelection.chipIds.filter((id) => ['wildcard', 'sugar-daddy'].includes(id))
      const selectedOptions = chipSelection.mandatory ? [] : [...baseSelectedOptions]
      scoringChipIds.forEach((chipId) => {
        const compatibleBaseOptions = chipSelection.mandatory
          ? baseSelectedOptions
          : baseSelectedOptions.slice(0, 1)
        compatibleBaseOptions.forEach((option) => selectedOptions.push(
          addChipToOption(option, chipId, chipStrategy.mode),
        ))
      })
      squadChipIds.forEach(
  (chipId) => {
    const squadChipStateLimit =
      chipId === 'sugar-daddy'
        ? Math.max(
            generationConfig
              .maximumSquadChipStatesPerGeneration,
            12,
          )
        : generationConfig
            .maximumSquadChipStatesPerGeneration

    if (
      stateIndex >=
      squadChipStateLimit
    ) {
      return
    }

    const remainingHorizon =
      Math.max(
        1,
        plannedRoundCount -
          depth,
      )
        const cacheKey = `${chipId}|${state.stateKey}|${remainingHorizon}`
        let squadAction = chipSquadActionCache.get(cacheKey)
        if (squadAction === undefined) {
          squadAction = generateChipSquadAction({
            chipId,
            source: chipStrategy.mode,
            state,
            playerPool,
            strategy,
            hardRules,
            manualSellingPrices: state.manualSellingPrices,
            horizon: remainingHorizon,
            onProgress: (progress) => emitProgress({
              currentGeneration: depth + 1,
              totalGenerations: plannedRoundCount,
              round: state.round,
              chipId,
              chipStage: progress?.stage ?? null,
              elapsedMs: Date.now() - progressStartedAt,
            }),
          })
          chipSquadActionCache.set(cacheKey, squadAction ?? null)
        }
        if (squadAction) selectedOptions.push(squadAction)
      })

      generation.invalidOptions += availableOptions.filter(
        (option) => option?.valid === false,
      ).length

      generation.selectedOptions += selectedOptions.length
      generation.optionsRemovedByMaximumOptionsPerState +=
        Math.max(0, availableOptions.length - selectedOptions.length)

      if (!selectedOptions.length) {
        const warning =
          `State ${state.id} heeft in speelronde ${state.round} geen uitbreidbare no-transfer- of single-transferopties.`

        plannerWarnings.push(warning)
        deadEndStates.push(
          addStateWarning(state, warning),
        )
        continue
      }

      const validTransitions = []
      const expansionWarnings = []

      for (const option of selectedOptions) {
        exploredActions += 1

        const transition = simulateSeasonRound({
          state,
          action: option,
          round: state.round,
        })

        if (!transition.valid) {
          generation.invalidOptions += 1
          const warning =
            `Actie ${getOptionId(option)} vanuit state ${state.id} is niet simuleerbaar: ${transition.errors.join(' ')}`

          expansionWarnings.push(warning)
          plannerWarnings.push(warning)
          continue
        }

        const transitionWarnings = transition.warnings.map(
          (warning) =>
            `Actie ${getOptionId(option)} vanuit state ${state.id}: ${warning}`,
        )

        plannerWarnings.push(...transitionWarnings)
        validTransitions.push({
          option,
          transition,
          transitionWarnings,
        })
      }

      if (!validTransitions.length) {
        const warning =
          `State ${state.id} heeft in speelronde ${state.round} geen simuleerbare transities opgeleverd.`

        plannerWarnings.push(warning)
        deadEndStates.push(
          addStateWarning(
            {
              ...state,
              warnings: [
                ...state.warnings,
                ...expansionWarnings,
              ],
            },
            warning,
          ),
        )
        continue
      }

      for (
        const {
          option,
          transition,
          transitionWarnings,
        } of validTransitions
      ) {
        const expectedPoints = transition.expectedPoints
        const transferPointsCost = transition.transferPointsCost

        const cumulativeExpectedPoints =
          state.cumulativeExpectedPoints + expectedPoints

        const cumulativeTransferPointsCost =
          state.cumulativeTransferPointsCost + transferPointsCost

        const cumulativeNetExpectedPoints =
          cumulativeExpectedPoints - cumulativeTransferPointsCost
        const cumulativeChipIncrementalPoints =
          state.cumulativeChipIncrementalPoints + transition.chipIncrementalPoints

        stateSequence += 1

        const child = createPlannerState({
          id: createStateId(depth + 1, stateSequence),
          round: transition.stateAfter.round,
          squad: transition.stateAfter.squad,
          bank: transition.stateAfter.bank,
          freeTransfers: transition.stateAfter.freeTransfers,
          purchasePrices: transition.stateAfter.purchasePrices,
          manualSellingPrices: transition.stateAfter.manualSellingPrices,
          chipState: transition.stateAfter.chipState ?? state.chipState,
          cumulativeExpectedPoints:
            cumulativeExpectedPoints,
          cumulativeTransferPointsCost:
            cumulativeTransferPointsCost,
          cumulativeNetExpectedPoints,
          cumulativeChipIncrementalPoints,
          parentStateId: state.id,
          action: createCompactAction(option, transition),
          depth: state.depth + 1,
          warnings: [
            ...state.warnings,
            ...transitionWarnings,
          ],
        })

        childStates.push(child)
        stateRepository.set(child.id, child)
      }
    }

    generation.statesBeforeMerge = childStates.length

    if (!childStates.length) {
      generation.outputStates = 0
      generations.push(generation)
      emitProgress({
        currentGeneration: depth + 1,
        totalGenerations: plannedRoundCount,
        round: generation.round,
        inputStates: generation.inputStates,
        outputStates: 0,
        processedStates: exploredStates,
        selectedActions: exploredActions,
        fullyEvaluatedActions: generation.fullyEvaluatedActions,
        bestScore: null,
        elapsedMs: Date.now() - progressStartedAt,
      })
      beam = []
      stopReason = 'no-expandable-states'
      break
    }

    const mergeResult = mergeStates(
      childStates,
      normalizedConfig.mergeIdenticalStates,
    )

    generation.mergedAway = mergeResult.mergedAway

    const mergedStates = mergeResult.states.sort(compareStates)
    const bestScore =
      mergedStates[0].cumulativeNetExpectedPoints

    const windowedStates = mergedStates.filter(
  (state) =>
    state.cumulativeNetExpectedPoints >=
      bestScore -
        generationConfig.scoreWindow,
)

    generation.removedByScoreWindow =
      mergedStates.length - windowedStates.length

    const nextBeam = windowedStates
  .sort(compareStates)
  .slice(
    0,
    generationConfig.beamWidth,
  )

    generation.removedByBeamWidth =
      windowedStates.length - nextBeam.length
    generation.outputStates = nextBeam.length
    generation.bestScore =
      nextBeam[0]?.cumulativeNetExpectedPoints ?? null
    generation.worstRetainedScore =
      nextBeam.at(-1)?.cumulativeNetExpectedPoints ?? null

    generations.push(generation)
    emitProgress({
      currentGeneration: depth + 1,
      totalGenerations: plannedRoundCount,
      round: generation.round,
      inputStates: generation.inputStates,
      outputStates: generation.outputStates,
      processedStates: exploredStates,
      selectedActions: exploredActions,
      fullyEvaluatedActions: generation.fullyEvaluatedActions,
      bestScore: generation.bestScore,
      elapsedMs: Date.now() - progressStartedAt,
    })
    beam = nextBeam
    completedDepth = depth + 1
  }

  if (
    completedDepth === plannedRoundCount &&
    plannedRoundCount < normalizedRoundCount
  ) {
    stopReason = 'maximum-rounds-reached'
  } else if (completedDepth === plannedRoundCount) {
    stopReason = 'horizon-reached'
  }

  const uniqueDeadEndStates = [
    ...new Map(
      deadEndStates.map((state) => [state.id, state]),
    ).values(),
  ]

  const completedStates = completedDepth === plannedRoundCount
    ? beam
        .filter((state) => state.depth === plannedRoundCount)
        .map((state) => createTerminalState(state, normalizedConfig))
        .sort(compareTerminalStates)
    : []

  const retainedTerminalStates = [...completedStates]
  const terminalStates = [
    ...completedStates,
    ...uniqueDeadEndStates,
  ]

  const bestTerminalState = completedStates[0] ?? null
  const bestPath = bestTerminalState
    ? reconstructPath(bestTerminalState, stateRepository)
    : []

  const statistics = {
    generations,
    exploredStates,
    exploredActions,
    totalValidOptionsAvailable:
      generations.reduce(
        (total, generation) =>
          total + generation.totalValidOptionsAvailable,
        0,
      ),
    selectedOptions:
      generations.reduce(
        (total, generation) =>
          total + generation.selectedOptions,
        0,
      ),
    blockedOptionsAvailable:
      generations.reduce(
        (total, generation) =>
          total + generation.blockedOptionsAvailable,
        0,
      ),
    optionsRemovedByMaximumOptionsPerState:
      generations.reduce(
        (total, generation) =>
          total + generation.optionsRemovedByMaximumOptionsPerState,
        0,
      ),
    rawSingleCombinations: generations.reduce(
      (total, generation) => total + generation.rawSingleCombinations, 0,
    ),
    rawDoubleCombinations: generations.reduce(
      (total, generation) => total + generation.rawDoubleCombinations, 0,
    ),
    cheaplyRankedCandidates: generations.reduce(
      (total, generation) => total + generation.cheaplyRankedCandidates, 0,
    ),
    fullyEvaluatedActions: generations.reduce(
      (total, generation) => total + generation.fullyEvaluatedActions, 0,
    ),
    skippedBeforeLineupOptimization: generations.reduce(
      (total, generation) => total + generation.skippedBeforeLineupOptimization, 0,
    ),
    actionProviderTimeMs: round(generations.reduce(
      (total, generation) => total + generation.actionProviderTimeMs, 0,
    ), 3),
    chipSquadScenarioCacheEntries: chipSquadActionCache.size,
    completedDepth,
    stopReason,
  }

  const period = {
    startRound: normalizedStartRound,
    endRound: normalizedStartRound + plannedRoundCount - 1,
    roundCount: plannedRoundCount,
    requestedRoundCount: normalizedRoundCount,
  }

  const result = {
    plannerType: 'season-planner',
    period,
    config: normalizedConfig,
    initialState,
    bestPath,
    bestTerminalState,
    currentStates: beam,
    finalBeam: beam,
    completedPaths: completedStates.length,
    completedStates,
    deadEndStates: uniqueDeadEndStates,
    terminalStates,
    retainedTerminalStates,
    statistics,
  }

  return {
    valid: completedStates.length > 0,
    errors: bestTerminalState
      ? []
      : [
          `De Season Planner heeft geen volledig pad over ${plannedRoundCount} speelronde(s) gevonden.`,
        ],
    warnings: plannerWarnings,
    ...result,
    result,
  }
}

export default planSeason
