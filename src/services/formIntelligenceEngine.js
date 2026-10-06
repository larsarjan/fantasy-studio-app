/*
|==============================================================================
| FVT FORM INTELLIGENCE ENGINE
|==============================================================================
|
| Doel
| ----
| De actuele fantasyvorm van een speler beoordelen op basis van de laatste
| vijf geregistreerde speelronden.
|
| Hoofdweging
| ------------
| - Continuïteit: 60%
| - Prestaties:   40%
|
| Belangrijk
| -----------
| We kijken bewust naar de laatste vijf speelronden en niet alleen naar de
| laatste vijf wedstrijden waarin de speler minuten maakte.
|
| Daardoor tellen ook mee:
| - bankbeurten;
| - buiten de selectie;
| - blessures;
| - schorsingen;
| - andere gemiste speelronden.
|
| Begin seizoen
| -------------
| Wanneer nog geen afgeronde speelronde beschikbaar is:
| - interne score: 5,0;
| - hasData: false;
| - zichtbaar label: "Nog geen data".
|
*/

/*
|------------------------------------------------------------------------------
| Instellingen
|------------------------------------------------------------------------------
*/

const DEFAULT_FORM_ROUND_COUNT =
  5

const NEUTRAL_FORM_SCORE =
  5

/*
 * Oudste → nieuwste speelronde.
 *
 * De meest recente speelronde weegt
 * zwaarder dan de oudste.
 */
const RECENCY_WEIGHTS = [
  0.10,
  0.15,
  0.20,
  0.25,
  0.30,
]

/*
 * Hoe zwaar de actuele vormberekening
 * al mag meetellen.
 *
 * De rest van de score blijft tijdelijk
 * richting de neutrale 5,0 getrokken.
 */
const FORM_MATURITY_WEIGHTS = {
  0: 0,
  1: 0.30,
  2: 0.50,
  3: 0.70,
  4: 0.85,
  5: 1,
}

/*
|------------------------------------------------------------------------------
| Algemene helpers
|------------------------------------------------------------------------------
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

function roundToOne(value) {
  return Math.round(
    (
      Number(value) +
      Number.EPSILON
    ) *
    10,
  ) / 10
}

function cleanText(value) {
  return String(value ?? '')
    .trim()
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
}

/*
|------------------------------------------------------------------------------
| Wedstrijdgegevens
|------------------------------------------------------------------------------
*/

function getRecentMatchSource(player) {
  const matches =
    player?.profile
      ?.match
      ?.recenteWedstrijden ??
    player?.profile
      ?.match
      ?.recentMatches ??
    player?.recentMatches ??
    player?.matchProfile
      ?.recenteWedstrijden ??
    player?.matchProfile
      ?.recentMatches ??
    []

  return Array.isArray(matches)
    ? matches
    : []
}

function getRecentRounds(
  player,
  roundCount =
    DEFAULT_FORM_ROUND_COUNT,
) {
  const normalizedCount =
    Math.max(
      1,
      Number(roundCount) ||
      DEFAULT_FORM_ROUND_COUNT,
    )

  return getRecentMatchSource(
    player,
  ).slice(
    -normalizedCount,
  )
}

function getRoundNumber(match) {
  const possibleValues = [
    match?.fixture?.round,
    match?.fixture?.gameweek,
    match?.fixture?.matchday,
    match?.round,
    match?.gameweek,
    match?.matchday,
  ]

  for (
    const value of
    possibleValues
  ) {
    const number =
      toNumber(value)

    if (number !== null) {
      return number
    }
  }

  return null
}

function getOpponent(match) {
  return cleanText(
    match?.fixture?.opponent ??
    match?.opponent ??
    match?.opponentName ??
    '',
  )
}

function getVenue(match) {
  const venue =
    normalizeText(
      match?.fixture?.venue ??
      match?.venue,
    )

  if (
    venue === 'home' ||
    venue === 'thuis'
  ) {
    return 'home'
  }

  if (
    venue === 'away' ||
    venue === 'uit'
  ) {
    return 'away'
  }

  return 'unknown'
}

