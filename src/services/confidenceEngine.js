/* ==========================================================
   FANTASY STUDIO — CONFIDENCE ENGINE
   Eerste versie van de centrale adviesmotor
========================================================== */

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(
    minimum,
    Math.min(maximum, value),
  )
}

function round(value, digits = 0) {
  const factor = 10 ** digits

  return (
    Math.round(value * factor) /
    factor
  )
}

function percentageToScore(
  percentage,
  maximumScore,
) {
  return clamp(
    (Number(percentage) || 0) /
      100 *
      maximumScore,
    0,
    maximumScore,
  )
}

function ratioToScore(
  value,
  minimum,
  maximum,
  maximumScore,
) {
  const numericValue =
    Number(value) || 0

  if (maximum <= minimum) {
    return 0
  }

  const ratio =
    (numericValue - minimum) /
    (maximum - minimum)

  return clamp(
    ratio * maximumScore,
    0,
    maximumScore,
  )
}

function inverseRatioToScore(
  value,
  minimum,
  maximum,
  maximumScore,
) {
  return (
    maximumScore -
    ratioToScore(
      value,
      minimum,
      maximum,
      maximumScore,
    )
  )
}

/* ==========================================================
   LABELS EN STERREN
========================================================== */

export function confidenceToStars(confidence) {
  const score = Number(confidence) || 0

  if (score >= 88) {
    return 5
  }

  if (score >= 74) {
    return 4
  }

  if (score >= 58) {
    return 3
  }

  if (score >= 42) {
    return 2
  }

  return 1
}

export function confidenceLabel(confidence) {
  const score = Number(confidence) || 0

  if (score >= 88) {
    return 'Uitzonderlijke keuze'
  }

  if (score >= 74) {
    return 'Sterke keuze'
  }

  if (score >= 58) {
    return 'Interessante keuze'
  }

  if (score >= 42) {
    return 'Twijfelgeval'
  }

  return 'Liever vermijden'
}

export function confidenceClass(confidence) {
  const score = Number(confidence) || 0

  if (score >= 88) {
    return 'excellent'
  }

  if (score >= 74) {
    return 'good'
  }

  if (score >= 58) {
    return 'neutral'
  }

  if (score >= 42) {
    return 'caution'
  }

  return 'risk'
}

/* ==========================================================
   RECENTE VORM — MAXIMAAL 20 PUNTEN
========================================================== */

export function calculateRecentFormScore(
  summary,
  maximumScore = 20,
) {
  if (!summary?.played) {
    return {
      score: maximumScore / 2,
      maximum: maximumScore,
      explanation:
        'Onvoldoende recente wedstrijden beschikbaar.',
    }
  }

  const pointsScore =
    ratioToScore(
      summary.pointsPerGame,
      0,
      3,
      maximumScore * 0.65,
    )

  const goalDifferencePerGame =
    (
      summary.goalsFor -
      summary.goalsAgainst
    ) / summary.played

  const goalDifferenceScore =
    ratioToScore(
      goalDifferencePerGame,
      -2,
      2,
      maximumScore * 0.35,
    )

  const score =
    pointsScore +
    goalDifferenceScore

  return {
    score: round(score, 1),
    maximum: maximumScore,

    explanation:
      `${summary.pointsPerGame.toFixed(1)} punten per duel ` +
      `en een doelsaldo van ` +
      `${goalDifferencePerGame >= 0 ? '+' : ''}` +
      `${goalDifferencePerGame.toFixed(1)} per wedstrijd.`,
  }
}

/* ==========================================================
   THUIS- OF UITVORM — MAXIMAAL 15 PUNTEN
========================================================== */

