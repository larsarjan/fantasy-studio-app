import { getEffectiveSellingPrice } from '../fantasyGameRulesEngine.js'
import { optimizeLineupForRound } from './optimizerLineup.js'
import { optimizeSquadForPeriod, optimizeSquadForRound } from './optimizerSquad.js'

function playerId(player) {
  const direct = player?.id ?? player?.playerId
  if (direct !== null && direct !== undefined && String(direct).trim()) return String(direct).trim()
  return [player?.name, player?.club].map((value) => String(value ?? '').trim()).filter(Boolean).join('@')
}

function price(player) {
  for (const value of [player?.currentPrice, player?.endPrice, player?.price, player?.startPrice]) {
    if (value !== null && value !== undefined && String(value).trim() && Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value)
  }
  return null
}

function valueFrom(source, id) {
  return source instanceof Map ? source.get(id) : source?.[id]
}

function wildcardCapital(state, manualSellingPrices) {
  return (state.squad ?? []).reduce((sum, player) => {
    const id = playerId(player)
    const sellingPrice = getEffectiveSellingPrice({
      manualSellingPrice: valueFrom(manualSellingPrices, id),
      purchasePrice: valueFrom(state.purchasePrices, id),
      currentPrice: price(player),
    })
    return sum + (Number.isFinite(Number(sellingPrice)) ? Number(sellingPrice) : 0)
  }, Number(state.bank) || 0)
}

function changedPlayers(before, after) {
  const beforeIds = new Set((before ?? []).map(playerId))
  const afterIds = new Set((after ?? []).map(playerId))
  return {
    playersOut: (before ?? []).filter((player) => !afterIds.has(playerId(player))),
    playersIn: (after ?? []).filter((player) => !beforeIds.has(playerId(player))),
  }
}

export function generateChipSquadAction({
  chipId,
  source,
  state,
  playerPool,
  strategy = {},
  hardRules = {},
  manualSellingPrices = {},
  horizon = 1,
  onProgress,
} = {}) {
  if (!['wildcard', 'sugar-daddy'].includes(chipId)) return null
  const minimumBank = hardRules?.minMoneyInBank?.enabled
    ? Math.max(0, Number(hardRules.minMoneyInBank.value) || 0)
    : 0
  const maximumPlayersPerClub = hardRules?.maxPlayersPerClub?.enabled
    ? Math.max(1, Math.min(3, Math.floor(Number(hardRules.maxPlayersPerClub.value) || 3)))
    : 3
  const common = {
    players: playerPool,
    philosophy: strategy,
    maximumPlayersPerClub,
    lockedPlayerIds: hardRules?.lockedPlayerIds ?? [],
    bannedPlayerIds: hardRules?.bannedPlayerIds ?? [],
    minimumAvailability: hardRules?.minPlayingChance?.enabled
      ? Number(hardRules.minPlayingChance.value)
      : null,
    onProgress,
  }
  const capital = wildcardCapital(state, manualSellingPrices)
  const optimized = chipId === 'wildcard'
    ? optimizeSquadForPeriod({
        ...common,
        startRound: state.round,
        roundCount: Math.max(1, Number(horizon) || 1),
        budget: Math.max(0, capital - minimumBank),
      })
    : optimizeSquadForRound({
        ...common,
        round: state.round,
        unlimitedBudget: true,
      })
  if (!optimized.valid || !optimized.result?.squad) return null
  const candidateSquad = optimized.result.squad
  const lineup = optimizeLineupForRound({ squad: candidateSquad, round: state.round })
  if (!lineup.valid || !lineup.result) return null
  const changes = changedPlayers(state.squad, candidateSquad)
  const persistentSquad = chipId === 'wildcard' ? candidateSquad : state.squad
  const roundSquad = candidateSquad
  const bankAfter = chipId === 'wildcard'
    ? Math.round((capital - Number(optimized.result.totalPrice ?? 0)) * 10) / 10
    : Number(state.bank)
  return {
    id: `${chipId}:${state.round}:${candidateSquad.map(playerId).sort().join(',')}`,
    valid: true,
    round: state.round,
    actionType: chipId,
    chip: { id: chipId, source },
    transfers: changes.playersOut.map((playerOut, index) => ({ playerOut, playerIn: changes.playersIn[index] ?? null })),
    playersOut: changes.playersOut,
    playersIn: changes.playersIn,
    transfersMade: changes.playersOut.length,
    persistentSquad,
    roundSquad,
    squad: persistentSquad,
    bankAfter,
    freeTransfersAfterMove: state.freeTransfers,
    nextFreeTransfers: state.freeTransfers,
    transferCost: { pointsCost: 0 },
    lineup: lineup.result,
    scenario: {
      temporary: chipId === 'sugar-daddy',
      unlimitedBudget: chipId === 'sugar-daddy',
      normalBudget: chipId === 'wildcard',
      capital: Math.round(capital * 10) / 10,
      minimumBank,
      horizon: chipId === 'wildcard' ? Math.max(1, Number(horizon) || 1) : 1,
      freeTransferRule: 'preserve-stored-without-round-accrual',
      purchasePriceRule: chipId === 'wildcard'
        ? 'retained-players-keep-price-new-players-use-current-price'
        : 'persistent-price-state-unchanged',
      manualSellingPriceRule: chipId === 'wildcard'
        ? 'retain-only-for-players-continuously-owned'
        : 'persistent-price-state-unchanged',
    },
  }
}

export default generateChipSquadAction
