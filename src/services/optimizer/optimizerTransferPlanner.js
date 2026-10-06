import {
  FANTASY_GAME_RULES,
  calculateNextFreeTransfers,
  calculateTransferCost,
  getEffectiveSellingPrice,
  normalizeFantasyPosition,
  validateSquad,
} from '../fantasyGameRulesEngine.js'

import {
  getPlayerPeriodProjection,
  optimizeLineupForPeriod,
} from './optimizerLineup.js'

/*
|--------------------------------------------------------------------------
| Fantasy Studio — Single Transfer Planner
|--------------------------------------------------------------------------
|
| Vergelijkt "geen transfer" met alle geldige enkele transfers.
| Harde regels blokkeren een optie. Voorkeuren verlagen alleen de score.
| Expected Points worden uitsluitend gelezen uit de bestaande projecties.
|
*/

export const DEFAULT_TRANSFER_STRATEGY = {
  hardRules: {
    minimumBank: 0,
    minimumFreeTransfersAfterMove: 0,
    maximumPointsCost: 0,
    lockedPlayerIds: [],
    bannedIncomingPlayerIds: [],
    transferReserveRules: [],
  },

  preferences: {
  preferredBank: 0.5,
  preferredFreeTransfersAfterMove: 1,
  preferredMaximumPointsCost: 0,

  // Een transfer moet voldoende netto Expected Points opleveren
  // voordat de coach hem echt aanbeveelt.
  minimumNetGainForTransfer: 2,
  strongNetGainForTransfer: 4,

    // Waarde van flexibiliteit, uitgedrukt in xP-equivalent per
    // opgeslagen vrije transfer voor de volgende speelronde.
    estimatedValuePerStoredTransfer: 1.5,

    bankShortfallPenaltyPerMillion: 0.5,
    transferShortfallPenalty: 1.5,
    pointsCostPreferencePenaltyMultiplier: 1,
  },

  output: {
    maximumRecommendedOptions: 3,
    maximumBlockedOptions: 5,
    // null betekent: retourneer de volledige geldige zoekruimte.
    maximumSearchOptions: null,
  },

  search: {
    plannerActions: {
      maximumActions: 10,
      singleCandidateLimit: 20,
      doubleCandidateLimit: 5,
      minimumSingleActions: 3,
      maximumDoubleActions: 3,
      doubleOutgoingCandidateLimit: 8,
      doubleIncomingCandidateLimitPerPosition: 6,
    },
    doubleTransfers: {
      enabled: true,
      maximumOutgoingCandidates: 8,
      maximumIncomingCandidatesPerPosition: 8,
      maximumGeneratedOptions: 250,
    },
  },
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
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return 0
  }

  const factor = 10 ** digits

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

function clamp(
  value,
  minimum,
  maximum,
) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      value,
    ),
  )
}

function normalizeRound(value) {
  return clamp(
    Math.floor(
      toNumber(
        value,
        1,
      ),
    ),
    1,
    34,
  )
}

function normalizeRoundCount(
  startRound,
  roundCount,
) {
  return clamp(
    Math.floor(
      toNumber(
        roundCount,
        1,
      ),
    ),
    1,
    Math.min(
      10,
      35 - startRound,
    ),
  )
}

function normalizeText(value) {
  return String(
    value ?? '',
  )
    .trim()
    .toLocaleLowerCase(
      'nl-NL',
    )
    .replace(
      /\s+/g,
      ' ',
    )
}

function getPlayerId(player) {
  const directId = player?.id ?? player?.playerId

  if (
    directId !== null &&
    directId !== undefined &&
    String(directId).trim()
  ) {
    return String(directId).trim()
  }

  const name = normalizeText(player?.name)
  const club = normalizeText(player?.club)
  const position = normalizeFantasyPosition(
    player?.fantasyPosition ?? player?.position,
  )
  const price = getPlayerCurrentPrice(player)

  if (
    !name ||
    !club ||
    position === 'unknown' ||
    price === null
  ) {
    return ''
  }

  // Oudere datasets zonder ID krijgen een deterministische samengestelde
  // identiteit. JSON voorkomt ambiguïteit door scheidingstekens in velden.
  return JSON.stringify([
    'player',
    name,
    club,
    position,
    price,
  ])
}

function createActionId({
  actionType,
  playerOut,
  playerIn,
  playersOut = [],
  playersIn = [],
}) {
  if (actionType === 'no-transfer') {
    return 'no-transfer'
  }

  if (actionType === 'double-transfer') {
    return JSON.stringify([
      'double-transfer',
      playersOut
        .map(getPlayerId)
        .sort((left, right) => left.localeCompare(right, 'en')),
      playersIn
        .map(getPlayerId)
        .sort((left, right) => left.localeCompare(right, 'en')),
    ])
  }

  return JSON.stringify([
    'single-transfer',
    getPlayerId(playerOut),
    getPlayerId(playerIn),
  ])
}

function getPlayerName(player) {
  return String(
    player?.name ??
    'Onbekende speler',
  )
}

function getPlayerPosition(player) {
  return normalizeFantasyPosition(
    player?.fantasyPosition ??
    player?.position,
  )
}

function getPlayerCurrentPrice(player) {
  const candidates = [
    player?.currentPrice,
    player?.endPrice,
    player?.price,
    player?.startPrice,
  ]

  for (
    const candidate
    of candidates
  ) {
    if (isMissingValue(candidate)) {
      continue
    }

    const price =
      Number(candidate)

    if (
      Number.isFinite(price) &&
      price >= 0
    ) {
      return round(
        price,
        1,
      )
    }
  }

  return null
}

function readMappedValue(
  source,
  playerId,
) {
  if (!source) {
    return undefined
  }

  if (
    source instanceof Map
  ) {
    return source.get(
      playerId,
    )
  }

  if (
    typeof source ===
    'object'
  ) {
    return source[
      playerId
    ]
  }

  return undefined
}

function mergeStrategy(
  strategy = {},
) {
  return {
    hardRules: {
      ...DEFAULT_TRANSFER_STRATEGY
        .hardRules,

      ...(strategy
        ?.hardRules ??
      {}),
    },

    preferences: {
      ...DEFAULT_TRANSFER_STRATEGY
        .preferences,

      ...(strategy
        ?.preferences ??
      {}),
    },

    output: {
      ...DEFAULT_TRANSFER_STRATEGY
        .output,

      ...(strategy
        ?.output ??
      {}),
    },

    search: {
      ...DEFAULT_TRANSFER_STRATEGY.search,
      ...(strategy?.search ?? {}),
      doubleTransfers: {
        ...DEFAULT_TRANSFER_STRATEGY.search.doubleTransfers,
        ...(strategy?.search?.doubleTransfers ?? {}),
      },
      plannerActions: {
        ...DEFAULT_TRANSFER_STRATEGY.search.plannerActions,
        ...(strategy?.search?.plannerActions ?? {}),
      },
    },
  }
}

function toIdSet(values) {
  return new Set(
    (
      Array.isArray(values)
        ? values
        : []
    )
      .map(
        (value) =>
          String(value),
      )
      .filter(Boolean),
  )
}

/*
|--------------------------------------------------------------------------
| Vereiste transferreserve
|--------------------------------------------------------------------------
|
| Hiermee kunnen we bijvoorbeeld zeggen:
|
| - standaard minimaal 0 transfers bewaren;
| - vanaf speelronde 5 minimaal 1 transfer bewaren;
| - vanaf speelronde 10 minimaal 2 transfers bewaren.
|
| De laatst geldende regel wint.
|
*/

function getRequiredTransferReserve(
  roundNumber,
  hardRules,
) {
  let reserve =
    Math.max(
      0,
      Math.floor(
        toNumber(
          hardRules
            ?.minimumFreeTransfersAfterMove,
          0,
        ),
      ),
    )

  const rules =
    Array.isArray(
      hardRules
        ?.transferReserveRules,
    )
      ? hardRules
          .transferReserveRules
      : []

  rules
    .map(
      (rule) => ({
        fromRound:
          normalizeRound(
            rule?.fromRound,
          ),

        reserve:
          Math.max(
            0,
            Math.floor(
              toNumber(
                rule
                  ?.minimumFreeTransfersAfterMove,
                0,
              ),
            ),
          ),
      }),
    )
    .filter(
      (rule) =>
        rule.fromRound <=
        roundNumber,
    )
    .sort(
      (
        left,
        right,
      ) =>
        left.fromRound -
        right.fromRound,
    )
    .forEach(
      (rule) => {
        reserve =
          rule.reserve
      },
    )

  return reserve
}

/*
|--------------------------------------------------------------------------
| Verkoopwaarde
|--------------------------------------------------------------------------
*/

function getSellingPrice({
  player,
  manualSellingPrices,
  purchasePrices,
}) {
  const playerId =
    getPlayerId(
      player,
    )

  return getEffectiveSellingPrice({
    manualSellingPrice:
      readMappedValue(
        manualSellingPrices,
        playerId,
      ) ??
      player
        ?.manualSellingPrice,

    purchasePrice:
      readMappedValue(
        purchasePrices,
        playerId,
      ) ??
      player?.purchasePrice ??
      player?.buyPrice,

    currentPrice:
      getPlayerCurrentPrice(
        player,
      ),
  })
}

/*
|--------------------------------------------------------------------------
| Binnenkomende speler voorbereiden
|--------------------------------------------------------------------------
*/

function createIncomingCandidate(
  player,
  startRound,
  roundCount,
) {
  return {
    player,

    playerId:
      getPlayerId(
        player,
      ),

    name:
      getPlayerName(
        player,
      ),

    position:
      getPlayerPosition(
        player,
      ),

    club:
      normalizeText(
        player?.club,
      ),

    price:
      getPlayerCurrentPrice(
        player,
      ),

    projection:
      getPlayerPeriodProjection(
        player,
        startRound,
        roundCount,
      ),
  }
}

function isUsableIncomingCandidate(
  candidate,
) {
  return Boolean(
    candidate?.player &&
    candidate.playerId &&
    candidate.position !==
      'unknown' &&
    candidate.club &&
    candidate.price !==
      null &&
    candidate.projection
      ?.hasProjection,
  )
}

/*
|--------------------------------------------------------------------------
| Harde regels beoordelen
|--------------------------------------------------------------------------
*/

