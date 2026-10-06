/*
|--------------------------------------------------------------------------
| Expected Points - Calculation
|--------------------------------------------------------------------------
|
| Deze module zet bestaande Fantasy Studio-intelligence
| om naar verwachte Fantasy-punten.
|
| Verantwoordelijkheden:
|
| - historische productie schalen naar verwachte minuten;
| - fixturemodifiers toepassen;
| - een beperkte vormcorrectie toepassen;
| - gebeurtenissen omzetten naar punten via Game Rules;
| - een volledige puntenbreakdown teruggeven.
|
| Deze module:
|
| - bepaalt geen officiële spelregels;
| - berekent geen wedstrijdmoeilijkheid;
| - berekent geen historische statistieken;
| - berekent geen Fantasy Outlook;
| - vergelijkt en selecteert geen spelers.
|
*/

import {
  FANTASY_SCORING_RULES,
  normalizeFantasyPosition,
} from '../fantasyGameRulesEngine.js'

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
  digits = 2,
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

function divide(
  numerator,
  denominator,
) {
  const safeDenominator =
    toNumber(
      denominator,
    )

  if (
    safeDenominator <= 0
  ) {
    return 0
  }

  return (
    toNumber(
      numerator,
    ) /
    safeDenominator
  )
}

/*
|--------------------------------------------------------------------------
| Positie
|--------------------------------------------------------------------------
*/

function resolvePosition(
  playerData,
) {
  const normalized =
    normalizeFantasyPosition(
      playerData
        ?.fantasyPosition ??
      playerData
        ?.position,
    )

  if (
    normalized !==
    'unknown'
  ) {
    return {
      position:
        normalized,

      usedFallback:
        false,
    }
  }

  /*
   * Tijdelijke veilige terugval voor
   * testdata zonder positie.
   *
   * Echte spelers horen altijd een
   * herkende Fantasy-positie te hebben.
   */
  return {
    position:
      'midfielder',

    usedFallback:
      true,
  }
}

/*
|--------------------------------------------------------------------------
| Speelprofiel
|--------------------------------------------------------------------------
|
| expectedMinutes:
| het verwachte aantal minuten wanneer de speler speelt.
|
| playingChance:
| de kans dat de speler daadwerkelijk minuten maakt.
|
| effectiveMinutes:
| expectedMinutes × playingChance.
|
*/

function resolvePlayingChance(
  playerData,
) {
  const source =
    playerData
      ?.playingChance ??
    playerData
      ?.chanceOfPlaying ??
    playerData
      ?.scoutProfile
      ?.chanceOfPlaying ??
    100

  return (
    clamp(
      source,
      0,
      100,
    ) /
    100
  )
}

function resolveConditionalMinutes(
  playerData,
) {
  const minutes =
    playerData
      ?.expectedMinutes ??
    playerData
      ?.scoutProfile
      ?.expectedMinutes ??
    0

  return clamp(
    minutes,
    0,
    90,
  )
}

