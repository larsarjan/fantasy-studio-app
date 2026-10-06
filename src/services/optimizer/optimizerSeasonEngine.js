import {
  getPlayerRoundProjection,
  optimizeLineupForRound,
} from './optimizerLineup.js'

import {
  canonicalizeChipState,
  consumeChip,
  normalizeChipId,
  validateChipActivation,
} from './optimizerChipStrategy.js'

import {
  planSingleTransfers,
} from './optimizerTransferPlanner.js'

import {
  calculateNextFreeTransfers,
  calculateTransferCost,
  normalizeFantasyPosition,
  validateStartingLineup,
  validateSquad,
} from '../fantasyGameRulesEngine.js'

/*
|--------------------------------------------------------------------------
| Fantasy Studio
| Season Simulation Engine
|--------------------------------------------------------------------------
|
| Deze engine simuleert meerdere speelrondes achter elkaar.
|
| Per speelronde:
|
| 1. wordt de huidige selectie vastgelegd;
| 2. wordt de beste transferbeslissing berekend;
| 3. wordt de bijbehorende opstelling opgeslagen;
| 4. worden selectie, bank en vrije transfers bijgewerkt;
| 5. vormt die nieuwe status het startpunt van de volgende speelronde.
|
| De engine bedenkt zelf geen opstellingen of transfers.
| Daarvoor gebruikt hij de bestaande gespecialiseerde optimizer-engines.
|
*/

/*
|--------------------------------------------------------------------------
| Algemene helpers
|--------------------------------------------------------------------------
*/

function toNumber(
  value,
  fallback = 0,
) {
  const number =
    Number(value)

  return Number.isFinite(number)
    ? number
    : fallback
}