function evaluateHardRules({
  actionType,
  playerOut,
  playersOut = [],
  playersIn = [],
  bankAfter,
  freeTransfersAfterMove,
  pointsCost,
  requiredTransferReserve,
  strategy,
}) {
  const violations = []

  const hardRules =
    strategy.hardRules

  const lockedIds =
    toIdSet(
      hardRules
        .lockedPlayerIds,
    )

  const outgoingPlayers = playersOut.length
    ? playersOut
    : playerOut
      ? [playerOut]
      : []

  outgoingPlayers.forEach((outgoingPlayer) => {
    if (lockedIds.has(getPlayerId(outgoingPlayer))) {
      violations.push({
        code: 'locked-player',
        message: `${getPlayerName(outgoingPlayer)} is vergrendeld en mag niet worden verkocht.`,
      })
    }
  })

  const bannedIncomingIds = toIdSet(
    hardRules.bannedIncomingPlayerIds,
  )

  playersIn.forEach((incomingPlayer) => {
    if (bannedIncomingIds.has(getPlayerId(incomingPlayer))) {
      violations.push({
        code: 'banned-incoming-player',
        message: `${getPlayerName(incomingPlayer)} mag niet worden gekocht.`,
      })
    }
  })

  const minimumBank =
    Math.max(
      0,
      toNumber(
        hardRules
          .minimumBank,
        0,
      ),
    )

  if (
    bankAfter <
    minimumBank -
      0.0001
  ) {
    violations.push({
      code:
        'minimum-bank',

      message:
        `Er blijft €${round(
          bankAfter,
          1,
        ).toFixed(
          1,
        )} miljoen over; minimaal €${minimumBank.toFixed(
          1,
        )} miljoen vereist.`,
    })
  }

  if (
    freeTransfersAfterMove <
    requiredTransferReserve
  ) {
    violations.push({
      code:
        'minimum-transfer-reserve',

      message:
        `Er blijven ${freeTransfersAfterMove} vrije transfer(s) over; minimaal ${requiredTransferReserve} vereist.`,
    })
  }

  const maximumPointsCost =
    Math.max(
      0,
      toNumber(
        hardRules
          .maximumPointsCost,
        0,
      ),
    )

  if (
    pointsCost >
    maximumPointsCost
  ) {
    violations.push({
      code:
        'maximum-points-cost',

      message:
        `Deze keuze kost ${pointsCost} punt(en); maximaal ${maximumPointsCost} toegestaan.`,
    })
  }

  return {
    valid:
      violations.length ===
      0,

    violations,
  }
}

/*
|--------------------------------------------------------------------------
| Voorkeuren beoordelen
|--------------------------------------------------------------------------
|
| Voorkeuren blokkeren niets.
| Ze geven alleen een transparante straf in de beslisscore.
|
*/

function evaluatePreferences({
  bankAfter,
  freeTransfersAfterMove,
  nextFreeTransfers,
  pointsCost,
  strategy,
}) {
  const preferences =
    strategy.preferences

  const preferredBank =
    Math.max(
      0,
      toNumber(
        preferences
          .preferredBank,
        0,
      ),
    )

  const preferredFreeTransfers =
    Math.max(
      0,
      Math.floor(
        toNumber(
          preferences
            .preferredFreeTransfersAfterMove,
          0,
        ),
      ),
    )

  const preferredMaximumPointsCost =
    Math.max(
      0,
      toNumber(
        preferences
          .preferredMaximumPointsCost,
        0,
      ),
    )

  const estimatedValuePerStoredTransfer =
    Math.max(
      0,
      toNumber(
        preferences
          .estimatedValuePerStoredTransfer,
        0,
      ),
    )

  const bankShortfall =
    Math.max(
      0,
      preferredBank -
      bankAfter,
    )

  const transferShortfall =
    Math.max(
      0,
      preferredFreeTransfers -
      freeTransfersAfterMove,
    )

  const pointsCostExcess =
    Math.max(
      0,
      pointsCost -
      preferredMaximumPointsCost,
    )

  const bankPenalty =
    bankShortfall *
    Math.max(
      0,
      toNumber(
        preferences
          .bankShortfallPenaltyPerMillion,
        0,
      ),
    )

  const transferPenalty =
    transferShortfall *
    Math.max(
      0,
      toNumber(
        preferences
          .transferShortfallPenalty,
        0,
      ),
    )

  const pointsCostPenalty =
    pointsCostExcess *
    Math.max(
      0,
      toNumber(
        preferences
          .pointsCostPreferencePenaltyMultiplier,
        0,
      ),
    )

  const storedTransferValue =
    nextFreeTransfers *
    estimatedValuePerStoredTransfer

  const deviations = []

  if (
    bankShortfall > 0
  ) {
    deviations.push({
      code:
        'preferred-bank',

      message:
        `De gewenste bankbuffer van €${preferredBank.toFixed(
          1,
        )} miljoen wordt met €${round(
          bankShortfall,
          1,
        ).toFixed(
          1,
        )} miljoen onderschreden.`,

      penalty:
        round(
          bankPenalty,
          2,
        ),
    })
  }

  if (
    transferShortfall > 0
  ) {
    deviations.push({
      code:
        'preferred-transfer-reserve',

      message:
        `Er blijven ${freeTransfersAfterMove} vrije transfer(s) over; de voorkeur is ${preferredFreeTransfers}.`,

      penalty:
        round(
          transferPenalty,
          2,
        ),
    })
  }

  if (
    pointsCostExcess > 0
  ) {
    deviations.push({
      code:
        'preferred-points-cost',

      message:
        `Deze keuze kost ${pointsCost} punt(en); de voorkeur is maximaal ${preferredMaximumPointsCost}.`,

      penalty:
        round(
          pointsCostPenalty,
          2,
        ),
    })
  }

  const totalPenalty =
    bankPenalty +
    transferPenalty +
    pointsCostPenalty

  const strategyScore =
    clamp(
      100 -
      totalPenalty * 10,
      0,
      100,
    )

  return {
    preferredBank:
      round(
        preferredBank,
        1,
      ),

    preferredFreeTransfers,

    bankShortfall:
      round(
        bankShortfall,
        1,
      ),

    transferShortfall,

    pointsCostExcess:
      round(
        pointsCostExcess,
        2,
      ),

    storedTransferValue:
      round(
        storedTransferValue,
        2,
      ),

    totalPenalty:
      round(
        totalPenalty,
        2,
      ),

    strategyScore:
      round(
        strategyScore,
        0,
      ),

    deviations,
  }
}

/*
|--------------------------------------------------------------------------
| Lineupresultaat compact maken
|--------------------------------------------------------------------------
*/

function serializeLineupSummary(
  lineupResult,
) {
  if (
    !lineupResult
      ?.valid ||
    !lineupResult
      ?.result
  ) {
    return null
  }

  return {
    formation:
      lineupResult
        .result
        .formation,

    expectedPoints:
      lineupResult
        .result
        .expectedPoints,

    expectedPointsPerRound:
      lineupResult
        .result
        .expectedPointsPerRound,

    baseExpectedPoints:
      lineupResult
        .result
        .baseExpectedPoints,

    captainBonus:
      lineupResult
        .result
        .captainBonus,

    captain:
      lineupResult
        .result
        .captain,

    viceCaptain:
      lineupResult
        .result
        .viceCaptain,

    starters:
      lineupResult
        .result
        .starters,

    bench:
      lineupResult
        .result
        .bench,
  }
}

/*
|--------------------------------------------------------------------------
| Coachuitleg maken
|--------------------------------------------------------------------------
*/

function createCoachReasons({
  actionType,
  playerOut,
  playerIn,
  playersOut = [],
  playersIn = [],
  expectedPointsGain,
  netExpectedPointsGain,
  bankAfter,
  freeTransfersAfterMove,
  nextFreeTransfers,
  pointsCost,
  preferenceEvaluation,
}) {
  const reasons = []

  if (
    actionType ===
    'no-transfer'
  ) {
    reasons.push(
      'Je gebruikt deze speelronde geen transfer.',
    )

    reasons.push(
      `Je gaat naar verwachting met ${nextFreeTransfers} vrije transfer(s) de volgende speelronde in.`,
    )

    if (
      preferenceEvaluation
        .deviations
        .length === 0
    ) {
      reasons.push(
        'Deze keuze voldoet volledig aan de ingestelde voorkeuren.',
      )
    }

    return reasons
  }

  if (actionType === 'double-transfer') {
    reasons.push(
      `${playersOut.map(getPlayerName).join(' en ')} worden vervangen door ${playersIn.map(getPlayerName).join(' en ')}.`,
    )
  } else {
    reasons.push(
      `${getPlayerName(playerOut)} wordt vervangen door ${getPlayerName(playerIn)}.`,
    )
  }

  reasons.push(
    `De optimale opstelling stijgt met ${round(
      expectedPointsGain,
      2,
    ).toFixed(
      2,
    )} Expected Points vóór eventuele transferkosten.`,
  )

  if (
    pointsCost > 0
  ) {
    reasons.push(
      `Na ${pointsCost} strafpunt(en) blijft een nettowinst van ${round(
        netExpectedPointsGain,
        2,
      ).toFixed(
        2,
      )} punt(en) over.`,
    )
  }

  reasons.push(
    `Na de transfer staat €${round(
      bankAfter,
      1,
    ).toFixed(
      1,
    )} miljoen op de bank.`,
  )

  reasons.push(
    `Je houdt direct ${freeTransfersAfterMove} vrije transfer(s) over en gaat naar verwachting met ${nextFreeTransfers} de volgende speelronde in.`,
  )

  if (
    preferenceEvaluation
      .deviations
      .length
  ) {
    reasons.push(
      `${preferenceEvaluation.deviations.length} voorkeur(en) worden niet volledig gevolgd.`,
    )
  } else {
    reasons.push(
      'Alle ingestelde voorkeuren worden gevolgd.',
    )
  }

  return reasons
}

/*
|--------------------------------------------------------------------------
| Beslisoptie maken
|--------------------------------------------------------------------------
*/

