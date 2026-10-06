import {
  calculateSeasonTransition,
} from '../seasonTransitionEngine.js'

/*
|--------------------------------------------------------------------------
| Expected Points - Player Data Adapter
|--------------------------------------------------------------------------
|
| Deze adapter vertaalt bestaande spelerinformatie
| naar het vaste speelprofiel dat de Expected Points
| Calculation Engine nodig heeft.
|
| De adapter gebruikt uitsluitend bestaande bronnen:
|
| 1. Handmatige verwachte minuten en speelkans
| 2. Beoordeelde basisstatus
| 3. Beoordeelde selectierol
| 4. Historische minuten per optreden
| 5. Een veilige onbekende fallback
|
| Deze module berekent:
|
| - geen Fantasy-punten;
| - geen vorm;
| - geen wedstrijdmoeilijkheid;
| - geen availability-score;
| - geen spelerkwaliteit.
|
*/

const ROLE_PROFILES = {
  'key-player': {
    expectedMinutes: 85,
    playingChance: 98,
  },

  starter: {
    expectedMinutes: 80,
    playingChance: 92,
  },

  rotation: {
    expectedMinutes: 35,
    playingChance: 65,
  },

  backup: {
    expectedMinutes: 15,
    playingChance: 30,
  },

  prospect: {
    expectedMinutes: 20,
    playingChance: 35,
  },

  unknown: {
    expectedMinutes: 0,
    playingChance: 0,
  },
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(
  value,
  fallback = null,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback
  }

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
  const number =
    toNumber(
      value,
      minimum,
    )

  return Math.max(
    minimum,
    Math.min(
      maximum,
      number,
    ),
  )
}

function round(
  value,
  digits = 1,
) {
  const number =
    toNumber(
      value,
      0,
    )

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
  ).toLowerCase()
}

/*
|--------------------------------------------------------------------------
| Spelerbronnen
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

function resolvePosition(
  player,
) {
  return cleanText(
    player?.fantasyPosition ??
    player?.position ??
    'unknown',
  )
}

function resolveExpectedRole(
  player,
) {
  const scout =
    getScoutProfile(
      player,
    )

  const role =
    normalizeText(
      player?.expectedRole ??
      scout?.expectedRole ??
      'unknown',
    )

  return (
    ROLE_PROFILES[role]
      ? role
      : 'unknown'
  )
}

function resolveExpectedStarter(
  player,
) {
  const scout =
    getScoutProfile(
      player,
    )

  const value =
    player?.expectedStarter ??
    scout?.expectedStarter

  if (
    value === true ||
    value === false
  ) {
    return value
  }

  return null
}

/*
|--------------------------------------------------------------------------
| Historische minuten
|--------------------------------------------------------------------------
*/

function getHistoricalMinutesPerAppearance(
  history,
) {
  return clamp(
    history
      ?.overall
      ?.minutesPerAppearance ??
    0,
    0,
    90,
  )
}

function getHistoricalStartPercentage(
  history,
) {
  return clamp(
    history
      ?.overall
      ?.startPercentage ??
    0,
    0,
    100,
  )
}

function hasHistoricalPlayingData(
  history,
) {
  return (
    toNumber(
      history
        ?.sample
        ?.appearances,
      0,
    ) > 0 &&
    toNumber(
      history
        ?.sample
        ?.minutes,
      0,
    ) > 0
  )
}

/*
|--------------------------------------------------------------------------
| Verwachte minuten bepalen
|--------------------------------------------------------------------------
*/

function resolveExpectedMinutes({
  player,
  history,
  role,
  expectedStarter,
}) {
  const scout =
    getScoutProfile(
      player,
    )

  const manualMinutes =
    toNumber(
      player?.expectedMinutes ??
      scout?.expectedMinutes,
    )

  if (
    manualMinutes !== null
  ) {
    return {
      value:
        clamp(
          manualMinutes,
          0,
          90,
        ),

      source:
        'manual',
    }
  }

  if (
    expectedStarter === true
  ) {
    return {
      value: 80,
      source:
        'expected-starter',
    }
  }

  if (
    expectedStarter === false
  ) {
    return {
      value: 15,
      source:
        'expected-non-starter',
    }
  }

  if (
    role !== 'unknown'
  ) {
    return {
      value:
        ROLE_PROFILES[
          role
        ].expectedMinutes,

      source:
        'expected-role',
    }
  }

  if (
    hasHistoricalPlayingData(
      history,
    )
  ) {
    return {
      value:
        getHistoricalMinutesPerAppearance(
          history,
        ),

      source:
        'historical-minutes',
    }
  }

  /*
   * Geen rol, geen basisstatus en geen
   * historische speelminuten.
   *
   * We nemen dan bewust geen speeltijd aan.
   */
  return {
    value: 0,
    source:
      'unknown',
  }
}

/*
|--------------------------------------------------------------------------
| Speelkans bepalen
|--------------------------------------------------------------------------
*/

function resolvePlayingChance({
  player,
  history,
  role,
  expectedStarter,
}) {
  const scout =
    getScoutProfile(
      player,
    )

  const manualChance =
    toNumber(
      player?.playingChance ??
      player?.chanceOfPlaying ??
      scout?.chanceOfPlaying,
    )

  if (
    manualChance !== null
  ) {
    return {
      value:
        clamp(
          manualChance,
          0,
          100,
        ),

      source:
        'manual',
    }
  }

  if (
    expectedStarter === true
  ) {
    return {
      value: 92,
      source:
        'expected-starter',
    }
  }

  if (
    expectedStarter === false
  ) {
    return {
      value: 30,
      source:
        'expected-non-starter',
    }
  }

  if (
    role !== 'unknown'
  ) {
    return {
      value:
        ROLE_PROFILES[
          role
        ].playingChance,

      source:
        'expected-role',
    }
  }

  if (
    hasHistoricalPlayingData(
      history,
    )
  ) {
    const startPercentage =
      getHistoricalStartPercentage(
        history,
      )

    /*
     * Historische basisplaatsen geven enige
     * aanwijzing, maar mogen nooit automatisch
     * tot volledige zekerheid leiden.
     */
    return {
      value:
        clamp(
          50 +
          startPercentage *
            0.45,
          50,
          95,
        ),

      source:
        'historical-start-rate',
    }
  }

  return {
    value: 0,
    source:
      'unknown',
  }
}