function buildPlayingProfile(
  playerData,
) {
  const appearanceProbability =
    resolvePlayingChance(
      playerData,
    )

  const conditionalMinutes =
    resolveConditionalMinutes(
      playerData,
    )

  const effectiveMinutes =
    conditionalMinutes *
    appearanceProbability

  /*
   * Geschatte kans dat de speler de grens
   * van 60 minuten bereikt.
   *
   * Bij 90 verwachte minuten en 50% speelkans:
   * 50% kans op clean-sheetgerechtigdheid.
   *
   * Bij 45 verwachte minuten en 100% speelkans:
   * 75% geschatte kans.
   */
  const sixtyMinuteProbability =
    appearanceProbability *
    clamp(
      divide(
        conditionalMinutes,
        60,
      ),
      0,
      1,
    )

  return {
    appearanceProbability:
      round(
        appearanceProbability,
        4,
      ),

    conditionalMinutes:
      round(
        conditionalMinutes,
        1,
      ),

    effectiveMinutes:
      round(
        effectiveMinutes,
        1,
      ),

    minuteFactor:
      divide(
        effectiveMinutes,
        90,
      ),

    sixtyMinuteProbability:
      round(
        sixtyMinuteProbability,
        4,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Fixturemodifiers
|--------------------------------------------------------------------------
*/

function getFixtureModifier(
  fixture,
  key,
) {
  return clamp(
    fixture
      ?.modifiers
      ?.[key] ??
    1,
    0.5,
    1.5,
  )
}

/*
|--------------------------------------------------------------------------
| Outlook-correctie
|--------------------------------------------------------------------------
|
| Fantasy Outlook bevat meerdere pijlers.
|
| Niet alle pijlers mogen Expected Points
| rechtstreeks beïnvloeden:
|
| - programma zit al in Fixture Intelligence;
| - availability zit al in minuten en speelkans;
| - value verandert de puntenproductie niet;
| - risk hoort vooral bij confidence en spreiding.
|
| Alleen actuele vorm wordt daarom als kleine
| productiecorrectie gebruikt.
|
*/

function resolveFormScore(
  outlook,
) {
  const directFormScore =
    outlook
      ?.form
      ?.score ??
    outlook
      ?.scores
      ?.form

  if (
    Number.isFinite(
      Number(
        directFormScore,
      ),
    )
  ) {
    return {
      score:
        clamp(
          directFormScore,
          0,
          10,
        ),

      neutralScore:
        5,

      source:
        'form',
    }
  }

  /*
   * Compatibiliteit met de eerste tests,
   * waarin alleen outlook.score werd gebruikt.
   *
   * De neutrale totaalscore was daar 7.
   */
  if (
    Number.isFinite(
      Number(
        outlook?.score,
      ),
    )
  ) {
    return {
      score:
        clamp(
          outlook.score,
          0,
          10,
        ),

      neutralScore:
        7,

      source:
        'legacy-outlook-score',
    }
  }

  return {
    score:
      5,

    neutralScore:
      5,

    source:
      'neutral',
  }
}

function calculateFormModifier(
  outlook,
) {
  const form =
    resolveFormScore(
      outlook,
    )

  /*
   * Iedere punt boven of onder neutraal
   * verandert de productie met 4%.
   *
   * De totale correctie blijft begrensd
   * tussen -20% en +20%.
   */
  const modifier =
    1 +
    (
      form.score -
      form.neutralScore
    ) *
      0.04

  return {
    value:
      round(
        clamp(
          modifier,
          0.80,
          1.20,
        ),
        4,
      ),

    score:
      round(
        form.score,
        1,
      ),

    neutralScore:
      form.neutralScore,

    source:
      form.source,
  }
}

/*
|--------------------------------------------------------------------------
| Appearancepunten
|--------------------------------------------------------------------------
*/

function calculateAppearancePoints(
  playingProfile,
) {
  const {
    appearanceProbability,
    conditionalMinutes,
  } =
    playingProfile

  if (
    appearanceProbability <= 0 ||
    conditionalMinutes <= 0
  ) {
    return 0
  }

  const pointsWhenPlaying =
    conditionalMinutes >= 60
      ? FANTASY_SCORING_RULES
          .appearance
          .sixtyMinutesOrMore
      : FANTASY_SCORING_RULES
          .appearance
          .upTo59Minutes

  return round(
    pointsWhenPlaying *
    appearanceProbability,
  )
}

/*
|--------------------------------------------------------------------------
| Verwachte gebeurtenissen
|--------------------------------------------------------------------------
*/

function buildExpectedEvents({
  history,
  fixture,
  playingProfile,
  formModifier,
}) {
  const overall =
    history?.overall ?? {}

  const minuteFactor =
    playingProfile
      .minuteFactor

  const appearanceProbability =
    playingProfile
      .appearanceProbability

  const sixtyMinuteProbability =
    playingProfile
      .sixtyMinuteProbability

  if (
    playingProfile
      .effectiveMinutes <= 0
  ) {
    return {
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      saves: 0,
      penaltySaves: 0,
      bonus: 0,
      yellowCards: 0,
      redCards: 0,
      ownGoals: 0,
      penaltiesMissed: 0,
      goalsConceded: 0,
    }
  }

  return {
    goals:
      round(
        toNumber(
          overall.goalsPer90,
        ) *
        minuteFactor *
        getFixtureModifier(
          fixture,
          'goals',
        ) *
        formModifier.value,
        4,
      ),

    assists:
      round(
        toNumber(
          overall.assistsPer90,
        ) *
        minuteFactor *
        getFixtureModifier(
          fixture,
          'assists',
        ) *
        formModifier.value,
        4,
      ),

    /*
     * Clean sheets worden per optreden
     * gemeten en vereisen minimaal ongeveer
     * zestig minuten speeltijd.
     */
    cleanSheets:
      round(
        toNumber(
          overall.cleanSheetRate,
        ) *
        sixtyMinuteProbability *
        getFixtureModifier(
          fixture,
          'cleanSheet',
        ) *
        formModifier.value,
        4,
      ),

    saves:
      round(
        toNumber(
          overall.savesPer90,
        ) *
        minuteFactor *
        getFixtureModifier(
          fixture,
          'saves',
        ) *
        formModifier.value,
        4,
      ),

    penaltySaves:
      round(
        toNumber(
          overall.penaltySavesPer90,
        ) *
        minuteFactor *
        getFixtureModifier(
          fixture,
          'penaltySaves',
        ) *
        formModifier.value,
        4,
      ),

    /*
     * OPTA-bonus is historisch per gespeeld
     * duel beschikbaar.
     */
    bonus:
      round(
        toNumber(
          overall.bonusPerMatch,
        ) *
        appearanceProbability *
        getFixtureModifier(
          fixture,
          'bonus',
        ) *
        formModifier.value,
        4,
      ),

    yellowCards:
      round(
        toNumber(
          overall.yellowCardsPer90,
        ) *
        minuteFactor *
        getFixtureModifier(
          fixture,
          'cards',
        ),
        4,
      ),

    redCards:
      round(
        toNumber(
          overall.redCardsPer90,
        ) *
        minuteFactor *
        getFixtureModifier(
          fixture,
          'cards',
        ),
        4,
      ),

    ownGoals:
      round(
        toNumber(
          overall.ownGoalsPer90,
        ) *
        minuteFactor *
        getFixtureModifier(
          fixture,
          'ownGoals',
        ),
        4,
      ),

    penaltiesMissed:
      round(
        toNumber(
          overall.penaltiesMissedPer90,
        ) *
        minuteFactor *
        getFixtureModifier(
          fixture,
          'penaltiesMissed',
        ),
        4,
      ),

    goalsConceded:
      round(
        toNumber(
          overall.goalsConcededPer90,
        ) *
        minuteFactor *
        getFixtureModifier(
          fixture,
          'goalsConceded',
        ),
        4,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Punten per gebeurtenis
|--------------------------------------------------------------------------
*/

function calculateGoalPoints({
  events,
  position,
}) {
  return round(
    events.goals *
    toNumber(
      FANTASY_SCORING_RULES
        .goals
        ?.[position],
    ),
  )
}

function calculateAssistPoints(
  events,
) {
  return round(
    events.assists *
    FANTASY_SCORING_RULES
      .assist,
  )
}

function calculateCleanSheetPoints({
  events,
  position,
}) {
  return round(
    events.cleanSheets *
    toNumber(
      FANTASY_SCORING_RULES
        .cleanSheet
        ?.[position],
    ),
  )
}

function calculateSavePoints({
  events,
  position,
}) {
  if (
    position !==
    'goalkeeper'
  ) {
    return 0
  }

  return round(
    divide(
      events.saves,
      FANTASY_SCORING_RULES
        .goalkeeper
        .savesPerPoint,
    ) *
    FANTASY_SCORING_RULES
      .goalkeeper
      .pointsPerSaveBlock,
  )
}

function calculatePenaltySavePoints({
  events,
  position,
}) {
  if (
    position !==
    'goalkeeper'
  ) {
    return 0
  }

  return round(
    events.penaltySaves *
    FANTASY_SCORING_RULES
      .goalkeeper
      .penaltySaved,
  )
}

function calculateBonusPoints(
  events,
) {
  /*
   * Historische optaBonus is al het werkelijk
   * behaalde aantal bonuspunten.
   */
  return round(
    events.bonus,
  )
}

function calculateCardPenalty(
  events,
) {
  return round(
    events.yellowCards *
      FANTASY_SCORING_RULES
        .cards
        .yellow +
    events.redCards *
      FANTASY_SCORING_RULES
        .cards
        .red,
  )
}

function calculateOwnGoalPenalty(
  events,
) {
  return round(
    events.ownGoals *
    FANTASY_SCORING_RULES
      .ownGoal,
  )
}

function calculateMissedPenaltyPenalty(
  events,
) {
  return round(
    events.penaltiesMissed *
    FANTASY_SCORING_RULES
      .penalties
      .missed,
  )
}

function calculateGoalsConcededPenalty({
  events,
  position,
}) {
  if (
    position !==
      'goalkeeper' &&
    position !==
      'defender'
  ) {
    return 0
  }

  const deduction =
    position ===
    'goalkeeper'
      ? FANTASY_SCORING_RULES
          .goalsConceded
          .goalkeeperDeduction
      : FANTASY_SCORING_RULES
          .goalsConceded
          .defenderDeduction

  /*
   * De officiële regel trekt één punt af
   * per blok van twee tegendoelpunten.
   *
   * Voor Expected Points gebruiken we de
   * lineaire verwachtingswaarde.
   */
  return round(
    divide(
      events.goalsConceded,
      FANTASY_SCORING_RULES
        .goalsConceded
        .goalsPerDeduction,
    ) *
    deduction,
  )
}

/*
|--------------------------------------------------------------------------
| Breakdown
|--------------------------------------------------------------------------
*/

function buildBreakdown({
  position,
  playingProfile,
  events,
}) {
  return {
    appearance:
      calculateAppearancePoints(
        playingProfile,
      ),

    goals:
      calculateGoalPoints({
        events,
        position,
      }),

    assists:
      calculateAssistPoints(
        events,
      ),

    cleanSheet:
      calculateCleanSheetPoints({
        events,
        position,
      }),

    saves:
      calculateSavePoints({
        events,
        position,
      }),

    penaltySaves:
      calculatePenaltySavePoints({
        events,
        position,
      }),

    bonus:
      calculateBonusPoints(
        events,
      ),

    cards:
      calculateCardPenalty(
        events,
      ),

    ownGoals:
      calculateOwnGoalPenalty(
        events,
      ),

    penaltiesMissed:
      calculateMissedPenaltyPenalty(
        events,
      ),

    goalsConceded:
      calculateGoalsConcededPenalty({
        events,
        position,
      }),
  }
}

/*
|--------------------------------------------------------------------------
| Totaal
|--------------------------------------------------------------------------
*/

function calculateExpectedPointsTotal(
  breakdown,
) {
  return round(
    Object.values(
      breakdown,
    ).reduce(
      (
        total,
        value,
      ) =>
        total +
        toNumber(
          value,
        ),
      0,
    ),
  )
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

/**
 * Berekent de verwachte Fantasy-productie
 * van één speler voor één wedstrijd.
 */
export function calculateExpectedPoints({
  playerData,
  history,
  fixture,
  outlook = null,
} = {}) {
  if (
    !playerData ||
    !history ||
    !fixture
  ) {
    return null
  }

  const positionResult =
    resolvePosition(
      playerData,
    )

  const playingProfile =
    buildPlayingProfile(
      playerData,
    )

  const formModifier =
    calculateFormModifier(
      outlook,
    )

  const events =
    buildExpectedEvents({
      history,
      fixture,
      playingProfile,
      formModifier,
    })

  const breakdown =
    buildBreakdown({
      position:
        positionResult.position,

      playingProfile,

      events,
    })

  const expectedPoints =
    calculateExpectedPointsTotal(
      breakdown,
    )

  return {
    playerId:
      playerData.id ?? '',

    position:
      positionResult.position,

    positionFallbackUsed:
      positionResult
        .usedFallback,

    expectedPoints,

    expectedMinutes:
      playingProfile
        .effectiveMinutes,

    conditionalMinutes:
      playingProfile
        .conditionalMinutes,

    appearanceProbability:
      playingProfile
        .appearanceProbability,

    sixtyMinuteProbability:
      playingProfile
        .sixtyMinuteProbability,

    events,

    breakdown,

    modifiers: {
      fixture:
        round(
          fixture
            ?.baseMultiplier ??
          1,
          4,
        ),

      form:
        formModifier.value,

      outlook:
        formModifier.value,
    },

    context: {
      formScore:
        formModifier.score,

      formNeutralScore:
        formModifier
          .neutralScore,

      formSource:
        formModifier.source,

      fixtureScore:
        fixture?.score ??
        null,

      fixtureDifficulty:
        fixture?.difficulty ??
        null,

      fixtureConfidence:
        fixture?.confidence ??
        null,
    },
  }
}

/**
 * Berekent Expected Points voor
 * meerdere voorbereide projecties.
 */
export function calculateExpectedPointsBatch(
  projections,
) {
  if (
    !Array.isArray(
      projections,
    )
  ) {
    return []
  }

  return projections
    .map(
      (
        projection,
      ) =>
        calculateExpectedPoints(
          projection,
        ),
    )
    .filter(Boolean)
}