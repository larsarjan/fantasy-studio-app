import { FANTASY_GAME_RULES, validateSquad } from '../fantasyGameRulesEngine.js'
import { optimizeLineupForRound } from './optimizerLineup.js'
import { optimizeSquadForPeriod } from './optimizerSquad.js'

function isValidPrice(value) {
  return value !== null && value !== undefined &&
    !(typeof value === 'string' && value.trim() === '') &&
    Number.isFinite(Number(value)) && Number(value) >= 0
}

function playerId(player) {
  return String(player?.id ?? player?.playerId ?? '').trim()
}

function currentPrice(player) {
  for (const value of [player?.currentPrice, player?.endPrice, player?.price, player?.startPrice]) {
    if (isValidPrice(value)) return Math.round(Number(value) * 10) / 10
  }
  return null
}

function readPriceMap(source) {
  return new Map(
    (source instanceof Map
      ? [...source.entries()]
      : source && typeof source === 'object' ? Object.entries(source) : [])
      .map(([id, value]) => [String(id ?? '').trim(), value])
      .filter(([id, value]) => id && isValidPrice(value))
      .map(([id, value]) => [id, Number(value)]),
  )
}

function canonicalPrices(squad, source, fallbackToCurrentPrice) {
  const supplied = readPriceMap(source)
  const result = {}
  squad.forEach((player) => {
    const id = playerId(player)
    const value = supplied.get(id)
    const price = isValidPrice(value)
      ? Number(value)
      : fallbackToCurrentPrice ? currentPrice(player) : null
    if (id && isValidPrice(price)) result[id] = price
  })
  return result
}

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => playerId(value) || String(value ?? '').trim())
    .filter(Boolean))]
}

function configuredRule(rule, fallback = null) {
  return rule?.enabled ? rule.value : fallback
}

