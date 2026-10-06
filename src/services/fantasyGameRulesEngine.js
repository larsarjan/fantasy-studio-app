import { FANTASY_CHIP_RULES } from './fantasyChipRules.js'

/*
|--------------------------------------------------------------------------
| Fantasy Game Rules Engine
|--------------------------------------------------------------------------
|
| Centrale bron voor de officiële regels van
| ESPN Fantasy Voetbal Eredivisie.
|
| Andere engines mogen spelregels niet zelf
| opnieuw definiëren, maar gebruiken dit bestand.
|
*/

/*
|--------------------------------------------------------------------------
| Algemene spelregels
|--------------------------------------------------------------------------
*/

export const FANTASY_GAME_RULES = {
  version:
    '2026-2027-v1',

  budget: {
    startingBudget:
      100,

    priceStep:
      0.1,

    currency:
      'EUR',
  },

  squad: {
    totalPlayers:
      15,

    positions: {
      goalkeeper:
        2,

      defender:
        5,

      midfielder:
        5,

      forward:
        3,
    },

    maxPlayersPerClub:
      3,
  },

  startingLineup: {
    totalPlayers:
      11,

    goalkeepers: {
      exact:
        1,
    },

    defenders: {
      minimum:
        3,
    },

    forwards: {
      minimum:
        1,
    },
  },

  bench: {
    totalPlayers:
      4,

    substituteGoalkeepers:
      1,

    substituteOutfieldPlayers:
      3,
  },

  captain: {
    normalMultiplier:
      2,

    viceCaptainTakesOverWhenCaptainMinutes:
      0,

    noReplacementWhenBothMiss:
      true,
  },

  transfers: {
    freeTransfersPerRound:
      1,

    maximumStoredFreeTransfers:
      5,

    pointsCostPerExtraTransfer:
      4,

    unlimitedBeforeFirstDeadline:
      true,

    transfersCannotBeCancelled:
      true,
  },

  sellingPrice: {
    profitShare:
      0.5,

    roundProfitDownTo:
      0.1,
  },

  seasonHalves: {
    first: {
      startRound:
        1,

      endRound:
        17,
    },

    second: {
      startRound:
        18,

      endRound:
        34,
    },
  },

  chips: {
    maximumPerRound:
      1,
    ...Object.fromEntries(Object.values(FANTASY_CHIP_RULES).map((chip) => [
      chip.id === 'dynamic-duo' ? 'dynamicDuo' : chip.id === 'sugar-daddy' ? 'sugarDaddy' : chip.id,
      { ...chip, usesPerHalf: chip.usesPerPeriod },
    ])),
  },

  automaticSubstitutions: {
    enabled:
      true,

    requiresZeroMinutes:
      true,

    processedAfterRound:
      true,

    preserveValidFormation:
      true,

    goalkeeperCanOnlyReplaceGoalkeeper:
      true,
  },

  doubleGameweeks: {
    countPointsFromAllMatches:
      true,

    oneAppearancePreventsAutomaticSub:
      true,
  },
}

/*
|--------------------------------------------------------------------------
| Puntentelling
|--------------------------------------------------------------------------
*/

export const FANTASY_SCORING_RULES = {
  appearance: {
    upTo59Minutes:
      1,

    sixtyMinutesOrMore:
      2,
  },

  goals: {
    goalkeeper:
      10,

    defender:
      6,

    midfielder:
      5,

    forward:
      4,
  },

  assist:
    3,

  cleanSheet: {
    goalkeeper:
      4,

    defender:
      4,

    midfielder:
      1,

    forward:
      0,

    minimumMinutes:
      60,
  },

  goalkeeper: {
    savesPerPoint:
      3,

    pointsPerSaveBlock:
      1,

    penaltySaved:
      5,
  },

  penalties: {
    missed:
      -2,
  },

  goalsConceded: {
    goalsPerDeduction:
      2,

    goalkeeperDeduction:
      -1,

    defenderDeduction:
      -1,
  },

  cards: {
    yellow:
      -1,

    red:
      -3,
  },

  ownGoal:
    -2,

  bonus: {
    first:
      3,

    second:
      2,

    third:
      1,
  },
}

/*
|--------------------------------------------------------------------------
| Getalhelpers
|--------------------------------------------------------------------------
*/

function toNumber(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number =
    Number(value)

  return Number.isFinite(number)
    ? number
    : null
}