/*
|--------------------------------------------------------------------------
| Betrouwbaarheid van het speelprofiel
|--------------------------------------------------------------------------
*/

function buildPlayingConfidence({
  minutesSource,
  chanceSource,
  player,
}) {
  const playerConfidence =
    toNumber(
      player
        ?.profile
        ?.confidence
        ?.score ??
      player
        ?.confidence
        ?.score,
      0,
    )

  let sourceScore = 20

  if (
    minutesSource === 'manual' &&
    chanceSource === 'manual'
  ) {
    sourceScore = 95
  } else if (
    minutesSource ===
      'expected-starter' ||
    minutesSource ===
      'expected-non-starter'
  ) {
    sourceScore = 80
  } else if (
    minutesSource ===
    'expected-role'
  ) {
    sourceScore = 65
  } else if (
    minutesSource ===
    'historical-minutes'
  ) {
    sourceScore = 55
  }

  return round(
    clamp(
      sourceScore * 0.7 +
      playerConfidence * 0.3,
      0,
      100,
    ),
    0,
  )
}

/*
|--------------------------------------------------------------------------
| Waarschuwingen
|--------------------------------------------------------------------------
*/

function buildWarnings({
  expectedMinutes,
  playingChance,
  role,
  expectedStarter,
}) {
  const warnings = []

  if (
    expectedMinutes.source ===
    'unknown'
  ) {
    warnings.push(
      'Er is geen betrouwbare bron voor verwachte speelminuten.',
    )
  }

  if (
    playingChance.source ===
    'unknown'
  ) {
    warnings.push(
      'Er is geen betrouwbare bron voor de speelkans.',
    )
  }

  if (
    role === 'unknown'
  ) {
    warnings.push(
      'De verwachte selectierol is nog niet beoordeeld.',
    )
  }

  if (
    expectedStarter === null
  ) {
    warnings.push(
      'De verwachte basisstatus is nog niet beoordeeld.',
    )
  }

  return warnings
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

/**
 * Bouwt het vaste spelerprofiel voor
 * Expected Points Calculation.
 */
export function getExpectedPointsPlayerData(
  player,
  {
    history = null,
    outlook = null,
  } = {},
) {
  if (
    !player
  ) {
    return null
  }

const seasonTransition =
  calculateSeasonTransition(
    history,
  )

  const role =
    resolveExpectedRole(
      player,
    )

  const expectedStarter =
    resolveExpectedStarter(
      player,
    )

  const expectedMinutes =
    resolveExpectedMinutes({
      player,
      history,
      role,
      expectedStarter,
    })

  const playingChance =
    resolvePlayingChance({
      player,
      history,
      role,
      expectedStarter,
    })

  const confidence =
    buildPlayingConfidence({
      minutesSource:
        expectedMinutes.source,

      chanceSource:
        playingChance.source,

      player,
    })

  return {
    /*
     * Bestaande spelerinformatie blijft behouden,
     * zodat Calculation en toekomstige inspectie
     * toegang houden tot naam, club en positie.
     */
    ...player,

    id:
      cleanText(
        player.id,
      ),

    name:
      cleanText(
        player.name,
      ),

    club:
      cleanText(
        player.club,
      ),

    position:
      resolvePosition(
        player,
      ),

    fantasyPosition:
      resolvePosition(
        player,
      ),

    expectedRole:
      role,

    expectedStarter,

    expectedMinutes:
      round(
        expectedMinutes.value,
        1,
      ),

    playingChance:
      round(
        playingChance.value,
        1,
      ),

    seasonTransition,  

    playingProfile: {
      expectedMinutes:
        round(
          expectedMinutes.value,
          1,
        ),

      playingChance:
        round(
          playingChance.value,
          1,
        ),

      expectedRole:
        role,

      expectedStarter,

      minutesSource:
        expectedMinutes.source,

      chanceSource:
        playingChance.source,

      confidence,

      warnings:
        buildWarnings({
          expectedMinutes,
          playingChance,
          role,
          expectedStarter,
        }),
    },

    /*
     * Outlook wordt alleen bewaard als context.
     * De adapter leidt hier geen nieuwe
     * speelminuten uit af.
     */
    expectedPointsContext: {
  availabilityScore:
    toNumber(
      outlook
        ?.scores
        ?.availability,
      null,
    ),

  riskScore:
    toNumber(
      outlook
        ?.scores
        ?.risk,
      null,
    ),

  roleTransition:
    seasonTransition
      .role,

  productionTransition:
    seasonTransition
      .production,

  overallTransition:
    seasonTransition
      .overall,
},
  }
}

/**
 * Bouwt spelerdata voor meerdere spelers.
 */
export function getExpectedPointsPlayerDataBatch(
  players,
  contextByPlayer = new Map(),
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
      ) => {
        const context =
          contextByPlayer.get(
            String(
              player?.id ??
              '',
            ),
          ) ??
          {}

        return getExpectedPointsPlayerData(
          player,
          context,
        )
      },
    )
    .filter(Boolean)
}