function createDecisionOption({
  actionType,
  playerOut = null,
  playerIn = null,
  squad,
  lineup,
  baselineLineup,
  bankBefore,
  bankAfter,
  sellingPrice = null,
  buyingPrice = null,
  playersOut = [],
  playersIn = [],
  sellingPrices = [],
  buyingPrices = [],
  transferPairs = [],
  availableFreeTransfers,
  transfersMade,
  requiredTransferReserve,
  strategy,
}) {
  const normalizedPlayersOut = playersOut.length
    ? playersOut
    : playerOut
      ? [playerOut]
      : []
  const normalizedPlayersIn = playersIn.length
    ? playersIn
    : playerIn
      ? [playerIn]
      : []
  const normalizedSellingPrices = sellingPrices.length
    ? sellingPrices.map((price) => round(price, 1))
    : sellingPrice === null
      ? []
      : [round(sellingPrice, 1)]
  const normalizedBuyingPrices = buyingPrices.length
    ? buyingPrices.map((price) => round(price, 1))
    : buyingPrice === null
      ? []
      : [round(buyingPrice, 1)]
  const transferCost =
    calculateTransferCost({
      transfersMade,

      availableFreeTransfers,
    })

  const freeTransfersUsed =
    Math.min(
      transfersMade,
      availableFreeTransfers,
    )

  const freeTransfersAfterMove =
    Math.max(
      0,
      availableFreeTransfers -
      freeTransfersUsed,
    )

  const nextFreeTransfers =
    calculateNextFreeTransfers({
      currentFreeTransfers:
        availableFreeTransfers,

      transfersMade,
    })

  const expectedPointsBefore =
    toNumber(
      baselineLineup
        ?.result
        ?.expectedPoints,
      0,
    )

  const expectedPointsAfter =
    toNumber(
      lineup
        ?.result
        ?.expectedPoints,
      0,
    )

  const expectedPointsGain =
    expectedPointsAfter -
    expectedPointsBefore

  const netExpectedPointsGain =
    expectedPointsGain -
    transferCost.pointsCost

  const hardRuleEvaluation =
    evaluateHardRules({
      actionType,

      playerOut,

      playersOut: normalizedPlayersOut,

      playersIn: normalizedPlayersIn,

      bankAfter,

      freeTransfersAfterMove,

      pointsCost:
        transferCost.pointsCost,

      requiredTransferReserve,

      strategy,
    })

  const preferenceEvaluation =
    evaluatePreferences({
      bankAfter,

      freeTransfersAfterMove,

      nextFreeTransfers,

      pointsCost:
        transferCost.pointsCost,

      strategy,
    })

  const decisionScore =
    netExpectedPointsGain +
    preferenceEvaluation
      .storedTransferValue -
    preferenceEvaluation
      .totalPenalty

  const coachScore =
    clamp(
      50 +
      decisionScore * 5,
      0,
      100,
    )

  return {
    id:
      createActionId({
        actionType,
        playerOut,
        playerIn,
        playersOut: normalizedPlayersOut,
        playersIn: normalizedPlayersIn,
      }),

    actionType,

    valid:
      hardRuleEvaluation
        .valid,

    playerOut,

    playerIn,

    playersOut: normalizedPlayersOut,

    playersIn: normalizedPlayersIn,

    transferPairs,

    squad,

    bankBefore:
      round(
        bankBefore,
        1,
      ),

    bankAfter:
      round(
        bankAfter,
        1,
      ),

    sellingPrice:
      sellingPrice ===
      null
        ? null
        : round(
            sellingPrice,
            1,
          ),

    buyingPrice:
      buyingPrice ===
      null
        ? null
        : round(
            buyingPrice,
            1,
          ),

    sellingPrices: normalizedSellingPrices,

    buyingPrices: normalizedBuyingPrices,

    transfersMade,

    availableFreeTransfers,

    freeTransfersAfterMove,

    nextFreeTransfers,

    requiredTransferReserve,

    transferCost,

    expectedPointsBefore:
      round(
        expectedPointsBefore,
        2,
      ),

    expectedPointsAfter:
      round(
        expectedPointsAfter,
        2,
      ),

    expectedPointsGain:
      round(
        expectedPointsGain,
        2,
      ),

    netExpectedPointsGain:
      round(
        netExpectedPointsGain,
        2,
      ),

    footballScore:
      round(
        expectedPointsGain,
        2,
      ),

    strategyScore:
      preferenceEvaluation
        .strategyScore,

    decisionScore:
      round(
        decisionScore,
        2,
      ),

    coachScore:
      round(
        coachScore,
        0,
      ),

    hardRules:
      hardRuleEvaluation,

    preferences:
      preferenceEvaluation,

    lineup:
      serializeLineupSummary(
        lineup,
      ),

    coachReasons:
      createCoachReasons({
        actionType,

        playerOut,

        playerIn,

        playersOut: normalizedPlayersOut,

        playersIn: normalizedPlayersIn,

        expectedPointsGain,

        netExpectedPointsGain,

        bankAfter,

        freeTransfersAfterMove,

        nextFreeTransfers,

        pointsCost:
          transferCost.pointsCost,

        preferenceEvaluation,
      }),
  }
}

/*
|--------------------------------------------------------------------------
| Opties vergelijken
|--------------------------------------------------------------------------
*/

function compareDecisionOptions(
  left,
  right,
) {
  return (
    Number(
      right.valid,
    ) -
      Number(
        left.valid,
      ) ||

    right.decisionScore -
      left.decisionScore ||

    right.netExpectedPointsGain -
      left.netExpectedPointsGain ||

    right.strategyScore -
      left.strategyScore ||

    right.bankAfter -
      left.bankAfter ||

    String(
      left.playerIn
        ?.name ??
      '',
    ).localeCompare(
      String(
        right.playerIn
          ?.name ??
        '',
      ),
      'nl-NL',
    ) ||

    String(left.id ?? '').localeCompare(
      String(right.id ?? ''),
      'en',
    )
  )
}

function deduplicateOptions(options) {
  const optionsById = new Map()

  options.forEach((option) => {
    if (
      option?.id &&
      !optionsById.has(option.id)
    ) {
      optionsById.set(option.id, option)
    }
  })

  return [...optionsById.values()]
    .sort(compareDecisionOptions)
}

function normalizeMaximumSearchOptions(value) {
  if (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  ) {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number)
    ? Math.max(2, Math.floor(number))
    : null
}

function normalizeMaximumRecommendedOptions(value) {
  if (isMissingValue(value)) {
    return DEFAULT_TRANSFER_STRATEGY
      .output
      .maximumRecommendedOptions
  }

  const number = Number(value)

  return Number.isFinite(number)
    ? Math.max(1, Math.floor(number))
    : DEFAULT_TRANSFER_STRATEGY
        .output
        .maximumRecommendedOptions
}

function selectSearchOptions(options, maximumSearchOptions) {
  if (
    maximumSearchOptions === null ||
    options.length <= maximumSearchOptions
  ) {
    return [...options]
  }

  const noTransferOption = options.find(
    (option) => option.actionType === 'no-transfer',
  )
  const transferOptions = options.filter(
    (option) => option !== noTransferOption,
  )
  const selected = noTransferOption
    ? [
        noTransferOption,
        ...transferOptions.slice(0, maximumSearchOptions - 1),
      ]
    : transferOptions.slice(0, maximumSearchOptions)

  return selected.sort(compareDecisionOptions)
}

/*
|--------------------------------------------------------------------------
| Basisinvoer controleren
|--------------------------------------------------------------------------
*/

function validatePlannerInput({
  currentSquad,
  playerPool,
  bank,
  availableFreeTransfers,
}) {
  const errors = []

  const requiredSquadSize = 15

  if (
    !Array.isArray(
      currentSquad,
    )
  ) {
    errors.push(
      'currentSquad moet een array zijn.',
    )
  }

  if (
    !Array.isArray(
      playerPool,
    )
  ) {
    errors.push(
      'playerPool moet een array zijn.',
    )
  }

  if (
    Array.isArray(
      currentSquad,
    ) &&
    currentSquad.length !==
      requiredSquadSize
  ) {
    errors.push(
      `De huidige selectie moet uit ${requiredSquadSize} spelers bestaan.`,
    )
  }

  if (
    !Number.isFinite(
      Number(bank),
    ) ||
    Number(bank) < 0
  ) {
    errors.push(
      'De bank moet een geldig positief bedrag zijn.',
    )
  }

  if (
    !Number.isFinite(
      Number(
        availableFreeTransfers,
      ),
    ) ||
    Number(
      availableFreeTransfers,
    ) < 0
  ) {
    errors.push(
      'Het aantal vrije transfers moet een geldig positief getal zijn.',
    )
  }

  return {
    valid:
      errors.length === 0,

    errors,
  }
}

/*
|--------------------------------------------------------------------------
| Selectie-identiteiten
|--------------------------------------------------------------------------
*/

function createSquadIdSet(
  squad,
) {
  return new Set(
    squad.map(
      getPlayerId,
    ),
  )
}

function countPlayersByClub(
  squad,
) {
  const counts =
    new Map()

  squad.forEach(
    (player) => {
      const club =
        normalizeText(
          player?.club,
        )

      if (!club) {
        return
      }

      counts.set(
        club,
        (
          counts.get(
            club,
          ) ??
          0
        ) + 1,
      )
    },
  )

  return counts
}

/*
|--------------------------------------------------------------------------
| Positiecontrole
|--------------------------------------------------------------------------
*/

function hasSamePosition(
  playerOut,
  playerIn,
) {
  return (
    getPlayerPosition(
      playerOut,
    ) ===
    getPlayerPosition(
      playerIn,
    )
  )
}

/*
|--------------------------------------------------------------------------
| Clubcontrole
|--------------------------------------------------------------------------
|
| De selectie mag na de wissel niet meer dan het toegestane aantal
| spelers van dezelfde club bevatten.
|
*/

function respectsClubLimit({
  currentSquad,
  playerOut,
  playerIn,
}) {
  const maximumPlayersPerClub =
    Math.max(
      1,
      toNumber(
        FANTASY_GAME_RULES
          ?.maximumPlayersPerClub ??
          FANTASY_GAME_RULES
            ?.maxPlayersPerClub,
        3,
      ),
    )

  const clubCounts =
    countPlayersByClub(
      currentSquad,
    )

  const outgoingClub =
    normalizeText(
      playerOut?.club,
    )

  const incomingClub =
    normalizeText(
      playerIn?.club,
    )

  if (
    outgoingClub
  ) {
    clubCounts.set(
      outgoingClub,
      Math.max(
        0,
        (
          clubCounts.get(
            outgoingClub,
          ) ??
          0
        ) - 1,
      ),
    )
  }

  if (
    incomingClub
  ) {
    clubCounts.set(
      incomingClub,
      (
        clubCounts.get(
          incomingClub,
        ) ??
        0
      ) + 1,
    )
  }

  return (
    (
      clubCounts.get(
        incomingClub,
      ) ??
      0
    ) <=
    maximumPlayersPerClub
  )
}

