/*
|==============================================================================
| FVT VALUE INTELLIGENCE ENGINE
|==============================================================================
|
| Centrale vraag
| ---------------
| Hoeveel actueel fantasyrendement krijgt een
| manager voor de huidige prijs?
|
| De Waarde-pijler gebruikt uitsluitend data
| uit het lopende Fantasy-seizoen.
|
| Waarde gebruikt NIET:
| - historische seizoenen;
| - speelzekerheid;
| - Fantasy-potentie;
| - programma;
| - vorm;
| - risico.
|
| Datastadia
| -----------
| 0 optredens:
| - geen beoordeling;
| - intern neutraal 5,0.
|
| 1–2 optredens:
| - voorlopige beoordeling;
| - sterk gedempt richting neutraal.
|
| 3–4 optredens:
| - beoordeling wordt opgebouwd;
| - actuele productie krijgt meer invloed.
|
| 5+ optredens:
| - volledig actuele waardebeoordeling.
|
*/

/*
|------------------------------------------------------------------------------
| Instellingen
|------------------------------------------------------------------------------
*/

const NEUTRAL_VALUE_SCORE =
  5

const FULL_VALUE_APPEARANCES =
  5

const PER_MATCH_WEIGHT =
  0.60

const PER_90_WEIGHT =
  0.40

/*
 * Hoe sterk de ruwe waardescore al mag
 * meetellen na een bepaald aantal optredens.
 */