function getFantasyPoints(match) {
  return (
    toNumber(
      match?.punten?.totaal,
    ) ??
    toNumber(
      match?.fantasyPoints,
    ) ??
    toNumber(
      match?.points,
    ) ??
    0
  )
}

function getMinutes(match) {
  return Math.max(
    0,
    toNumber(
      match?.minutes,
    ) ?? 0,
  )
}

function hasPlayed(match) {
  return (
    match?.played === true ||
    getMinutes(match) > 0
  )
}

function hasStarted(match) {
  return (
    match?.started === true ||
    normalizeText(
      match?.status,
    ) === 'starter'
  )
}

function hasSubstituted(match) {
  return (
    match?.substituted === true ||
    normalizeText(
      match?.status,
    ) === 'substitute' ||
    normalizeText(
      match?.status,
    ) === 'sub'
  )
}

/*
|------------------------------------------------------------------------------
| Continuïteit per speelronde
|------------------------------------------------------------------------------
|
| Continuïteit kijkt naar:
|
| - aanwezigheid;
| - basisplaats of invalbeurt;
| - aantal minuten;
| - recentheid.
|
| De recentheid wordt later via de
| RECENCY_WEIGHTS toegepast.
|
*/

function calculateRoundContinuity(
  match,
) {
  const minutes =
    getMinutes(match)

  /*
   * Niet gespeeld is voor actuele vorm
   * relevante negatieve informatie.
   */
  if (!hasPlayed(match)) {
    return {
      score:
        0,

      status:
        'not-played',

      explanation:
        'Niet gespeeld.',
    }
  }

  /*
   * Basisplaats:
   *
   * 1 minuut  → ongeveer 5,0
   * 60 minuten → ongeveer 8,3
   * 90 minuten → 10,0
   */
  if (hasStarted(match)) {
    const score =
      clamp(
        5 +
        (
          Math.min(
            minutes,
            90,
          ) /
          90
        ) *
        5,
      )

    return {
      score:
        roundToOne(score),

      status:
        'started',

      explanation:
        `${minutes} minuten als basisspeler.`,
    }
  }

  /*
   * Invalbeurt:
   *
   * Korte invalbeurt telt positief mee,
   * maar duidelijk minder dan een basisplaats.
   *
   * 1 minuut  → ongeveer 2,6
   * 20 minuten → ongeveer 4,1
   * 45 minuten → 6,0
   */
  if (
    hasSubstituted(match) ||
    minutes > 0
  ) {
    const score =
      clamp(
        2.5 +
        (
          Math.min(
            minutes,
            45,
          ) /
          45
        ) *
        3.5,
      )

    return {
      score:
        roundToOne(score),

      status:
        'substitute',

      explanation:
        `${minutes} minuten als invaller.`,
    }
  }

  return {
    score:
      0,

    status:
      'not-played',

    explanation:
      'Niet gespeeld.',
  }
}

/*
|------------------------------------------------------------------------------
| Prestaties per speelronde
|------------------------------------------------------------------------------
|
| Fantasypunten vormen hier de basis.
|
| De punten bevatten al:
| - speelminuten;
| - goals;
| - assists;
| - clean sheets;
| - reddingen;
| - OPTA-bonus;
| - kaarten;
| - eigen doelpunten;
| - overige minpunten.
|
| Daardoor hoeven we deze onderdelen
| niet opnieuw afzonderlijk te wegen.
|
*/

