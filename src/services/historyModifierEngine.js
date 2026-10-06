import {
  createModifier,
} from './modifierEngine.js'

/*
|--------------------------------------------------------------------------
| History Modifier Engine
|--------------------------------------------------------------------------
|
| Analyseert uitsluitend historische Eredivisieprestaties.
|
| Omdat Fantasy Eredivisie pas één eerder seizoen beschikbaar heeft,
| gebruikt versie 1.0:
|
| - historische productie: 55%;
| - speelvolume:           30%;
| - recentheid:            15%.
|
| Er wordt nog geen wedstrijd-tot-wedstrijdconsistentie berekend,
| omdat daarvoor geen historische wedstrijddata beschikbaar is.
|
*/

/*
|--------------------------------------------------------------------------
| Configuratie
|--------------------------------------------------------------------------
*/

const NEUTRAL_HISTORY_SCORE = 5

const HISTORY_WEIGHT = 0.05

const MINIMUM_MODIFIER_VALUE = -0.15
const MAXIMUM_MODIFIER_VALUE = 0.15

const PRODUCTION_WEIGHT = 0.55
const VOLUME_WEIGHT = 0.30
const RECENCY_WEIGHT = 0.15

const FULL_SEASON_MINUTES = 2700
const STRONG_EVIDENCE_MINUTES = 2000
const USABLE_EVIDENCE_MINUTES = 900

/*
|--------------------------------------------------------------------------
| Getalhelpers
|--------------------------------------------------------------------------
*/

function toNumber(value) {
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

function clamp(
  value,
  minimum = 0,
  maximum = 10,
) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return minimum
  }

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
    Number(value)

  if (!Number.isFinite(number)) {
    return 0
  }

  const factor =
    10 ** digits

  return (
    Math.round(number * factor) /
    factor
  )
}

/*
|--------------------------------------------------------------------------
| Historische gegevens
|--------------------------------------------------------------------------
*/

function getHistory(player) {
  return (
    player?.profile?.history ?? {
      previousSeason: null,
      seasons: [],
      totals: {
        minutes: 0,
        points: 0,
        goals: 0,
        assists: 0,
        optaBonus: 0,
        cleanSheets: 0,
        saves: 0,
      },
    }
  )
}

function getPreviousSeason(
  player,
) {
  return (
    getHistory(player)
      .previousSeason ??
    null
  )
}

function getPreviousSeasonMinutes(
  previousSeason,
) {
  return (
    toNumber(
      previousSeason?.minutes,
    ) ??
    0
  )
}

function getPreviousSeasonPoints(
  previousSeason,
) {
  return (
    toNumber(
      previousSeason?.points,
    ) ??
    0
  )
}

function calculatePointsPer90(
  previousSeason,
) {
  const minutes =
    getPreviousSeasonMinutes(
      previousSeason,
    )

  const points =
    getPreviousSeasonPoints(
      previousSeason,
    )

  if (minutes <= 0) {
    return null
  }

  return (
    points /
    minutes
  ) * 90
}

/*
|--------------------------------------------------------------------------
| Productiescore
|--------------------------------------------------------------------------
|
| Punten per 90 is leidend.
|
| De grenzen zijn bewust breed, omdat doelmannen,
| verdedigers, middenvelders en spitsen niet exact
| dezelfde Fantasyproductie hebben.
|
*/

function calculateProductionScore(
  previousSeason,
) {
  const pointsPer90 =
    calculatePointsPer90(
      previousSeason,
    )

  if (pointsPer90 === null) {
    return {
      score:
        NEUTRAL_HISTORY_SCORE,

      pointsPer90:
        null,

      available:
        false,
    }
  }

  /*
   * 0 punten per 90  → 0
   * 3 punten per 90  → ongeveer 5
   * 6 punten per 90  → 10
   */

  const score =
    clamp(
      (
        pointsPer90 /
        6
      ) *
        10,
      0,
      10,
    )

  return {
    score:
      round(
        score,
        2,
      ),

    pointsPer90:
      round(
        pointsPer90,
        2,
      ),

    available:
      true,
  }
}