/*
|--------------------------------------------------------------------------
| Nieuwe selectie maken
|--------------------------------------------------------------------------
*/

function replaceSquadPlayer({
  currentSquad,
  playerOut,
  playerIn,
}) {
  const outgoingId =
    getPlayerId(
      playerOut,
    )

  return currentSquad.map(
    (player) =>
      getPlayerId(
        player,
      ) ===
      outgoingId
        ? playerIn
        : player,
  )
}

/*
|--------------------------------------------------------------------------
| Selectie valideren
|--------------------------------------------------------------------------
*/

function validateTransferSquad(
  squad,
) {
  const validation =
    validateSquad(
      squad,
      // An existing squad can appreciate beyond the initial starting budget.
      // Individual transfers are still limited by bank plus selling proceeds.
      { unlimitedBudget: true },
    )

  if (
    typeof validation ===
    'boolean'
  ) {
    return {
      valid:
        validation,

      errors:
        validation
          ? []
          : [
              'De selectie voldoet niet aan de spelregels.',
            ],
    }
  }

  if (
    validation &&
    typeof validation ===
      'object'
  ) {
    return {
      valid:
        validation.valid !==
        false,

      errors:
        Array.isArray(
          validation.errors,
        )
          ? validation.errors
          : [],
    }
  }

  return {
    valid: true,
    errors: [],
  }
}

function passesCheapSquadIdentityAndClubCheck(squad) {
  const ids = squad.map(getPlayerId)
  if (ids.some((id) => !id) || new Set(ids).size !== squad.length) return false

  return [...countPlayersByClub(squad).values()].every(
    (count) => count <= FANTASY_GAME_RULES.squad.maxPlayersPerClub,
  )
}

/*
|--------------------------------------------------------------------------
| Binnenkomende kandidaten voorbereiden
|--------------------------------------------------------------------------
*/

function prepareIncomingCandidates({
  playerPool,
  currentSquad,
  startRound,
  roundCount,
  strategy,
}) {
  const currentSquadIds =
    createSquadIdSet(
      currentSquad,
    )

  const bannedIncomingIds =
    toIdSet(
      strategy
        .hardRules
        .bannedIncomingPlayerIds,
    )

  const uniqueCandidates =
    new Map()

  const ambiguousCandidateIds =
    new Set()

  playerPool.forEach(
    (player) => {
      const candidate =
        createIncomingCandidate(
          player,
          startRound,
          roundCount,
        )

      if (
        !isUsableIncomingCandidate(
          candidate,
        )
      ) {
        return
      }

      if (
        currentSquadIds.has(
          candidate.playerId,
        )
      ) {
        return
      }

      if (
        bannedIncomingIds.has(
          candidate.playerId,
        )
      ) {
        return
      }

      if (ambiguousCandidateIds.has(candidate.playerId)) {
        return
      }

      if (uniqueCandidates.has(candidate.playerId)) {
        uniqueCandidates.delete(candidate.playerId)
        ambiguousCandidateIds.add(candidate.playerId)
        return
      }

      uniqueCandidates.set(
        candidate.playerId,
        candidate,
      )
    },
  )

  return [
    ...uniqueCandidates.values(),
  ]
}

/*
|--------------------------------------------------------------------------
| Geen-transferoptie beoordelen
|--------------------------------------------------------------------------
*/

function evaluateNoTransferOption({
  currentSquad,
  baselineLineup,
  bank,
  availableFreeTransfers,
  requiredTransferReserve,
  strategy,
}) {
  return createDecisionOption({
    actionType:
      'no-transfer',

    squad:
      currentSquad,

    lineup:
      baselineLineup,

    baselineLineup,

    bankBefore:
      bank,

    bankAfter:
      bank,

    availableFreeTransfers,

    transfersMade: 0,

    requiredTransferReserve,

    strategy,
  })
}

/*
|--------------------------------------------------------------------------
| Enkele transfer beoordelen
|--------------------------------------------------------------------------
*/

function evaluateSingleTransfer({
  currentSquad,
  playerOut,
  incomingCandidate,
  baselineLineup,
  bank,
  availableFreeTransfers,
  requiredTransferReserve,
  startRound,
  roundCount,
  manualSellingPrices,
  purchasePrices,
  strategy,
}) {
  const playerIn =
    incomingCandidate.player

  if (
    !getPlayerId(playerOut) ||
    !incomingCandidate.playerId
  ) {
    return null
  }

  if (
    !hasSamePosition(
      playerOut,
      playerIn,
    )
  ) {
    return null
  }

  if (
    !respectsClubLimit({
      currentSquad,

      playerOut,

      playerIn,
    })
  ) {
    return null
  }

  const sellingPrice =
    getSellingPrice({
      player:
        playerOut,

      manualSellingPrices,

      purchasePrices,
    })

  if (
    sellingPrice ===
      null ||
    !Number.isFinite(
      Number(
        sellingPrice,
      ),
    )
  ) {
    return null
  }

  const buyingPrice =
    incomingCandidate.price

  const bankAfter =
    round(
      bank +
      sellingPrice -
      buyingPrice,
      1,
    )

  if (
    bankAfter <
    -0.0001
  ) {
    return null
  }

  const newSquad =
    replaceSquadPlayer({
      currentSquad,

      playerOut,

      playerIn,
    })

  const squadValidation =
    validateTransferSquad(
      newSquad,
    )

  if (
    !squadValidation.valid
  ) {
    return null
  }

  const lineup =
    optimizeLineupForPeriod({
      squad:
        newSquad,

      startRound,

      roundCount,
    })

  if (
    !lineup?.valid
  ) {
    return null
  }

  return createDecisionOption({
    actionType:
      'transfer',

    playerOut,

    playerIn,

    squad:
      newSquad,

    lineup,

    baselineLineup,

    bankBefore:
      bank,

    bankAfter,

    sellingPrice,

    buyingPrice,

    availableFreeTransfers,

    transfersMade: 1,

    requiredTransferReserve,

    strategy,
  })
}

/*
|--------------------------------------------------------------------------
| Alle enkele transfers genereren
|--------------------------------------------------------------------------
*/

function generateSingleTransferOptions({
  currentSquad,
  incomingCandidates,
  baselineLineup,
  bank,
  availableFreeTransfers,
  requiredTransferReserve,
  startRound,
  roundCount,
  manualSellingPrices,
  purchasePrices,
  strategy,
}) {
  const options = []

  currentSquad.forEach(
    (playerOut) => {
      incomingCandidates.forEach(
        (
          incomingCandidate,
        ) => {
          const option =
            evaluateSingleTransfer({
              currentSquad,

              playerOut,

              incomingCandidate,

              baselineLineup,

              bank,

              availableFreeTransfers,

              requiredTransferReserve,

              startRound,

              roundCount,

              manualSellingPrices,

              purchasePrices,

              strategy,
            })

          if (option) {
            options.push(
              option,
            )
          }
        },
      )
    },
  )

  return options
}

function normalizeBoundedSearchLimit(value, fallback, minimum = 1) {
  if (isMissingValue(value)) {
    return fallback
  }

  const number = Number(value)
  return Number.isFinite(number)
    ? Math.max(minimum, Math.floor(number))
    : fallback
}

function compareCandidateProjection(left, right) {
  return (
    toNumber(right.projection?.expectedPoints, 0) -
      toNumber(left.projection?.expectedPoints, 0) ||
    toNumber(left.price, Number.MAX_SAFE_INTEGER) -
      toNumber(right.price, Number.MAX_SAFE_INTEGER) ||
    left.playerId.localeCompare(right.playerId, 'en')
  )
}

function selectDiversifiedCandidates(rankings, maximumCandidates, getId) {
  const selected = []
  const seen = new Set()
  let rankIndex = 0

  while (selected.length < maximumCandidates) {
    let added = false

    rankings.forEach((ranking) => {
      const candidate = ranking[rankIndex]
      const candidateId = candidate ? getId(candidate) : ''
      if (candidateId && !seen.has(candidateId) && selected.length < maximumCandidates) {
        seen.add(candidateId)
        selected.push(candidate)
        added = true
      }
    })

    if (!added && rankings.every((ranking) => rankIndex >= ranking.length)) {
      break
    }
    rankIndex += 1
  }

  return selected
}

function createTransferPairs(playersOut, playersIn) {
  const availableIncoming = [...playersIn]
    .sort((left, right) => getPlayerId(left).localeCompare(getPlayerId(right), 'en'))

  return [...playersOut]
    .sort((left, right) => getPlayerId(left).localeCompare(getPlayerId(right), 'en'))
    .map((playerOut) => {
      const index = availableIncoming.findIndex(
        (playerIn) => getPlayerPosition(playerIn) === getPlayerPosition(playerOut),
      )
      const playerIn = availableIncoming.splice(index, 1)[0]
      return { playerOut, playerIn }
    })
}