function convertFantasyPointsToScore(
  fantasyPoints,
) {
  const points =
    Number(fantasyPoints) || 0

  /*
   * Transparante voorlopige schaal:
   *
   * -2 punten → 0,0
   *  0 punten → 1,5
   *  2 punten → 3,5
   *  4 punten → 5,5
   *  6 punten → 7,0
   *  8 punten → 8,5
   * 10+        → 10,0
   *
   * Hiermee is een normale verschijning niet
   * direct een hoge prestatiescore, terwijl
   * echt sterke fantasyduels worden beloond.
   */

  if (points <= -2) {
    return 0
  }

  if (points <= 0) {
    return clamp(
      1.5 +
      (
        points /
        2
      ) *
      1.5,
    )
  }

  if (points <= 2) {
    return (
      1.5 +
      (
        points /
        2
      ) *
      2
    )
  }

  if (points <= 4) {
    return (
      3.5 +
      (
        (
          points -
          2
        ) /
        2
      ) *
      2
    )
  }

  if (points <= 6) {
    return (
      5.5 +
      (
        (
          points -
          4
        ) /
        2
      ) *
      1.5
    )
  }

  if (points <= 8) {
    return (
      7 +
      (
        (
          points -
          6
        ) /
        2
      ) *
      1.5
    )
  }

  if (points <= 10) {
    return (
      8.5 +
      (
        (
          points -
          8
        ) /
        2
      ) *
      1.5
    )
  }

  return 10
}

function calculateRoundPerformance(
  match,
) {
  if (!hasPlayed(match)) {
    return {
      score:
        0,

      fantasyPoints:
        0,

      explanation:
        'Geen wedstrijdprestatie.',
    }
  }

  const fantasyPoints =
    getFantasyPoints(match)

  const score =
    clamp(
      convertFantasyPointsToScore(
        fantasyPoints,
      ),
    )

  return {
    score:
      roundToOne(score),

    fantasyPoints,

    explanation:
      `${fantasyPoints} fantasypunt${
        fantasyPoints === 1
          ? ''
          : 'en'
      }.`,
  }
}

/*
|------------------------------------------------------------------------------
| Gewogen gemiddelde
|------------------------------------------------------------------------------
*/

function getWeightsForLength(
  length,
) {
  if (length <= 0) {
    return []
  }

  return RECENCY_WEIGHTS.slice(
    -Math.min(
      length,
      RECENCY_WEIGHTS.length,
    ),
  )
}

/*
|------------------------------------------------------------------------------
| Datavolwassenheid
|------------------------------------------------------------------------------
*/

function getFormMaturityWeight(
  roundCount,
) {
  const normalizedRoundCount =
    Math.max(
      0,
      Math.floor(
        Number(roundCount) || 0,
      ),
    )

  if (normalizedRoundCount >= 5) {
    return 1
  }

  return (
    FORM_MATURITY_WEIGHTS[
      normalizedRoundCount
    ] ?? 0
  )
}

function dampFormScoreToNeutral(
  rawScore,
  maturityWeight,
) {
  return (
    NEUTRAL_FORM_SCORE *
      (
        1 -
        maturityWeight
      ) +
    rawScore *
      maturityWeight
  )
}

function calculateWeightedAverage(
  values,
) {
  if (
    !Array.isArray(values) ||
    values.length === 0
  ) {
    return 0
  }

  const weights =
    getWeightsForLength(
      values.length,
    )

  const totalWeight =
    weights.reduce(
      (
        total,
        weight,
      ) =>
        total +
        weight,
      0,
    )

  if (totalWeight <= 0) {
    return 0
  }

  const weightedTotal =
    values.reduce(
      (
        total,
        value,
        index,
      ) =>
        total +
        (
          Number(value) || 0
        ) *
        weights[index],
      0,
    )

  return (
    weightedTotal /
    totalWeight
  )
}

/*
|------------------------------------------------------------------------------
| Trend
|------------------------------------------------------------------------------
|
| We vergelijken de eerste speelronden in het
| venster met de laatste speelronden.
|
| Trend verandert de vormscore voorlopig niet.
| Hij is uitsluitend beschrijvend.
|
*/

function getCombinedRoundScore(
  round,
) {
  return (
    round.continuity.score *
      0.60 +
    round.performance.score *
      0.40
  )
}