/*
|--------------------------------------------------------------------------
| Speelvolume
|--------------------------------------------------------------------------
*/

function calculateVolumeScore(
  previousSeason,
) {
  const minutes =
    getPreviousSeasonMinutes(
      previousSeason,
    )

  const score =
    clamp(
      (
        minutes /
        FULL_SEASON_MINUTES
      ) *
        10,
      0,
      10,
    )

  return {
    score:
      round(
        score,
        2,
      ),

    minutes,

    available:
      minutes > 0,
  }
}

/*
|--------------------------------------------------------------------------
| Recentheid
|--------------------------------------------------------------------------
|
| Het vorige seizoen is automatisch maximaal recent.
| Zonder vorig seizoen is er geen recente onderbouwing.
|
*/

function calculateRecencyScore(
  previousSeason,
) {
  if (!previousSeason) {
    return {
      score: 0,
      available: false,
    }
  }

  return {
    score: 10,
    available: true,
  }
}

/*
|--------------------------------------------------------------------------
| Totale historiescore
|--------------------------------------------------------------------------
*/

function calculateHistoryScore(
  player,
) {
  const previousSeason =
    getPreviousSeason(
      player,
    )

  if (!previousSeason) {
    return {
      score:
        NEUTRAL_HISTORY_SCORE,

      production: {
        score:
          NEUTRAL_HISTORY_SCORE,

        pointsPer90:
          null,

        available:
          false,
      },

      volume: {
        score: 0,
        minutes: 0,
        available: false,
      },

      recency: {
        score: 0,
        available: false,
      },

      previousSeason:
        null,
    }
  }

  const production =
    calculateProductionScore(
      previousSeason,
    )

  const volume =
    calculateVolumeScore(
      previousSeason,
    )

  const recency =
    calculateRecencyScore(
      previousSeason,
    )

  const score =
    production.score *
      PRODUCTION_WEIGHT +
    volume.score *
      VOLUME_WEIGHT +
    recency.score *
      RECENCY_WEIGHT

  return {
    score:
      round(
        score,
        2,
      ),

    production,
    volume,
    recency,
    previousSeason,
  }
}

/*
|--------------------------------------------------------------------------
| Betrouwbaarheid
|--------------------------------------------------------------------------
|
| Historische betrouwbaarheid kijkt uitsluitend naar
| beschikbaar historisch bewijs.
|
*/

function calculateHistoryConfidence(
  historyResult,
) {
  const minutes =
    historyResult
      ?.volume
      ?.minutes ??
    0

  const hasProduction =
    historyResult
      ?.production
      ?.available ===
    true

  if (
    !historyResult?.previousSeason
  ) {
    return 10
  }

  let confidence = 25

  if (hasProduction) {
    confidence += 20
  }

  if (
    minutes >=
    STRONG_EVIDENCE_MINUTES
  ) {
    confidence += 45
  } else if (
    minutes >=
    USABLE_EVIDENCE_MINUTES
  ) {
    confidence += 30
  } else if (minutes > 0) {
    confidence += 15
  }

  return clamp(
    confidence,
    0,
    100,
  )
}

/*
|--------------------------------------------------------------------------
| Uitleg
|--------------------------------------------------------------------------
*/