export function optimizePreseasonTeam({
  mode = 'new-team',
  currentSquad = [],
  playerPool = [],
  bank = 0,
  purchasePrices = {},
  manualSellingPrices = {},
  strategy = {},
  hardRules = {},
  startRound = 1,
  roundCount = 1,
  onProgress,
} = {}) {
  const warnings = []
  const errors = []
  const inputTeam = mode === 'current-team' && Array.isArray(currentSquad)
    ? [...currentSquad]
    : []
  const initialIds = new Set(inputTeam.map(playerId).filter(Boolean))
  const minimumBank = Math.max(0, Number(configuredRule(hardRules.minMoneyInBank, hardRules.minimumBank)) || 0)
  const maximumPlayersPerClub = Math.max(1, Math.min(3,
    Math.floor(Number(configuredRule(hardRules.maxPlayersPerClub, 3)) || 3)))
  const minimumAvailability = configuredRule(hardRules.minPlayingChance, null)
  const lockedPlayerIds = uniqueIds(
    hardRules.lockedPlayerIds ?? strategy?.hardRules?.lockedPlayerIds,
  )
  const bannedPlayerIds = uniqueIds(
    hardRules.bannedPlayerIds ?? hardRules.bannedIncomingPlayerIds ??
      strategy?.hardRules?.bannedIncomingPlayerIds,
  )

  if (mode === 'current-team') {
    const validation = validateSquad(inputTeam, { unlimitedBudget: true })
    if (!validation.valid) errors.push(...validation.errors)
  }
  if (errors.length) {
    return { valid: false, errors: [...new Set(errors)], warnings, mode, inputTeam, initialTeam: inputTeam, finalTeam: [], changes: null }
  }

  let initialLineupResult = null
  if (mode === 'current-team') {
    initialLineupResult = optimizeLineupForRound({ squad: inputTeam, round: 1 })
    if (!initialLineupResult.valid) {
      return {
        valid: false,
        errors: initialLineupResult.errors,
        warnings: [...warnings, ...(initialLineupResult.warnings ?? [])],
        mode,
        inputTeam,
        initialTeam: inputTeam,
        finalTeam: [],
        changes: null,
      }
    }
  }

  const budget = Math.max(0, FANTASY_GAME_RULES.budget.startingBudget - minimumBank)
  const squadResult = optimizeSquadForPeriod({
    players: playerPool,
    startRound: 1,
    roundCount: Math.max(1, Number(roundCount) || 1),
    budget,
    philosophy: strategy,
    maximumPlayersPerClub,
    lockedPlayerIds,
    bannedPlayerIds,
    minimumAvailability,
    onProgress: (progress) => onProgress?.({ phase: 'building-preseason-squad', ...progress }),
  })

  if (!squadResult.valid || !Array.isArray(squadResult.result?.squad)) {
    return {
      valid: false,
      errors: squadResult.errors ?? ['Er kon geen geldig voorseizoensteam worden samengesteld.'],
      warnings: squadResult.warnings ?? [],
      mode,
      inputTeam,
      initialTeam: inputTeam,
      finalTeam: [],
      changes: null,
    }
  }

  const finalTeam = squadResult.result.squad
  const finalIds = new Set(finalTeam.map(playerId).filter(Boolean))
  const playersOut = inputTeam.filter((player) => !finalIds.has(playerId(player)))
  const playersIn = finalTeam.filter((player) => !initialIds.has(playerId(player)))
  const finalBank = Math.round((FANTASY_GAME_RULES.budget.startingBudget - squadResult.result.totalPrice) * 10) / 10
  const suppliedPurchasePrices = readPriceMap(purchasePrices)
  const retainedPurchasePrices = mode === 'current-team'
    ? Object.fromEntries([...suppliedPurchasePrices.entries()].filter(([id]) => initialIds.has(id)))
    : {}
  const finalPurchasePrices = canonicalPrices(finalTeam, retainedPurchasePrices, true)
  const suppliedSellingPrices = readPriceMap(manualSellingPrices)
  const finalManualSellingPrices = {}
  finalTeam.forEach((player) => {
    const id = playerId(player)
    if (initialIds.has(id) && suppliedSellingPrices.has(id)) {
      finalManualSellingPrices[id] = suppliedSellingPrices.get(id)
    }
  })

  onProgress?.({ phase: 'optimizing-round-1-lineup' })
  const lineupResult = optimizeLineupForRound({ squad: finalTeam, round: 1 })
  if (!lineupResult.valid) {
    return {
      valid: false,
      errors: lineupResult.errors,
      warnings: [...warnings, ...(lineupResult.warnings ?? [])],
      mode,
      inputTeam,
      initialTeam: inputTeam,
      finalTeam,
      changes: null,
    }
  }

  return {
    valid: true,
    errors: [],
    warnings: [...new Set([...(squadResult.warnings ?? []), ...(lineupResult.warnings ?? [])])],
    mode,
    startRound: Number(startRound),
    inputTeam,
    initialTeam: inputTeam,
    initialExpectedPointsRound1: initialLineupResult
      ? Number(initialLineupResult.result.expectedPoints)
      : null,
    initialLineup: initialLineupResult
      ? {
          ...initialLineupResult.result,
          bench: initialLineupResult.result.bench?.ordered ?? [],
          round: 1,
        }
      : null,
    finalTeam,
    changes: {
      kind: mode === 'new-team' ? 'new-team-build' : 'preseason-rebuild',
      playersOut,
      playersIn,
      changesMade: mode === 'new-team' ? finalTeam.length : Math.max(playersOut.length, playersIn.length),
      transferPointsCost: 0,
    },
    bankBefore: Number(bank) || 0,
    bankAfter: finalBank,
    purchasePrices: finalPurchasePrices,
    manualSellingPrices: finalManualSellingPrices,
    expectedPointsRound1: Number(lineupResult.result.expectedPoints),
    lineup: {
      ...lineupResult.result,
      bench: lineupResult.result.bench?.ordered ?? [],
      round: 1,
    },
    squadResult,
    lineupResult,
    initialLineupResult,
    rules: { budget: FANTASY_GAME_RULES.budget.startingBudget, minimumBank, maximumPlayersPerClub },
  }
}

export default optimizePreseasonTeam
