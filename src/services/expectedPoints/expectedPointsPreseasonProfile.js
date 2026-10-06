/*
|--------------------------------------------------------------------------
| Expected Points - Preseason Profile
|--------------------------------------------------------------------------
|
| Bouwt een productieprofiel voor spelers wanneer
| er nog onvoldoende actuele seizoensdata is.
|
| Primaire bronnen:
|
| - specifieke veldrollen uit PLAYER_METADATA;
| - Fantasy-positie;
| - huidige Fantasy Outlook;
| - huidige standaardsituaties;
| - huidige scouting-confidence.
|
| Deze module bepaalt niet:
|
| - of een speler speelt;
| - hoeveel minuten hij maakt;
| - hoe moeilijk een wedstrijd is;
| - hoeveel Fantasy-punten hij krijgt.
|
| De uitkomst bestaat uitsluitend uit verwachte
| productierates wanneer de speler op het veld staat.
|
*/

/*
|--------------------------------------------------------------------------
| Rolprofielen
|--------------------------------------------------------------------------
|
| Dit zijn transparante en configureerbare priors.
|
| Ze worden later gekalibreerd met actuele data.
|
*/

export const EXPECTED_POINTS_ROLE_PROFILES = {
  GK: {
    label:
      'Doelman',

    goalsPer90:
      0.001,

    assistsPer90:
      0.005,

    cleanSheetRate:
      0.30,

    savesPer90:
      3.10,

    penaltySavesPer90:
      0.015,

    bonusPerMatch:
      0.35,

    yellowCardsPer90:
      0.025,

    redCardsPer90:
      0.002,

    ownGoalsPer90:
      0.002,

    penaltiesMissedPer90:
      0,

    goalsConcededPer90:
      1.35,
  },

  CB: {
    label:
      'Centrale verdediger',

    goalsPer90:
      0.075,

    assistsPer90:
      0.035,

    cleanSheetRate:
      0.29,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.28,

    yellowCardsPer90:
      0.17,

    redCardsPer90:
      0.012,

    ownGoalsPer90:
      0.008,

    penaltiesMissedPer90:
      0.001,

    goalsConcededPer90:
      1.35,
  },

  LB: {
    label:
      'Linksachter',

    goalsPer90:
      0.045,

    assistsPer90:
      0.115,

    cleanSheetRate:
      0.28,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.27,

    yellowCardsPer90:
      0.13,

    redCardsPer90:
      0.008,

    ownGoalsPer90:
      0.004,

    penaltiesMissedPer90:
      0.001,

    goalsConcededPer90:
      1.35,
  },

  RB: {
    label:
      'Rechtsachter',

    goalsPer90:
      0.045,

    assistsPer90:
      0.115,

    cleanSheetRate:
      0.28,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.27,

    yellowCardsPer90:
      0.13,

    redCardsPer90:
      0.008,

    ownGoalsPer90:
      0.004,

    penaltiesMissedPer90:
      0.001,

    goalsConcededPer90:
      1.35,
  },

  LWB: {
    label:
      'Linker vleugelverdediger',

    goalsPer90:
      0.075,

    assistsPer90:
      0.18,

    cleanSheetRate:
      0.26,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.31,

    yellowCardsPer90:
      0.12,

    redCardsPer90:
      0.007,

    ownGoalsPer90:
      0.003,

    penaltiesMissedPer90:
      0.001,

    goalsConcededPer90:
      1.40,
  },

  RWB: {
    label:
      'Rechter vleugelverdediger',

    goalsPer90:
      0.075,

    assistsPer90:
      0.18,

    cleanSheetRate:
      0.26,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.31,

    yellowCardsPer90:
      0.12,

    redCardsPer90:
      0.007,

    ownGoalsPer90:
      0.003,

    penaltiesMissedPer90:
      0.001,

    goalsConcededPer90:
      1.40,
  },

  DM: {
    label:
      'Centrale verdedigende middenvelder',

    goalsPer90:
      0.055,

    assistsPer90:
      0.075,

    cleanSheetRate:
      0.24,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.22,

    yellowCardsPer90:
      0.19,

    redCardsPer90:
      0.012,

    ownGoalsPer90:
      0.003,

    penaltiesMissedPer90:
      0.001,

    goalsConcededPer90:
      0,
  },

  B2B: {
    label:
      'Box-to-box middenvelder',

    goalsPer90:
      0.13,

    assistsPer90:
      0.13,

    cleanSheetRate:
      0.22,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.30,

    yellowCardsPer90:
      0.13,

    redCardsPer90:
      0.008,

    ownGoalsPer90:
      0.002,

    penaltiesMissedPer90:
      0.002,

    goalsConcededPer90:
      0,
  },

  AM: {
    label:
      'Centraal aanvallende middenvelder',

    goalsPer90:
      0.25,

    assistsPer90:
      0.24,

    cleanSheetRate:
      0.18,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.42,

    yellowCardsPer90:
      0.07,

    redCardsPer90:
      0.004,

    ownGoalsPer90:
      0.001,

    penaltiesMissedPer90:
      0.006,

    goalsConcededPer90:
      0,
  },

  RW: {
    label:
      'Rechter vleugelaanvaller',

    goalsPer90:
      0.31,

    assistsPer90:
      0.25,

    cleanSheetRate:
      0,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.43,

    yellowCardsPer90:
      0.055,

    redCardsPer90:
      0.003,

    ownGoalsPer90:
      0.001,

    penaltiesMissedPer90:
      0.006,

    goalsConcededPer90:
      0,
  },

  LW: {
    label:
      'Linker vleugelaanvaller',

    goalsPer90:
      0.31,

    assistsPer90:
      0.25,

    cleanSheetRate:
      0,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.43,

    yellowCardsPer90:
      0.055,

    redCardsPer90:
      0.003,

    ownGoalsPer90:
      0.001,

    penaltiesMissedPer90:
      0.006,

    goalsConcededPer90:
      0,
  },

  SS: {
    label:
      'Schaduwspits',

    goalsPer90:
      0.40,

    assistsPer90:
      0.22,

    cleanSheetRate:
      0,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.47,

    yellowCardsPer90:
      0.06,

    redCardsPer90:
      0.004,

    ownGoalsPer90:
      0.001,

    penaltiesMissedPer90:
      0.008,

    goalsConcededPer90:
      0,
  },

  ST: {
    label:
      'Spits',

    goalsPer90:
      0.48,

    assistsPer90:
      0.14,

    cleanSheetRate:
      0,

    savesPer90:
      0,

    penaltySavesPer90:
      0,

    bonusPerMatch:
      0.48,

    yellowCardsPer90:
      0.065,

    redCardsPer90:
      0.004,

    ownGoalsPer90:
      0.001,

    penaltiesMissedPer90:
      0.010,

    goalsConcededPer90:
      0,
  },
}

