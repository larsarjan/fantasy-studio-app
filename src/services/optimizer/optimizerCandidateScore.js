import {
  calculateFantasyOutlook,
} from '../fantasyOutlookEngine.js'

/*
|--------------------------------------------------------------------------
| Fantasy Studio — Optimizer Candidate Score
|--------------------------------------------------------------------------
|
| Deze engine vertaalt:
|
| - de projectie van een speler;
| - de Fantasy Outlook-pijlers;
| - de managementfilosofie;
|
| naar één gestandaardiseerde Manager Score van 0 tot 100.
|
| De Squad Optimizer hoeft daardoor niet zelf te weten
| hoe de verschillende strategieonderdelen worden berekend.
|
*/

/*
|--------------------------------------------------------------------------
| Standaardfilosofie
|--------------------------------------------------------------------------
|
| Deze gewichten zijn gelijk aan het aanbevolen startprofiel
| van de FVT Manager.
|
*/

export const DEFAULT_MANAGER_PHILOSOPHY = {
  expectedPoints: 35,
  fixtures: 20,
  form: 15,
  flexibility: 10,
  teamValue: 10,
  risk: 5,
  benchStrength: 5,
}

/*
|--------------------------------------------------------------------------
| Algemene helpers
|--------------------------------------------------------------------------
*/

function toNumber(
  value,
  fallback = 0,
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

  return Number.isFinite(number)
    ? number
    : fallback
}