export function calculateVenueFormScore(
  summary,
  maximumScore = 15,
) {
  if (!summary?.played) {
    return {
      score: maximumScore / 2,
      maximum: maximumScore,
      explanation:
        'Onvoldoende thuis- of uitwedstrijden beschikbaar.',
    }
  }

  const pointsScore =
    ratioToScore(
      summary.pointsPerGame,
      0,
      3,
      maximumScore * 0.6,
    )

  const scoringScore =
    ratioToScore(
      summary.averageGoalsFor,
      0,
      3,
      maximumScore * 0.4,
    )

  return {
    score: round(
      pointsScore + scoringScore,
      1,
    ),

    maximum: maximumScore,

    explanation:
      `${summary.pointsPerGame.toFixed(1)} punten en ` +
      `${summary.averageGoalsFor.toFixed(1)} goals per duel ` +
      `op deze locatie.`,
  }
}

/* ==========================================================
   ONDERLINGE HISTORIE — MAXIMAAL 10 PUNTEN
========================================================== */

export function calculateHeadToHeadScore(
  summary,
  maximumScore = 10,
) {
  if (!summary?.matches) {
    return {
      score: maximumScore / 2,
      maximum: maximumScore,
      explanation:
        'Geen bruikbare onderlinge wedstrijden beschikbaar.',
    }
  }

  const availablePoints =
    summary.matches * 3

  const obtainedPoints =
    summary.wins * 3 +
    summary.draws

  const resultScore =
    availablePoints
      ? obtainedPoints /
        availablePoints *
        maximumScore *
        0.7
      : maximumScore * 0.35

  const goalBalance =
    summary.averageGoalsFor -
    summary.averageGoalsAgainst

  const goalsScore =
    ratioToScore(
      goalBalance,
      -2,
      2,
      maximumScore * 0.3,
    )

  return {
    score: round(
      resultScore + goalsScore,
      1,
    ),

    maximum: maximumScore,

    explanation:
      `${summary.wins} zeges, ` +
      `${summary.draws} gelijke spelen en ` +
      `${summary.losses} nederlagen in ` +
      `${summary.matches} onderlinge duels.`,
  }
}

/* ==========================================================
   HISTORIE OP DEZE LOCATIE — MAXIMAAL 20 PUNTEN
========================================================== */

export function calculateLocationHistoryScore(
  summary,
  maximumScore = 20,
) {
  if (!summary?.matches) {
    return {
      score: maximumScore / 2,
      maximum: maximumScore,
      explanation:
        'Geen historische duels op deze locatie beschikbaar.',
    }
  }

  const availablePoints =
    summary.matches * 3

  const obtainedPoints =
    summary.wins * 3 +
    summary.draws

  const resultScore =
    availablePoints
      ? obtainedPoints /
        availablePoints *
        maximumScore *
        0.7
      : maximumScore * 0.35

  const goalsScore =
    ratioToScore(
      summary.averageGoalsFor,
      0,
      3,
      maximumScore * 0.3,
    )

  return {
    score: round(
      resultScore + goalsScore,
      1,
    ),

    maximum: maximumScore,

    explanation:
      `${summary.wins} van de laatste ` +
      `${summary.matches} thuisduels gewonnen, ` +
      `met gemiddeld ` +
      `${summary.averageGoalsFor.toFixed(1)} goals.`,
  }
}

/* ==========================================================
   VERWACHTE GOALS — MAXIMAAL 15 PUNTEN
========================================================== */

export function calculateExpectedGoalsScore(
  expectedGoals,
  maximumScore = 15,
) {
  const score =
    ratioToScore(
      expectedGoals,
      0.4,
      2.8,
      maximumScore,
    )

  return {
    score: round(score, 1),
    maximum: maximumScore,

    explanation:
      `${Number(expectedGoals || 0).toFixed(1)} verwachte goals.`,
  }
}

/* ==========================================================
   TEGENSTANDER VERDEDIGING — MAXIMAAL 10 PUNTEN
========================================================== */