function calculateTrend(
  rounds,
) {
  if (
    !Array.isArray(rounds) ||
    rounds.length < 3
  ) {
    return {
      direction:
        'unknown',

      label:
        'Nog onvoldoende data',

      difference:
        0,
    }
  }

  const combinedScores =
    rounds.map(
      getCombinedRoundScore,
    )

  const splitIndex =
    Math.ceil(
      combinedScores.length /
      2,
    )

  const earlier =
    combinedScores.slice(
      0,
      splitIndex,
    )

  const recent =
    combinedScores.slice(
      splitIndex,
    )

  const average = (
    values,
  ) => {
    if (!values.length) {
      return 0
    }

    return (
      values.reduce(
        (
          total,
          value,
        ) =>
          total +
          value,
        0,
      ) /
      values.length
    )
  }

  const difference =
    average(recent) -
    average(earlier)

  if (difference >= 2) {
    return {
      direction:
        'strong-up',

      label:
        'Sterk stijgende vorm',

      difference:
        roundToOne(
          difference,
        ),
    }
  }

  if (difference >= 0.75) {
    return {
      direction:
        'up',

      label:
        'Stijgende vorm',

      difference:
        roundToOne(
          difference,
        ),
    }
  }

  if (difference <= -2) {
    return {
      direction:
        'strong-down',

      label:
        'Sterk dalende vorm',

      difference:
        roundToOne(
          difference,
        ),
    }
  }

  if (difference <= -0.75) {
    return {
      direction:
        'down',

      label:
        'Dalende vorm',

      difference:
        roundToOne(
          difference,
        ),
    }
  }

  return {
    direction:
      'stable',

    label:
      'Stabiele vorm',

    difference:
      roundToOne(
        difference,
      ),
  }
}

/*
|------------------------------------------------------------------------------
| Databetrouwbaarheid
|------------------------------------------------------------------------------
|
| De betrouwbaarheid wordt hoger naarmate:
| - meer speelronden beschikbaar zijn;
| - de speler daadwerkelijk minuten maakte.
|
*/

function calculateConfidence(
  rounds,
) {
  const totalRounds =
    Array.isArray(rounds)
      ? rounds.length
      : 0

  const playedRounds =
    Array.isArray(rounds)
      ? rounds.filter(
          (round) =>
            round.played,
        ).length
      : 0

  if (totalRounds === 0) {
    return {
      score:
        0,

      level:
        'none',

      label:
        'Nog geen data',
    }
  }

  const coverageScore =
    (
      Math.min(
        totalRounds,
        DEFAULT_FORM_ROUND_COUNT,
      ) /
      DEFAULT_FORM_ROUND_COUNT
    ) *
    60

  const appearanceScore =
    (
      playedRounds /
      totalRounds
    ) *
    40

  const score =
    Math.round(
      Math.max(
        0,
        Math.min(
          100,
          coverageScore +
          appearanceScore,
        ),
      ),
    )

  if (score >= 85) {
    return {
      score,
      level:
        'high',

      label:
        'Hoog',
    }
  }

  if (score >= 60) {
    return {
      score,
      level:
        'medium',

      label:
        'Gemiddeld',
    }
  }

  return {
    score,
    level:
      'low',

    label:
      'Laag',
  }
}

/*
|------------------------------------------------------------------------------
| Labels
|------------------------------------------------------------------------------
*/

function getFormLabel(
  score,
  hasData,
) {
  if (!hasData) {
    return 'Nog geen data'
  }

  if (score >= 8.5) {
    return 'Uitstekende vorm'
  }

  if (score >= 7) {
    return 'Goede vorm'
  }

  if (score >= 5.5) {
    return 'Redelijke vorm'
  }

  if (score >= 4) {
    return 'Matige vorm'
  }

  if (score >= 2.5) {
    return 'Slechte vorm'
  }

  return 'Zeer slechte vorm'
}

/*
|------------------------------------------------------------------------------
| Uitleg
|------------------------------------------------------------------------------
*/