const DATA_MATURITY_WEIGHTS = {
  0: 0,
  1: 0.25,
  2: 0.45,
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

function roundToTwo(value) {
  return Math.round(
    (
      Number(value) +
      Number.EPSILON
    ) *
    100,
  ) / 100
}

function divide(
  numerator,
  denominator,
) {
  const safeNumerator =
    toNumber(numerator)

  const safeDenominator =
    toNumber(denominator)

  if (
    safeNumerator === null ||
    safeDenominator === null ||
    safeDenominator <= 0
  ) {
    return null
  }

  return (
    safeNumerator /
    safeDenominator
  )
}

/*
|------------------------------------------------------------------------------
| Huidige prijs
|------------------------------------------------------------------------------
*/

function getCurrentPrice(player) {
  return (
    toNumber(
      player?.currentPrice,
    ) ??
    toNumber(
      player?.endPrice,
    ) ??
    toNumber(
      player?.startPrice,
    )
  )
}

function getStartPrice(player) {
  return toNumber(
    player?.startPrice,
  )
}

function getPriceChange(
  currentPrice,
  startPrice,
) {
  if (
    currentPrice === null ||
    startPrice === null
  ) {
    return null
  }

  return (
    currentPrice -
    startPrice
  )
}

/*
|------------------------------------------------------------------------------
| Actuele productie
|------------------------------------------------------------------------------
*/

function getCurrentProduction(player) {
  const matchProfile =
    player?.profile?.match ??
    player?.matchProfile ??
    {}

  const statistics =
    matchProfile.statistieken ??
    player?.matchStatistics ??
    {}

  const points =
    matchProfile.punten ??
    player?.matchPoints ??
    {}

  const averages =
    matchProfile.gemiddelden ??
    player?.matchAverages ??
    {}

  const summary =
    matchProfile.samenvatting ??
    matchProfile.summary ??
    {}

  const appearances =
    toNumber(
      statistics
        .gespeeldeWedstrijden,
    ) ??
    toNumber(
      summary.appearances,
    ) ??
    toNumber(
      player?.matches,
    ) ??
    0

  const minutes =
    toNumber(
      statistics.minuten,
    ) ??
    toNumber(
      summary.minutes,
    ) ??
    toNumber(
      player?.minutes,
    ) ??
    0

  const totalPoints =
    toNumber(
      points.totaal,
    ) ??
    toNumber(
      summary.fantasypunten,
    ) ??
    toNumber(
      summary.fantasyPoints,
    ) ??
    toNumber(
      player?.points,
    ) ??
    0

  const directPointsPerMatch =
    toNumber(
      averages
        .puntenPerWedstrijd,
    ) ??
    toNumber(
      player?.pointsPerMatch,
    )

  const directPointsPer90 =
    toNumber(
      averages.puntenPer90,
    ) ??
    toNumber(
      player?.pointsPer90,
    )

  const pointsPerMatch =
    directPointsPerMatch ??
    divide(
      totalPoints,
      appearances,
    )

  const pointsPer90 =
    directPointsPer90 ??
    (
      minutes > 0
        ? (
            totalPoints /
            minutes
          ) *
          90
        : null
    )

  return {
    appearances:
      Math.max(
        0,
        appearances,
      ),

    minutes:
      Math.max(
        0,
        minutes,
      ),

    totalPoints,

    pointsPerMatch,

    pointsPer90,
  }
}

/*
|------------------------------------------------------------------------------
| Prijsrendement
|------------------------------------------------------------------------------
*/

function calculateEfficiency({
  price,
  pointsPerMatch,
  pointsPer90,
}) {
  return {
    perMatchPerMillion:
      divide(
        pointsPerMatch,
        price,
      ),

    per90PerMillion:
      divide(
        pointsPer90,
        price,
      ),
  }
}

/*
|------------------------------------------------------------------------------
| Efficiëntie omzetten naar een 0–10-score
|------------------------------------------------------------------------------
|
| Voorlopige transparante schaal:
|
| 0,00 per miljoen → 0,0
| 0,20 per miljoen → 2,0
| 0,40 per miljoen → 4,0
| 0,60 per miljoen → 6,0
| 0,80 per miljoen → 8,0
| 1,00 per miljoen → 10,0
|
*/

function efficiencyToScore(
  efficiency,
) {
  const normalizedEfficiency =
    toNumber(
      efficiency,
    )

  if (
    normalizedEfficiency ===
    null
  ) {
    return null
  }

  return clamp(
    normalizedEfficiency *
      10,
  )
}

function calculateRawValue({
  price,
  pointsPerMatch,
  pointsPer90,
}) {
  const efficiency =
    calculateEfficiency({
      price,
      pointsPerMatch,
      pointsPer90,
    })

  const perMatchScore =
    efficiencyToScore(
      efficiency
        .perMatchPerMillion,
    )

  const per90Score =
    efficiencyToScore(
      efficiency
        .per90PerMillion,
    )

  const parts = []

  if (perMatchScore !== null) {
    parts.push({
      score:
        perMatchScore,

      weight:
        PER_MATCH_WEIGHT,
    })
  }

  if (per90Score !== null) {
    parts.push({
      score:
        per90Score,

      weight:
        PER_90_WEIGHT,
    })
  }

  if (!parts.length) {
    return {
      hasData:
        false,

      score:
        null,

      perMatchScore:
        null,

      per90Score:
        null,

      perMatchPerMillion:
        efficiency
          .perMatchPerMillion,

      per90PerMillion:
        efficiency
          .per90PerMillion,
    }
  }

  const totalWeight =
    parts.reduce(
      (
        total,
        part,
      ) =>
        total +
        part.weight,
      0,
    )

  const score =
    parts.reduce(
      (
        total,
        part,
      ) =>
        total +
        part.score *
          part.weight,
      0,
    ) /
    totalWeight

  return {
    hasData:
      true,

    score:
      roundToOne(
        clamp(score),
      ),

    perMatchScore:
      perMatchScore === null
        ? null
        : roundToOne(
            perMatchScore,
          ),

    per90Score:
      per90Score === null
        ? null
        : roundToOne(
            per90Score,
          ),

    perMatchPerMillion:
      efficiency
        .perMatchPerMillion ===
      null
        ? null
        : roundToTwo(
            efficiency
              .perMatchPerMillion,
          ),

    per90PerMillion:
      efficiency
        .per90PerMillion ===
      null
        ? null
        : roundToTwo(
            efficiency
              .per90PerMillion,
          ),
  }
}

/*
|------------------------------------------------------------------------------
| Datavolwassenheid
|------------------------------------------------------------------------------
*/

function getMaturityWeight(
  appearances,
) {
  const normalizedAppearances =
    Math.max(
      0,
      Math.floor(
        Number(appearances) || 0,
      ),
    )

  if (
    normalizedAppearances >=
    FULL_VALUE_APPEARANCES
  ) {
    return 1
  }

  return (
    DATA_MATURITY_WEIGHTS[
      normalizedAppearances
    ] ?? 0
  )
}

function dampScoreToNeutral(
  rawScore,
  maturityWeight,
) {
  return (
    NEUTRAL_VALUE_SCORE *
      (
        1 -
        maturityWeight
      ) +
    rawScore *
      maturityWeight
  )
}

function getValueStage(
  appearances,
) {
  if (appearances <= 0) {
    return {
      id:
        'no-data',

      label:
        'Nog geen beoordeling',

      shortLabel:
        'Nog geen data',
    }
  }

  if (appearances <= 2) {
    return {
      id:
        'provisional',

      label:
        'Voorlopige beoordeling',

      shortLabel:
        'Voorlopig',
    }
  }

  if (appearances <= 4) {
    return {
      id:
        'building',

      label:
        'Beoordeling wordt opgebouwd',

      shortLabel:
        'In opbouw',
    }
  }

  return {
    id:
      'current',

    label:
      'Actuele waardebeoordeling',

    shortLabel:
      'Actueel',
  }
}

/*
|------------------------------------------------------------------------------
| Waardelabel
|------------------------------------------------------------------------------
*/

function getValueLabel(
  score,
  hasData,
) {
  if (!hasData) {
    return 'Nog geen data'
  }

  if (score >= 8.5) {
    return 'Uitstekende waarde'
  }

  if (score >= 7) {
    return 'Sterke waarde'
  }

  if (score >= 5.5) {
    return 'Redelijke waarde'
  }

  if (score >= 4) {
    return 'Matige waarde'
  }

  if (score >= 2.5) {
    return 'Slechte waarde'
  }

  return 'Zeer slechte waarde'
}

/*
|------------------------------------------------------------------------------
| Betrouwbaarheid
|------------------------------------------------------------------------------
*/

function calculateConfidence(
  appearances,
) {
  const normalizedAppearances =
    Math.max(
      0,
      Number(appearances) || 0,
    )

  const score =
    Math.round(
      Math.min(
        100,
        (
          normalizedAppearances /
          FULL_VALUE_APPEARANCES
        ) *
        100,
      ),
    )

  if (score >= 100) {
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

  if (score > 0) {
    return {
      score,
      level:
        'low',

      label:
        'Laag',
    }
  }

  return {
    score:
      0,

    level:
      'none',

    label:
      'Nog geen data',
  }
}

/*
|------------------------------------------------------------------------------
| Openbare uitleg
|------------------------------------------------------------------------------
*/

function buildExplanation({
  hasData,
  stage,
  price,
  production,
  rawValue,
  maturityWeight,
}) {
  if (!hasData) {
    return [
      'Er zijn nog geen actuele optredens in het lopende Fantasy-seizoen.',
      'Fantasy Studio geeft daarom nog geen waardebeoordeling.',
      'Intern wordt tijdelijk een neutrale score van 5,0 gebruikt.',
    ]
  }

  const explanation = [
    `${production.appearances} optreden${
      production.appearances === 1
        ? ''
        : 's'
    } in het huidige seizoen.`,
  ]

  if (price !== null) {
    explanation.push(
      `De actuele prijs is ${price.toFixed(
        1,
      )} miljoen.`,
    )
  }

  explanation.push(
    `${production.totalPoints} fantasypunt${
      production.totalPoints === 1
        ? ''
        : 'en'
    } in ${production.minutes} minuten.`,
  )

  if (
    rawValue
      .perMatchPerMillion !==
    null
  ) {
    explanation.push(
      `${rawValue
        .perMatchPerMillion
        .toFixed(
          2,
        )} punten per wedstrijd per miljoen.`,
    )
  }

  if (
    rawValue
      .per90PerMillion !==
    null
  ) {
    explanation.push(
      `${rawValue
        .per90PerMillion
        .toFixed(
          2,
        )} punten per 90 minuten per miljoen.`,
    )
  }

  if (
    stage.id !==
    'current'
  ) {
    explanation.push(
      `Door de beperkte hoeveelheid data telt de actuele berekening voorlopig voor ${Math.round(
        maturityWeight *
          100,
      )}% mee.`,
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
) {
  const normalizedScore =
    roundToOne(
      clamp(score),
    )

  return {
    score:
      normalizedScore,

    displayScore:
      normalizedScore,

    hasData:
      true,

    source:
      'manual',

    label:
      getValueLabel(
        normalizedScore,
        true,
      ),

    stage: {
      id:
        'manual',

      label:
        'Handmatige beoordeling',

      shortLabel:
        'Handmatig',
    },

    price:
      null,

    priceChange:
      null,

    maturityWeight:
      1,

    production:
      null,

    calculation:
      null,

    confidence: {
      score:
        100,

      level:
        'manual',

      label:
        'Handmatig',
    },

    explanation: [
      'De waardescore is handmatig ingesteld.',
    ],
  }
}

/*
|------------------------------------------------------------------------------
| Hoofdfunctie
|------------------------------------------------------------------------------
*/

export function calculatePlayerValue({
  player,
  manualScore = null,
} = {}) {
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
    )
  }

  const currentPrice =
    getCurrentPrice(
      player,
    )

  const startPrice =
    getStartPrice(
      player,
    )

  const priceChange =
    getPriceChange(
      currentPrice,
      startPrice,
    )

  const production =
    getCurrentProduction(
      player,
    )

  const stage =
    getValueStage(
      production.appearances,
    )

  const maturityWeight =
    getMaturityWeight(
      production.appearances,
    )

  /*
   * Zonder optredens, prijs of productie
   * bestaat nog geen actuele beoordeling.
   */
  if (
    production.appearances <= 0 ||
    currentPrice === null
  ) {
    return {
      score:
        NEUTRAL_VALUE_SCORE,

      displayScore:
        null,

      hasData:
        false,

      source:
        'neutral-fallback',

      label:
        'Nog geen data',

      stage,

      price:
        currentPrice,

      priceChange,

      maturityWeight:
        0,

      production,

      calculation: {
        rawScore:
          null,

        adjustedScore:
          NEUTRAL_VALUE_SCORE,

        perMatchScore:
          null,

        per90Score:
          null,

        perMatchPerMillion:
          null,

        per90PerMillion:
          null,
      },

      confidence:
        calculateConfidence(
          production.appearances,
        ),

      explanation:
        buildExplanation({
          hasData:
            false,

          stage,

          price:
            currentPrice,

          production,

          rawValue: {
            perMatchPerMillion:
              null,

            per90PerMillion:
              null,
          },

          maturityWeight:
            0,
        }),
    }
  }

  const rawValue =
    calculateRawValue({
      price:
        currentPrice,

      pointsPerMatch:
        production
          .pointsPerMatch,

      pointsPer90:
        production
          .pointsPer90,
    })

  /*
   * Er kan een optreden bestaan terwijl de
   * noodzakelijke productievelden ontbreken.
   */
  if (!rawValue.hasData) {
    return {
      score:
        NEUTRAL_VALUE_SCORE,

      displayScore:
        null,

      hasData:
        false,

      source:
        'neutral-fallback',

      label:
        'Nog onvoldoende data',

      stage,

      price:
        currentPrice,

      priceChange,

      maturityWeight,

      production,

      calculation: {
        rawScore:
          null,

        adjustedScore:
          NEUTRAL_VALUE_SCORE,

        perMatchScore:
          null,

        per90Score:
          null,

        perMatchPerMillion:
          null,

        per90PerMillion:
          null,
      },

      confidence:
        calculateConfidence(
          production.appearances,
        ),

      explanation: [
        'Er zijn al actuele optredens, maar nog onvoldoende productiegegevens voor een waardebeoordeling.',
        'Intern wordt tijdelijk een neutrale score van 5,0 gebruikt.',
      ],
    }
  }

  const adjustedScore =
    roundToOne(
      clamp(
        dampScoreToNeutral(
          rawValue.score,
          maturityWeight,
        ),
      ),
    )

  const confidence =
    calculateConfidence(
      production.appearances,
    )

  const explanation =
    buildExplanation({
      hasData:
        true,

      stage,

      price:
        currentPrice,

      production,

      rawValue,

      maturityWeight,
    })

  return {
    /*
     * De gedempte score telt mee in de
     * FVT Fantasy Score.
     */
    score:
      adjustedScore,

    /*
     * Deze score mag zichtbaar worden zodra
     * actuele productie beschikbaar is.
     */
    displayScore:
      adjustedScore,

    hasData:
      true,

    source:
      'value-intelligence',

    label:
      getValueLabel(
        adjustedScore,
        true,
      ),

    stage,

    price:
      currentPrice,

    priceChange:
      priceChange === null
        ? null
        : roundToOne(
            priceChange,
          ),

    maturityWeight:
      roundToTwo(
        maturityWeight,
      ),

    production,

    calculation: {
      rawScore:
        rawValue.score,

      adjustedScore,

      perMatchScore:
        rawValue.perMatchScore,

      per90Score:
        rawValue.per90Score,

      perMatchPerMillion:
        rawValue
          .perMatchPerMillion,

      per90PerMillion:
        rawValue
          .per90PerMillion,
    },

    weights: {
      perMatch:
        PER_MATCH_WEIGHT,

      per90:
        PER_90_WEIGHT,
    },

    confidence,

    explanation,
  }
}