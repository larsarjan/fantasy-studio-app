/*
|--------------------------------------------------------------------------
| Season Plan Timeline
|--------------------------------------------------------------------------
|
| Pure result layer: translates a completed Season Planner result into a
| compact UI contract. It never chooses or simulates an action.
|
*/

import { canonicalizeChipState } from './optimizerChipStrategy.js'
import { FANTASY_CHIP_RULES } from '../fantasyChipRules.js'

function round(value, digits = 2) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const factor = 10 ** digits
  return Math.round((number + Number.EPSILON) * factor) / factor
}

function playerId(player) {
  const direct = player?.id ?? player?.playerId
  if (direct !== null && direct !== undefined && String(direct).trim()) {
    return String(direct).trim()
  }
  return [player?.name, player?.club]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('@')
}

function compactPlayer(playerOrEntry) {
  const player = playerOrEntry?.player ?? playerOrEntry
  if (!player) return null
  const prices = [player.currentPrice, player.endPrice, player.price, player.startPrice]
  const price = prices.find((value) =>
    value !== null && value !== undefined && value !== '' &&
    Number.isFinite(Number(value)) && Number(value) >= 0,
  )
  return {
    id: playerId(player) || null,
    name: player.name ?? null,
    club: player.club ?? null,
    position: player.fantasyPosition ?? player.position ?? null,
    price: price === undefined ? null : round(price, 1),
  }
}

function compactSquad(squad) {
  return (Array.isArray(squad) ? squad : [])
    .map(compactPlayer)
    .filter(Boolean)
}

function normalizePurchasePrices(value, squad) {
  const source = value instanceof Map
    ? [...value.entries()]
    : value && typeof value === 'object'
      ? Object.entries(value)
      : []
  const squadIds = new Set(compactSquad(squad).map((player) => player.id))
  return Object.fromEntries(
    source
      .map(([id, price]) => [String(id), Number(price)])
      .filter(([id, price]) => squadIds.has(id) && Number.isFinite(price) && price >= 0)
      .map(([id, price]) => [id, round(price, 1)])
      .sort(([left], [right]) => left.localeCompare(right, 'en')),
  )
}

function compactTeam(state) {
  return {
    round: Number(state?.round),
    squad: compactSquad(state?.squad),
    bank: round(state?.bank, 1),
    freeTransfers: Number(state?.freeTransfers),
    purchasePrices: normalizePurchasePrices(state?.purchasePrices, state?.squad),
    manualSellingPrices: normalizePurchasePrices(state?.manualSellingPrices, state?.squad),
    chipState: canonicalizeChipState(state?.chipState),
  }
}

function ambiguousIdlessIdentities(squad) {
  const counts = new Map()
  ;(Array.isArray(squad) ? squad : []).forEach((player) => {
    const direct = player?.id ?? player?.playerId
    if (direct !== null && direct !== undefined && String(direct).trim()) return
    const fallback = playerId(player)
    if (fallback) counts.set(fallback, (counts.get(fallback) ?? 0) + 1)
  })
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right, 'en'))
}

function ids(players) {
  return (players ?? []).map((player) => player?.id ?? playerId(player)).filter(Boolean)
}