function roundToTenths(
  value,
) {
  const number =
    toNumber(value)

  if (number === null) {
    return null
  }

  return (
    Math.round(
      number * 10,
    ) / 10
  )
}

function floorToTenths(
  value,
) {
  const number =
    toNumber(value)

  if (number === null) {
    return null
  }

  /*
   * Kleine marge voorkomt problemen
   * met floating-pointwaarden zoals
   * 0.299999999999.
   */
  return (
    Math.floor(
      (
        number +
        Number.EPSILON
      ) * 10,
    ) / 10
  )
}

function normalizeText(
  value,
) {
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

/*
|--------------------------------------------------------------------------
| Posities normaliseren
|--------------------------------------------------------------------------
*/

export function normalizeFantasyPosition(
  position,
) {
  const value =
    normalizeText(
      position,
    )

  if (
    [
      'keeper',
      'doelman',
      'goalkeeper',
      'gk',
      'k',
    ].includes(value)
  ) {
    return 'goalkeeper'
  }

  if (
    [
      'verdediger',
      'defender',
      'def',
      'd',
    ].includes(value)
  ) {
    return 'defender'
  }

  if (
    [
      'middenvelder',
      'midfielder',
      'mid',
      'm',
    ].includes(value)
  ) {
    return 'midfielder'
  }

  if (
    [
      'spits',
      'aanvaller',
      'forward',
      'attacker',
      'fwd',
      'a',
    ].includes(value)
  ) {
    return 'forward'
  }

  return 'unknown'
}

/*
|--------------------------------------------------------------------------
| Verkoopwaarde
|--------------------------------------------------------------------------
|
| Bij winst ontvangt de gebruiker:
|
| aankoopprijs
| +
| 50% van de prijsstijging,
| naar beneden afgerond op €0,1 miljoen.
|
| Bij een prijsdaling wordt de actuele
| marktprijs gebruikt.
|
*/

export function calculateSellingPrice({
  purchasePrice,
  currentPrice,
}) {
  const purchase =
    toNumber(
      purchasePrice,
    )

  const current =
    toNumber(
      currentPrice,
    )

  if (
    purchase === null ||
    current === null
  ) {
    return null
  }

  if (
    current <= purchase
  ) {
    return roundToTenths(
      current,
    )
  }

  const profit =
    current -
    purchase

  const userProfit =
    floorToTenths(
      profit *
      FANTASY_GAME_RULES
        .sellingPrice
        .profitShare,
    )

  return roundToTenths(
    purchase +
    userProfit,
  )
}

/*
 * Handmatige verkoopwaarde heeft altijd
 * voorrang op de berekende waarde.
 *
 * Is ook geen aankoopprijs bekend, dan
 * gebruiken we de actuele marktprijs.
 */

export function getEffectiveSellingPrice({
  manualSellingPrice,
  purchasePrice,
  currentPrice,
}) {
  const manual =
    toNumber(
      manualSellingPrice,
    )

  if (
    manual !== null
  ) {
    return roundToTenths(
      manual,
    )
  }

  const calculated =
    calculateSellingPrice({
      purchasePrice,
      currentPrice,
    })

  if (
    calculated !== null
  ) {
    return calculated
  }

  return roundToTenths(
    currentPrice,
  )
}

/*
|--------------------------------------------------------------------------
| Selectie valideren
|--------------------------------------------------------------------------
*/

function countPlayersByPosition(
  players,
) {
  const counts = {
    goalkeeper:
      0,

    defender:
      0,

    midfielder:
      0,

    forward:
      0,

    unknown:
      0,
  }

  players.forEach(
    (player) => {
      const position =
        normalizeFantasyPosition(
          player
            ?.fantasyPosition ??
          player
            ?.position,
        )

      counts[position] =
        (
          counts[position] ||
          0
        ) + 1
    },
  )

  return counts
}

function countPlayersByClub(
  players,
) {
  const counts =
    new Map()

  players.forEach(
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
          ) ||
          0
        ) + 1,
      )
    },
  )

  return counts
}

function getPlayerPrice(
  player,
) {
  return (
    toNumber(
      player?.currentPrice,
    ) ??
    toNumber(
      player?.endPrice,
    ) ??
    toNumber(
      player?.price,
    ) ??
    0
  )
}

