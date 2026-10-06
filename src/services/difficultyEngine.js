import {
  buildFixtureAnalysis,
  normalizeClubName,
} from './historyAnalytics.js'

const DEFAULT_WEIGHTS = {
  teamStrength: 40,
  recentForm: 17.5,
  venueForm: 17.5,
  production: 15,
  history: 10,
}

function clamp(
  value,
  minimum = 0,
  maximum = 100,
) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return minimum
  }

  return Math.max(
    minimum,
    Math.min(maximum, number),
  )
}

function round(value, digits = 1) {
  const factor = 10 ** digits

  return (
    Math.round(Number(value) * factor) /
    factor
  )
}

function average(values) {
  const usableValues = values
    .map(Number)
    .filter(Number.isFinite)

  if (!usableValues.length) {
    return null
  }

  return (
    usableValues.reduce(
      (sum, value) => sum + value,
      0,
    ) / usableValues.length
  )
}

function calculateRelativeStrength(
  ownTeamStrength,
  opponentTeamStrength,
) {
  const ownStrength = clamp(
    ownTeamStrength,
    0,
    100,
  )

  const opponentStrength = clamp(
    opponentTeamStrength,
    0,
    100,
  )

  const difference =
    opponentStrength - ownStrength

  /*
   * Comprimeert het krachtsverschil.
   *
   * Gelijke ploegen blijven rond 50.
   * Middelgrote verschillen worden minder extreem.
   * Grote verschillen blijven duidelijk zichtbaar.
   */
  const compressedDifference =
    Math.sign(difference) *
    Math.pow(Math.abs(difference), 0.82) *
    1.45

  return clamp(
    50 + compressedDifference,
    0,
    100,
  )
}

function scoreToDifficulty(score) {
  const value = clamp(score, 0, 100)

  /*
   * Stukgewijze schaal:
   *
   * 0–20   → 1,0–1,5
   * 20–40  → 1,5–2,4
   * 40–60  → 2,4–3,2
   * 60–80  → 3,2–4,1
   * 80–100 → 4,1–5,0
   *
   * Hierdoor ontstaat vooral tussen
   * makkelijk en gemiddeld meer nuance.
   */
  if (value <= 20) {
    return round(
      1 + (value / 20) * 0.5,
      1,
    )
  }

  if (value <= 40) {
    return round(
      1.5 +
        ((value - 20) / 20) * 0.9,
      1,
    )
  }

  if (value <= 60) {
    return round(
      2.4 +
        ((value - 40) / 20) * 0.8,
      1,
    )
  }

  if (value <= 80) {
    return round(
      3.2 +
        ((value - 60) / 20) * 0.9,
      1,
    )
  }

  return round(
    4.1 +
      ((value - 80) / 20) * 0.9,
    1,
  )
}

export function difficultyColor(difficulty) {
  const value = clamp(
    difficulty,
    1,
    5,
  )

  const ratio = (value - 1) / 4

  /*
   * De kleur verschuift iets sneller
   * van groen naar geel en oranje.
   */
  const colorRatio =
    Math.pow(ratio, 0.72)

  const hue =
    120 - colorRatio * 120

  return `hsl(${round(hue, 1)}, 88%, 46%)`
}

export function difficultyLabel(difficulty) {
  const value = clamp(difficulty, 1, 5)

  if (value < 1.3) {
    return 'Uitstekend'
  }

  if (value < 1.7) {
    return 'Zeer gunstig'
  }

  if (value < 2.1) {
    return 'Gunstig'
  }

  if (value < 2.5) {
    return 'Licht gunstig'
  }

  if (value < 3.0) {
    return 'In balans'
  }

  if (value < 3.4) {
    return 'Licht ongunstig'
  }

  if (value < 3.8) {
    return 'Ongunstig'
  }

  if (value < 4.3) {
    return 'Zwaar'
  }

  return 'Extreem zwaar'
}

export function difficultyToStars(difficulty) {
  return clamp(
    Math.round(Number(difficulty) || 3),
    1,
    5,
  )
}