function generateDoubleTransferOptions({
  currentSquad,
  incomingCandidates,
  baselineLineup,
  bank,
  availableFreeTransfers,
  requiredTransferReserve,
  startRound,
  roundCount,
  manualSellingPrices,
  purchasePrices,
  strategy,
}) {
  const config = strategy.search.doubleTransfers
  const statistics = {
    doubleOutgoingCandidates: 0,
    doubleIncomingCandidatesByPosition: {},
    doubleOutgoingPairsEvaluated: 0,
    doubleIncomingPairsEvaluated: 0,
    doubleCombinationsEvaluated: 0,
    doubleCombinationsPruned: 0,
    doubleCombinationsAfterCheapFilters: 0,
    doubleLineupOptimizations: 0,
    doublePreselectionMs: 0,
    doubleLineupOptimizationMs: 0,
  }

  if (config.enabled === false || String(config.enabled).toLowerCase() === 'false') {
    return { options: [], statistics }
  }

  const maximumOutgoingCandidates = normalizeBoundedSearchLimit(
    config.maximumOutgoingCandidates,
    DEFAULT_TRANSFER_STRATEGY.search.doubleTransfers.maximumOutgoingCandidates,
    2,
  )
  const maximumIncomingCandidatesPerPosition = normalizeBoundedSearchLimit(
    config.maximumIncomingCandidatesPerPosition,
    DEFAULT_TRANSFER_STRATEGY.search.doubleTransfers.maximumIncomingCandidatesPerPosition,
    2,
  )
  const maximumGeneratedOptions = normalizeBoundedSearchLimit(
    config.maximumGeneratedOptions,
    DEFAULT_TRANSFER_STRATEGY.search.doubleTransfers.maximumGeneratedOptions,
  )
  const lockedIds = toIdSet(strategy.hardRules.lockedPlayerIds)
  const eligibleOutgoingCandidates = currentSquad
    .map((player) => ({
      player,
      playerId: getPlayerId(player),
      price: getPlayerCurrentPrice(player),
      projection: getPlayerPeriodProjection(player, startRound, roundCount),
    }))
    .filter((candidate) => candidate.playerId && !lockedIds.has(candidate.playerId))

  const outgoingByLowProjection = [...eligibleOutgoingCandidates].sort((left, right) => (
    toNumber(left.projection?.expectedPoints, 0) -
      toNumber(right.projection?.expectedPoints, 0) ||
    left.playerId.localeCompare(right.playerId, 'en')
  ))
  const outgoingByHighPrice = [...eligibleOutgoingCandidates].sort((left, right) => (
    toNumber(right.price, 0) - toNumber(left.price, 0) ||
    toNumber(left.projection?.expectedPoints, 0) -
      toNumber(right.projection?.expectedPoints, 0) ||
    left.playerId.localeCompare(right.playerId, 'en')
  ))
  const outgoingByPosition = [...new Set(
    eligibleOutgoingCandidates.map((candidate) => getPlayerPosition(candidate.player)),
  )]
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map((position) => outgoingByLowProjection.filter(
      (candidate) => getPlayerPosition(candidate.player) === position,
    ))
  const outgoingCandidates = selectDiversifiedCandidates(
    [outgoingByLowProjection, outgoingByHighPrice, ...outgoingByPosition],
    maximumOutgoingCandidates,
    (candidate) => candidate.playerId,
  )
  statistics.doubleOutgoingCandidates = outgoingCandidates.length

  const incomingByPosition = new Map()
  incomingCandidates.forEach((candidate) => {
    if (!incomingByPosition.has(candidate.position)) {
      incomingByPosition.set(candidate.position, [])
    }
    incomingByPosition.get(candidate.position).push(candidate)
  })
  incomingByPosition.forEach((candidates, position) => {
    const byProjection = [...candidates].sort(compareCandidateProjection)
    const byValue = [...candidates].sort((left, right) => (
      toNumber(right.projection?.expectedPoints, 0) / Math.max(toNumber(right.price, 0), 0.1) -
        toNumber(left.projection?.expectedPoints, 0) / Math.max(toNumber(left.price, 0), 0.1) ||
      left.playerId.localeCompare(right.playerId, 'en')
    ))
    const byLowPrice = [...candidates].sort((left, right) => (
      toNumber(left.price, Number.MAX_SAFE_INTEGER) -
        toNumber(right.price, Number.MAX_SAFE_INTEGER) ||
      left.playerId.localeCompare(right.playerId, 'en')
    ))
    const byHighPrice = [...candidates].sort((left, right) => (
      toNumber(right.price, 0) - toNumber(left.price, 0) ||
      left.playerId.localeCompare(right.playerId, 'en')
    ))
    incomingByPosition.set(
      position,
      selectDiversifiedCandidates(
        [byProjection, byValue, byLowPrice, byHighPrice],
        maximumIncomingCandidatesPerPosition,
        (candidate) => candidate.playerId,
      ).sort(compareCandidateProjection),
    )
  })
  statistics.doubleIncomingCandidatesByPosition = Object.fromEntries(
    [...incomingByPosition.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([position, candidates]) => [position, candidates.length]),
  )
  const projectionById = new Map([
    ...eligibleOutgoingCandidates.map((candidate) => [
      candidate.playerId,
      toNumber(candidate.projection?.expectedPoints, 0),
    ]),
    ...incomingCandidates.map((candidate) => [
      candidate.playerId,
      toNumber(candidate.projection?.expectedPoints, 0),
    ]),
  ])

  const outgoingPairs = []
  for (let left = 0; left < outgoingCandidates.length; left += 1) {
    for (let right = left + 1; right < outgoingCandidates.length; right += 1) {
      outgoingPairs.push([outgoingCandidates[left].player, outgoingCandidates[right].player])
    }
  }
  statistics.doubleOutgoingPairsEvaluated = outgoingPairs.length
  const cheapCandidates = []
  const preselectionStarted = getNow()

  for (const playersOut of outgoingPairs) {
    const [firstPosition, secondPosition] = playersOut.map(getPlayerPosition).sort()
    const firstCandidates = incomingByPosition.get(firstPosition) ?? []
    const secondCandidates = incomingByPosition.get(secondPosition) ?? []

    for (let first = 0; first < firstCandidates.length; first += 1) {
      const secondStart = firstPosition === secondPosition ? first + 1 : 0
      for (let second = secondStart; second < secondCandidates.length; second += 1) {
        statistics.doubleIncomingPairsEvaluated += 1
        const pair = [firstCandidates[first], secondCandidates[second]]
        if (pair[0].playerId === pair[1].playerId) continue
        statistics.doubleCombinationsEvaluated += 1

        const playersIn = pair.map((candidate) => candidate.player)
        const transferPairs = createTransferPairs(playersOut, playersIn)
        const orderedPlayersOut = transferPairs.map(({ playerOut }) => playerOut)
        const orderedPlayersIn = transferPairs.map(({ playerIn }) => playerIn)
        const sellingPrices = transferPairs.map(({ playerOut }) => getSellingPrice({
          player: playerOut,
          manualSellingPrices,
          purchasePrices,
        }))
        const buyingPrices = transferPairs.map(({ playerIn }) => getPlayerCurrentPrice(playerIn))
        if ([...sellingPrices, ...buyingPrices].some((price) => price === null)) continue

        const bankAfter = round(
          bank + sellingPrices.reduce((sum, price) => sum + price, 0) -
            buyingPrices.reduce((sum, price) => sum + price, 0),
          1,
        )
        if (
          bankAfter < Math.max(0, toNumber(strategy.hardRules.minimumBank, 0)) - 0.0001
        ) continue

        const replacements = new Map(
          transferPairs.map(({ playerOut, playerIn }) => [getPlayerId(playerOut), playerIn]),
        )
        const newSquad = currentSquad.map((player) => replacements.get(getPlayerId(player)) ?? player)
        if (!passesCheapSquadIdentityAndClubCheck(newSquad)) continue

        const id = createActionId({
          actionType: 'double-transfer',
          playersOut: orderedPlayersOut,
          playersIn: orderedPlayersIn,
        })
        const projectedGain =
          orderedPlayersIn.reduce(
            (sum, player) => sum + toNumber(projectionById.get(getPlayerId(player)), 0),
            0,
          ) -
          orderedPlayersOut.reduce(
            (sum, player) => sum + toNumber(projectionById.get(getPlayerId(player)), 0),
            0,
          )

        cheapCandidates.push({
          id,
          projectedGain,
          bankAfter,
          playersOut: orderedPlayersOut,
          playersIn: orderedPlayersIn,
          sellingPrices,
          buyingPrices,
          transferPairs,
          squad: newSquad,
        })
      }
    }
  }

  statistics.doubleCombinationsAfterCheapFilters = cheapCandidates.length
  const selectedCandidates = cheapCandidates
    .sort((left, right) => (
      right.projectedGain - left.projectedGain ||
      right.bankAfter - left.bankAfter ||
      left.id.localeCompare(right.id, 'en')
    ))
    .slice(0, maximumGeneratedOptions)
  statistics.doubleCombinationsPruned =
    cheapCandidates.length - selectedCandidates.length
  statistics.doublePreselectionMs = round(getNow() - preselectionStarted, 3)

  const options = []
  const lineupStarted = getNow()
  selectedCandidates.forEach((candidate) => {
    statistics.doubleLineupOptimizations += 1
    const lineup = optimizeLineupForPeriod({
      squad: candidate.squad,
      startRound,
      roundCount,
    })
    if (!lineup?.valid) return

    options.push(createDecisionOption({
      actionType: 'double-transfer',
      playersOut: candidate.playersOut,
      playersIn: candidate.playersIn,
      sellingPrices: candidate.sellingPrices,
      buyingPrices: candidate.buyingPrices,
      transferPairs: candidate.transferPairs,
      squad: candidate.squad,
      lineup,
      baselineLineup,
      bankBefore: bank,
      bankAfter: candidate.bankAfter,
      availableFreeTransfers,
      transfersMade: 2,
      requiredTransferReserve,
      strategy,
    }))
  })
  statistics.doubleLineupOptimizationMs = round(getNow() - lineupStarted, 3)

  return { options, statistics }
}

function getNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function getHeapUsed() {
  if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
    return process.memoryUsage().heapUsed
  }
  return Number(globalThis.performance?.memory?.usedJSHeapSize) || null
}