function buildExplanation({
  hasData,
  rounds,
  continuityScore,
  performanceScore,
  trend,
  maturityWeight,
}) {
  if (!hasData) {
    return [
      'Er zijn nog geen afgeronde speelronden beschikbaar.',
      'De vormpijler krijgt daarom nog geen beoordeling.',
    ]
  }

  const totalRounds =
    rounds.length

  const playedRounds =
    rounds.filter(
      (round) =>
        round.played,
    ).length

  const startedRounds =
    rounds.filter(
      (round) =>
        round.started,
    ).length

  const totalMinutes =
    rounds.reduce(
      (
        total,
        round,
      ) =>
        total +
        round.minutes,
      0,
    )

  const totalPoints =
    rounds.reduce(
      (
        total,
        round,
      ) =>
        total +
        round.fantasyPoints,
      0,
    )

  const explanation = [
    `${playedRounds} van de laatste ${totalRounds} speelronden gespeeld.`,
    `${startedRounds} basisplaats${
      startedRounds === 1
        ? ''
        : 'en'
    } en ${totalMinutes} minuten.`,
    `${totalPoints} fantasypunt${
      totalPoints === 1
        ? ''
        : 'en'
    } over deze periode.`,
    `Continuïteit ${roundToOne(
      continuityScore,
    )}; prestaties ${roundToOne(
      performanceScore,
    )}.`,
  ]

if (maturityWeight < 1) {
  explanation.push(
    `Door de beperkte hoeveelheid data telt de actuele vormberekening voorlopig voor ${Math.round(
      maturityWeight *
        100,
    )}% mee.`,
  )
}

  if (
    trend.direction !==
    'unknown'
  ) {
    explanation.push(
      trend.label + '.',
    )
  }

  return explanation
}

/*
|------------------------------------------------------------------------------
| Handmatige override
|------------------------------------------------------------------------------
*/

function createManualResult(
  score,
  source,
) {
  const normalizedScore =
    roundToOne(
      clamp(score),
    )

  return {
    /*
     * Interne rekenscore.
     */
    score:
      normalizedScore,

    /*
     * Score die zichtbaar mag worden
     * in het spelersprofiel.
     */
    displayScore:
      normalizedScore,

    hasData:
      true,

    source,

    label:
      getFormLabel(
        normalizedScore,
        true,
      ),

    continuityScore:
      null,

    performanceScore:
      null,

    weights: {
      continuity:
        0.60,

      performance:
        0.40,
    },

    roundCount:
      0,

    playedRoundCount:
      0,

    trend: {
      direction:
        'unknown',

      label:
        'Niet automatisch bepaald',

      difference:
        0,
    },

    confidence: {
      score:
        100,

      level:
        'manual',

      label:
        'Handmatig',
    },

    explanation: [
      'De vormscore is handmatig ingesteld.',
    ],

    rounds:
      [],
  }
}

/*
|------------------------------------------------------------------------------
| Hoofdfunctie
|------------------------------------------------------------------------------
*/

