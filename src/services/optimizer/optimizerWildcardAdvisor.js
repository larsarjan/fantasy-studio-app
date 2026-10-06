import {
  getPlayerRoundProjection,
  optimizeLineupForRound,
} from './optimizerLineup.js'

/*
|--------------------------------------------------------------------------
| Fantasy Studio — Wildcard Advisor
|--------------------------------------------------------------------------
|
| De Wildcard wordt niet automatisch door de Beam Search ingepland.
|
| Deze module onderzoekt goedkope, uitlegbare signalen en benoemt maximaal
| drie interessante Wildcardmomenten. Na een keuze van de gebruiker kan
| die specifieke ronde later volledig worden doorgerekend.
|
*/

const DEFAULT_WILDCARD_ADVISOR = Object.freeze({
  maximumRecommendations: 3,
  lookAheadRounds: 3,
})

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
  const factor =
    10 ** digits

  return (
    Math.round(
      (
        toNumber(value) +
        Number.EPSILON
      ) *
      factor,
    ) /
    factor
  )
}

function normalizeRound(
  value,
  fallback = 1,
) {
  return Math.max(
    1,
    Math.min(
      34,
      Math.floor(
        toNumber(
          value,
          fallback,
        ),
      ),
    ),
  )
}

function normalizePlayerId(
  player,
) {
  const directId =
    player?.id ??
    player?.playerId

  if (
    directId !== null &&
    directId !== undefined &&
    String(directId).trim()
  ) {
    return String(
      directId,
    ).trim()
  }

  return [
    player?.name,
    player?.club,
  ]
    .map(
      (value) =>
        String(
          value ??
          '',
        ).trim(),
    )
    .filter(Boolean)
    .join('@')
}

function getEntryPlayer(
  entry,
) {
  return (
    entry?.player ??
    entry ??
    null
  )
}

function getLineupStarters(
  lineupResult,
) {
  const starters =
    lineupResult
      ?.result
      ?.starters

  return Array.isArray(
    starters,
  )
    ? starters
    : []
}

function getProjection(
  player,
  roundNumber,
) {
  const projection =
    getPlayerRoundProjection(
      player,
      roundNumber,
    )

  const expectedPoints =
    Math.max(
      0,
      toNumber(
        projection
          ?.expectedPoints ??
        projection
          ?.points,
      ),
    )

  const expectedMinutes =
    Math.max(
      0,
      toNumber(
        projection
          ?.expectedMinutes,
      ),
    )

  const appearanceProbability =
    Math.max(
      0,
      Math.min(
        1,
        toNumber(
          projection
            ?.appearanceProbability,
        ),
      ),
    )

  const fixtureCount =
    Math.max(
      0,
      Math.floor(
        toNumber(
          projection
            ?.fixtureCount,
        ),
      ),
    )

  return {
    expectedPoints:
      round(
        expectedPoints,
      ),

    expectedMinutes:
      round(
        expectedMinutes,
        1,
      ),

    appearanceProbability:
      round(
        appearanceProbability,
        4,
      ),

    fixtureCount,

    hasProjection:
      projection?.hasProjection ===
      true,

    type:
      projection?.type ??
      null,
  }
}

function createSquadRoundReport({
  squad,
  roundNumber,
} = {}) {
  const lineupResult =
    optimizeLineupForRound({
      squad,
      round:
        roundNumber,
    })

  if (
    !lineupResult?.valid ||
    !lineupResult?.result
  ) {
    return null
  }

  const starters =
    getLineupStarters(
      lineupResult,
    )

  const starterReports =
    starters.map(
      (entry) => {
        const player =
          getEntryPlayer(
            entry,
          )

        return {
          player,

          projection:
            getProjection(
              player,
              roundNumber,
            ),
        }
      },
    )

  const squadReports =
    squad.map(
      (player) => ({
        player,

        projection:
          getProjection(
            player,
            roundNumber,
          ),
      }),
    )

  const zeroPointStarters =
    starterReports.filter(
      ({ projection }) =>
        projection.fixtureCount === 0 ||
        projection.expectedPoints <= 0,
    )

  const weakStarters =
    starterReports.filter(
      ({ projection }) =>
        projection.expectedPoints > 0 &&
        projection.expectedPoints < 2,
    )

  const unavailableSquadPlayers =
    squadReports.filter(
      ({ projection }) =>
        projection.fixtureCount === 0 ||
        !projection.hasProjection,
    )

  const lowAvailabilityPlayers =
    squadReports.filter(
      ({ projection }) =>
        projection.fixtureCount > 0 &&
        projection.appearanceProbability < 0.6,
    )

  return {
    round:
      roundNumber,

    lineupExpectedPoints:
      round(
        lineupResult
          .result
          .expectedPoints,
      ),

    zeroPointStarters,

    weakStarters,

    unavailableSquadPlayers,

    lowAvailabilityPlayers,

    lineup:
      lineupResult.result,
  }
}