function createCheapSingleCandidates({
  currentSquad,
  incomingCandidates,
  bank,
  startRound,
  roundCount,
  manualSellingPrices,
  purchasePrices,
  strategy,
}) {
  const lockedIds =
    toIdSet(
      strategy.hardRules.lockedPlayerIds,
    )

  const candidates = []

  let rawCombinations = 0

  currentSquad.forEach(
    (playerOut) => {
      const playerOutId =
        getPlayerId(
          playerOut,
        )

      if (
        !playerOutId ||
        lockedIds.has(
          playerOutId,
        )
      ) {
        return
      }

      const sellingPrice =
        getSellingPrice({
          player:
            playerOut,

          manualSellingPrices,

          purchasePrices,
        })

      if (
        sellingPrice === null
      ) {
        return
      }

      const outgoingProjection =
        getPlayerPeriodProjection(
          playerOut,
          startRound,
          roundCount,
        )

      const outgoingFixtureCount =
        Math.max(
          0,
          toNumber(
            outgoingProjection
              ?.fixtureCount,
            0,
          ),
        )

      incomingCandidates.forEach(
        (incomingCandidate) => {
          rawCombinations += 1

          const playerIn =
            incomingCandidate.player

          if (
            !hasSamePosition(
              playerOut,
              playerIn,
            ) ||
            !respectsClubLimit({
              currentSquad,
              playerOut,
              playerIn,
            })
          ) {
            return
          }

          const bankAfter =
            round(
              bank +
              sellingPrice -
              incomingCandidate.price,
              1,
            )

          if (
            bankAfter <
            Math.max(
              0,
              toNumber(
                strategy
                  .hardRules
                  .minimumBank,
                0,
              ),
            ) -
              0.0001
          ) {
            return
          }

          const incomingFixtureCount =
            Math.max(
              0,
              toNumber(
                incomingCandidate
                  .projection
                  ?.fixtureCount,
                0,
              ),
            )

          const expectedPointsGain =
            round(
              toNumber(
                incomingCandidate
                  .projection
                  ?.expectedPoints,
                0,
              ) -
              toNumber(
                outgoingProjection
                  ?.expectedPoints,
                0,
              ),
              4,
            )

          const value =
            round(
              toNumber(
                incomingCandidate
                  .projection
                  ?.expectedPoints,
                0,
              ) /
              Math.max(
                incomingCandidate.price,
                0.1,
              ),
              4,
            )

          const availability =
            round(
              toNumber(
                incomingCandidate
                  .projection
                  ?.appearanceProbability,
                0,
              ),
              4,
            )

          /*
          |--------------------------------------------------------------------------
          | Zero Fixture Rescue
          |--------------------------------------------------------------------------
          |
          | Wanneer de uitgaande speler deze ronde geen wedstrijd heeft en
          | de binnenkomende speler wel, moet deze transfer gegarandeerd in
          | de serieuze voorselectie kunnen komen.
          |
          | Dit kiest de transfer nog niet automatisch. De volledige
          | lineupoptimalisatie en Season Planner bepalen daarna of hij
          | werkelijk beter is dan niets doen.
          |
          */

          const zeroFixtureRescue =
            outgoingFixtureCount === 0 &&
            incomingFixtureCount > 0

          candidates.push({
            id:
              createActionId({
                actionType:
                  'transfer',

                playerOut,

                playerIn,
              }),

            playerOut,

            incomingCandidate,

            outgoingId:
              playerOutId,

            position:
              getPlayerPosition(
                playerOut,
              ),

            expectedPointsGain,

            value,

            availability,

            fixtureCount:
              incomingFixtureCount,

            outgoingFixtureCount,

            incomingFixtureCount,

            zeroFixtureRescue,

            cheapScore:
              round(
                expectedPointsGain +
                availability * 0.5 +
                incomingFixtureCount * 0.05 +
                (
                  zeroFixtureRescue
                    ? 5
                    : 0
                ),
                4,
              ),

            bankAfter,

            priceDelta:
              round(
                incomingCandidate.price -
                sellingPrice,
                1,
              ),
          })
        },
      )
    },
  )

  return {
    candidates,
    rawCombinations,
  }
}

function selectCheapSingleCandidates(
  candidates,
  maximumCandidates,
) {
  const normalizedMaximum =
    Math.max(
      1,
      Math.floor(
        toNumber(
          maximumCandidates,
          1,
        ),
      ),
    )

  /*
  |--------------------------------------------------------------------------
  | Fixture-rescues eerst veiligstellen
  |--------------------------------------------------------------------------
  |
  | Deze opties worden niet automatisch aanbevolen. Ze worden alleen
  | gegarandeerd volledig doorgerekend, zodat de planner ze niet mist.
  |
  */

  const rescueCandidates =
    candidates
      .filter(
        (candidate) =>
          candidate.zeroFixtureRescue ===
          true,
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.expectedPointsGain -
            left.expectedPointsGain ||

          right.availability -
            left.availability ||

          right.incomingFixtureCount -
            left.incomingFixtureCount ||

          right.bankAfter -
            left.bankAfter ||

          left.id.localeCompare(
            right.id,
            'en',
          ),
      )

  const selected =
    rescueCandidates.slice(
      0,
      normalizedMaximum,
    )

  const selectedIds =
    new Set(
      selected.map(
        (candidate) =>
          candidate.id,
      ),
    )

  const remainingSlots =
    normalizedMaximum -
    selected.length

  if (
    remainingSlots <= 0
  ) {
    return selected
  }

  const remainingCandidates =
    candidates.filter(
      (candidate) =>
        !selectedIds.has(
          candidate.id,
        ),
    )

  const byGain =
    [...remainingCandidates].sort(
      (
        left,
        right,
      ) =>
        right.expectedPointsGain -
          left.expectedPointsGain ||

        left.id.localeCompare(
          right.id,
          'en',
        ),
    )

  const byValue =
    [...remainingCandidates].sort(
      (
        left,
        right,
      ) =>
        right.value -
          left.value ||

        right.expectedPointsGain -
          left.expectedPointsGain ||

        left.id.localeCompare(
          right.id,
          'en',
        ),
    )

  const byBudget =
    [...remainingCandidates].sort(
      (
        left,
        right,
      ) =>
        right.bankAfter -
          left.bankAfter ||

        right.expectedPointsGain -
          left.expectedPointsGain ||

        left.id.localeCompare(
          right.id,
          'en',
        ),
    )

  const byPremiumUpgrade =
    [...remainingCandidates].sort(
      (
        left,
        right,
      ) =>
        right.priceDelta -
          left.priceDelta ||

        right.expectedPointsGain -
          left.expectedPointsGain ||

        left.id.localeCompare(
          right.id,
          'en',
        ),
    )

  const byLowRisk =
    [...remainingCandidates].sort(
      (
        left,
        right,
      ) =>
        right.availability -
          left.availability ||

        right.cheapScore -
          left.cheapScore ||

        left.id.localeCompare(
          right.id,
          'en',
        ),
    )

  const perPosition =
    [
      ...new Set(
        remainingCandidates.map(
          (candidate) =>
            candidate.position,
        ),
      ),
    ]
      .sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
            'en',
          ),
      )
      .map(
        (position) =>
          byGain.filter(
            (candidate) =>
              candidate.position ===
              position,
          ),
      )

  const perOutgoing =
    [
      ...new Set(
        byGain.map(
          (candidate) =>
            candidate.outgoingId,
        ),
      ),
    ]
      .map(
        (outgoingId) =>
          byGain.filter(
            (candidate) =>
              candidate.outgoingId ===
              outgoingId,
          ),
      )

  const diversified =
    selectDiversifiedCandidates(
      [
        byGain,
        byValue,
        byBudget,
        byPremiumUpgrade,
        byLowRisk,
        ...perPosition,
        ...perOutgoing,
      ],
      remainingSlots,
      (candidate) =>
        candidate.id,
    )

  return [
    ...selected,
    ...diversified,
  ]
}

function selectPlannerActionOptions({
  noTransferOption,
  singleOptions,
  doubleOptions,
  maximumActions,
  minimumSingleActions,
  maximumDoubleActions,
}) {
  if (maximumActions <= 0) return []
  const selected = noTransferOption?.valid ? [noTransferOption] : []
  const seen = new Set(selected.map((option) => option.id))
  const add = (option) => {
    if (!option?.valid || seen.has(option.id) || selected.length >= maximumActions) return
    seen.add(option.id)
    selected.push(option)
  }
  const sortedSingles = singleOptions.filter((option) => option.valid).sort(compareDecisionOptions)
  const sortedDoubles = doubleOptions.filter((option) => option.valid).sort(compareDecisionOptions)
  const allowedDoubles = sortedDoubles.slice(0, maximumDoubleActions)

  sortedSingles.slice(0, minimumSingleActions).forEach(add)
  allowedDoubles.forEach(add)
  ;[...sortedSingles, ...allowedDoubles]
    .sort(compareDecisionOptions)
    .forEach(add)

  return selected.sort(compareDecisionOptions)
}

/**
 * Begrensde action-provider voor Beam Search. Deze functie is bewust niet
 * exhaustief: goedkope, diverse preselectie vindt plaats vóór lineupoptimalisatie.
 */