function findTeamRating(
  teamRatings,
  club,
) {
  const clubKey = normalizeClubName(club)

  return teamRatings.find(
    (rating) =>
      normalizeClubName(rating.club) ===
      clubKey,
  ) || null
}

function getTeamStrengthValue(rating) {
  if (!rating) {
    return 50
  }

  /*
   * Voorkeur:
   * gebruik rechtstreeks de handmatig bepaalde
   * Gewogen_teamsterkte uit Google Sheets.
   */
  const weightedStrength = Number(
    rating.weightedStrength,
  )

  if (Number.isFinite(weightedStrength)) {
    if (weightedStrength <= 5) {
      return clamp(
        ((weightedStrength - 1) / 4) * 100,
        0,
        100,
      )
    }

    return clamp(
      weightedStrength,
      0,
      100,
    )
  }

  /*
   * Reserve:
   * wanneer Gewogen_teamsterkte ontbreekt,
   * berekenen we tijdelijk zelf een gemiddelde.
   */
  const ratingAverage = average([
    rating.attack,
    rating.midfield,
    rating.defense,
    rating.coach,
  ])

  if (ratingAverage === null) {
    return 50
  }

  if (ratingAverage <= 5) {
    return clamp(
      ((ratingAverage - 1) / 4) * 100,
      0,
      100,
    )
  }

  return clamp(
    ratingAverage,
    0,
    100,
  )
}

function getFormValue(summary) {
  if (!summary?.played) {
    return null
  }

  return clamp(
    (summary.pointsPerGame / 3) * 100,
    0,
    100,
  )
}

function getProductionValue(summary) {
  if (!summary?.played) {
    return null
  }

  const attackingScore = clamp(
    (summary.averageGoalsFor / 3) * 100,
    0,
    100,
  )

  const defensiveScore = clamp(
    100 -
      (summary.averageGoalsAgainst / 3) * 100,
    0,
    100,
  )

  return average([
    attackingScore,
    defensiveScore,
  ])
}

function getHistoryValue(summary) {
  const played =
    summary?.played ??
    summary?.matches ??
    0

  if (!played) {
    return 50
  }

  return clamp(
    (
      summary.wins * 100 +
      summary.draws * 50
    ) / played,
    0,
    100,
  )
}

function calculateConfidence({
  recentPlayed,
  venuePlayed,
  historyPlayed,
  hasTeamRating,
}) {
  const recentConfidence =
    clamp(recentPlayed / 10, 0, 1) * 30

  const venueConfidence =
    clamp(venuePlayed / 10, 0, 1) * 25

  const historyConfidence =
    clamp(historyPlayed / 10, 0, 1) * 20

  const teamRatingConfidence =
    hasTeamRating ? 25 : 10

  return round(
    recentConfidence +
      venueConfidence +
      historyConfidence +
      teamRatingConfidence,
    0,
  )
}