function sameSet(left, right) {
  const a = [...ids(left)].sort()
  const b = [...ids(right)].sort()
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function sameOrder(left, right) {
  const a = ids(left)
  const b = ids(right)
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function difference(left, right) {
  const rightIds = new Set(ids(right))
  return (left ?? []).filter((player) => !rightIds.has(player?.id ?? playerId(player)))
}

function actionLabel(action) {
  if (action.actionType === 'wildcard') return 'Wildcardteam wordt permanent actief'
  if (action.actionType === 'sugar-daddy') return 'Tijdelijk Suikeroomteam'
  if (action.actionType === 'no-transfer') return 'Geen transfer'
  const outgoing = action.playersOut.map((player) => player.name ?? player.id).join(' + ')
  const incoming = action.playersIn.map((player) => player.name ?? player.id).join(' + ')
  return `${outgoing} → ${incoming}`
}

function serializeAction(action, warnings, errors) {
  const playersOut = (action?.playersOut ?? []).map(compactPlayer).filter(Boolean)
  const playersIn = (action?.playersIn ?? []).map(compactPlayer).filter(Boolean)
  const transfersMade = Number(action?.transfersMade) || 0
  const compactPrice = (value) =>
    value !== null && value !== undefined && value !== '' &&
    Number.isFinite(Number(value)) && Number(value) >= 0
      ? round(value, 1)
      : null
  let transferPairs = (action?.transferPairs ?? []).map((pair, index) => ({
    playerOut: compactPlayer(pair?.playerOut),
    playerIn: compactPlayer(pair?.playerIn),
    sellingPrice: compactPrice(action?.sellingPrices?.[index]),
    buyingPrice: compactPrice(action?.buyingPrices?.[index]),
  }))

  if (!transferPairs.length && transfersMade === 1 && playersOut[0] && playersIn[0]) {
    transferPairs = [{
      playerOut: playersOut[0],
      playerIn: playersIn[0],
      sellingPrice: compactPrice(action?.sellingPrices?.[0]),
      buyingPrice: compactPrice(action?.buyingPrices?.[0]),
    }]
  }

  const serialized = {
    id: action?.id ?? null,
    actionType: action?.actionType ?? null,
    label: '',
    transfersMade,
    chip: action?.chip ? structuredClone(action.chip) : null,
    chipScenario: action?.chipScenario ? structuredClone(action.chipScenario) : null,
    lineupExpectedPoints: round(action?.lineupExpectedPoints, 2),
    normalCaptainBonus: round(action?.normalCaptainBonus, 2),
    chipIncrementalPoints: round(action?.chipIncrementalPoints, 2),
    persistentSquad: compactSquad(action?.persistentSquad),
    roundSquad: compactSquad(action?.roundSquad),
    playersOut,
    playersIn,
    transferPairs,
    sellingPrices: Array.isArray(action?.sellingPrices) ? [...action.sellingPrices] : [],
    buyingPrices: Array.isArray(action?.buyingPrices) ? [...action.buyingPrices] : [],
  }
  serialized.label = actionLabel(serialized)

  const squadChipAction = ['wildcard', 'sugar-daddy'].includes(serialized.actionType)
  const expectedCount = serialized.actionType === 'double-transfer'
    ? 2
    : serialized.actionType === 'transfer'
      ? 1
      : 0
  if (!squadChipAction && (
    transfersMade !== expectedCount ||
    playersOut.length !== expectedCount ||
    playersIn.length !== expectedCount ||
    transferPairs.length !== expectedCount
  )) {
    errors.push(`Actie ${serialized.id ?? 'zonder ID'} heeft onvolledige transfermetadata.`)
  }
  if (!['no-transfer', 'transfer', 'double-transfer', 'wildcard', 'sugar-daddy'].includes(serialized.actionType)) {
    errors.push(`Actie ${serialized.id ?? 'zonder ID'} heeft een onbekend actietype.`)
  }
  if (
    new Set(ids(playersOut)).size !== playersOut.length ||
    new Set(ids(playersIn)).size !== playersIn.length
  ) {
    errors.push(`Actie ${serialized.id ?? 'zonder ID'} bevat dubbele spelers.`)
  }
  transferPairs.forEach((pair, index) => {
    if (
      pair.playerOut?.id !== playersOut[index]?.id ||
      pair.playerIn?.id !== playersIn[index]?.id
    ) {
      errors.push(`Actie ${serialized.id ?? 'zonder ID'} bevat inconsistente transferPairs.`)
    }
    if (expectedCount > 0 && (pair.sellingPrice === null || pair.buyingPrice === null)) {
      warnings.push(`Prijsdetails ontbreken voor een transferpaar in actie ${serialized.id ?? 'zonder ID'}.`)
    }
  })
  return serialized
}

function serializeLineup(action) {
  const lineup = action?.lineup ?? {}
  return {
    formation: lineup.formation ?? action?.formation ?? null,
    captain: compactPlayer(lineup.captain),
    viceCaptain: compactPlayer(lineup.viceCaptain),
    starters: (lineup.starters ?? []).map(compactPlayer).filter(Boolean),
    bench: (lineup.bench ?? []).map(compactPlayer).filter(Boolean),
  }
}

function validateLineup(lineup, squad, roundNumber) {
  const errors = []
  const starterIds = ids(lineup.starters)
  const benchIds = ids(lineup.bench)
  const squadIds = new Set(ids(squad))
  const allLineupIds = [...starterIds, ...benchIds]

  if (starterIds.length !== 11 || new Set(starterIds).size !== 11) {
    errors.push(`Speelronde ${roundNumber} heeft geen 11 unieke starters.`)
  }
  if (benchIds.length !== 4 || new Set(benchIds).size !== 4) {
    errors.push(`Speelronde ${roundNumber} heeft geen 4 unieke bankspelers.`)
  }
  if (
    new Set(allLineupIds).size !== 15 ||
    allLineupIds.some((id) => !squadIds.has(id)) ||
    !sameSet([...lineup.starters, ...lineup.bench], squad)
  ) {
    errors.push(`De lineup van speelronde ${roundNumber} komt niet overeen met de eindsquad.`)
  }
  if (!lineup.captain?.id || !starterIds.includes(lineup.captain.id)) {
    errors.push(`De captain van speelronde ${roundNumber} staat niet in de basiself.`)
  }
  if (!lineup.viceCaptain?.id || !starterIds.includes(lineup.viceCaptain.id)) {
    errors.push(`De vice-captain van speelronde ${roundNumber} staat niet in de basiself.`)
  }
  if (lineup.captain?.id && lineup.captain.id === lineup.viceCaptain?.id) {
    errors.push(`Captain en vice-captain zijn gelijk in speelronde ${roundNumber}.`)
  }

  const formationParts = String(lineup.formation ?? '')
    .split('-')
    .map(Number)
  if (
    formationParts.length !== 3 ||
    formationParts.some((value) => !Number.isInteger(value)) ||
    formationParts.reduce((total, value) => total + value, 0) !== 10 ||
    formationParts[0] < 3 || formationParts[0] > 5 ||
    formationParts[1] < 2 || formationParts[1] > 5 ||
    formationParts[2] < 1 || formationParts[2] > 3
  ) {
    errors.push(`Speelronde ${roundNumber} heeft geen geldige formatie.`)
  }
  return errors
}

function invalidResult(errors, warnings = []) {
  return {
    valid: false,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    planType: 'season-plan',
    period: null,
    summary: null,
    initialTeam: null,
    timeline: [],
    finalTeam: null,
    searchMeta: null,
  }
}

export function createSeasonPlanTimeline({ plannerResult } = {}) {
  const topLevel = plannerResult
  const hasTopLevelPlannerType = Boolean(
    plannerResult && Object.prototype.hasOwnProperty.call(plannerResult, 'plannerType'),
  )
  const source = hasTopLevelPlannerType
    ? plannerResult?.plannerType === 'season-planner'
      ? plannerResult
      : null
    : plannerResult?.result?.plannerType === 'season-planner'
      ? plannerResult.result
      : null
  const errors = []
  const warnings = [
    ...(Array.isArray(topLevel?.warnings) ? topLevel.warnings : []),
    ...(Array.isArray(source?.warnings) ? source.warnings : []),
  ]

  if (!source) errors.push('Het resultaat is geen geldig Season Planner-resultaat.')
  if (topLevel?.valid === false) errors.push('De Season Planner heeft geen geldig volledig plan opgeleverd.')
  if (!Array.isArray(source?.bestPath)) errors.push('Het Season Planner-resultaat bevat geen bestPath.')
  if (!source?.initialState) errors.push('Het Season Planner-resultaat bevat geen initialState.')
  if (!source?.bestTerminalState) errors.push('Het Season Planner-resultaat bevat geen bestTerminalState.')
  if (errors.length) return invalidResult(errors, warnings)

  const period = {
    startRound: Number(source.period?.startRound),
    endRound: Number(source.period?.endRound),
    roundCount: Number(source.period?.roundCount),
    requestedRoundCount: Number(source.period?.requestedRoundCount ?? source.period?.roundCount),
  }
  if (source.bestPath.length !== period.roundCount) {
    errors.push('De lengte van bestPath komt niet overeen met de geplande horizon.')
  }

  ambiguousIdlessIdentities(source.initialState.squad).forEach((identity) => {
    warnings.push(`Meerdere ID-loze spelers delen de ambigue identiteit ${identity}.`)
  })

  let stateBefore = source.initialState
  let previousLineup = null
  let cumulativeExpectedPoints = 0
  let cumulativeTransferPointsCost = 0
  const timeline = []

  source.bestPath.forEach((step, index) => {
    const expectedRound = period.startRound + index
    const action = step?.action
    const resultingState = step?.resultingState
    const roundNumber = Number(step?.round ?? action?.round)

    if (roundNumber !== expectedRound) {
      errors.push(`Het plan bevat een gat of verkeerde volgorde bij speelronde ${expectedRound}.`)
    }
    if (!action || !resultingState) {
      errors.push(`Speelronde ${expectedRound} mist een action of resultingState.`)
      return
    }

    const teamBefore = compactTeam(stateBefore)
    const teamAfter = compactTeam(resultingState)
    const expectedParentStateId = index === 0
      ? source.initialState.id
      : source.bestPath[index - 1]?.resultingState?.id
    if (resultingState.parentStateId !== expectedParentStateId) {
      errors.push(`De parent-stateketen bij speelronde ${expectedRound} is inconsistent.`)
    }
    if (teamBefore.round !== expectedRound || teamAfter.round !== expectedRound + 1) {
      errors.push(`De state-rondes rond speelronde ${expectedRound} zijn inconsistent.`)
    }
    if (index > 0) {
      const previousAfter = timeline[index - 1]?.teamAfter
      if (
        !previousAfter || !sameSet(previousAfter.squad, teamBefore.squad) ||
        previousAfter.bank !== teamBefore.bank ||
        previousAfter.freeTransfers !== teamBefore.freeTransfers ||
        JSON.stringify(previousAfter.purchasePrices) !== JSON.stringify(teamBefore.purchasePrices)
        || JSON.stringify(previousAfter.manualSellingPrices) !== JSON.stringify(teamBefore.manualSellingPrices)
      ) {
        errors.push(`De statecontinuïteit vóór speelronde ${expectedRound} is verbroken.`)
      }
    }

    const entryWarnings = []
    const publicAction = serializeAction(action, entryWarnings, errors)
    const lineup = serializeLineup(action)
    const lineupSquad = publicAction.roundSquad.length
      ? publicAction.roundSquad
      : teamAfter.squad
    errors.push(...validateLineup(lineup, lineupSquad, expectedRound))
    warnings.push(...entryWarnings)

    if (
      round(action.bankBefore, 1) !== teamBefore.bank ||
      round(action.bankAfter, 1) !== teamAfter.bank
    ) {
      errors.push(`De bankmetadata van speelronde ${expectedRound} is inconsistent.`)
    }
    if (
      Number(action.freeTransfersBefore) !== teamBefore.freeTransfers ||
      Number(action.nextFreeTransfers) !== teamAfter.freeTransfers ||
      !Number.isInteger(Number(action.freeTransfersAfterMove)) ||
      Number(action.freeTransfersAfterMove) < 0
    ) {
      errors.push(`De vrije-transfermetadata van speelronde ${expectedRound} is inconsistent.`)
    }

    ambiguousIdlessIdentities(resultingState.squad).forEach((identity) => {
      warnings.push(`Meerdere ID-loze spelers delen de ambigue identiteit ${identity}.`)
    })

    const expectedPoints = round(action.expectedPoints, 2)
    const transferPointsCost = round(action.transferPointsCost, 0)
    const netExpectedPoints = round(action.netExpectedPoints, 2)
    if (netExpectedPoints !== round(expectedPoints - transferPointsCost, 2)) {
      errors.push(`De netto Expected Points in speelronde ${expectedRound} zijn inconsistent.`)
    }
    cumulativeExpectedPoints = round(cumulativeExpectedPoints + expectedPoints, 2)
    cumulativeTransferPointsCost = round(
      cumulativeTransferPointsCost + transferPointsCost,
      0,
    )
    const cumulativeNetExpectedPoints = round(
      cumulativeExpectedPoints - cumulativeTransferPointsCost,
      2,
    )

    if (
      round(resultingState.cumulativeExpectedPoints, 2) !== cumulativeExpectedPoints ||
      round(resultingState.cumulativeTransferPointsCost, 0) !== cumulativeTransferPointsCost ||
      round(resultingState.cumulativeNetExpectedPoints, 2) !== cumulativeNetExpectedPoints
    ) {
      errors.push(`De cumulatieve punten na speelronde ${expectedRound} zijn inconsistent.`)
    }

    const previousStarters = previousLineup?.starters ?? []
    const benchChanged = previousLineup
      ? !sameOrder(previousLineup.bench, lineup.bench)
      : false
    const playersAdded = difference(teamAfter.squad, teamBefore.squad)
    const playersRemoved = difference(teamBefore.squad, teamAfter.squad)
    const startersAdded = previousLineup ? difference(lineup.starters, previousStarters) : []
    const startersRemoved = previousLineup ? difference(previousStarters, lineup.starters) : []
    const hasPrice = (price) =>
      price !== null && price !== undefined && price !== '' &&
      Number.isFinite(Number(price)) && Number(price) >= 0
    const sellingPrices = publicAction.sellingPrices.filter(hasPrice)
    const buyingPrices = publicAction.buyingPrices.filter(hasPrice)

    timeline.push({
      round: expectedRound,
      index,
      action: publicAction,
      teamBefore,
      teamAfter,
      lineup,
      points: {
        lineupExpectedPoints: round(action.lineupExpectedPoints, 2),
        normalCaptainBonus: round(action.normalCaptainBonus, 2),
        chipIncrementalPoints: round(action.chipIncrementalPoints, 2),
        expectedPoints,
        transferPointsCost,
        netExpectedPoints,
        cumulativeExpectedPoints,
        cumulativeTransferPointsCost,
        cumulativeNetExpectedPoints,
      },
      chip: publicAction.chip ? {
        ...publicAction.chip,
        label: FANTASY_CHIP_RULES[publicAction.chip.id]?.label ?? publicAction.chip.id,
        localOrGlobalContext: 'global-planner-path',
        reason: 'Deze chip is als onderdeel van het gesimuleerde Season Planner-pad gekozen.',
        scenario: publicAction.chipScenario,
      } : null,
      squads: publicAction.chip?.id === 'sugar-daddy' ? {
        persistentSquad: publicAction.persistentSquad,
        roundSquad: publicAction.roundSquad,
        returnsAfterRound: true,
      } : publicAction.chip?.id === 'wildcard' ? {
        persistentSquad: publicAction.persistentSquad,
        roundSquad: publicAction.roundSquad,
        returnsAfterRound: false,
      } : null,
      transfers: {
        freeTransfersBefore: Number(action.freeTransfersBefore),
        freeTransfersAfterMove: Number(action.freeTransfersAfterMove),
        nextFreeTransfers: Number(action.nextFreeTransfers),
      },
      finance: {
        bankBefore: teamBefore.bank,
        bankAfter: teamAfter.bank,
        bankChange: round(teamAfter.bank - teamBefore.bank, 1),
        totalSellingPrice:
          publicAction.transfersMade > 0 && sellingPrices.length === publicAction.transfersMade
            ? round(sellingPrices.reduce((a, b) => a + Number(b), 0), 1)
            : null,
        totalBuyingPrice:
          publicAction.transfersMade > 0 && buyingPrices.length === publicAction.transfersMade
            ? round(buyingPrices.reduce((a, b) => a + Number(b), 0), 1)
            : null,
      },
      changes: {
        squadChanged: !sameSet(teamBefore.squad, teamAfter.squad),
        // Semantiek: basiself als set plus de geordende bank.
        lineupChanged: previousLineup
          ? !sameSet(previousStarters, lineup.starters) || benchChanged
          : false,
        benchChanged,
        captainChanged: previousLineup
          ? previousLineup.captain?.id !== lineup.captain?.id
          : false,
        formationChanged: previousLineup
          ? previousLineup.formation !== lineup.formation
          : false,
        playersAdded,
        playersRemoved,
        startersAdded,
        startersRemoved,
      },
      warnings: [...new Set(entryWarnings)],
    })

    previousLineup = lineup
    stateBefore = resultingState
  })

  const initialTeam = compactTeam(source.initialState)
  const finalTeam = compactTeam(source.bestTerminalState)
  const lastEntry = timeline.at(-1)
  if (
    lastEntry && (
      source.bestPath.at(-1)?.resultingState?.id !== source.bestTerminalState.id ||
      !sameSet(lastEntry.teamAfter.squad, finalTeam.squad) ||
      lastEntry.teamAfter.bank !== finalTeam.bank ||
      lastEntry.teamAfter.freeTransfers !== finalTeam.freeTransfers ||
      lastEntry.teamAfter.round !== finalTeam.round ||
      JSON.stringify(lastEntry.teamAfter.purchasePrices) !==
        JSON.stringify(finalTeam.purchasePrices) ||
      JSON.stringify(lastEntry.teamAfter.manualSellingPrices) !==
        JSON.stringify(finalTeam.manualSellingPrices)
    )
  ) {
    errors.push('De terminalstate wijkt af van de laatste timeline-state.')
  }
  if (
    round(source.bestTerminalState.cumulativeExpectedPoints, 2) !== cumulativeExpectedPoints ||
    round(source.bestTerminalState.cumulativeTransferPointsCost, 0) !== cumulativeTransferPointsCost ||
    round(source.bestTerminalState.cumulativeNetExpectedPoints, 2) !==
      round(cumulativeExpectedPoints - cumulativeTransferPointsCost, 2)
  ) {
    errors.push('De terminalpunten wijken af van de timeline-totalen.')
  }

  if (errors.length) return invalidResult(errors, warnings)

  const transferRounds = timeline.filter((entry) => entry.action.transfersMade > 0)
  const expectedSorted = [...timeline].sort(
    (left, right) => right.points.expectedPoints - left.points.expectedPoints || left.round - right.round,
  )
  const summary = {
    roundsPlanned: timeline.length,
    transfersMade: timeline.reduce((total, entry) => total + entry.action.transfersMade, 0),
    transferActions: transferRounds.length,
    noTransferRounds: timeline.filter((entry) => entry.action.actionType === 'no-transfer').length,
    singleTransferRounds: timeline.filter((entry) => entry.action.actionType === 'transfer').length,
    doubleTransferRounds: timeline.filter((entry) => entry.action.actionType === 'double-transfer').length,
    chipRounds: timeline.filter((entry) => entry.chip?.used).length,
    totalChipIncrementalPoints: round(timeline.reduce((total, entry) => total + entry.points.chipIncrementalPoints, 0), 2),
    totalExpectedPoints: cumulativeExpectedPoints,
    totalTransferPointsCost: cumulativeTransferPointsCost,
    totalNetExpectedPoints: round(cumulativeExpectedPoints - cumulativeTransferPointsCost, 2),
    terminalFreeTransfers: finalTeam.freeTransfers,
    terminalFreeTransferValue: round(source.bestTerminalState.terminalFreeTransferValue, 2),
    terminalScore: round(source.bestTerminalState.terminalScore, 2),
    startingBank: initialTeam.bank,
    finalBank: finalTeam.bank,
    bankChange: round(finalTeam.bank - initialTeam.bank, 1),
    startingFreeTransfers: initialTeam.freeTransfers,
    finalFreeTransfers: finalTeam.freeTransfers,
    averageExpectedPointsPerRound: timeline.length
      ? round(cumulativeExpectedPoints / timeline.length, 2)
      : 0,
    highestExpectedPointsRound: expectedSorted[0]
      ? { round: expectedSorted[0].round, expectedPoints: expectedSorted[0].points.expectedPoints }
      : null,
    lowestExpectedPointsRound: expectedSorted.at(-1)
      ? { round: expectedSorted.at(-1).round, expectedPoints: expectedSorted.at(-1).points.expectedPoints }
      : null,
  }
  const statistics = source.statistics ?? {}
  const searchMeta = {
    completedPaths: Number(source.completedPaths ?? 0),
    exploredStates: Number(statistics.exploredStates ?? 0),
    exploredActions: Number(statistics.exploredActions ?? 0),
    completedDepth: Number(statistics.completedDepth ?? 0),
    stopReason: statistics.stopReason ?? null,
    totalValidOptionsAvailable: Number(statistics.totalValidOptionsAvailable ?? 0),
    selectedOptions: Number(statistics.selectedOptions ?? 0),
    optionsRemovedByMaximumOptionsPerState: Number(
      statistics.optionsRemovedByMaximumOptionsPerState ?? 0,
    ),
  }

  return {
    valid: true,
    errors: [],
    warnings: [...new Set(warnings)],
    planType: 'season-plan',
    period,
    summary,
    initialTeam,
    timeline,
    finalTeam,
    searchMeta,
  }
}

export default createSeasonPlanTimeline