export function calculateOpponentDefenseScore(
  opponentSummary,
  maximumScore = 10,
) {
  if (!opponentSummary?.played) {
    return {
      score: maximumScore / 2,
      maximum: maximumScore,
      explanation:
        'Onvoldoende defensieve gegevens van de tegenstander.',
    }
  }

  const goalsAgainstScore =
    ratioToScore(
      opponentSummary.averageGoalsAgainst,
      0.4,
      2.5,
      maximumScore * 0.7,
    )

  const cleanSheetWeakness =
    inverseRatioToScore(
      opponentSummary.cleanSheetPercentage,
      0,
      70,
      maximumScore * 0.3,
    )

  return {
    score: round(
      goalsAgainstScore +
      cleanSheetWeakness,
      1,
    ),

    maximum: maximumScore,

    explanation:
      `De tegenstander krijgt gemiddeld ` +
      `${opponentSummary.averageGoalsAgainst.toFixed(1)} goals tegen ` +
      `en houdt in ` +
      `${opponentSummary.cleanSheetPercentage.toFixed(0)}% ` +
      `van de duels de nul.`,
  }
}

/* ==========================================================
   CLEAN-SHEETKANS
========================================================== */

export function calculateCleanSheetChance(
  ownSummary,
  opponentSummary,
) {
  const ownDefensiveRate =
    Number(
      ownSummary?.cleanSheetPercentage,
    ) || 0

  const opponentNoGoalRate =
    opponentSummary?.played
      ? clamp(
          (
            1 -
            opponentSummary.averageGoalsFor /
              2.5
          ) * 100,
          0,
          100,
        )
      : 35

  const chance =
    ownDefensiveRate * 0.55 +
    opponentNoGoalRate * 0.45

  return round(
    clamp(chance, 5, 80),
    0,
  )
}

/* ==========================================================
   UITEINDELIJKE CONFIDENCE
========================================================== */

export function buildAttackConfidence({
  recentSummary,
  venueSummary,
  headToHeadSummary,
  locationHistorySummary,
  expectedGoals,
  opponentSummary,
}) {
  const factors = {
    recentForm:
      calculateRecentFormScore(
        recentSummary,
        20,
      ),

    venueForm:
      calculateVenueFormScore(
        venueSummary,
        15,
      ),

    locationHistory:
      calculateLocationHistoryScore(
        locationHistorySummary,
        20,
      ),

    headToHead:
      calculateHeadToHeadScore(
        headToHeadSummary,
        10,
      ),

    expectedGoals:
      calculateExpectedGoalsScore(
        expectedGoals,
        15,
      ),

    opponentDefense:
      calculateOpponentDefenseScore(
        opponentSummary,
        10,
      ),
  }

  const scoredPoints =
    Object.values(factors).reduce(
      (total, factor) =>
        total + factor.score,
      0,
    )

  const possiblePoints =
    Object.values(factors).reduce(
      (total, factor) =>
        total + factor.maximum,
      0,
    )

  const confidence =
    possiblePoints
      ? scoredPoints /
        possiblePoints *
        100
      : 50

  const roundedConfidence =
    round(
      clamp(confidence, 0, 100),
      0,
    )

  const reasons = []

  if (
    factors.expectedGoals.score >=
    factors.expectedGoals.maximum * 0.7
  ) {
    reasons.push(
      factors.expectedGoals.explanation,
    )
  }

  if (
    factors.recentForm.score >=
    factors.recentForm.maximum * 0.68
  ) {
    reasons.push(
      `Goede recente vorm: ${factors.recentForm.explanation}`,
    )
  }

  if (
    factors.venueForm.score >=
    factors.venueForm.maximum * 0.68
  ) {
    reasons.push(
      `Sterke thuis- of uitvorm: ${factors.venueForm.explanation}`,
    )
  }

  if (
    factors.locationHistory.score >=
    factors.locationHistory.maximum * 0.65
  ) {
    reasons.push(
      `Gunstige historie op deze locatie: ${factors.locationHistory.explanation}`,
    )
  }

  if (
    factors.opponentDefense.score >=
    factors.opponentDefense.maximum * 0.65
  ) {
    reasons.push(
      factors.opponentDefense.explanation,
    )
  }

  if (!reasons.length) {
    reasons.push(
      'De beschikbare aanvalssignalen zijn gemengd.',
    )
  }

  return {
    confidence:
      roundedConfidence,

    stars:
      confidenceToStars(
        roundedConfidence,
      ),

    label:
      confidenceLabel(
        roundedConfidence,
      ),

    className:
      confidenceClass(
        roundedConfidence,
      ),

    factors,

    reasons:
      reasons.slice(0, 3),
  }
}