function createReason({
  key,
  label,
  value,
  text,
  weight,
} = {}) {
  return {
    key,
    label,
    value,
    text,
    weight:
      round(
        weight,
      ),
  }
}

function createCandidate({
  report,
  bestLineupExpectedPoints,
  futureReports,
} = {}) {
  const zeroStarterCount =
    report
      .zeroPointStarters
      .length

  const unavailableSquadCount =
    report
      .unavailableSquadPlayers
      .length

  const weakStarterCount =
    report
      .weakStarters
      .length

  const lowAvailabilityCount =
    report
      .lowAvailabilityPlayers
      .length

  const lineupGap =
    Math.max(
      0,
      bestLineupExpectedPoints -
      report.lineupExpectedPoints,
    )

  const futureLineupAverage =
    futureReports.length
      ? futureReports.reduce(
          (
            total,
            item,
          ) =>
            total +
            item.lineupExpectedPoints,
          0,
        ) /
        futureReports.length
      : report.lineupExpectedPoints

  const structuralWeakness =
    Math.max(
      0,
      bestLineupExpectedPoints -
      futureLineupAverage,
    )

  const scoreParts = {
    zeroPointStarters:
      Math.min(
        30,
        zeroStarterCount * 15,
      ),

    unavailableSquad:
      Math.min(
        24,
        unavailableSquadCount * 6,
      ),

    weakStarters:
      Math.min(
        16,
        weakStarterCount * 4,
      ),

    lowAvailability:
      Math.min(
        12,
        lowAvailabilityCount * 3,
      ),

    immediateLineupGap:
      Math.min(
        10,
        lineupGap * 1.5,
      ),

    structuralWeakness:
      Math.min(
        8,
        structuralWeakness,
      ),
  }

  const score =
    Math.max(
      0,
      Math.min(
        100,
        Object.values(
          scoreParts,
        ).reduce(
          (
            total,
            value,
          ) =>
            total +
            value,
          0,
        ),
      ),
    )

  const reasons = []

  if (
    zeroStarterCount > 0
  ) {
    reasons.push(
      createReason({
        key:
          'zero-point-starters',

        label:
          'Nulspelers in de basis',

        value:
          zeroStarterCount,

        text:
          `${zeroStarterCount} basisspeler${zeroStarterCount === 1 ? '' : 's'} heeft geen wedstrijd of een projectie van 0 punten.`,

        weight:
          scoreParts
            .zeroPointStarters,
      }),
    )
  }

  if (
    unavailableSquadCount > 0
  ) {
    reasons.push(
      createReason({
        key:
          'unavailable-squad',

        label:
          'Niet inzetbare selectiespelers',

        value:
          unavailableSquadCount,

        text:
          `${unavailableSquadCount} speler${unavailableSquadCount === 1 ? '' : 's'} uit de selectie heeft geen bruikbare projectie voor deze ronde.`,

        weight:
          scoreParts
            .unavailableSquad,
      }),
    )
  }

  if (
    weakStarterCount > 0
  ) {
    reasons.push(
      createReason({
        key:
          'weak-starters',

        label:
          'Zwakke basisplaatsen',

        value:
          weakStarterCount,

        text:
          `${weakStarterCount} basisspeler${weakStarterCount === 1 ? '' : 's'} blijft onder 2 verwachte punten.`,

        weight:
          scoreParts
            .weakStarters,
      }),
    )
  }

  if (
    lowAvailabilityCount > 0
  ) {
    reasons.push(
      createReason({
        key:
          'availability-risk',

        label:
          'Lage speelkans',

        value:
          lowAvailabilityCount,

        text:
          `${lowAvailabilityCount} selectiespeler${lowAvailabilityCount === 1 ? '' : 's'} heeft minder dan 60% verwachte speelkans.`,

        weight:
          scoreParts
            .lowAvailability,
      }),
    )
  }

  if (
    lineupGap >= 2
  ) {
    reasons.push(
      createReason({
        key:
          'lineup-gap',

        label:
          'Lage rondeprojectie',

        value:
          round(
            lineupGap,
          ),

        text:
          `De basiself ligt ${round(lineupGap, 1)} xP onder de sterkste ronde binnen de onderzochte horizon.`,

        weight:
          scoreParts
            .immediateLineupGap,
      }),
    )
  }

  if (
    structuralWeakness >= 2
  ) {
    reasons.push(
      createReason({
        key:
          'structural-weakness',

        label:
          'Probleem over meerdere rondes',

        value:
          round(
            structuralWeakness,
          ),

        text:
          `Ook over de komende ${futureReports.length} ronde${futureReports.length === 1 ? '' : 's'} blijft de huidige selectie relatief zwak.`,

        weight:
          scoreParts
            .structuralWeakness,
      }),
    )
  }

  reasons.sort(
    (
      left,
      right,
    ) =>
      right.weight -
        left.weight ||
      left.key.localeCompare(
        right.key,
        'en',
      ),
  )

  return {
    round:
      report.round,

    score:
      round(
        score,
        1,
      ),

    lineupExpectedPoints:
      report.lineupExpectedPoints,

    futureLineupAverage:
      round(
        futureLineupAverage,
      ),

    indicators: {
      zeroPointStarters:
        zeroStarterCount,

      unavailableSquadPlayers:
        unavailableSquadCount,

      weakStarters:
        weakStarterCount,

      lowAvailabilityPlayers:
        lowAvailabilityCount,

      immediateLineupGap:
        round(
          lineupGap,
        ),

      structuralWeakness:
        round(
          structuralWeakness,
        ),
    },

    reasons:
      reasons.slice(
        0,
        4,
      ),

    affectedPlayers: {
      zeroPointStarters:
        report
          .zeroPointStarters
          .map(
            ({ player }) => ({
              id:
                normalizePlayerId(
                  player,
                ),

              name:
                player?.name ??
                null,

              club:
                player?.club ??
                null,
            }),
          ),

      unavailableSquadPlayers:
        report
          .unavailableSquadPlayers
          .map(
            ({ player }) => ({
              id:
                normalizePlayerId(
                  player,
                ),

              name:
                player?.name ??
                null,

              club:
                player?.club ??
                null,
            }),
          ),
    },
  }
}