function buildHistoryExplanation(
  historyResult,
) {
  if (
    !historyResult.previousSeason
  ) {
    return (
      'Er is nog geen eerder Fantasy Eredivisie-seizoen ' +
      'beschikbaar voor deze speler.'
    )
  }

  const minutes =
    historyResult.volume.minutes

  const pointsPer90 =
    historyResult
      .production
      .pointsPer90

  const explanations = []

  if (
    pointsPer90 !== null
  ) {
    if (pointsPer90 >= 5) {
      explanations.push(
        'De speler behaalde vorig seizoen veel Fantasypunten per 90 minuten.',
      )
    } else if (
      pointsPer90 >= 3
    ) {
      explanations.push(
        'De historische Fantasyproductie was degelijk.',
      )
    } else {
      explanations.push(
        'De historische Fantasyproductie was relatief beperkt.',
      )
    }
  }

  if (
    minutes >=
    STRONG_EVIDENCE_MINUTES
  ) {
    explanations.push(
      'Het grote aantal gespeelde minuten geeft een sterke onderbouwing.',
    )
  } else if (
    minutes >=
    USABLE_EVIDENCE_MINUTES
  ) {
    explanations.push(
      'Er is een bruikbare hoeveelheid historische speelminuten beschikbaar.',
    )
  } else {
    explanations.push(
      'Het historische bewijs is beperkt door het lage aantal speelminuten.',
    )
  }

  explanations.push(
    'Omdat het Fantasyspel pas één seizoen bestaat, is de analyse gebaseerd op maximaal één volledig seizoen.',
  )

  return explanations.join(
    ' ',
  )
}

/*
|--------------------------------------------------------------------------
| History Modifier
|--------------------------------------------------------------------------
*/

function createHistoryModifier(
  player,
) {
  const historyResult =
    calculateHistoryScore(
      player,
    )

  const confidence =
    calculateHistoryConfidence(
      historyResult,
    )

  const previousSeason =
    historyResult.previousSeason

  const points =
    getPreviousSeasonPoints(
      previousSeason,
    )

  const minutes =
    getPreviousSeasonMinutes(
      previousSeason,
    )

  return createModifier({
    id:
      'history',

    label:
      'Historische onderbouwing',

    category:
      'core',

    score:
      historyResult.score,

    neutralScore:
      NEUTRAL_HISTORY_SCORE,

    weight:
      HISTORY_WEIGHT,

    minimumValue:
      MINIMUM_MODIFIER_VALUE,

    maximumValue:
      MAXIMUM_MODIFIER_VALUE,

    confidence,

    explanation:
      buildHistoryExplanation(
        historyResult,
      ),

    calculation: {
      formula:
        'Productie × 55% + speelvolume × 30% + recentheid × 15%',

      steps: [
        {
          label:
            'Historische productie',

          value:
            historyResult
              .production
              .score,

          digits:
            1,

          suffix:
            ' / 10',
        },

        {
          label:
            'Speelvolume',

          value:
            historyResult
              .volume
              .score,

          digits:
            1,

          suffix:
            ' / 10',
        },

        {
          label:
            'Recentheid',

          value:
            historyResult
              .recency
              .score,

          digits:
            1,

          suffix:
            ' / 10',
        },

        {
          label:
            'Historiescore',

          value:
            historyResult.score,

          digits:
            1,

          suffix:
            ' / 10',
        },

        {
          label:
            'Weging',

          value:
            HISTORY_WEIGHT *
            100,

          digits:
            0,

          suffix:
            '%',
        },
      ],
    },

    details: {
      previousSeason:
        previousSeason
          ?.season ??
        '',

      club:
        previousSeason
          ?.club ??
        '',

      minutes,

      points,

      pointsPer90:
        historyResult
          .production
          .pointsPer90,

      productionScore:
        historyResult
          .production
          .score,

      volumeScore:
        historyResult
          .volume
          .score,

      recencyScore:
        historyResult
          .recency
          .score,

      historicalSeasonCount:
        getHistory(player)
          .seasons
          .length,

      limitedToOneSeason:
        true,
    },

    source: {
      id:
        'player-history',

      label:
        'Historische Eredivisiestatistieken',

      type:
        'automatic',

      references: [
        'Fantasy-punten',
        'Speelminuten',
        'Punten per 90 minuten',
        'Vorig seizoen',
      ],
    },
  })
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

export {
  calculateHistoryScore,
  calculateHistoryConfidence,
  createHistoryModifier,
}