export function calculatePlayerForm({
  player,
  manualScore = null,
  roundCount =
    DEFAULT_FORM_ROUND_COUNT,
} = {}) {
  /*
   * Expliciete handmatige override.
   */
  const normalizedManualScore =
    toNumber(
      manualScore,
    )

  if (
    normalizedManualScore !==
    null
  ) {
    return createManualResult(
      normalizedManualScore,
      'manual',
    )
  }

  const recentMatches =
    getRecentRounds(
      player,
      roundCount,
    )

  /*
   * Geen geregistreerde speelronden:
   * neutraal rekenen, maar geen data tonen.
   */
  if (
  recentMatches.length === 0 ||
  !recentMatches.some(
    (match) =>
      hasPlayed(
        match,
      ),
  )
) {
  return {
    /*
     * Interne neutrale rekenscore.
     * Deze wordt later niet zichtbaar getoond.
     */
    score:
      NEUTRAL_FORM_SCORE,

    /*
     * Geen zichtbare score zolang er
     * geen wedstrijden zijn gespeeld.
     */
    displayScore:
      null,

    hasData:
      false,

    source:
      'neutral-fallback',

    label:
      'Nog geen data',

    continuityScore:
      null,

    performanceScore:
      null,

    weights: {
      continuity:
        0.60,

      performance:
        0.40,
    },

    roundCount:
      0,

    playedRoundCount:
      0,

    trend: {
      direction:
        'unknown',

      label:
        'Nog geen data',

      difference:
        0,
    },

    confidence: {
      score:
        0,

      level:
        'none',

      label:
        'Nog geen data',
    },

    explanation: [
      'Er zijn nog geen afgeronde speelronden beschikbaar.',
      'De vormpijler krijgt daarom nog geen beoordeling.',
    ],

    rounds:
      [],
  }
}

  const rounds =
    recentMatches.map(
      (
        match,
        index,
      ) => {
        const continuity =
          calculateRoundContinuity(
            match,
          )

        const performance =
          calculateRoundPerformance(
            match,
          )

        const fantasyPoints =
          getFantasyPoints(
            match,
          )

        const minutes =
          getMinutes(
            match,
          )

        return {
          index:
            index + 1,

          round:
            getRoundNumber(
              match,
            ),

          opponent:
            getOpponent(
              match,
            ),

          venue:
            getVenue(
              match,
            ),

          played:
            hasPlayed(
              match,
            ),

          started:
            hasStarted(
              match,
            ),

          substituted:
            hasSubstituted(
              match,
            ),

          status:
            cleanText(
              match?.status,
            ),

          minutes,

          fantasyPoints,

          continuity,

          performance,

          combinedScore:
            roundToOne(
              continuity.score *
                0.60 +
              performance.score *
                0.40,
            ),

          raw:
            match,
        }
      },
    )

  const playedRounds =
    rounds.filter(
      (round) =>
        round.played,
    )

  const continuityScore =
    clamp(
      calculateWeightedAverage(
        rounds.map(
          (round) =>
            round
              .continuity
              .score,
        ),
      ),
    )

  const performanceScore =
    clamp(
      calculateWeightedAverage(
        rounds.map(
          (round) =>
            round
              .performance
              .score,
        ),
      ),
    )

  /*
 * Eerst berekenen we de zuivere vormscore
 * op basis van continuïteit en prestaties.
 */
const rawScore =
  clamp(
    continuityScore *
      0.60 +
    performanceScore *
      0.40,
  )

/*
 * Daarna dempen we de score zolang nog
 * geen vijf speelronden beschikbaar zijn.
 */
const maturityWeight =
  getFormMaturityWeight(
    rounds.length,
  )

const score =
  clamp(
    dampFormScoreToNeutral(
      rawScore,
      maturityWeight,
    ),
  )

  const trend =
    calculateTrend(
      rounds,
    )

  const confidence =
    calculateConfidence(
      rounds,
    )

  const explanation =
  buildExplanation({
    hasData:
      true,

    rounds,

    continuityScore,

    performanceScore,

    trend,

    maturityWeight,
  })

return {
  /*
   * De gedempte score die meetelt in de
   * FVT Fantasy Score.
   */
  score:
    roundToOne(
      score,
    ),

 /*
   * Omdat er actuele vormdata bestaat,
   * mag dezelfde score zichtbaar worden.
   */
  displayScore:
    roundToOne(
      score,
    ),

  /*
   * De zuivere score vóór de correctie
   * voor beperkte data.
   */
  rawScore:
    roundToOne(
      rawScore,
    ),

  maturityWeight:
    roundToOne(
      maturityWeight,
    ),

  hasData:
    true,

    source:
      'form-intelligence',

    label:
      getFormLabel(
        score,
        true,
      ),

    continuityScore:
      roundToOne(
        continuityScore,
      ),

    performanceScore:
      roundToOne(
        performanceScore,
      ),

    weights: {
      continuity:
        0.60,

      performance:
        0.40,
    },

    roundCount:
      rounds.length,

    playedRoundCount:
      playedRounds.length,

    trend,

    confidence,

    explanation,

    rounds,
  }
}