/* ==========================================================
   DEFENSIEVE CONFIDENCE
========================================================== */

export function buildDefenseConfidence({
  recentSummary,
  venueSummary,
  opponentSummary,
  cleanSheetChance,
}) {
  const recentDefenseScore =
    inverseRatioToScore(
      recentSummary?.averageGoalsAgainst,
      0.3,
      2.5,
      25,
    )

  const venueDefenseScore =
    inverseRatioToScore(
      venueSummary?.averageGoalsAgainst,
      0.3,
      2.5,
      20,
    )

  const cleanSheetScore =
    percentageToScore(
      cleanSheetChance,
      35,
    )

  const opponentAttackScore =
    inverseRatioToScore(
      opponentSummary?.averageGoalsFor,
      0.3,
      2.8,
      20,
    )

  const confidence =
    round(
      clamp(
        recentDefenseScore +
        venueDefenseScore +
        cleanSheetScore +
        opponentAttackScore,
        0,
        100,
      ),
      0,
    )
  const reasons = []

  if (cleanSheetChance >= 40) {
    reasons.push(
      `Goede clean-sheetkans van ${cleanSheetChance}%.`,
    )
  }

  if (
    Number(
      recentSummary?.averageGoalsAgainst,
    ) <= 1
  ) {
    reasons.push(
      `Recent gemiddeld ${Number(
        recentSummary.averageGoalsAgainst,
      ).toFixed(1)} tegendoelpunt per wedstrijd.`,
    )
  }

  if (
    Number(
      venueSummary?.averageGoalsAgainst,
    ) <= 1
  ) {
    reasons.push(
      `Op deze thuis- of uitlocatie gemiddeld ${Number(
        venueSummary.averageGoalsAgainst,
      ).toFixed(1)} tegendoelpunt.`,
    )
  }

  if (
    Number(
      opponentSummary?.averageGoalsFor,
    ) < 1.2
  ) {
    reasons.push(
      `De tegenstander scoort recent slechts ${Number(
        opponentSummary.averageGoalsFor,
      ).toFixed(1)} keer per duel.`,
    )
  }

  if (!reasons.length) {
    reasons.push(
      'De defensieve signalen zijn gemengd.',
    )
  }
  
  return {
    confidence,

    stars:
      confidenceToStars(confidence),

    label:
      confidenceLabel(confidence),

    className:
      confidenceClass(confidence),

    factors: {
      recentDefense: {
        score: round(
          recentDefenseScore,
          1,
        ),
        maximum: 25,
      },

      venueDefense: {
        score: round(
          venueDefenseScore,
          1,
        ),
        maximum: 20,
      },

      cleanSheet: {
        score: round(
          cleanSheetScore,
          1,
        ),
        maximum: 35,
      },

      opponentAttack: {
        score: round(
          opponentAttackScore,
          1,
        ),
        maximum: 20,
      },
      },

    reasons:
      reasons.slice(0, 3),
  }
}

/* ==========================================================
   MIDDENVELD EN KEEPER
========================================================== */

export function buildMidfieldConfidence(
  attackConfidence,
) {
  const confidence =
    round(
      clamp(
        attackConfidence.confidence *
          0.9,
        0,
        100,
      ),
      0,
    )

  return {
    ...attackConfidence,

    confidence,

    stars:
      confidenceToStars(confidence),

    label:
      confidenceLabel(confidence),

    className:
      confidenceClass(confidence),
  }
}

export function buildGoalkeeperConfidence(
  defenseConfidence,
  opponentSummary,
) {
  const savePotential =
    ratioToScore(
      opponentSummary?.averageGoalsFor,
      0.5,
      2.5,
      15,
    )

  const confidence =
    round(
      clamp(
        defenseConfidence.confidence *
          0.85 +
        savePotential,
        0,
        100,
      ),
      0,
    )

  return {
    ...defenseConfidence,

    confidence,

    stars:
      confidenceToStars(confidence),

    label:
      confidenceLabel(confidence),

    className:
      confidenceClass(confidence),

    savePotential:
      round(savePotential, 1),
  }
}
/* ==========================================================
   CENTRALE WEDSTRIJDCONFIDENCE
========================================================== */