function clamp(
  value,
  minimum = 0,
  maximum = 100,
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
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

function normalizeTenPointScore(
  value,
  fallback = 5,
) {
  return round(
    clamp(
      toNumber(
        value,
        fallback,
      ),
      0,
      10,
    ) * 10,
    2,
  )
}

/*
|--------------------------------------------------------------------------
| Filosofie normaliseren
|--------------------------------------------------------------------------
|
| De invoer hoort bij elkaar 100 punten te zijn.
|
| Voor extra veiligheid normaliseert deze engine de gewichten
| ook wanneer een andere aanroeper geen totaal van exact 100 doorgeeft.
|
*/

export function normalizeManagerPhilosophy(
  philosophy = {},
) {
  const merged = {
    ...DEFAULT_MANAGER_PHILOSOPHY,
    ...philosophy,
  }

  const rawWeights =
    Object.fromEntries(
      Object.keys(
        DEFAULT_MANAGER_PHILOSOPHY,
      ).map(
        (
          key,
        ) => [
          key,
          Math.max(
            0,
            toNumber(
              merged[key],
              DEFAULT_MANAGER_PHILOSOPHY[
                key
              ],
            ),
          ),
        ],
      ),
    )

  const totalWeight =
    Object.values(
      rawWeights,
    ).reduce(
      (
        total,
        weight,
      ) =>
        total +
        weight,
      0,
    )

  if (
    totalWeight <= 0
  ) {
    return {
      ...DEFAULT_MANAGER_PHILOSOPHY,
    }
  }

  return Object.fromEntries(
    Object.entries(
      rawWeights,
    ).map(
      (
        [
          key,
          weight,
        ],
      ) => [
        key,
        round(
          (
            weight /
            totalWeight
          ) * 100,
          4,
        ),
      ],
    ),
  )
}

/*
|--------------------------------------------------------------------------
| Expected Points-score
|--------------------------------------------------------------------------
|
| De projectie wordt omgerekend naar een schaal van 0 tot 100.
|
| Voorlopige schaal:
|
| 0 xP per ronde  =   0
| 5 xP per ronde  =  50
| 10 xP per ronde = 100
|
| Waarden boven 10 xP per ronde blijven maximaal 100.
|
*/

function calculateExpectedPointsScore(
  projection,
) {
  const roundCount =
    Math.max(
      1,
      toNumber(
        projection
          ?.roundCount,
        1,
      ),
    )

  const expectedPointsPerRound =
    toNumber(
      projection
        ?.expectedPointsPerRound,
      toNumber(
        projection
          ?.expectedPoints,
        0,
      ) /
        roundCount,
    )

  return {
    score:
      round(
        clamp(
          (
            expectedPointsPerRound /
            10
          ) * 100,
        ),
        2,
      ),

    expectedPointsPerRound:
      round(
        expectedPointsPerRound,
        4,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Flexibiliteit
|--------------------------------------------------------------------------
|
| Een goedkopere speler is doorgaans eenvoudiger:
|
| - te vervangen;
| - op de bank te zetten;
| - te combineren met verschillende teamstructuren.
|
| De prijsscore wordt gecombineerd met de waardescore.
|
*/

function calculateFlexibilityScore({
  price,
  valueScore,
}) {
  const normalizedPrice =
    clamp(
      toNumber(
        price,
        10,
      ),
      3,
      15,
    )

  const priceFlexibility =
    (
      (
        15 -
        normalizedPrice
      ) /
      12
    ) * 100

  return round(
    (
      priceFlexibility *
        0.6
    ) +
      (
        valueScore *
        0.4
      ),
    2,
  )
}

/*
|--------------------------------------------------------------------------
| Banksterkte
|--------------------------------------------------------------------------
|
| Banksterkte is geen losse eigenschap van één speler.
|
| Als individuele indicatie gebruiken we daarom:
|
| - beschikbaarheid;
| - waarde;
| - flexibiliteit.
|
| De uiteindelijke verdeling van de vier bankplaatsen
| blijft later de verantwoordelijkheid van de Squad Optimizer.
|
*/

function calculateBenchStrengthScore({
  availabilityScore,
  valueScore,
  flexibilityScore,
}) {
  return round(
    (
      availabilityScore *
        0.5
    ) +
      (
        valueScore *
        0.3
    ) +
      (
        flexibilityScore *
        0.2
      ),
    2,
  )
}

/*
|--------------------------------------------------------------------------
| Gewogen bijdrage
|--------------------------------------------------------------------------
*/

function createWeightedBreakdown({
  scores,
  weights,
}) {
  return Object.fromEntries(
    Object.keys(
      DEFAULT_MANAGER_PHILOSOPHY,
    ).map(
      (
        key,
      ) => {
        const score =
          clamp(
            scores[key],
          )

        const weight =
          toNumber(
            weights[key],
          )

        return [
          key,
          {
            score:
              round(
                score,
                2,
              ),

            weight:
              round(
                weight,
                4,
              ),

            contribution:
              round(
                score *
                  (
                    weight /
                    100
                  ),
                4,
              ),
          },
        ]
      },
    ),
  )
}

/*
|--------------------------------------------------------------------------
| Publieke Candidate Score
|--------------------------------------------------------------------------
*/

export function calculateOptimizerCandidateScore({
  player,
  projection,
  philosophy,
  outlook,
} = {}) {
  const normalizedPhilosophy =
    normalizeManagerPhilosophy(
      philosophy,
    )

  /*
   * Een bestaande Outlook-berekening mag worden meegegeven.
   * Anders berekenen we hem hier centraal.
   */

    const resolvedOutlook =
    outlook ??
    player?.outlook ??
    calculateFantasyOutlook(
      player ?? {},
      {},
    )

  const outlookScores =
    resolvedOutlook
      ?.scores ??
    {}

  const expectedPointsResult =
    calculateExpectedPointsScore(
      projection,
    )

  const fixtureScore =
    normalizeTenPointScore(
      outlookScores
        .fixtures ??
      player
        ?.outlook
        ?.fixtures,
    )

  const formScore =
    normalizeTenPointScore(
      outlookScores
        .form ??
      player
        ?.outlook
        ?.form,
    )

  const valueScore =
    normalizeTenPointScore(
      outlookScores
        .value ??
      player
        ?.outlook
        ?.value,
    )

  const availabilityScore =
    normalizeTenPointScore(
      outlookScores
        .availability ??
      player
        ?.outlook
        ?.availability,
    )

  /*
   * In de Fantasy Outlook Engine betekent een hogere risk-score:
   * meer risico.
   *
   * Voor de Manager Score moet hoger juist gunstiger zijn.
   */

  const rawRiskScore =
    normalizeTenPointScore(
      outlookScores
        .risk ??
      player
        ?.outlook
        ?.risk,
    )

  const certaintyScore =
    round(
      100 -
      rawRiskScore,
      2,
    )

  const price =
    toNumber(
      player?.currentPrice ??
      player?.endPrice ??
      player?.price ??
      player?.startPrice,
      10,
    )

  const flexibilityScore =
    calculateFlexibilityScore({
      price,
      valueScore,
    })

  const benchStrengthScore =
    calculateBenchStrengthScore({
      availabilityScore,
      valueScore,
      flexibilityScore,
    })

  const scores = {
    expectedPoints:
      expectedPointsResult
        .score,

    fixtures:
      fixtureScore,

    form:
      formScore,

    flexibility:
      flexibilityScore,

    teamValue:
      valueScore,

    risk:
      certaintyScore,

    benchStrength:
      benchStrengthScore,
  }

  const breakdown =
    createWeightedBreakdown({
      scores,

      weights:
        normalizedPhilosophy,
    })

  const totalScore =
    Object.values(
      breakdown,
    ).reduce(
      (
        total,
        item,
      ) =>
        total +
        item.contribution,
      0,
    )

  return {
    score:
      round(
        clamp(
          totalScore,
        ),
        2,
      ),

    scores,

    weights:
      normalizedPhilosophy,

    breakdown,

    metrics: {
      expectedPoints:
        round(
          toNumber(
            projection
              ?.expectedPoints,
          ),
          4,
        ),

      expectedPointsPerRound:
        expectedPointsResult
          .expectedPointsPerRound,

      expectedMinutes:
        round(
          toNumber(
            projection
              ?.expectedMinutes,
          ),
          2,
        ),

      expectedMinutesPerRound:
        round(
          toNumber(
            projection
              ?.expectedMinutesPerRound,
          ),
          2,
        ),

      price:
        round(
          price,
          1,
        ),
    },

    outlook:
      resolvedOutlook,

    calculation: {
      scale: {
        minimum:
          0,

        maximum:
          100,
      },

      source:
        'optimizer-candidate-score',

      version:
        1,
    },
  }
}