function createSideResult({
  club,
  opponent,
  ownTeamStrength,
  opponentTeamStrength,
  recentForm,
  venueForm,
  production,
  history,
  confidence,
  reasons,
  sampleSizes = {},
}) {
  /*
   * De invloed van dynamische gegevens groeit mee
   * met het aantal beschikbare wedstrijden.
   *
   * Geen wedstrijden = factor telt niet mee.
   * Vijf wedstrijden = volledige invloed.
   */
  const relativeTeamStrength =
  calculateRelativeStrength(
    ownTeamStrength,
    opponentTeamStrength,
  )

  const recentReliability = clamp(
    (sampleSizes.recent || 0) / 5,
    0,
    1,
  )

  const venueReliability = clamp(
    (sampleSizes.venue || 0) / 5,
    0,
    1,
  )

  const productionReliability = clamp(
    (sampleSizes.production || 0) / 5,
    0,
    1,
  )

  const historyReliability = clamp(
    (sampleSizes.history || 0) / 10,
    0,
    1,
  )

  const components = [
  {
    key: 'teamStrength',
    value: relativeTeamStrength,
    baseWeight: DEFAULT_WEIGHTS.teamStrength,
    reliability: 1,
  },
    {
      key: 'recentForm',
      value: recentForm,
      baseWeight: DEFAULT_WEIGHTS.recentForm,
      reliability: recentReliability,
    },
    {
      key: 'venueForm',
      value: venueForm,
      baseWeight: DEFAULT_WEIGHTS.venueForm,
      reliability: venueReliability,
    },
    {
      key: 'production',
      value: production,
      baseWeight: DEFAULT_WEIGHTS.production,
      reliability: productionReliability,
    },
    {
      key: 'history',
      value: history,
      baseWeight: DEFAULT_WEIGHTS.history,
      reliability: historyReliability,
    },
  ]

  const availableComponents = components.filter(
    (component) =>
      Number.isFinite(Number(component.value)) &&
      component.reliability > 0,
  )

  const effectiveWeightTotal =
    availableComponents.reduce(
      (sum, component) =>
        sum +
        component.baseWeight *
          component.reliability,
      0,
    )

  const totalScore = effectiveWeightTotal
    ? availableComponents.reduce(
        (sum, component) => {
          const effectiveWeight =
            component.baseWeight *
            component.reliability

          return (
            sum +
            Number(component.value) *
              effectiveWeight
          )
        },
        0,
      ) / effectiveWeightTotal
    : 50

  const difficulty =
    scoreToDifficulty(totalScore)

  const effectiveWeights =
    Object.fromEntries(
      components.map((component) => {
        const effectiveWeight =
          component.baseWeight *
          component.reliability

        const normalizedWeight =
          effectiveWeightTotal > 0
            ? (
                effectiveWeight /
                effectiveWeightTotal
              ) * 100
            : 0

        return [
          component.key,
          round(normalizedWeight, 1),
        ]
      }),
    )

  return {
    club,
    opponent,

    difficulty,
    stars: difficultyToStars(difficulty),
    label: difficultyLabel(difficulty),
    color: difficultyColor(difficulty),
    confidence,

    totalScore: round(totalScore, 1),

    components: {
  teamStrength: round(
    relativeTeamStrength,
    1,
  ),

  ownTeamStrength: round(
    ownTeamStrength,
    1,
  ),

  opponentTeamStrength: round(
    opponentTeamStrength,
    1,
  ),

      recentForm:
        recentForm === null
          ? null
          : round(recentForm, 1),

      venueForm:
        venueForm === null
          ? null
          : round(venueForm, 1),

      production:
        production === null
          ? null
          : round(production, 1),

      history:
        history === null
          ? null
          : round(history, 1),
    },

    effectiveWeights,

    sampleSizes: {
      ...sampleSizes,
    },

    reasons,
  }
}