export function generatePlannerActions({
  currentSquad,
  playerPool,
  bank = 0,
  availableFreeTransfers = 1,
  startRound = 1,
  roundCount = 1,
  manualSellingPrices = {},
  purchasePrices = {},
  strategy = {},
  maximumActions,
} = {}) {
  const totalStarted = getNow()
  const heapBefore = getHeapUsed()
  const inputValidation = validatePlannerInput({
    currentSquad,
    playerPool,
    bank,
    availableFreeTransfers,
  })
  if (!inputValidation.valid) {
    return { valid: false, errors: inputValidation.errors, result: null }
  }

  const normalizedStartRound = normalizeRound(startRound)
  const normalizedRoundCount = normalizeRoundCount(normalizedStartRound, roundCount)
  const normalizedBank = round(Math.max(0, toNumber(bank, 0)), 1)
  const normalizedFreeTransfers = Math.max(0, Math.floor(toNumber(availableFreeTransfers, 1)))
  const mergedStrategy = mergeStrategy(strategy)
  const config = mergedStrategy.search.plannerActions
  const actionLimit = normalizeBoundedSearchLimit(
    maximumActions,
    normalizeBoundedSearchLimit(config.maximumActions, 10),
  )
  const singleCandidateLimit = normalizeBoundedSearchLimit(config.singleCandidateLimit, 32)
  const maximumDoubleActions = Math.min(
    actionLimit,
    normalizeBoundedSearchLimit(config.maximumDoubleActions, 3, 0),
  )
  const doubleCandidateLimit = Math.max(
    maximumDoubleActions,
    normalizeBoundedSearchLimit(config.doubleCandidateLimit, 8, 0),
  )
  const doubleOutgoingCandidateLimit = normalizeBoundedSearchLimit(
    config.doubleOutgoingCandidateLimit,
    8,
    2,
  )
  const doubleIncomingCandidateLimitPerPosition = normalizeBoundedSearchLimit(
    config.doubleIncomingCandidateLimitPerPosition,
    6,
    2,
  )
  const minimumSingleActions = Math.min(
    Math.max(0, actionLimit - 1),
    normalizeBoundedSearchLimit(config.minimumSingleActions, 3, 0),
  )
  if (!validateTransferSquad(currentSquad).valid) {
    return { valid: false, errors: ['De huidige selectie voldoet niet aan de spelregels.'], result: null }
  }

  const timings = {}
  let started = getNow()
  const baselineLineup = optimizeLineupForPeriod({
    squad: currentSquad,
    startRound: normalizedStartRound,
    roundCount: normalizedRoundCount,
  })
  timings.baselineLineupMs = round(getNow() - started, 3)
  if (!baselineLineup?.valid) {
    return { valid: false, errors: ['De huidige optimale opstelling kon niet worden berekend.'], result: null }
  }

  const requiredTransferReserve = getRequiredTransferReserve(
    normalizedStartRound,
    mergedStrategy.hardRules,
  )
  started = getNow()
  const noTransferOption = evaluateNoTransferOption({
    currentSquad,
    baselineLineup,
    bank: normalizedBank,
    availableFreeTransfers: normalizedFreeTransfers,
    requiredTransferReserve,
    strategy: mergedStrategy,
  })
  timings.noTransferMs = round(getNow() - started, 3)
  const incomingCandidates = prepareIncomingCandidates({
    playerPool,
    currentSquad,
    startRound: normalizedStartRound,
    roundCount: normalizedRoundCount,
    strategy: mergedStrategy,
  })

  started = getNow()
  const cheapSingles = createCheapSingleCandidates({
    currentSquad,
    incomingCandidates,
    bank: normalizedBank,
    startRound: normalizedStartRound,
    roundCount: normalizedRoundCount,
    manualSellingPrices,
    purchasePrices,
    strategy: mergedStrategy,
  })
  const selectedSingles = selectCheapSingleCandidates(
    cheapSingles.candidates,
    singleCandidateLimit,
  )
  timings.singlePreselectionMs = round(getNow() - started, 3)

  started = getNow()
  const singleOptions = selectedSingles
    .map(({ playerOut, incomingCandidate }) => evaluateSingleTransfer({
      currentSquad,
      playerOut,
      incomingCandidate,
      baselineLineup,
      bank: normalizedBank,
      availableFreeTransfers: normalizedFreeTransfers,
      requiredTransferReserve,
      startRound: normalizedStartRound,
      roundCount: normalizedRoundCount,
      manualSellingPrices,
      purchasePrices,
      strategy: mergedStrategy,
    }))
    .filter(Boolean)
  timings.singleLineupOptimizationMs = round(getNow() - started, 3)

  started = getNow()
  const doubleTransferResult = generateDoubleTransferOptions({
    currentSquad,
    incomingCandidates,
    baselineLineup,
    bank: normalizedBank,
    availableFreeTransfers: normalizedFreeTransfers,
    requiredTransferReserve,
    startRound: normalizedStartRound,
    roundCount: normalizedRoundCount,
    manualSellingPrices,
    purchasePrices,
    strategy: {
      ...mergedStrategy,
      search: {
        ...mergedStrategy.search,
        doubleTransfers: {
          ...mergedStrategy.search.doubleTransfers,
          maximumGeneratedOptions: doubleCandidateLimit,
          maximumOutgoingCandidates: doubleOutgoingCandidateLimit,
          maximumIncomingCandidatesPerPosition: doubleIncomingCandidateLimitPerPosition,
        },
      },
    },
  })
  timings.doublePreselectionAndLineupMs = round(getNow() - started, 3)

  const validOptions = selectPlannerActionOptions({
    noTransferOption,
    singleOptions,
    doubleOptions: doubleTransferResult.options,
    maximumActions: actionLimit,
    minimumSingleActions,
    maximumDoubleActions,
  })
  const fullyEvaluatedActions = 1 + singleOptions.length + doubleTransferResult.options.length
  const rawDoubleCombinations = doubleTransferResult.statistics.doubleCombinationsEvaluated
  const cheaplyRankedCandidates = cheapSingles.candidates.length +
    doubleTransferResult.statistics.doubleCombinationsAfterCheapFilters
  const skippedBeforeLineupOptimization = Math.max(
    0,
    cheaplyRankedCandidates - singleOptions.length - doubleTransferResult.options.length,
  )
  timings.totalMs = round(getNow() - totalStarted, 3)

  return {
    valid: true,
    errors: [],
    result: {
      plannerType: 'season-planner-actions',
      validOptions,
      noTransferOption,
      statistics: {
        rawSingleCombinations: cheapSingles.rawCombinations,
        rawDoubleCombinations,
        cheaplyRankedCandidates,
        fullyEvaluatedActions,
        skippedBeforeLineupOptimization,
        singleLineupOptimizations: singleOptions.length,
        doubleLineupOptimizations: doubleTransferResult.statistics.doubleLineupOptimizations,
        returnedValidOptions: validOptions.length,
        incomingCandidatesEvaluated: incomingCandidates.length,
        timings,
        heapDeltaBytes:
          heapBefore === null || getHeapUsed() === null
            ? null
            : getHeapUsed() - heapBefore,
        ...doubleTransferResult.statistics,
      },
    },
  }
}

/*
|--------------------------------------------------------------------------
| Geblokkeerde opties compact sorteren
|--------------------------------------------------------------------------
*/

function compareBlockedOptions(
  left,
  right,
) {
  return (
    right.decisionScore -
      left.decisionScore ||

    right.netExpectedPointsGain -
      left.netExpectedPointsGain ||

    right.expectedPointsGain -
      left.expectedPointsGain
  )
}

/*
|--------------------------------------------------------------------------
| Samenvatting van de aanbeveling
|--------------------------------------------------------------------------
*/