export function validateSquad(
  players,
  {
    budget =
      FANTASY_GAME_RULES
        .budget
        .startingBudget,

    unlimitedBudget =
      false,
  } = {},
) {
  const squad =
    Array.isArray(players)
      ? players.filter(Boolean)
      : []

  const errors = []
  const warnings = []

  const positionCounts =
    countPlayersByPosition(
      squad,
    )

  const clubCounts =
    countPlayersByClub(
      squad,
    )

  const totalPrice =
    roundToTenths(
      squad.reduce(
        (
          total,
          player,
        ) =>
          total +
          getPlayerPrice(
            player,
          ),
        0,
      ),
    ) ?? 0

  if (
    squad.length !==
    FANTASY_GAME_RULES
      .squad
      .totalPlayers
  ) {
    errors.push(
      `De selectie moet precies ${
        FANTASY_GAME_RULES
          .squad
          .totalPlayers
      } spelers bevatten.`,
    )
  }

  Object.entries(
    FANTASY_GAME_RULES
      .squad
      .positions,
  ).forEach(
    (
      [
        position,
        required,
      ],
    ) => {
      const actual =
        positionCounts[
          position
        ] || 0

      if (
        actual !==
        required
      ) {
        errors.push(
          `${position} moet ${required} keer voorkomen; gevonden: ${actual}.`,
        )
      }
    },
  )

  clubCounts.forEach(
    (
      count,
      club,
    ) => {
      if (
        count >
        FANTASY_GAME_RULES
          .squad
          .maxPlayersPerClub
      ) {
        errors.push(
          `Er zijn ${count} spelers van ${club} geselecteerd; maximaal ${
            FANTASY_GAME_RULES
              .squad
              .maxPlayersPerClub
          } toegestaan.`,
        )
      }
    },
  )

  if (
    !unlimitedBudget &&
    totalPrice >
      Number(budget)
  ) {
    errors.push(
      `De selectie kost €${totalPrice.toFixed(
        1,
      )} miljoen en overschrijdt het budget van €${Number(
        budget,
      ).toFixed(
        1,
      )} miljoen.`,
    )
  }

  if (
    positionCounts
      .unknown > 0
  ) {
    warnings.push(
      `${positionCounts.unknown} speler(s) hebben geen herkende Fantasy-positie.`,
    )
  }

  return {
    valid:
      errors.length ===
      0,

    errors,

    warnings,

    squadSize:
      squad.length,

    positionCounts,

    clubCounts:
      Object.fromEntries(
        clubCounts,
      ),

    totalPrice,

    budget:
      Number(budget),

    remainingBudget:
      unlimitedBudget
        ? null
        : roundToTenths(
            Number(budget) -
            totalPrice,
          ),
  }
}

/*
|--------------------------------------------------------------------------
| Basiself valideren
|--------------------------------------------------------------------------
*/

export function validateStartingLineup(
  players,
) {
  const lineup =
    Array.isArray(players)
      ? players.filter(Boolean)
      : []

  const errors = []

  const positionCounts =
    countPlayersByPosition(
      lineup,
    )

  if (
    lineup.length !==
    FANTASY_GAME_RULES
      .startingLineup
      .totalPlayers
  ) {
    errors.push(
      `De basisopstelling moet precies ${
        FANTASY_GAME_RULES
          .startingLineup
          .totalPlayers
      } spelers bevatten.`,
    )
  }

  if (
    positionCounts
      .goalkeeper !==
    FANTASY_GAME_RULES
      .startingLineup
      .goalkeepers
      .exact
  ) {
    errors.push(
      'De basisopstelling moet precies één keeper bevatten.',
    )
  }

  if (
    positionCounts
      .defender <
    FANTASY_GAME_RULES
      .startingLineup
      .defenders
      .minimum
  ) {
    errors.push(
      `De basisopstelling moet minimaal ${
        FANTASY_GAME_RULES
          .startingLineup
          .defenders
          .minimum
      } verdedigers bevatten.`,
    )
  }

  if (
    positionCounts
      .forward <
    FANTASY_GAME_RULES
      .startingLineup
      .forwards
      .minimum
  ) {
    errors.push(
      `De basisopstelling moet minimaal ${
        FANTASY_GAME_RULES
          .startingLineup
          .forwards
          .minimum
      } spits bevatten.`,
    )
  }

  return {
    valid:
      errors.length ===
      0,

    errors,

    lineupSize:
      lineup.length,

    positionCounts,
  }
}

/*
|--------------------------------------------------------------------------
| Transfers
|--------------------------------------------------------------------------
*/