export function calculateFixtureDifficulty({
  fixture,
  results = [],
  teamRatings = [],
}) {
  if (!fixture) {
    return null
  }

  const analysis = buildFixtureAnalysis(
    results,
    fixture.home,
    fixture.away,
    fixture.date,
    fixture.season,
)

  const homeTeamRating = findTeamRating(
    teamRatings,
    fixture.home,
  )

  const awayTeamRating = findTeamRating(
    teamRatings,
    fixture.away,
  )

  const homeStrength =
    getTeamStrengthValue(homeTeamRating)

  const awayStrength =
    getTeamStrengthValue(awayTeamRating)

  /*
   * Belangrijk:
   * vorm en thuis-/uitvorm worden alleen
   * uit het seizoen van de fixture gehaald
   * zodra we buildFixtureAnalysis in de
   * volgende stap seizoensbewust maken.
   */

  const homeRecentForm = getFormValue(
    analysis.homeRecentSummary,
  )

  const awayRecentForm = getFormValue(
    analysis.awayRecentSummary,
  )

  const homeVenueForm = getFormValue(
    analysis.homeVenueSummary,
  )

  const awayVenueForm = getFormValue(
    analysis.awayVenueSummary,
  )

  const homeProduction = getProductionValue(
    analysis.homeCombinedSummary,
  )

  const awayProduction = getProductionValue(
    analysis.awayCombinedSummary,
  )

  const homeHistoryAdvantage =
    getHistoryValue(
      analysis.headToHeadSummary,
    )

  const awayHistoryAdvantage =
    100 - homeHistoryAdvantage

  const homeLocationAdvantage =
    getHistoryValue(
      analysis.venueHeadToHeadSummary,
    )

  const awayLocationAdvantage =
    100 - homeLocationAdvantage

  const homeHistory =
  homeHistoryAdvantage * 0.4 +
  homeLocationAdvantage * 0.6

const awayHistory =
  awayHistoryAdvantage * 0.4 +
  awayLocationAdvantage * 0.6

  const confidence = calculateConfidence({
    recentPlayed:
      analysis.homeRecentSummary.played +
      analysis.awayRecentSummary.played,

    venuePlayed:
      analysis.homeVenueSummary.played +
      analysis.awayVenueSummary.played,

    historyPlayed:
  analysis.headToHeadSummary.matches || 0,

    hasTeamRating:
      Boolean(
        homeTeamRating &&
        awayTeamRating,
      ),
  })

  /*
   * Moeilijkheid voor de thuisploeg:
   * gebaseerd op de kracht en prestaties
   * van de uitploeg.
   *
   * Een gunstige eigen historische matchup
   * verlaagt juist de moeilijkheid.
   */
  const home = createSideResult({
    club: fixture.home,
    opponent: fixture.away,

    ownTeamStrength: homeStrength,
opponentTeamStrength: awayStrength,

    recentForm: awayRecentForm,
    venueForm: awayVenueForm,
    production: awayProduction,
    history: 100 - homeHistory,

    confidence,

    sampleSizes: {
  recent:
    analysis.awayRecentSummary.played,

  venue:
    analysis.awayVenueSummary.played,

  production: Math.max(
    analysis.awayRecentSummary.played,
    analysis.awayVenueSummary.played,
  ),

  history:
    analysis.headToHeadSummary.matches || 0,
},

    reasons: [
      `${fixture.away} bepaalt met zijn teamkracht de basis van deze moeilijkheid.`,
      `De actuele vorm van ${fixture.away} telt mee.`,
      `De uitvorm van ${fixture.away} telt afzonderlijk mee.`,
      `Doelpunten voor en tegen beïnvloeden de productiescore.`,
      `De historische matchup telt voor 10% mee.`,
    ],
  })

  /*
   * Moeilijkheid voor de uitploeg:
   * gebaseerd op de kracht en prestaties
   * van de thuisploeg.
   */
  const away = createSideResult({
    club: fixture.away,
    opponent: fixture.home,

    ownTeamStrength: awayStrength,
opponentTeamStrength: homeStrength,

    recentForm: homeRecentForm,
    venueForm: homeVenueForm,
    production: homeProduction,
    history: 100 - awayHistory,

    confidence,

    sampleSizes: {
  recent:
    analysis.homeRecentSummary.played,

  venue:
    analysis.homeVenueSummary.played,

  production: Math.max(
    analysis.homeRecentSummary.played,
    analysis.homeVenueSummary.played,
  ),

  history:
    analysis.headToHeadSummary.matches || 0,
},

    reasons: [
      `${fixture.home} bepaalt met zijn teamkracht de basis van deze moeilijkheid.`,
      `De actuele vorm van ${fixture.home} telt mee.`,
      `De thuisvorm van ${fixture.home} telt afzonderlijk mee.`,
      `Doelpunten voor en tegen beïnvloeden de productiescore.`,
      `De historische matchup telt voor 10% mee.`,
    ],
  })

return {
  fixtureId: fixture.id,
  season: fixture.season,

  home,
  away,

  analysis,
}
}

export const difficultyEngineWeights = {
  ...DEFAULT_WEIGHTS,
}