export function analyzeWildcardMoments({
  squad = [],
  startRound = 1,
  roundCount = 10,
  maximumRecommendations =
    DEFAULT_WILDCARD_ADVISOR
      .maximumRecommendations,
  lookAheadRounds =
    DEFAULT_WILDCARD_ADVISOR
      .lookAheadRounds,
} = {}) {
  if (
    !Array.isArray(
      squad,
    ) ||
    squad.length !== 15
  ) {
    return {
      valid: false,

      errors: [
        'De Wildcard Advisor heeft een selectie van precies vijftien spelers nodig.',
      ],

      warnings: [],

      recommendations: [],

      rounds: [],
    }
  }

  const normalizedStartRound =
    normalizeRound(
      startRound,
    )

  const normalizedRoundCount =
    Math.max(
      1,
      Math.min(
        34 -
          normalizedStartRound +
          1,
        Math.floor(
          toNumber(
            roundCount,
            10,
          ),
        ),
      ),
    )

  const normalizedMaximumRecommendations =
    Math.max(
      1,
      Math.min(
        5,
        Math.floor(
          toNumber(
            maximumRecommendations,
            3,
          ),
        ),
      ),
    )

  const normalizedLookAhead =
    Math.max(
      1,
      Math.min(
        5,
        Math.floor(
          toNumber(
            lookAheadRounds,
            3,
          ),
        ),
      ),
    )

  const endRound =
    normalizedStartRound +
    normalizedRoundCount -
    1

  const reports = []

  for (
    let roundNumber =
      normalizedStartRound;
    roundNumber <= endRound;
    roundNumber += 1
  ) {
    const report =
      createSquadRoundReport({
        squad,
        roundNumber,
      })

    if (
      report
    ) {
      reports.push(
        report,
      )
    }
  }

  if (
    !reports.length
  ) {
    return {
      valid: false,

      errors: [
        'Er konden geen geldige speelrondes voor de Wildcardanalyse worden beoordeeld.',
      ],

      warnings: [],

      recommendations: [],

      rounds: [],
    }
  }

  const bestLineupExpectedPoints =
    Math.max(
      ...reports.map(
        (report) =>
          report.lineupExpectedPoints,
      ),
    )

  const candidates =
    reports.map(
      (
        report,
        index,
      ) =>
        createCandidate({
          report,

          bestLineupExpectedPoints,

          futureReports:
            reports.slice(
              index,
              index +
                normalizedLookAhead,
            ),
        }),
    )

  const meaningfulCandidates =
    candidates.filter(
      (candidate) =>
        candidate.score > 0,
    )

  const recommendations =
    meaningfulCandidates
      .sort(
        (
          left,
          right,
        ) =>
          right.score -
            left.score ||
          left.round -
            right.round,
      )
      .slice(
        0,
        normalizedMaximumRecommendations,
      )
      .map(
        (
          candidate,
          index,
        ) => ({
          ...candidate,

          rank:
            index + 1,

          recommendationType:
            'wildcard-advisory',

          automaticallyScheduled:
            false,
        }),
      )

  return {
    valid: true,

    errors: [],

    warnings: [
      'De Wildcardmomenten zijn indicatief. De Wildcard wordt pas volledig doorgerekend nadat je zelf een speelronde kiest.',
    ],

    mode:
      'advisory',

    startRound:
      normalizedStartRound,

    endRound,

    roundCount:
      normalizedRoundCount,

    recommendations,

    rounds:
      candidates.sort(
        (
          left,
          right,
        ) =>
          left.round -
          right.round,
      ),

    diagnostics: {
      evaluatedRounds:
        reports.length,

      maximumRecommendations:
        normalizedMaximumRecommendations,

      lookAheadRounds:
        normalizedLookAhead,

      expensiveSquadOptimizations:
        0,

      beamSearchExecutions:
        0,
    },
  }
}

export default analyzeWildcardMoments