/*
|--------------------------------------------------------------------------
| Algemene positieprofielen
|--------------------------------------------------------------------------
|
| Worden alleen gebruikt wanneer geen specifieke
| rol uit PLAYER_METADATA beschikbaar is.
|
*/

const POSITION_FALLBACK_ROLES = {
  goalkeeper:
    ['GK'],

  defender:
    ['CB'],

  midfielder:
    ['B2B'],

  forward:
    ['ST'],
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(
  value,
  fallback = 0,
) {
  const number =
    Number(value)

  return Number.isFinite(
    number,
  )
    ? number
    : fallback
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
      toNumber(
        value,
        minimum,
      ),
    ),
  )
}

function round(
  value,
  digits = 4,
) {
  const number =
    Number(value)

  if (
    !Number.isFinite(
      number,
    )
  ) {
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

function cleanText(
  value,
) {
  return String(
    value ?? '',
  ).trim()
}

function normalizeText(
  value,
) {
  return cleanText(
    value,
  ).toUpperCase()
}

/*
|--------------------------------------------------------------------------
| Positie normaliseren
|--------------------------------------------------------------------------
*/

function normalizeFantasyPosition(
  player,
) {
  const position =
    cleanText(
      player?.fantasyPosition ??
      player?.position,
    )
      .toLocaleLowerCase(
        'nl-NL',
      )

  if (
    [
      'doelman',
      'keeper',
      'goalkeeper',
      'gk',
    ].includes(
      position,
    )
  ) {
    return 'goalkeeper'
  }

  if (
    [
      'verdediger',
      'defender',
      'def',
    ].includes(
      position,
    )
  ) {
    return 'defender'
  }

  if (
    [
      'middenvelder',
      'midfielder',
      'mid',
    ].includes(
      position,
    )
  ) {
    return 'midfielder'
  }

  if (
    [
      'aanvaller',
      'spits',
      'forward',
      'attacker',
      'fwd',
      'att',
    ].includes(
      position,
    )
  ) {
    return 'forward'
  }

  return 'unknown'
}

/*
|--------------------------------------------------------------------------
| Rollen uitlezen
|--------------------------------------------------------------------------
*/

function normalizeRole(
  role,
) {
  const normalized =
    normalizeText(
      role,
    )

  const aliases = {
    GOALKEEPER:
      'GK',

    KEEPER:
      'GK',

    DOELMAN:
      'GK',

    LINKSACHTER:
      'LB',

    RECHTSACHTER:
      'RB',

    'LINKER VLEUGELVERDEDIGER':
      'LWB',

    'RECHTER VLEUGELVERDEDIGER':
      'RWB',

    'CENTRALE VERDEDIGER':
      'CB',

    'CENTRALE VERDEDIGENDE MIDDENVELDER':
      'DM',

    'BOX TO BOX MIDDENVELDER':
      'B2B',

    'BOX-TO-BOX MIDDENVELDER':
      'B2B',

    'CENTRAAL AANVALLENDE MIDDENVELDER':
      'AM',

    'RECHTER VLEUGEL AANVALLER':
      'RW',

    'LINKER VLEUGEL AANVALLER':
      'LW',

    SCHADUWSPITS:
      'SS',

    SPITS:
      'ST',
  }

  const resolved =
    aliases[normalized] ??
    normalized

  return (
    EXPECTED_POINTS_ROLE_PROFILES[
      resolved
    ]
      ? resolved
      : null
  )
}

function getPlayerRoles(
  player,
) {
  const roles =
    Array.isArray(
      player?.roles,
    )
      ? player.roles
      : cleanText(
          player?.roles,
        )
          .split(',')

  const normalizedRoles =
    roles
      .map(
        normalizeRole,
      )
      .filter(Boolean)

  const uniqueRoles = [
    ...new Set(
      normalizedRoles,
    ),
  ]

  if (
    uniqueRoles.length
  ) {
    return {
      roles:
        uniqueRoles,

      source:
        'player-roles',
    }
  }

  const position =
    normalizeFantasyPosition(
      player,
    )

  return {
    roles:
      POSITION_FALLBACK_ROLES[
        position
      ] ??
      [],

    source:
      position === 'unknown'
        ? 'unknown'
        : 'position-fallback',
  }
}

/*
|--------------------------------------------------------------------------
| Profielen combineren
|--------------------------------------------------------------------------
*/

const RATE_KEYS = [
  'goalsPer90',
  'assistsPer90',
  'cleanSheetRate',
  'savesPer90',
  'penaltySavesPer90',
  'bonusPerMatch',
  'yellowCardsPer90',
  'redCardsPer90',
  'ownGoalsPer90',
  'penaltiesMissedPer90',
  'goalsConcededPer90',
]

function createEmptyRates() {
  return RATE_KEYS.reduce(
    (
      rates,
      key,
    ) => {
      rates[key] = 0

      return rates
    },
    {},
  )
}

function combineRoleProfiles(
  roles,
) {
  if (
    !Array.isArray(
      roles,
    ) ||
    !roles.length
  ) {
    return createEmptyRates()
  }

  const rates =
    createEmptyRates()

  roles.forEach(
    (
      role,
    ) => {
      const profile =
        EXPECTED_POINTS_ROLE_PROFILES[
          role
        ]

      if (
        !profile
      ) {
        return
      }

      RATE_KEYS.forEach(
        (
          key,
        ) => {
          rates[key] +=
            toNumber(
              profile[key],
            )
        },
      )
    },
  )

  RATE_KEYS.forEach(
    (
      key,
    ) => {
      rates[key] =
        round(
          rates[key] /
          roles.length,
        )
    },
  )

  return rates
}

/*
|--------------------------------------------------------------------------
| Outlook-potentie
|--------------------------------------------------------------------------
|
| Neutrale potentie = 6,5.
|
| Ieder punt daarboven of daaronder wijzigt alleen
| de positieve productiecomponenten met 6%.
|
| De correctie blijft begrensd tussen -25% en +25%.
|
*/

function getPotentialScore(
  outlook,
) {
  return clamp(
    outlook
      ?.scores
      ?.potential ??
    6.5,
    0,
    10,
  )
}

function getPotentialModifier(
  outlook,
) {
  const score =
    getPotentialScore(
      outlook,
    )

  return round(
    clamp(
      1 +
      (
        score -
        6.5
      ) *
        0.06,
      0.75,
      1.25,
    ),
  )
}

function applyPotentialModifier(
  rates,
  modifier,
) {
  return {
    ...rates,

    goalsPer90:
      round(
        rates.goalsPer90 *
        modifier,
      ),

    assistsPer90:
      round(
        rates.assistsPer90 *
        modifier,
      ),

    savesPer90:
      round(
        rates.savesPer90 *
        modifier,
      ),

    penaltySavesPer90:
      round(
        rates
          .penaltySavesPer90 *
        modifier,
      ),

    bonusPerMatch:
      round(
        rates.bonusPerMatch *
        modifier,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Standaardsituaties
|--------------------------------------------------------------------------
*/

function getScoutProfile(
  player,
) {
  return (
    player?.scoutProfile ??
    player?.profile?.scout ??
    {}
  )
}

function applySetPieceAdjustments(
  rates,
  player,
) {
  const scout =
    getScoutProfile(
      player,
    )

  const penalties =
    player?.penalties ===
      true ||
    scout?.penalties ===
      true

  const corners =
    player?.corners ===
      true ||
    scout?.corners ===
      true

  const freeKicks =
    player?.freeKicks ===
      true ||
    scout?.freeKicks ===
      true

  const adjusted = {
    ...rates,
  }

  if (
    penalties
  ) {
    adjusted.goalsPer90 =
      round(
        adjusted.goalsPer90 +
        0.12,
      )

    adjusted.penaltiesMissedPer90 =
      round(
        adjusted
          .penaltiesMissedPer90 +
        0.012,
      )
  }

  if (
    corners
  ) {
    adjusted.assistsPer90 =
      round(
        adjusted.assistsPer90 +
        0.055,
      )
  }

  if (
    freeKicks
  ) {
    adjusted.goalsPer90 =
      round(
        adjusted.goalsPer90 +
        0.035,
      )

    adjusted.assistsPer90 =
      round(
        adjusted.assistsPer90 +
        0.025,
      )
  }

  return {
    rates:
      adjusted,

    setPieces: {
      penalties,
      corners,
      freeKicks,
    },
  }
}

/*
|--------------------------------------------------------------------------
| Confidence
|--------------------------------------------------------------------------
*/

function getPreseasonConfidence(
  player,
  roleSource,
) {
  const profileConfidence =
    toNumber(
      player
        ?.profile
        ?.confidence
        ?.score ??
      player
        ?.confidence
        ?.score,
      20,
    )

  let roleConfidence = 25

  if (
    roleSource ===
    'player-roles'
  ) {
    roleConfidence = 90
  } else if (
    roleSource ===
    'position-fallback'
  ) {
    roleConfidence = 55
  }

  return round(
    clamp(
      roleConfidence * 0.60 +
      profileConfidence * 0.40,
      0,
      100,
    ),
    0,
  )
}

/*
|--------------------------------------------------------------------------
| Uitleg
|--------------------------------------------------------------------------
*/

function buildExplanation({
  roles,
  roleSource,
  potentialScore,
  potentialModifier,
  setPieces,
}) {
  const explanation = []

  if (
    roles.length
  ) {
    explanation.push(
      `Het preseason-profiel gebruikt de veldrol(len): ${roles.join(', ')}.`,
    )
  } else {
    explanation.push(
      'Er was geen bruikbare veldrol of Fantasy-positie beschikbaar.',
    )
  }

  if (
    roleSource ===
    'position-fallback'
  ) {
    explanation.push(
      'Omdat specifieke veldrollen ontbreken, is een algemeen positieprofiel gebruikt.',
    )
  }

  explanation.push(
    `De Outlook-potentie van ${round(
      potentialScore,
      1,
    )} geeft een productiemodifier van ${potentialModifier}.`,
  )

  if (
    setPieces.penalties
  ) {
    explanation.push(
      'De speler is als penaltynemer beoordeeld.',
    )
  }

  if (
    setPieces.corners
  ) {
    explanation.push(
      'De speler is betrokken bij corners.',
    )
  }

  if (
    setPieces.freeKicks
  ) {
    explanation.push(
      'De speler is betrokken bij vrije trappen.',
    )
  }

  return explanation
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

/**
 * Bouwt het preseason-productieprofiel van één speler.
 */
export function getExpectedPointsPreseasonProfile(
  player,
  {
    outlook = null,
  } = {},
) {
  if (
    !player
  ) {
    return null
  }

  const roleResult =
    getPlayerRoles(
      player,
    )

  const baseRates =
    combineRoleProfiles(
      roleResult.roles,
    )

  const potentialScore =
    getPotentialScore(
      outlook,
    )

  const potentialModifier =
    getPotentialModifier(
      outlook,
    )

  const potentialRates =
    applyPotentialModifier(
      baseRates,
      potentialModifier,
    )

  const setPieceResult =
    applySetPieceAdjustments(
      potentialRates,
      player,
    )

  const confidence =
    getPreseasonConfidence(
      player,
      roleResult.source,
    )

  return {
    playerId:
      cleanText(
        player.id,
      ),

    playerName:
      cleanText(
        player.name,
      ),

    mode:
      'preseason',

    roles:
      roleResult.roles,

    roleLabels:
      roleResult.roles.map(
        (
          role,
        ) =>
          EXPECTED_POINTS_ROLE_PROFILES[
            role
          ]?.label ??
          role,
      ),

    roleSource:
      roleResult.source,

    position:
      normalizeFantasyPosition(
        player,
      ),

    /*
     * `overall` gebruikt bewust hetzelfde formaat
     * als Expected Points History.
     *
     * Daardoor kan Calculation beide bronnen
     * zonder aparte vertaallogica gebruiken.
     */
    overall: {
      ...setPieceResult.rates,

      fantasyPointsPerMatch:
        0,

      fantasyPointsPer90:
        0,

      minutesPerAppearance:
        0,

      goalsPerMatch:
        0,

      assistsPerMatch:
        0,

      savesPerMatch:
        0,

      penaltySavesPerMatch:
        0,

      startPercentage:
        0,

      cleanSheetsPer90:
        setPieceResult
          .rates
          .cleanSheetRate,

      bonusPer90:
        setPieceResult
          .rates
          .bonusPerMatch,
    },

    modifiers: {
      potential: {
        score:
          round(
            potentialScore,
            1,
          ),

        value:
          potentialModifier,
      },

      setPieces:
        setPieceResult
          .setPieces,
    },

    confidence,

    explanation:
      buildExplanation({
        roles:
          roleResult.roles,

        roleSource:
          roleResult.source,

        potentialScore,

        potentialModifier,

        setPieces:
          setPieceResult
            .setPieces,
      }),

    source: {
      id:
        'expected-points-preseason-profile',

      label:
        'Expected Points Preseason Profile',

      type:
        'configured-prior',
    },
  }
}

/**
 * Bouwt preseason-profielen voor meerdere spelers.
 */
export function getExpectedPointsPreseasonProfileBatch(
  players,
  outlookByPlayer = new Map(),
) {
  if (
    !Array.isArray(
      players,
    )
  ) {
    return []
  }

  return players
    .map(
      (
        player,
      ) =>
        getExpectedPointsPreseasonProfile(
          player,
          {
            outlook:
              outlookByPlayer.get(
                String(
                  player?.id ??
                  '',
                ),
              ) ??
              null,
          },
        ),
    )
    .filter(Boolean)
}

/*
|--------------------------------------------------------------------------
| Engine-informatie
|--------------------------------------------------------------------------
*/

export function getExpectedPointsPreseasonProfileInfo() {
  return {
    id:
      'expected-points-preseason-profile',

    label:
      'Expected Points Preseason Profile',

    version:
      '1.0.0',

    description:
      'Vertaalt actuele veldrollen en scoutinginformatie naar een voorlopig productieprofiel.',

    supports: {
      specificRoles:
        true,

      multipleRoles:
        true,

      positionFallback:
        true,

      outlookPotential:
        true,

      penalties:
        true,

      corners:
        true,

      freeKicks:
        true,
    },

    configuredRoles:
      Object.keys(
        EXPECTED_POINTS_ROLE_PROFILES,
      ),
  }
}