function poissonZeroProbability(expectedGoals) {
  const goals = Math.max(
    Number(expectedGoals) || 0,
    0,
  )

  return Math.exp(-goals)
}

function calculateBothTeamsScoreChance(
  expectedHomeGoals,
  expectedAwayGoals,
) {
  const homeZero =
    poissonZeroProbability(
      expectedHomeGoals,
    )

  const awayZero =
    poissonZeroProbability(
      expectedAwayGoals,
    )

  const bothZero =
    Math.exp(
      -(
        (Number(expectedHomeGoals) || 0) +
        (Number(expectedAwayGoals) || 0)
      ),
    )

  const chance =
    (
      1 -
      homeZero -
      awayZero +
      bothZero
    ) * 100

  return round(
    clamp(chance, 0, 100),
    0,
  )
}

function calculateOver25Chance(
  expectedHomeGoals,
  expectedAwayGoals,
) {
  const expectedTotal =
    Math.max(
      (Number(expectedHomeGoals) || 0) +
      (Number(expectedAwayGoals) || 0),
      0,
    )

  /*
    Poisson:
    P(meer dan 2 goals) =
    1 - P(0) - P(1) - P(2)
  */

  const probabilityZero =
    Math.exp(-expectedTotal)

  const probabilityOne =
    probabilityZero *
    expectedTotal

  const probabilityTwo =
    probabilityZero *
    expectedTotal ** 2 /
    2

  const chance =
    (
      1 -
      probabilityZero -
      probabilityOne -
      probabilityTwo
    ) * 100

  return round(
    clamp(chance, 0, 100),
    0,
  )
}

function calculateModelConfidence({
  homeRecentSummary,
  awayRecentSummary,
  homeVenueSummary,
  awayVenueSummary,
  headToHeadSummary,
  locationHistorySummary,
}) {
  const availableMatches =
    Math.min(
      Number(homeRecentSummary?.played) || 0,
      5,
    ) +
    Math.min(
      Number(awayRecentSummary?.played) || 0,
      5,
    ) +
    Math.min(
      Number(homeVenueSummary?.played) || 0,
      10,
    ) +
    Math.min(
      Number(awayVenueSummary?.played) || 0,
      10,
    ) +
    Math.min(
      Number(headToHeadSummary?.matches) || 0,
      10,
    ) +
    Math.min(
      Number(locationHistorySummary?.matches) || 0,
      10,
    )

  const maximumMatches =
    5 + 5 + 10 + 10 + 10 + 10

  const dataCoverage =
    availableMatches /
    maximumMatches *
    100

  /*
    De betrouwbaarheid blijft bewust tussen 45 en 95.
    Een model is nooit 100% zeker.
  */

  return round(
    clamp(
      45 +
      dataCoverage * 0.5,
      45,
      95,
    ),
    0,
  )
}

function confidenceToRating(confidence) {
  return round(
    clamp(
      (Number(confidence) || 0) / 20,
      1,
      5,
    ),
    1,
  )
}