function createRecommendationSummary({
  bestOption,
  noTransferOption,
  strategy,
}) {
  if (!bestOption) {
    return {
      recommendation:
        'no-valid-option',

      strength:
        'none',

      title:
        'Geen geldige keuze gevonden',

      message:
        'Er kon geen geldige transferbeslissing worden berekend.',
    }
  }

  if (
    bestOption.actionType ===
    'no-transfer'
  ) {
    return {
      recommendation:
        'hold-transfer',

      strength:
        'strong',

      title:
        'Bewaar je transfer',

      message:
        'Geen transfer geeft op basis van de huidige projecties en strategie de beste totaalscore.',

      expectedPointsDifference:
        0,

      decisionScoreDifference:
        0,

      minimumRequiredGain:
        round(
          Math.max(
            0,
            toNumber(
              strategy
                ?.preferences
                ?.minimumNetGainForTransfer,
              2,
            ),
          ),
          2,
        ),
    }
  }

  const expectedPointsDifference =
    round(
      bestOption
        .netExpectedPointsGain -
      noTransferOption
        .netExpectedPointsGain,
      2,
    )

  const decisionScoreDifference =
    round(
      bestOption
        .decisionScore -
      noTransferOption
        .decisionScore,
      2,
    )

  const transferTitle = bestOption.actionType === 'double-transfer'
    ? `${bestOption.playersOut.map(getPlayerName).join(' + ')} → ${bestOption.playersIn.map(getPlayerName).join(' + ')}`
    : `${getPlayerName(bestOption.playerOut)} → ${getPlayerName(bestOption.playerIn)}`

  const minimumNetGainForTransfer =
    Math.max(
      0,
      toNumber(
        strategy
          ?.preferences
          ?.minimumNetGainForTransfer,
        2,
      ),
    )

  const strongNetGainForTransfer =
    Math.max(
      minimumNetGainForTransfer,
      toNumber(
        strategy
          ?.preferences
          ?.strongNetGainForTransfer,
        4,
      ),
    )

  if (
    expectedPointsDifference <
    minimumNetGainForTransfer
  ) {
    return {
      recommendation:
        'hold-transfer',

      strength:
        'strong',

      title:
        'Bewaar je transfer',

      message:
        `De beste transfer levert slechts ${expectedPointsDifference.toFixed(
          2,
        )} netto punt(en) meer op. Dat is onvoldoende om nu een transfer te gebruiken.`,

      alternativeTransfer: {
        playerOut:
          bestOption.playerOut,

        playerIn:
          bestOption.playerIn,

        playersOut:
          bestOption.playersOut,

        playersIn:
          bestOption.playersIn,
      },

      expectedPointsDifference,

      decisionScoreDifference,

      minimumRequiredGain:
        round(
          minimumNetGainForTransfer,
          2,
        ),
    }
  }

  if (
    expectedPointsDifference <
    strongNetGainForTransfer
  ) {
    return {
      recommendation:
        'consider-transfer',

      strength:
        'medium',

      title:
        transferTitle,

      message:
        `Deze transfer levert naar verwachting ${expectedPointsDifference.toFixed(
          2,
        )} netto punt(en) meer op dan niets doen. Het is een verdedigbare transfer, maar geen absolute noodzaak.`,

      expectedPointsDifference,

      decisionScoreDifference,

      minimumRequiredGain:
        round(
          minimumNetGainForTransfer,
          2,
        ),

      strongGainThreshold:
        round(
          strongNetGainForTransfer,
          2,
        ),
    }
  }

  return {
    recommendation:
      'make-transfer',

    strength:
      'strong',

    title:
      transferTitle,

    message:
      `Deze transfer levert naar verwachting ${expectedPointsDifference.toFixed(
        2,
      )} netto punt(en) meer op dan niets doen en is daarmee een sterke transfer.`,

    expectedPointsDifference,

    decisionScoreDifference,

    minimumRequiredGain:
      round(
        minimumNetGainForTransfer,
        2,
      ),

    strongGainThreshold:
      round(
        strongNetGainForTransfer,
        2,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Publieke hoofdfunctie
|--------------------------------------------------------------------------
|
| Deze functie:
|
| 1. controleert en normaliseert de invoer;
| 2. optimaliseert de huidige opstelling;
| 3. maakt de optie "geen transfer";
| 4. genereert alle geldige enkele transfers;
| 5. beoordeelt voetbalwaarde, transferkosten en strategie;
| 6. sorteert de opties;
| 7. geeft de beste aanbevelingen terug.
|
*/

export function planSingleTransfers({
  currentSquad,
  playerPool,
  bank = 0,
  availableFreeTransfers = 1,
  startRound = 1,
  roundCount = 1,
  manualSellingPrices = {},
  purchasePrices = {},
  strategy = {},
} = {}) {
  const inputValidation =
    validatePlannerInput({
      currentSquad,

      playerPool,

      bank,

      availableFreeTransfers,
    })

  if (
    !inputValidation.valid
  ) {
    return {
      valid: false,

      errors:
        inputValidation.errors,

      result: null,
    }
  }

  const normalizedStartRound =
    normalizeRound(
      startRound,
    )

  const normalizedRoundCount =
    normalizeRoundCount(
      normalizedStartRound,
      roundCount,
    )

  const normalizedBank =
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

  const normalizedFreeTransfers =
    Math.max(
      0,
      Math.floor(
        toNumber(
          availableFreeTransfers,
          1,
        ),
      ),
    )

  const mergedStrategy =
    mergeStrategy(
      strategy,
    )

  const currentSquadValidation =
    validateTransferSquad(
      currentSquad,
    )

  if (
    !currentSquadValidation.valid
  ) {
    return {
      valid: false,

      errors:
        currentSquadValidation
          .errors
          .length
          ? currentSquadValidation
              .errors
          : [
              'De huidige selectie voldoet niet aan de spelregels.',
            ],

      result: null,
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Huidige optimale opstelling
  |--------------------------------------------------------------------------
  */

  const baselineLineup =
    optimizeLineupForPeriod({
      squad:
        currentSquad,

      startRound:
        normalizedStartRound,

      roundCount:
        normalizedRoundCount,
    })

  if (
    !baselineLineup
      ?.valid
  ) {
    return {
      valid: false,

      errors: [
        ...(
          Array.isArray(
            baselineLineup
              ?.errors,
          )
            ? baselineLineup
                .errors
            : []
        ),

        ...(
          Array.isArray(
            baselineLineup
              ?.error,
          )
            ? baselineLineup
                .error
            : []
        ),

        ...(
          !baselineLineup
            ?.errors
            ?.length &&
          !baselineLineup
            ?.error
            ?.length
            ? [
                'De huidige optimale opstelling kon niet worden berekend.',
              ]
            : []
        ),
      ],

      result: null,
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Vereiste transferreserve
  |--------------------------------------------------------------------------
  */

  const requiredTransferReserve =
    getRequiredTransferReserve(
      normalizedStartRound,
      mergedStrategy
        .hardRules,
    )

  /*
  |--------------------------------------------------------------------------
  | Geen-transferoptie
  |--------------------------------------------------------------------------
  */

  const noTransferOption =
    evaluateNoTransferOption({
      currentSquad,

      baselineLineup,

      bank:
        normalizedBank,

      availableFreeTransfers:
        normalizedFreeTransfers,

      requiredTransferReserve,

      strategy:
        mergedStrategy,
    })

  /*
  |--------------------------------------------------------------------------
  | Mogelijke binnenkomende spelers
  |--------------------------------------------------------------------------
  */

  const incomingCandidates =
    prepareIncomingCandidates({
      playerPool,

      currentSquad,

      startRound:
        normalizedStartRound,

      roundCount:
        normalizedRoundCount,

      strategy:
        mergedStrategy,
    })

  /*
  |--------------------------------------------------------------------------
  | Alle enkele transfers beoordelen
  |--------------------------------------------------------------------------
  */

  const transferOptions =
    generateSingleTransferOptions({
      currentSquad,

      incomingCandidates,

      baselineLineup,

      bank:
        normalizedBank,

      availableFreeTransfers:
        normalizedFreeTransfers,

      requiredTransferReserve,

      startRound:
        normalizedStartRound,

      roundCount:
        normalizedRoundCount,

      manualSellingPrices,

      purchasePrices,

      strategy:
        mergedStrategy,
    })

  const doubleTransferResult =
    generateDoubleTransferOptions({
      currentSquad,
      incomingCandidates,
      baselineLineup,
      bank: normalizedBank,
      availableFreeTransfers: normalizedFreeTransfers,
      requiredTransferReserve,
      startRound: normalizedStartRound,
      roundCount: normalizedRoundCount,
      manualSellingPrices,
      purchasePrices,
      strategy: mergedStrategy,
    })

  const doubleTransferOptions = doubleTransferResult.options

  /*
  |--------------------------------------------------------------------------
  | Geldige en geblokkeerde opties scheiden
  |--------------------------------------------------------------------------
  */

  const allOptions = [
    noTransferOption,
    ...transferOptions,
    ...doubleTransferOptions,
  ]

  const allValidOptions =
    deduplicateOptions(
      allOptions
      .filter(
        (option) =>
          option.valid,
      )
    )

  const blockedOptions =
    allOptions
      .filter(
        (option) =>
          !option.valid,
      )
      .sort(
        compareBlockedOptions,
      )

  /*
  |--------------------------------------------------------------------------
  | Uitvoerlimieten
  |--------------------------------------------------------------------------
  */

  const maximumRecommendedOptions =
    normalizeMaximumRecommendedOptions(
      mergedStrategy
        .output
        .maximumRecommendedOptions,
    )

  const maximumSearchOptions =
    normalizeMaximumSearchOptions(
      mergedStrategy
        .output
        .maximumSearchOptions,
    )

  const validOptions =
    selectSearchOptions(
      allValidOptions,
      maximumSearchOptions,
    )

  /*
   * Zoek- en presentatievelden delen bewust dezelfde optionobjecten. Dat
   * voorkomt extra kopieën in geheugen. Bij JSON-serialisatie wordt
   * validOptions wel volledig uitgeschreven en kan het resultaat groot zijn.
   */

  const maximumBlockedOptions =
    Math.max(
      0,
      Math.floor(
        toNumber(
          mergedStrategy
            .output
            .maximumBlockedOptions,
          5,
        ),
      ),
    )

  const recommendedOptions =
    allValidOptions.slice(
      0,
      maximumRecommendedOptions,
    )

  const displayedBlockedOptions =
    blockedOptions.slice(
      0,
      maximumBlockedOptions,
    )

  const bestOption =
    recommendedOptions[
      0
    ] ??
    null

  /*
  |--------------------------------------------------------------------------
  | Transferalternatieven
  |--------------------------------------------------------------------------
  |
  | Hierbij wordt de optie "geen transfer" niet meegenomen.
  |
  */

  const validTransferOptions =
    [...transferOptions, ...doubleTransferOptions]
      .filter(
        (option) =>
          option.valid,
      )
      .sort(
        compareDecisionOptions,
      )

  const bestTransferOption =
    // Historisch contract: dit veld blijft de beste enkele transfer.
    transferOptions
      .filter((option) => option.valid)
      .sort(compareDecisionOptions)[
      0
    ] ??
    null

  const bestDoubleTransferOption =
    doubleTransferOptions
      .filter((option) => option.valid)
      .sort(compareDecisionOptions)[0] ?? null

  const bestAnyTransferOption =
    // Generiek contract voor consumers die single en double ondersteunen.
    validTransferOptions[0] ?? null

  /*
  |--------------------------------------------------------------------------
  | Verschil tussen beste transfer en niets doen
  |--------------------------------------------------------------------------
  */

  const bestTransferComparison =
    bestTransferOption
      ? {
          expectedPointsGain:
            round(
              bestTransferOption
                .expectedPointsAfter -
              noTransferOption
                .expectedPointsAfter,
              2,
            ),

          netExpectedPointsGain:
            round(
              bestTransferOption
                .netExpectedPointsGain -
              noTransferOption
                .netExpectedPointsGain,
              2,
            ),

          decisionScoreGain:
            round(
              bestTransferOption
                .decisionScore -
              noTransferOption
                .decisionScore,
              2,
            ),

          strategyScoreDifference:
            round(
              bestTransferOption
                .strategyScore -
              noTransferOption
                .strategyScore,
              0,
            ),
        }
      : null

  /*
  |--------------------------------------------------------------------------
  | Eindresultaat
  |--------------------------------------------------------------------------
  */

  return {
    valid: true,

    errors: [],

    result: {
      plannerType:
        'single-transfer',

      period: {
        startRound:
          normalizedStartRound,

        roundCount:
          normalizedRoundCount,

        endRound:
          normalizedStartRound +
          normalizedRoundCount -
          1,
      },

      input: {
        squadSize:
          currentSquad.length,

        playerPoolSize:
          playerPool.length,

        bank:
          normalizedBank,

        availableFreeTransfers:
          normalizedFreeTransfers,

        requiredTransferReserve,
      },

      strategy:
        mergedStrategy,

      baseline: {
        squad:
          currentSquad,

        lineup:
          serializeLineupSummary(
            baselineLineup,
          ),

        bank:
          normalizedBank,

        availableFreeTransfers:
          normalizedFreeTransfers,
      },

      recommendation:
  createRecommendationSummary({
    bestOption,

    noTransferOption,

    strategy:
      mergedStrategy,
  }),

      bestOption,

      noTransferOption,

      bestTransferOption,

      bestDoubleTransferOption,

      bestAnyTransferOption,

      bestTransferComparison,

      recommendedOptions,

      validOptions,

      blockedOptions:
        displayedBlockedOptions,

      statistics: {
        incomingCandidatesEvaluated:
          incomingCandidates.length,

        transferCombinationsEvaluated:
          currentSquad.length *
          incomingCandidates.length,

        legalTransferOptions:
          transferOptions.length + doubleTransferOptions.length,

        validTransferOptions:
          validTransferOptions.length,

        blockedTransferOptions:
          [...transferOptions, ...doubleTransferOptions].filter(
            (option) =>
              !option.valid,
          ).length,

        generatedSingleTransferOptions: transferOptions.length,

        generatedDoubleTransferOptions: doubleTransferOptions.length,

        validSingleTransferOptions: transferOptions.filter((option) => option.valid).length,

        validDoubleTransferOptions: doubleTransferOptions.filter((option) => option.valid).length,

        blockedSingleTransferOptions: transferOptions.filter((option) => !option.valid).length,

        blockedDoubleTransferOptions: doubleTransferOptions.filter((option) => !option.valid).length,

        ...doubleTransferResult.statistics,

        totalValidOptions:
          allValidOptions.length,

        searchOptionsReturned:
          validOptions.length,

        searchOptionsLimited:
          maximumSearchOptions !== null &&
          validOptions.length < allValidOptions.length,

        totalBlockedOptions:
          blockedOptions.length,
      },
    },
  }
}

/*
|--------------------------------------------------------------------------
| Alternatieve exportnaam
|--------------------------------------------------------------------------
|
| Hierdoor kan de planner eventueel ook algemener worden aangeroepen.
|
*/

export const optimizeSingleTransfers =
  planSingleTransfers

export default
  planSingleTransfers