export function calculateTransferCost({
  transfersMade = 0,
  availableFreeTransfers = 1,
  wildcardActive = false,
  sugarDaddyActive = false,
}) {
  const transfers =
    Math.max(
      0,
      Math.floor(
        Number(
          transfersMade,
        ) || 0,
      ),
    )

  const freeTransfers =
    Math.max(
      0,
      Math.min(
        FANTASY_GAME_RULES
          .transfers
          .maximumStoredFreeTransfers,
        Math.floor(
          Number(
            availableFreeTransfers,
          ) || 0,
        ),
      ),
    )

  if (
    wildcardActive ||
    sugarDaddyActive
  ) {
    return {
      transfersMade:
        transfers,

      availableFreeTransfers:
        freeTransfers,

      chargedTransfers:
        0,

      pointsCost:
        0,
    }
  }

  const chargedTransfers =
    Math.max(
      0,
      transfers -
      freeTransfers,
    )

  return {
    transfersMade:
      transfers,

    availableFreeTransfers:
      freeTransfers,

    chargedTransfers,

    pointsCost:
      chargedTransfers *
      FANTASY_GAME_RULES
        .transfers
        .pointsCostPerExtraTransfer,
  }
}

export function calculateNextFreeTransfers({
  currentFreeTransfers = 1,
  transfersMade = 0,
  wildcardActive = false,
  sugarDaddyActive = false,
}) {
  const current =
    Math.max(
      0,
      Math.min(
        FANTASY_GAME_RULES
          .transfers
          .maximumStoredFreeTransfers,
        Math.floor(
          Number(
            currentFreeTransfers,
          ) || 0,
        ),
      ),
    )

  /*
   * Wildcard en Suikeroom behouden
   * het bestaande aantal opgeslagen
   * gratis transfers.
   */
  if (
    wildcardActive ||
    sugarDaddyActive
  ) {
    return current
  }

  const usedFreeTransfers =
    Math.min(
      current,
      Math.max(
        0,
        Math.floor(
          Number(
            transfersMade,
          ) || 0,
        ),
      ),
    )

  const remaining =
    current -
    usedFreeTransfers

  return Math.min(
    FANTASY_GAME_RULES
      .transfers
      .maximumStoredFreeTransfers,

    remaining +
    FANTASY_GAME_RULES
      .transfers
      .freeTransfersPerRound,
  )
}

/*
|--------------------------------------------------------------------------
| Chips
|--------------------------------------------------------------------------
*/

export function getSeasonHalf(
  round,
) {
  const roundNumber =
    Number(round)

  if (
    !Number.isFinite(
      roundNumber,
    ) ||
    roundNumber < 1 ||
    roundNumber > 34
  ) {
    return null
  }

  return roundNumber <= 17
    ? 'first'
    : 'second'
}

export function validateChipUsage({
  chipId,
  round,
  activeChipId = null,
  wildcardActive = false,
  usedInFirstHalf = [],
  usedInSecondHalf = [],
}) {
  const errors = []

  const half =
    getSeasonHalf(
      round,
    )

  const chip =
    Object.values(
      FANTASY_GAME_RULES
        .chips,
    ).find(
      (item) =>
        item.id ===
        chipId,
    )

  if (!chip) {
    errors.push(
      'Onbekende chip.',
    )
  }

  if (!half) {
    errors.push(
      'Ongeldige speelronde.',
    )
  }

  if (
    activeChipId &&
    activeChipId !==
      chipId
  ) {
    errors.push(
      'Er kan maximaal één chip per speelronde worden gebruikt.',
    )
  }

  if (
    wildcardActive &&
    chipId !==
      'wildcard'
  ) {
    errors.push(
      'Een chip kan niet in dezelfde speelronde als een Wildcard worden gebruikt.',
    )
  }

  const usedChips =
    half === 'first'
      ? usedInFirstHalf
      : usedInSecondHalf

  if (
    chip &&
    Array.isArray(
      usedChips,
    ) &&
    usedChips.includes(
      chip.id,
    )
  ) {
    errors.push(
      `${chip.label} is in deze seizoenshelft al gebruikt.`,
    )
  }

  return {
    valid:
      errors.length ===
      0,

    errors,

    chip:
      chip ?? null,

    half,
  }
}

/*
|--------------------------------------------------------------------------
| Regels ophalen
|--------------------------------------------------------------------------
*/

export function getFantasyGameRules() {
  return FANTASY_GAME_RULES
}

export function getFantasyScoringRules() {
  return FANTASY_SCORING_RULES
}