export function buildFixtureConfidence({
  homeRecentSummary,
  awayRecentSummary,

  homeVenueSummary,
  awayVenueSummary,

  homeHeadToHeadSummary,
  awayHeadToHeadSummary,

  homeLocationHistorySummary,
  awayLocationHistorySummary,

  expectedHomeGoals,
  expectedAwayGoals,
}) {
  const homeCleanSheetChance =
    calculateCleanSheetChance(
      homeVenueSummary,
      awayVenueSummary,
    )

  const awayCleanSheetChance =
    calculateCleanSheetChance(
      awayVenueSummary,
      homeVenueSummary,
    )

  const homeAttack =
    buildAttackConfidence({
      recentSummary:
        homeRecentSummary,

      venueSummary:
        homeVenueSummary,

      headToHeadSummary:
        homeHeadToHeadSummary,

      locationHistorySummary:
        homeLocationHistorySummary,

      expectedGoals:
        expectedHomeGoals,

      opponentSummary:
        awayVenueSummary,
    })

  const awayAttack =
    buildAttackConfidence({
      recentSummary:
        awayRecentSummary,

      venueSummary:
        awayVenueSummary,

      headToHeadSummary:
        awayHeadToHeadSummary,

      locationHistorySummary:
        awayLocationHistorySummary,

      expectedGoals:
        expectedAwayGoals,

      opponentSummary:
        homeVenueSummary,
    })

  const homeDefense =
    buildDefenseConfidence({
      recentSummary:
        homeRecentSummary,

      venueSummary:
        homeVenueSummary,

      opponentSummary:
        awayRecentSummary,

      cleanSheetChance:
        homeCleanSheetChance,
    })

  const awayDefense =
    buildDefenseConfidence({
      recentSummary:
        awayRecentSummary,

      venueSummary:
        awayVenueSummary,

      opponentSummary:
        homeRecentSummary,

      cleanSheetChance:
        awayCleanSheetChance,
    })

  const homeMidfield =
    buildMidfieldConfidence(
      homeAttack,
    )

  const awayMidfield =
    buildMidfieldConfidence(
      awayAttack,
    )

  const homeGoalkeeper =
    buildGoalkeeperConfidence(
      homeDefense,
      awayRecentSummary,
    )

  const awayGoalkeeper =
    buildGoalkeeperConfidence(
      awayDefense,
      homeRecentSummary,
    )

  const expectedTotalGoals =
    round(
      (Number(expectedHomeGoals) || 0) +
      (Number(expectedAwayGoals) || 0),
      1,
    )

  const bothTeamsScoreChance =
    calculateBothTeamsScoreChance(
      expectedHomeGoals,
      expectedAwayGoals,
    )

  const over25Chance =
    calculateOver25Chance(
      expectedHomeGoals,
      expectedAwayGoals,
    )

  const modelConfidence =
    calculateModelConfidence({
      homeRecentSummary,
      awayRecentSummary,
      homeVenueSummary,
      awayVenueSummary,

      headToHeadSummary:
        homeHeadToHeadSummary,

      locationHistorySummary:
        homeLocationHistorySummary,
    })

  return {
    expectedGoals: {
      home:
        round(
          Number(expectedHomeGoals) || 0,
          1,
        ),

      away:
        round(
          Number(expectedAwayGoals) || 0,
          1,
        ),

      total:
        expectedTotalGoals,
    },

    cleanSheet: {
      home:
        homeCleanSheetChance,

      away:
        awayCleanSheetChance,
    },

    bothTeamsScoreChance,
    over25Chance,
    modelConfidence,

    home: {
      attack:
        homeAttack,

      midfield:
        homeMidfield,

      defense:
        homeDefense,

      goalkeeper:
        homeGoalkeeper,
    },

    away: {
      attack:
        awayAttack,

      midfield:
        awayMidfield,

      defense:
        awayDefense,

      goalkeeper:
        awayGoalkeeper,
    },

    /*
      Deze numerieke ratings houden de huidige interface werkend.
      De echte confidence-percentages blijven hierboven beschikbaar.
    */

    homeRatings: {
      attack:
        confidenceToRating(
          homeAttack.confidence,
        ),

      midfield:
        confidenceToRating(
          homeMidfield.confidence,
        ),

      defense:
        confidenceToRating(
          homeDefense.confidence,
        ),

      goalkeeper:
        confidenceToRating(
          homeGoalkeeper.confidence,
        ),
    },

    awayRatings: {
      attack:
        confidenceToRating(
          awayAttack.confidence,
        ),

      midfield:
        confidenceToRating(
          awayMidfield.confidence,
        ),

      defense:
        confidenceToRating(
          awayDefense.confidence,
        ),

      goalkeeper:
        confidenceToRating(
          awayGoalkeeper.confidence,
        ),
    },
  }
}