function round(
  value,
  digits = 2,
) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return 0
  }

  const factor =
    10 ** digits

  return (
    Math.round(
      (
        number +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  )
}

function normalizeStartRound(
  value,
) {
  return Math.max(
    1,
    Math.min(
      34,
      Math.round(
        toNumber(
          value,
          1,
        ),
      ),
    ),
  )
}

function normalizeRoundCount({
  startRound,
  roundCount,
}) {
  const maximumRoundCount =
    Math.max(
      1,
      Math.min(
        10,
        35 - startRound,
      ),
    )

  return Math.max(
    1,
    Math.min(
      maximumRoundCount,
      Math.round(
        toNumber(
          roundCount,
          1,
        ),
      ),
    ),
  )
}

function copySquad(
  squad,
) {
  return Array.isArray(
    squad,
  )
    ? [...squad]
    : []
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

  return [
    String(player?.name ?? '').trim(),
    String(player?.club ?? '').trim(),
  ]
    .filter(Boolean)
    .join('@')
}

function createSquadIds(squad) {
  return (
    Array.isArray(squad)
      ? squad
      : []
  )
    .map(normalizePlayerId)
    .sort((left, right) =>
      left.localeCompare(right, 'en'),
    )
}

function squadsAreEqual(left, right) {
  const leftIds = createSquadIds(left)
  const rightIds = createSquadIds(right)

  return (
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  )
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

function normalizePurchasePrices(source, squad) {
  const squadIds = new Set(
    createSquadIds(squad).filter(Boolean),
  )

  return Object.fromEntries(
    readPriceEntries(source)
      .map(([playerId, price]) => ({
        playerId: String(playerId).trim(),
        rawPrice: price,
        price: Number(price),
      }))
      .filter(({ playerId, rawPrice, price }) =>
        playerId &&
        squadIds.has(playerId) &&
        !isMissingValue(rawPrice) &&
        Number.isFinite(price) &&
        price >= 0,
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

function getPlayerCurrentPrice(player) {
  const price = [
    player?.currentPrice,
    player?.endPrice,
    player?.price,
    player?.startPrice,
  ].find((value) =>
    !isMissingValue(value) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0,
  )

  return price === undefined
    ? null
    : round(price, 1)
}

function updatePurchasePrices({
  purchasePrices,
  action,
  buyingPrices = [],
}) {
  const nextPrices = new Map(
    Object.entries(
      normalizePurchasePrices(
        purchasePrices,
        action.squad,
      ),
    ),
  )

  const playersOut = action.actionType === 'double-transfer'
    ? action.playersOut
    : action.actionType === 'transfer'
      ? [action.playerOut]
      : []
  const playersIn = action.actionType === 'double-transfer'
    ? action.playersIn
    : action.actionType === 'transfer'
      ? [action.playerIn]
      : []

  playersOut.forEach((player) => nextPrices.delete(normalizePlayerId(player)))
  playersIn.forEach((player, index) => {
    const incomingId = normalizePlayerId(player)
    const buyingPrice = buyingPrices[index]
    if (incomingId && Number.isFinite(buyingPrice) && buyingPrice >= 0) {
      nextPrices.set(incomingId, buyingPrice)
    }
  })

  return normalizePurchasePrices(nextPrices, action.squad)
}

function updateWildcardPurchasePrices({ purchasePrices, previousSquad, nextSquad }) {
  const previousPrices = normalizePurchasePrices(purchasePrices, previousSquad)
  const previousIds = new Set((previousSquad ?? []).map(normalizePlayerId))
  return normalizePurchasePrices(Object.fromEntries((nextSquad ?? []).map((player) => {
    const id = normalizePlayerId(player)
    const retainedPrice = previousIds.has(id) ? previousPrices[id] : undefined
    return [id, Number.isFinite(Number(retainedPrice)) ? retainedPrice : getPlayerCurrentPrice(player)]
  })), nextSquad)
}

function updateManualSellingPrices({ manualSellingPrices, previousSquad, nextSquad }) {
  const previous = normalizePurchasePrices(manualSellingPrices, previousSquad)
  const previousIds = new Set((previousSquad ?? []).map(normalizePlayerId))
  return normalizePurchasePrices(Object.fromEntries((nextSquad ?? [])
    .map((player) => normalizePlayerId(player))
    .filter((id) => previousIds.has(id) && Number.isFinite(Number(previous[id])))
    .map((id) => [id, previous[id]])), nextSquad)
}

function validateSquadForSimulation(squad, label) {
  const validation = validateSquad(
    squad,
    {
      unlimitedBudget: true,
    },
  )

  return validation.valid
    ? []
    : validation.errors.map((error) => `${label}: ${error}`)
}

function validateStateForSimulation(state) {
  const errors = validateSquadForSimulation(
    state?.squad,
    'Ongeldige beginsquad',
  )
  const bank = Number(state?.bank)
  const freeTransfers = Number(state?.freeTransfers)
  const roundNumber = Number(state?.round)

  if (
    isMissingValue(state?.bank) ||
    !Number.isFinite(bank) ||
    bank < 0
  ) {
    errors.push('De state bevat geen geldig banksaldo.')
  }

  if (
    isMissingValue(state?.freeTransfers) ||
    !Number.isInteger(freeTransfers) ||
    freeTransfers < 0
  ) {
    errors.push('De state bevat geen geldig geheel aantal vrije transfers.')
  }

  if (
    isMissingValue(state?.round) ||
    !Number.isInteger(roundNumber) ||
    roundNumber < 1 ||
    roundNumber > 34
  ) {
    errors.push('De state bevat geen geldige speelronde.')
  }

  return errors
}

function validateLineupForRound(lineup, roundNumber, squad) {
  const errors = []
  const warnings = []

  if (!lineup || typeof lineup !== 'object') {
    return {
      errors: ['De actie bevat geen lineup.'],
      warnings,
    }
  }

  if (
    isMissingValue(lineup.expectedPoints) ||
    !Number.isFinite(Number(lineup.expectedPoints)) ||
    Number(lineup.expectedPoints) < 0
  ) {
    errors.push('De lineup bevat geen geldige niet-negatieve Expected Points.')
  }

  if (!Array.isArray(lineup.starters) || lineup.starters.length !== 11) {
    errors.push('De lineup bevat geen volledige basiself.')
  } else {
    const starterPlayers = lineup.starters.map(
      (starter) => starter?.player ?? starter,
    )
    const lineupValidation = validateStartingLineup(starterPlayers)

    errors.push(
      ...lineupValidation.errors.map(
        (error) => `Ongeldige basiself: ${error}`,
      ),
    )

    const squadIds = new Set(createSquadIds(squad))
    const starterIds = starterPlayers.map(normalizePlayerId)

    if (
      starterIds.some((id) => !id || !squadIds.has(id))
    ) {
      errors.push('De basiself bevat een speler buiten de eindsquad.')
    }

    if (new Set(starterIds).size !== starterIds.length) {
      errors.push('De basiself bevat dezelfde speler meer dan één keer.')
    }
  }

  const startersWithRoundMetadata = (
    Array.isArray(lineup.starters)
      ? lineup.starters
      : []
  ).filter((starter) =>
    Array.isArray(starter?.roundProjections),
  )

  if (startersWithRoundMetadata.length) {
    const mismatchedPlayers = startersWithRoundMetadata.filter(
      (starter) =>
        !starter.roundProjections.some(
          (projection) =>
            Number(projection?.round) === roundNumber,
        ),
    )

    if (mismatchedPlayers.length) {
      errors.push(
        `De lineup bevat ${mismatchedPlayers.length} speler(s) zonder projectie voor speelronde ${roundNumber}.`,
      )
    }
  } else {
    warnings.push(
      `De lineup bevat geen expliciete rondemetadata voor speelronde ${roundNumber}.`,
    )
  }

  return { errors, warnings }
}

function lineupEntryPlayer(entry) {
  return entry?.player ?? entry
}

function projectionRoundPoints(projection) {
  const unavailableTypes = new Set([
    'postponed', 'cancelled', 'canceled', 'abandoned', 'suspended',
    'not-finished', 'unfinished', 'gestaakt', 'afgelast', 'uitgesteld',
  ])
  const type = String(projection?.type ?? '').trim().toLowerCase()
  if (!projection?.hasProjection || unavailableTypes.has(type)) return 0
  const points = Number(projection.expectedPoints)
  return Number.isFinite(points) && points >= 0 ? points : 0
}

function lineupEntryRoundPoints(entry, roundNumber) {
  const projection = getPlayerRoundProjection(lineupEntryPlayer(entry), roundNumber)
  if (projection?.hasProjection) return projectionRoundPoints(projection)
  const direct = Number(entry?.expectedPoints)
  return Number.isFinite(direct) && direct >= 0 ? direct : 0
}

function calculateChipScore({ chipId, lineup, squad, roundNumber }) {
  const lineupExpectedPoints = Number(lineup?.expectedPoints ?? 0)
  const normalCaptainBonus = Number(lineup?.captainBonus ?? 0)
  if (!chipId) return {
    lineupExpectedPoints,
    normalCaptainBonus,
    chipIncrementalPoints: 0,
    expectedPoints: lineupExpectedPoints,
    effects: null,
  }

  if (chipId === 'attacking') {
    const forwards = squad.filter((player) => normalizeFantasyPosition(
      player?.fantasyPosition ?? player?.position,
    ) === 'forward')
    const forwardPoints = forwards.map((player) => ({
      player,
      projection: getPlayerRoundProjection(player, roundNumber),
    }))
    const extraForwardPoints = forwardPoints.reduce(
      (sum, entry) => sum + projectionRoundPoints(entry.projection),
      0,
    )
    const chipIncrementalPoints = extraForwardPoints - normalCaptainBonus
    return {
      lineupExpectedPoints,
      normalCaptainBonus,
      chipIncrementalPoints,
      expectedPoints: lineupExpectedPoints + chipIncrementalPoints,
      effects: {
        scoringForwards: 'all-three-squad-forwards',
        captainDisabled: true,
        automaticSubstitutionsSimulated: false,
        forwards: forwardPoints.map(({ player, projection }) => ({
          id: normalizePlayerId(player),
          name: player?.name ?? null,
          roundPoints: round(projectionRoundPoints(projection), 2),
          fixtureCount: Number(projection?.fixtureCount ?? 0),
          hasProjection: projection?.hasProjection === true,
        })),
        removedNormalCaptainBonus: round(normalCaptainBonus, 2),
      },
    }
  }

  if (chipId === 'dynamic-duo') {
    const captainPoints = lineupEntryRoundPoints(lineup?.captain, roundNumber)
    const viceCaptainPoints = lineupEntryRoundPoints(lineup?.viceCaptain, roundNumber)
    const chipIncrementalPoints = captainPoints + viceCaptainPoints
    return {
      lineupExpectedPoints,
      normalCaptainBonus,
      chipIncrementalPoints,
      expectedPoints: lineupExpectedPoints + chipIncrementalPoints,
      effects: {
        captainMultiplier: 3,
        viceCaptainMultiplier: 2,
        captain: {
          id: normalizePlayerId(lineupEntryPlayer(lineup?.captain)),
          name: lineupEntryPlayer(lineup?.captain)?.name ?? null,
          roundPoints: round(captainPoints, 2),
        },
        viceCaptain: {
          id: normalizePlayerId(lineupEntryPlayer(lineup?.viceCaptain)),
          name: lineupEntryPlayer(lineup?.viceCaptain)?.name ?? null,
          roundPoints: round(viceCaptainPoints, 2),
        },
      },
    }
  }

  return {
    lineupExpectedPoints,
    normalCaptainBonus,
    chipIncrementalPoints: 0,
    expectedPoints: lineupExpectedPoints,
    effects: null,
  }
}

/*
|--------------------------------------------------------------------------
| Deterministische simulatie van één gekozen actie
|--------------------------------------------------------------------------
|
| Deze functie genereert of vergelijkt geen acties. Ze past exact de
| aangeleverde no-transfer- of single-transferoptie toe op de huidige state.
|
*/

export function simulateSeasonRound({
  state,
  action,
  round: requestedRound,
} = {}) {
  const errors = []
  const warnings = []
  const roundNumber = Number(
    requestedRound ?? state?.round,
  )
  const stateSquad = copySquad(state?.squad)
  const chipId = action?.chip ? normalizeChipId(action.chip.id) : null
  const isSquadChipAction = ['wildcard', 'sugar-daddy'].includes(chipId)
  const actionSquad = copySquad(
    chipId === 'sugar-daddy'
      ? action?.roundSquad
      : action?.persistentSquad ?? action?.squad,
  )
  const persistentSquadAfter = copySquad(
    chipId === 'sugar-daddy'
      ? action?.persistentSquad
      : action?.persistentSquad ?? action?.squad,
  )
  const bankBefore = Number(state?.bank)
  const freeTransfersBefore = Number(state?.freeTransfers)
  const bankAfter = Number(action?.bankAfter)
  const nextFreeTransfers = Number(action?.nextFreeTransfers)
  const freeTransfersAfterMove = Number(action?.freeTransfersAfterMove)
  const transferPointsCost = Number(action?.transferCost?.pointsCost)
  const playersOut = action?.actionType === 'double-transfer'
    ? action?.playersOut
    : action?.actionType === 'transfer'
      ? [action?.playerOut]
      : []
  const playersIn = action?.actionType === 'double-transfer'
    ? action?.playersIn
    : action?.actionType === 'transfer'
      ? [action?.playerIn]
      : []
  const resolvedSellingPrices = []
  const resolvedBuyingPrices = []
  const chipStateBefore = canonicalizeChipState(state?.chipState)

  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 34) {
    errors.push('Er is geen geldige speelronde opgegeven.')
  }

  errors.push(...validateStateForSimulation(state))

  if (Number(state?.round) !== roundNumber) {
    errors.push('De gevraagde speelronde komt niet overeen met de huidige state.')
  }

  if (
    !isMissingValue(action?.round) &&
    Number(action.round) !== roundNumber
  ) {
    errors.push('De actie hoort niet bij de gespeelde ronde.')
  }

  if (action?.valid !== true) {
    errors.push('De aangeleverde actie is niet geldig.')
  }

  if (action?.chip && !chipId) {
    errors.push('De actie bevat een onbekende chip.')
  }
  if (chipId) {
    const chipValidation = validateChipActivation({
      chipId,
      round: roundNumber,
      state: chipStateBefore,
    })
    errors.push(...chipValidation.errors)
    if (!['manual', 'automatic'].includes(action?.chip?.source)) {
      errors.push('De chipactie bevat geen geldige bron.')
    }
  }

  if (!['no-transfer', 'transfer', 'double-transfer', 'wildcard', 'sugar-daddy'].includes(action?.actionType)) {
    errors.push('De simulator ondersteunt dit actietype niet.')
  }
  if (isSquadChipAction && action?.actionType !== chipId) {
    errors.push('Het actietype is niet consistent met de gekozen squadchip.')
  }
  if (!isSquadChipAction && ['wildcard', 'sugar-daddy'].includes(action?.actionType)) {
    errors.push('Een squadchipactie bevat geen bijpassende chip.')
  }

  errors.push(
    ...validateSquadForSimulation(actionSquad, 'Ongeldige eindsquad'),
  )

  if (
    isMissingValue(action?.bankAfter) ||
    !Number.isFinite(bankAfter) ||
    bankAfter < 0
  ) {
    errors.push('De actie bevat geen geldig banksaldo na de actie.')
  }

  if (
    isMissingValue(action?.nextFreeTransfers) ||
    !Number.isInteger(nextFreeTransfers) ||
    nextFreeTransfers < 0
  ) {
    errors.push('De actie bevat geen geldig volgend aantal vrije transfers.')
  }

  if (
    isMissingValue(action?.freeTransfersAfterMove) ||
    !Number.isInteger(freeTransfersAfterMove) ||
    freeTransfersAfterMove < 0
  ) {
    errors.push('De actie bevat geen geldig aantal vrije transfers na de actie.')
  }

  if (
    isMissingValue(action?.transferCost?.pointsCost) ||
    !Number.isFinite(transferPointsCost) ||
    transferPointsCost < 0
  ) {
    errors.push('De actie bevat geen geldige transferpuntenkosten.')
  }

  const transfersMade = isSquadChipAction
    ? Math.max(0, Math.floor(Number(action?.transfersMade) || 0))
    : action?.actionType === 'double-transfer'
    ? 2
    : action?.actionType === 'transfer'
      ? 1
      : 0

  if (!isSquadChipAction &&
    !isMissingValue(action?.transfersMade) &&
    Number(action.transfersMade) !== transfersMade
  ) {
    errors.push('Het aantal transfers in de actie is inconsistent met het actietype.')
  }
  const expectedTransferCost = isSquadChipAction
    ? { pointsCost: 0 }
    : calculateTransferCost({ transfersMade, availableFreeTransfers: freeTransfersBefore })
  const expectedFreeTransfersAfterMove = isSquadChipAction
    ? freeTransfersBefore
    : Math.max(0, freeTransfersBefore - Math.min(transfersMade, freeTransfersBefore))
  const expectedNextFreeTransfers = isSquadChipAction
    ? freeTransfersBefore
    : calculateNextFreeTransfers({ currentFreeTransfers: freeTransfersBefore, transfersMade })

  if (
    Number.isFinite(transferPointsCost) &&
    transferPointsCost !== expectedTransferCost.pointsCost
  ) {
    errors.push('De transferpuntenkosten zijn niet consistent met de huidige state.')
  }

  if (
    Number.isInteger(freeTransfersAfterMove) &&
    freeTransfersAfterMove !== expectedFreeTransfersAfterMove
  ) {
    errors.push('Het aantal vrije transfers na de actie is inconsistent.')
  }

  if (
    Number.isInteger(nextFreeTransfers) &&
    nextFreeTransfers !== expectedNextFreeTransfers
  ) {
    errors.push('Het aantal vrije transfers voor de volgende ronde is inconsistent.')
  }

  const currentIds = new Set(createSquadIds(stateSquad))

  if (action?.actionType === 'no-transfer') {
    if (!squadsAreEqual(stateSquad, actionSquad)) {
      errors.push('Een no-transferactie mag de squad niet wijzigen.')
    }

    if (
      Number.isFinite(bankBefore) &&
      Number.isFinite(bankAfter) &&
      Math.abs(bankBefore - bankAfter) > 0.0001
    ) {
      errors.push('Een no-transferactie mag het banksaldo niet wijzigen.')
    }
  }

  if (chipId === 'sugar-daddy') {
    if (!squadsAreEqual(stateSquad, persistentSquadAfter)) {
      errors.push('Suikeroom mag de persistente squad niet wijzigen.')
    }
    if (Number.isFinite(bankBefore) && Number.isFinite(bankAfter) && Math.abs(bankBefore - bankAfter) > 0.0001) {
      errors.push('Suikeroom mag het persistente banksaldo niet wijzigen.')
    }
  }

  if (chipId === 'wildcard' && !squadsAreEqual(actionSquad, persistentSquadAfter)) {
    errors.push('De Wildcard-roundSquad en persistente eindsquad moeten gelijk zijn.')
  }

  if (!isSquadChipAction && transfersMade > 0) {
    if (!Array.isArray(playersOut) || playersOut.length !== transfersMade) {
      errors.push(`De actie moet exact ${transfersMade} uitgaande speler(s) bevatten.`)
    }
    if (!Array.isArray(playersIn) || playersIn.length !== transfersMade) {
      errors.push(`De actie moet exact ${transfersMade} inkomende speler(s) bevatten.`)
    }

    const outgoingIds = (playersOut ?? []).map(normalizePlayerId)
    const incomingIds = (playersIn ?? []).map(normalizePlayerId)
    if (outgoingIds.some((id) => !id || !currentIds.has(id))) {
      errors.push('Niet alle uitgaande spelers zitten in de huidige squad.')
    }
    if (incomingIds.some((id) => !id || currentIds.has(id))) {
      errors.push('Een inkomende speler zit al in de huidige squad of is onbekend.')
    }
    if (new Set(outgoingIds).size !== transfersMade) {
      errors.push('De uitgaande spelers moeten uniek zijn.')
    }
    if (new Set(incomingIds).size !== transfersMade) {
      errors.push('De inkomende spelers moeten uniek zijn.')
    }

    if (action.actionType === 'double-transfer') {
      if (!Array.isArray(action.transferPairs) || action.transferPairs.length !== 2) {
        errors.push('Een double transfer moet exact twee transferPairs bevatten.')
      } else {
        action.transferPairs.forEach((pair, index) => {
          const pairOutgoingId = normalizePlayerId(pair?.playerOut)
          const pairIncomingId = normalizePlayerId(pair?.playerIn)

          if (
            pairOutgoingId !== outgoingIds[index] ||
            pairIncomingId !== incomingIds[index]
          ) {
            errors.push('De transferPairs zijn niet consistent met de canonieke spelersvolgorde.')
          }

          if (
            normalizeFantasyPosition(pair?.playerOut?.fantasyPosition ?? pair?.playerOut?.position) !==
            normalizeFantasyPosition(pair?.playerIn?.fantasyPosition ?? pair?.playerIn?.position)
          ) {
            errors.push('Een transferPair koppelt spelers met verschillende posities.')
          }
        })
      }
    }

    const getPosition = (player) => normalizeFantasyPosition(
      player?.fantasyPosition ?? player?.position,
    )
    if (
      (playersOut ?? []).map(getPosition).sort().join('|') !==
      (playersIn ?? []).map(getPosition).sort().join('|')
    ) {
      errors.push('De positiecombinatie van de transfer is ongeldig.')
    }

    const outgoingSet = new Set(outgoingIds)
    const expectedSquad = [
      ...stateSquad.filter((player) => !outgoingSet.has(normalizePlayerId(player))),
      ...(playersIn ?? []),
    ]
    if (!squadsAreEqual(expectedSquad, actionSquad)) {
      errors.push('De eindsquad komt niet overeen met de gekozen transfer(s).')
    }

    const suppliedSellingPrices = action.actionType === 'double-transfer'
      ? action.sellingPrices
      : [action.sellingPrice]
    const suppliedBuyingPrices = action.actionType === 'double-transfer'
      ? action.buyingPrices
      : [action.buyingPrice]
    if (!Array.isArray(suppliedSellingPrices) || suppliedSellingPrices.length !== transfersMade) {
      errors.push('De transfer bevat niet voor iedere speler een verkoopprijs.')
    }
    if (!Array.isArray(suppliedBuyingPrices) || suppliedBuyingPrices.length !== transfersMade) {
      errors.push('De transfer bevat niet voor iedere speler een aankoopprijs.')
    }

    for (let index = 0; index < transfersMade; index += 1) {
      const sellingValue = suppliedSellingPrices?.[index]
      const buyingValue = suppliedBuyingPrices?.[index]
      const sellingPrice = isMissingValue(sellingValue) ? null : Number(sellingValue)
      const buyingPrice = isMissingValue(buyingValue)
        ? getPlayerCurrentPrice(playersIn?.[index])
        : Number(buyingValue)
      resolvedSellingPrices.push(sellingPrice)
      resolvedBuyingPrices.push(buyingPrice)
      if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
        errors.push('De transfer bevat geen geldige niet-negatieve verkoopprijs.')
      }
      if (!Number.isFinite(buyingPrice) || buyingPrice < 0) {
        errors.push('De transfer bevat geen geldige niet-negatieve aankoopprijs.')
      }
    }

    if (
      [...resolvedSellingPrices, ...resolvedBuyingPrices].every(
        (price) => Number.isFinite(price) && price >= 0,
      ) && Number.isFinite(bankBefore) && Number.isFinite(bankAfter)
    ) {
      const calculatedBankAfter = round(
        bankBefore + resolvedSellingPrices.reduce((sum, price) => sum + price, 0) -
          resolvedBuyingPrices.reduce((sum, price) => sum + price, 0),
        1,
      )
      if (Math.abs(calculatedBankAfter - bankAfter) > 0.0001) {
        errors.push('Het banksaldo na de transfer is financieel inconsistent.')
      }
    }
  }

  const lineupValidation = validateLineupForRound(
    action?.lineup,
    roundNumber,
    actionSquad,
  )
  errors.push(...lineupValidation.errors)
  warnings.push(...lineupValidation.warnings)

  if (chipId === 'dynamic-duo' && action?.lineup) {
    const captainId = normalizePlayerId(lineupEntryPlayer(action.lineup.captain))
    const viceCaptainId = normalizePlayerId(lineupEntryPlayer(action.lineup.viceCaptain))
    const starterIds = new Set((action.lineup.starters ?? []).map((entry) => (
      normalizePlayerId(lineupEntryPlayer(entry))
    )))
    if (!captainId || !viceCaptainId || captainId === viceCaptainId) {
      errors.push('Dynamisch Duo vereist twee verschillende captainspelers.')
    } else if (!starterIds.has(captainId) || !starterIds.has(viceCaptainId)) {
      errors.push('Captain en vice-captain moeten voor Dynamisch Duo allebei in de basis staan.')
    }
  }

  if (errors.length) {
    return {
      valid: false,
      errors,
      warnings,
      round: Number.isInteger(roundNumber) ? roundNumber : null,
      action: action ?? null,
      stateBefore: null,
      stateAfter: null,
      lineup: action?.lineup ?? null,
      expectedPoints: 0,
      transferPointsCost: 0,
      netExpectedPoints: 0,
      transfer: null,
    }
  }

  const purchasePricesBefore = normalizePurchasePrices(
    state?.purchasePrices,
    stateSquad,
  )
  const purchasePricesAfter = chipId === 'wildcard'
    ? updateWildcardPurchasePrices({
        purchasePrices: purchasePricesBefore,
        previousSquad: stateSquad,
        nextSquad: persistentSquadAfter,
      })
    : chipId === 'sugar-daddy'
      ? purchasePricesBefore
      : updatePurchasePrices({
          purchasePrices: purchasePricesBefore,
          action,
          buyingPrices: resolvedBuyingPrices,
        })
  const manualSellingPricesBefore = normalizePurchasePrices(
    state?.manualSellingPrices,
    stateSquad,
  )
  const manualSellingPricesAfter = chipId === 'sugar-daddy'
    ? manualSellingPricesBefore
    : updateManualSellingPrices({
        manualSellingPrices: manualSellingPricesBefore,
        previousSquad: stateSquad,
        nextSquad: persistentSquadAfter,
      })
  const chipScore = calculateChipScore({
    chipId,
    lineup: action.lineup,
    squad: actionSquad,
    roundNumber,
  })
  const expectedPoints = round(chipScore.expectedPoints, 2)
  const normalizedTransferPointsCost = round(transferPointsCost, 0)
  const consumedChip = chipId
    ? consumeChip(chipStateBefore, chipId, roundNumber)
    : { valid: true, state: chipStateBefore }

  return {
    valid: true,
    errors: [],
    warnings,
    round: roundNumber,
    action,
    stateBefore: {
      squad: stateSquad,
      bank: round(bankBefore, 1),
      freeTransfers: Math.floor(freeTransfersBefore),
      purchasePrices: purchasePricesBefore,
      manualSellingPrices: manualSellingPricesBefore,
      round: roundNumber,
      chipState: chipStateBefore,
    },
    stateAfter: {
      squad: persistentSquadAfter,
      bank: round(bankAfter, 1),
      freeTransfers: expectedNextFreeTransfers,
      purchasePrices: purchasePricesAfter,
      manualSellingPrices: manualSellingPricesAfter,
      round: roundNumber + 1,
      chipState: consumedChip.state,
    },
    lineup: action.lineup,
    persistentSquad: persistentSquadAfter,
    roundSquad: actionSquad,
    expectedPoints,
    lineupExpectedPoints: round(chipScore.lineupExpectedPoints, 2),
    normalCaptainBonus: round(chipScore.normalCaptainBonus, 2),
    chipIncrementalPoints: round(chipScore.chipIncrementalPoints, 2),
    transferPointsCost: normalizedTransferPointsCost,
    netExpectedPoints: round(
      expectedPoints - normalizedTransferPointsCost,
      2,
    ),
    chip: chipId ? {
      used: true,
      id: chipId,
      source: action.chip.source,
      incrementalPoints: round(chipScore.chipIncrementalPoints, 2),
      effects: chipScore.effects,
    } : null,
    transfer: action.actionType === 'transfer'
      ? {
          playerOut: action.playerOut,
          playerIn: action.playerIn,
          sellingPrice: round(resolvedSellingPrices[0], 1),
          buyingPrice: round(resolvedBuyingPrices[0], 1),
        }
      : action.actionType === 'double-transfer'
        ? {
            playersOut,
            playersIn,
            sellingPrices: resolvedSellingPrices.map((price) => round(price, 1)),
            buyingPrices: resolvedBuyingPrices.map((price) => round(price, 1)),
            transferPairs: action.transferPairs ?? [],
          }
        : null,
  }
}

/*
|--------------------------------------------------------------------------
| Een vooraf gekozen plan chronologisch simuleren
|--------------------------------------------------------------------------
*/

export function simulateSeasonPlan({
  initialState,
  actions = [],
} = {}) {
  const rounds = []
  const errors = validateStateForSimulation(initialState)
  const warnings = []
  let currentState = initialState
  const actionList = Array.isArray(actions) ? actions : []

  if (!Array.isArray(actions)) {
    errors.push('De acties voor de seizoenssimulatie moeten een array zijn.')
  }

  // Een lege actionlijst is een geldige no-op, mits de beginstate geldig is.
  if (errors.length) {
    return {
      valid: false,
      errors,
      warnings,
      rounds,
      initialState,
      finalState: initialState,
      totalExpectedPoints: 0,
      totalChipIncrementalPoints: 0,
      totalTransferPointsCost: 0,
      totalNetExpectedPoints: 0,
      failedTransition: null,
    }
  }

  for (const action of actionList) {
    const transition = simulateSeasonRound({
      state: currentState,
      action,
      round: currentState?.round,
    })

    warnings.push(...transition.warnings)

    if (!transition.valid) {
      errors.push(...transition.errors)
      return {
        valid: false,
        errors,
        warnings,
        rounds,
        initialState,
        finalState: currentState,
        totalExpectedPoints: round(
          rounds.reduce((total, item) => total + item.expectedPoints, 0),
          2,
        ),
        totalChipIncrementalPoints: round(
          rounds.reduce((total, item) => total + item.chipIncrementalPoints, 0),
          2,
        ),
        totalTransferPointsCost: rounds.reduce(
          (total, item) => total + item.transferPointsCost,
          0,
        ),
        totalNetExpectedPoints: round(
          rounds.reduce((total, item) => total + item.netExpectedPoints, 0),
          2,
        ),
        failedTransition: transition,
      }
    }

    rounds.push(transition)
    currentState = transition.stateAfter
  }

  const totalExpectedPoints = round(
    rounds.reduce((total, item) => total + item.expectedPoints, 0),
    2,
  )
  const totalTransferPointsCost = rounds.reduce(
    (total, item) => total + item.transferPointsCost,
    0,
  )
  const totalChipIncrementalPoints = round(
    rounds.reduce((total, item) => total + item.chipIncrementalPoints, 0),
    2,
  )

  return {
    valid: true,
    errors: [],
    warnings,
    rounds,
    initialState,
    finalState: currentState,
    totalExpectedPoints,
    totalChipIncrementalPoints,
    totalTransferPointsCost,
    totalNetExpectedPoints: round(
      totalExpectedPoints - totalTransferPointsCost,
      2,
    ),
    failedTransition: null,
  }
}

/*
|--------------------------------------------------------------------------
| Foutresultaat maken
|--------------------------------------------------------------------------
*/

function createInvalidResult({
  errors = [],
  rounds = [],
  startRound,
  roundCount,
} = {}) {
  return {
    valid: false,

    errors:
      Array.isArray(errors)
        ? errors
        : [
            String(errors),
          ],

    warnings: [],

    rounds,

    period: {
      startRound,

      endRound:
        startRound +
        roundCount -
        1,

      roundCount,
    },
  }
}

/*
|--------------------------------------------------------------------------
| Publieke Season Simulation
|--------------------------------------------------------------------------
|
| Legacy greedy orchestration voor bestaande aanroepers. Deze functie vraagt
| nog zelf per ronde de beste actie op. Nieuwe planners gebruiken uitsluitend
| simulateSeasonRound() en simulateSeasonPlan().
*/

export function runSeasonSimulation({
  request = null,

  players = [],

  squad = [],

  bank = 0,

  freeTransfers = 1,

  startRound = 1,

  roundCount = 1,

  manualSellingPrices = {},

  purchasePrices = {},

  transferStrategy = {},
} = {}) {
  const normalizedStartRound =
    normalizeStartRound(
      startRound,
    )

  const normalizedRoundCount =
    normalizeRoundCount({
      startRound:
        normalizedStartRound,

      roundCount,
    })

  const sourcePlayers =
    Array.isArray(players)
      ? players.filter(Boolean)
      : []

  const startingSquad =
    copySquad(
      squad,
    )

  if (
    startingSquad.length !== 15
  ) {
    return createInvalidResult({
      errors: [
        'De seizoenssimulatie heeft een geldige selectie van vijftien spelers nodig.',
      ],

      startRound:
        normalizedStartRound,

      roundCount:
        normalizedRoundCount,
    })
  }

  if (
    sourcePlayers.length === 0
  ) {
    return createInvalidResult({
      errors: [
        'Er zijn geen spelers beschikbaar voor de seizoenssimulatie.',
      ],

      startRound:
        normalizedStartRound,

      roundCount:
        normalizedRoundCount,
    })
  }

  const rounds = []
  const warnings = []

  let currentSquad =
    startingSquad

  let currentBank =
    round(
      Math.max(
        0,
        toNumber(
          bank,
          0,
        ),
      ),
      1,
    )

  let currentFreeTransfers =
    Math.max(
      0,
      Math.floor(
        toNumber(
          freeTransfers,
          1,
        ),
      ),
    )

  let currentPurchasePrices =
    normalizePurchasePrices(
      purchasePrices,
      startingSquad,
    )

  /*
  |--------------------------------------------------------------------------
  | Speelrondes doorlopen
  |--------------------------------------------------------------------------
  */

  for (
    let roundNumber =
      normalizedStartRound;

    roundNumber <
      normalizedStartRound +
        normalizedRoundCount;

    roundNumber += 1
  ) {
    const squadBefore =
      copySquad(
        currentSquad,
      )

    const bankBefore =
      currentBank

    const freeTransfersBefore =
      currentFreeTransfers

    /*
    |--------------------------------------------------------------------------
    | Transferbeslissing voor deze speelronde
    |--------------------------------------------------------------------------
    |
    | De Transfer Planner vergelijkt:
    |
    | - geen transfer;
    | - alle geldige enkele transfers.
    |
    | Iedere optie bevat zelf al:
    |
    | - de nieuwe selectie;
    | - de optimale opstelling;
    | - het nieuwe banksaldo;
    | - de vrije transfers voor de volgende ronde.
    |
    */

    const transferPlannerResult =
      planSingleTransfers({
        currentSquad:
          squadBefore,

        playerPool:
          sourcePlayers,

        bank:
          bankBefore,

        availableFreeTransfers:
          freeTransfersBefore,

        startRound:
          roundNumber,

        roundCount:
          1,

        manualSellingPrices,

        purchasePrices:
          currentPurchasePrices,

        strategy:
          transferStrategy,
      })

    /*
    |--------------------------------------------------------------------------
    | Veilige terugval
    |--------------------------------------------------------------------------
    |
    | Mocht de Transfer Planner onverwacht mislukken, dan bewaren we de
    | huidige selectie en berekenen we alsnog de beste opstelling.
    |
    */

    if (
      !transferPlannerResult
        ?.valid ||
      !transferPlannerResult
        ?.result
    ) {
      const fallbackLineup =
        optimizeLineupForRound({
          squad:
            squadBefore,

          round:
            roundNumber,
        })

      rounds.push({
        round:
          roundNumber,

        squadBefore,

        squadAfter:
          copySquad(
            squadBefore,
          ),

        squad:
          copySquad(
            squadBefore,
          ),

        bankBefore,

        bankAfter:
          bankBefore,

        bank:
          bankBefore,

        freeTransfersBefore,

        freeTransfersAfterMove:
          freeTransfersBefore,

        nextFreeTransfers:
          freeTransfersBefore,

        freeTransfers:
          freeTransfersBefore,

        actionType:
          'planner-error',

        transfer:
          null,

        lineup:
          fallbackLineup
            ?.result ??
          null,

        transferPlannerResult,

        valid: false,

        errors:
          transferPlannerResult
            ?.errors ??
          [
            `De Transfer Planner kon speelronde ${roundNumber} niet berekenen.`,
          ],
      })

      warnings.push(
        `De transferplanning voor speelronde ${roundNumber} is mislukt. De bestaande selectie is behouden.`,
      )

      continue
    }

    const bestOption =
      transferPlannerResult
        .result
        .bestOption

    if (!bestOption) {
      const fallbackLineup =
        optimizeLineupForRound({
          squad:
            squadBefore,

          round:
            roundNumber,
        })

      rounds.push({
        round:
          roundNumber,

        squadBefore,

        squadAfter:
          copySquad(
            squadBefore,
          ),

        squad:
          copySquad(
            squadBefore,
          ),

        bankBefore,

        bankAfter:
          bankBefore,

        bank:
          bankBefore,

        freeTransfersBefore,

        freeTransfersAfterMove:
          freeTransfersBefore,

        nextFreeTransfers:
          freeTransfersBefore,

        freeTransfers:
          freeTransfersBefore,

        actionType:
          'no-valid-option',

        transfer:
          null,

        lineup:
          fallbackLineup
            ?.result ??
          null,

        transferPlannerResult,

        valid: false,

        errors: [
          `Er is geen beste transferoptie gevonden voor speelronde ${roundNumber}.`,
        ],
      })

      warnings.push(
        `Voor speelronde ${roundNumber} werd geen geldige transferbeslissing gevonden.`,
      )

      continue
    }

    const transition = simulateSeasonRound({
      state: {
        squad: squadBefore,
        bank: bankBefore,
        freeTransfers: freeTransfersBefore,
        purchasePrices: currentPurchasePrices,
        round: roundNumber,
      },
      action: bestOption,
      round: roundNumber,
    })

    if (!transition.valid) {
      rounds.push({
        round: roundNumber,
        squadBefore,
        squadAfter: copySquad(squadBefore),
        squad: copySquad(squadBefore),
        bankBefore,
        bankAfter: bankBefore,
        bank: bankBefore,
        freeTransfersBefore,
        freeTransfersAfterMove: freeTransfersBefore,
        nextFreeTransfers: freeTransfersBefore,
        freeTransfers: freeTransfersBefore,
        actionType: 'simulation-error',
        transfer: null,
        lineup: bestOption.lineup ?? null,
        expectedPoints: 0,
        transferCost: bestOption.transferCost ?? null,
        bestOption,
        transferPlannerResult,
        transition,
        valid: false,
        errors: transition.errors,
      })

      warnings.push(
        `De gekozen actie voor speelronde ${roundNumber} kon niet worden gesimuleerd. De bestaande selectie is behouden.`,
      )
      continue
    }

    /*
    |--------------------------------------------------------------------------
    | Nieuwe teamstatus bepalen
    |--------------------------------------------------------------------------
    */

    const squadAfter =
      copySquad(
        transition.stateAfter.squad,
      )

    const bankAfter =
      round(
        toNumber(
          transition.stateAfter.bank,
          bankBefore,
        ),
        1,
      )

    const nextFreeTransfers =
      Math.max(
        0,
        Math.floor(
          toNumber(
            transition.stateAfter.freeTransfers,
            freeTransfersBefore,
          ),
        ),
      )

    /*
    |--------------------------------------------------------------------------
    | Speelrondemoment opslaan
    |--------------------------------------------------------------------------
    */

    rounds.push({
      round:
        roundNumber,

      valid:
        bestOption.valid !==
        false,

      squadBefore,

      squadAfter,

      /*
       * Tijdelijk algemeen squad-veld voor eenvoudige UI-koppeling.
       * Dit is de selectie waarmee de speelronde wordt gespeeld.
       */

      squad:
        squadAfter,

      bankBefore,

      bankAfter,

      bank:
        bankAfter,

      freeTransfersBefore,

      freeTransfersAfterMove:
        bestOption
          .freeTransfersAfterMove,

      nextFreeTransfers,

      freeTransfers:
        nextFreeTransfers,

      actionType:
        bestOption.actionType,

      transfer:
        bestOption.actionType ===
        'transfer'
          ? {
              playerOut:
                bestOption.playerOut,

              playerIn:
                bestOption.playerIn,

              sellingPrice:
                bestOption.sellingPrice,

              buyingPrice:
                bestOption.buyingPrice,

              pointsCost:
                bestOption
                  .transferCost
                  ?.pointsCost ??
                0,

              expectedPointsGain:
                bestOption
                  .expectedPointsGain,

              netExpectedPointsGain:
                bestOption
                  .netExpectedPointsGain,
            }
          : bestOption.actionType === 'double-transfer'
            ? {
                playersOut: bestOption.playersOut,
                playersIn: bestOption.playersIn,
                sellingPrices: bestOption.sellingPrices,
                buyingPrices: bestOption.buyingPrices,
                transferPairs: bestOption.transferPairs,
                pointsCost: bestOption.transferCost?.pointsCost ?? 0,
                expectedPointsGain: bestOption.expectedPointsGain,
                netExpectedPointsGain: bestOption.netExpectedPointsGain,
              }
            : null,

      lineup:
        bestOption.lineup,

      expectedPoints:
        transition.expectedPoints,

      transferCost:
        bestOption.transferCost,

      recommendation:
        transferPlannerResult
          .result
          .recommendation,

      coachReport:
        bestOption.report,

      bestOption,

      transferPlannerResult,

      transition,
    })

    /*
    |--------------------------------------------------------------------------
    | Status doorschuiven naar de volgende speelronde
    |--------------------------------------------------------------------------
    */

    currentSquad =
      squadAfter

    currentBank =
      bankAfter

    currentFreeTransfers =
      nextFreeTransfers

    currentPurchasePrices =
      transition.stateAfter.purchasePrices
  }

  /*
  |--------------------------------------------------------------------------
  | Totaalresultaat
  |--------------------------------------------------------------------------
  */

  const totalExpectedPoints =
    rounds.reduce(
      (
        total,
        roundResult,
      ) =>
        total +
        toNumber(
          roundResult
            ?.expectedPoints,
          0,
        ),
      0,
    )

  const totalTransferPointsCost =
    rounds.reduce(
      (
        total,
        roundResult,
      ) =>
        total +
        toNumber(
          roundResult
            ?.transferCost
            ?.pointsCost,
          0,
        ),
      0,
    )

  // Publieke semantiek: aantal daadwerkelijke spelerswissels, niet actions.
  const transfersMade = rounds.reduce(
    (total, roundResult) =>
      total + (
        roundResult.actionType === 'double-transfer'
          ? 2
          : roundResult.actionType === 'transfer'
            ? 1
            : 0
      ),
    0,
  )

  return {
    valid:
      rounds.every(
        (roundResult) =>
          roundResult.valid !==
          false,
      ),

    errors: [],

    warnings,

    request,

    period: {
      startRound:
        normalizedStartRound,

      endRound:
        normalizedStartRound +
        normalizedRoundCount -
        1,

      roundCount:
        normalizedRoundCount,

      rounds:
        rounds.map(
          (roundResult) =>
            roundResult.round,
        ),
    },

    startingState: {
      squad:
        startingSquad,

      bank:
        round(
          bank,
          1,
        ),

      freeTransfers:
        Math.max(
          0,
          Math.floor(
            toNumber(
              freeTransfers,
              1,
            ),
          ),
        ),
    },

    rounds,

    finalState: {
      squad:
        copySquad(
          currentSquad,
        ),

      bank:
        currentBank,

      freeTransfers:
        currentFreeTransfers,
    },

    summary: {
      roundsSimulated:
        rounds.length,

      transfersMade,

      noTransferRounds:
        rounds.filter(
          (roundResult) =>
            roundResult
              .actionType ===
            'no-transfer',
        ).length,

      totalExpectedPoints:
        round(
          totalExpectedPoints,
          2,
        ),

      totalTransferPointsCost:
        round(
          totalTransferPointsCost,
          0,
        ),

      netExpectedPoints:
        round(
          totalExpectedPoints -
          totalTransferPointsCost,
          2,
        ),

      finalBank:
        currentBank,

      finalFreeTransfers:
        currentFreeTransfers,
    },
  }
}

export default
  runSeasonSimulation
