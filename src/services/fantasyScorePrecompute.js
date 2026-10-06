import {
  calculateFantasyOutlook,
} from './fantasyOutlookEngine.js'

import {
  createFixtureModifier,
} from './fixtureIntelligenceEngine.js'

import {
  calculateFvtScore,
} from './fvtScoreEngine.js'

import {
  calculatePlayerFantasyDNA,
} from './fantasyDNABuilder.js'

import {
  calculateExpectedPointsEngine,
} from './expectedPoints/expectedPointsEngine.js'

/*
|--------------------------------------------------------------------------
| Fantasy-scores vooraf berekenen
|--------------------------------------------------------------------------
|
| Deze service berekent tijdens de databasesynchronisatie:
|
| - FVT Fantasy Score
| - Captain
| - Differential
| - Budget
| - Bonus
| - Lange termijn
| - Transfer
|
| De resultaten worden daarna bij de spelers opgeslagen.
| De spelerspagina hoeft de engines dan niet opnieuw uit te voeren.
|
*/

function getPlayerKey(
  player,
) {
  return [
    player?.season ?? '',
    player?.id ?? '',
  ].join('::')
}

function getFixtureCacheKey({
  player,
  startRound,
  roundCount,
}) {
  return [
    player?.season ?? '',
    player?.club ?? '',

    player?.fantasyPosition ??
      player?.position ??
      '',

    startRound,
    roundCount,
  ].join('::')
}

function clampScore(
  value,
) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return 0
  }

  return Math.max(
    0,
    Math.min(
      100,
      number,
    ),
  )
}

function roundValue(
  value,
  digits = 2,
) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
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

function createExpectedPointsProjection(
  expectedPointsResult,
) {
  if (
    !expectedPointsResult
  ) {
    return {
      startRound: 1,
      endRound: 10,
      roundCount: 10,
      rounds: [],
    }
  }

  return {
    startRound:
      Number(
        expectedPointsResult
          .startRound,
      ) || 1,

    endRound:
      Number(
        expectedPointsResult
          .endRound,
      ) || 10,

    roundCount:
      Number(
        expectedPointsResult
          .roundCount,
      ) || 10,

    rounds:
      Array.isArray(
        expectedPointsResult
          .rounds,
      )
        ? expectedPointsResult
            .rounds
            .map(
              (
                round,
              ) => ({
                round:
                  Number(
                    round?.round,
                  ) || 0,

                type:
                  round?.type ??
                  'blank',

                fixtureCount:
                  Number(
                    round
                      ?.fixtureCount,
                  ) || 0,

                expectedPoints:
                  roundValue(
                    round
                      ?.expectedPoints,
                    2,
                  ),

                expectedMinutes:
                  roundValue(
                    round
                      ?.expectedMinutes,
                    1,
                  ),

                appearanceProbability:
                  roundValue(
                    round
                      ?.appearanceProbability,
                    4,
                  ),
              }),
            )
        : [],
  }
}

function createPlayerScores({
  player,
  referencePlayers,
  startRound,
  roundCount,
  fixtures,
  results,
  teamRatings,
  fixtureModifierCache,
  profiler,
}) {

  const playerStartedAt =
    performance.now()

  const fixtureCacheKey =
  getFixtureCacheKey({
    player,
    startRound,
    roundCount,
  })

let fixtureModifier =
  fixtureModifierCache.get(
    fixtureCacheKey,
  )

if (!fixtureModifier) {
  const fixtureStartedAt =
    performance.now()

  fixtureModifier =
    createFixtureModifier({
      player,
      startRound,
      roundCount,
      fixtures,
      results,
      teamRatings,
    })

  profiler.fixtureModifier +=
    performance.now() -
    fixtureStartedAt

  fixtureModifierCache.set(
    fixtureCacheKey,
    fixtureModifier,
  )
}

  const outlookStartedAt =
    performance.now()

  const outlook =
    calculateFantasyOutlook(
      player,
      {
        fixtureScore:
          fixtureModifier.score,
      },
    )

  profiler.fantasyOutlook +=
    performance.now() -
    outlookStartedAt

  const fvtStartedAt =
    performance.now()

  const fvtResult =
    calculateFvtScore(
      player,
      {
        outlook,
      },
    )

  profiler.fvtScore +=
    performance.now() -
    fvtStartedAt

  const dnaStartedAt =
    performance.now()

  const fantasyDNA =
    calculatePlayerFantasyDNA(
      player,
      {
        baseScore:
          outlook.calculation
            ?.baseScore ??
          outlook.score,

        startRound,
        roundCount,
        outlook,
        fvtScore:
          fvtResult,
          fixtureModifier,
        referencePlayers,
        profiler,
      },
    )

  profiler.fantasyDNA +=
    performance.now() -
    dnaStartedAt

  const fantasyProfile =
  fantasyDNA
    ?.fantasyProfile ??
  {}

const expectedPointsStartedAt =
  performance.now()

const expectedPointsResult =
  calculateExpectedPointsEngine(
    player,
    fixtures,
    {
      startRound,
      roundCount,

      results,
      teamRatings,

      useCache:
        true,
    },
  )

  const expectedPointsProjection =
  createExpectedPointsProjection(
    expectedPointsResult,
  )

profiler.expectedPoints +=
  performance.now() -
  expectedPointsStartedAt

profiler.playerScores +=
  performance.now() -
  playerStartedAt

  return {

        outlook: {
      score:
        roundValue(
          outlook?.score,
          2,
        ),

      potential:
        roundValue(
          outlook
            ?.scores
            ?.potential,
          2,
        ),

      availability:
        roundValue(
          outlook
            ?.scores
            ?.availability,
          2,
        ),

      fixtures:
        roundValue(
          outlook
            ?.scores
            ?.fixtures,
          2,
        ),

      form:
        roundValue(
          outlook
            ?.scores
            ?.form,
          2,
        ),

      value:
        roundValue(
          outlook
            ?.scores
            ?.value,
          2,
        ),

      risk:
        roundValue(
          outlook
            ?.scores
            ?.risk,
          2,
        ),
    },
    
    fvtFantasyScore:
      clampScore(
        fvtResult?.score,
      ),

    captainScore:
      clampScore(
        fantasyProfile
          ?.captain
          ?.score,
      ),

    differentialScore:
      clampScore(
        fantasyProfile
          ?.differential
          ?.score,
      ),

    budgetScore:
      clampScore(
        fantasyProfile
          ?.budget
          ?.score,
      ),

    bonusScore:
      clampScore(
        fantasyProfile
          ?.bonus
          ?.score,
      ),

    longTermScore:
      clampScore(
        fantasyProfile
          ?.longTerm
          ?.score,
      ),

    transferScore:
      clampScore(
        fantasyProfile
          ?.transfer
          ?.score,
      ),

expectedPoints:
  roundValue(
    expectedPointsResult
      ?.totalExpectedPoints,
    2,
  ),

expectedPointsPerRound:
  roundValue(
    expectedPointsResult
      ?.averageExpectedPointsPerRound,
    2,
  ),

expectedMinutes:
  roundValue(
    expectedPointsResult
      ?.totalExpectedMinutes,
    1,
  ),

  expectedPointsProjection,

    fantasyScoresCalculatedAt:
      new Date().toISOString(),

    fantasyScoresVersion:
  'fantasy-profile-v3',
  }
}

function waitForBrowser() {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        0,
      )
    },
  )
}

/*
|--------------------------------------------------------------------------
| Hoofdfunctie
|--------------------------------------------------------------------------
|
| profiles:
| De volledig verrijkte spelers uit getPlayerProfiles().
|
| rawPlayers:
| De oorspronkelijke spelers die in database.players worden opgeslagen.
|
| activeSeason:
| Alleen het actuele seizoen wordt doorgerekend.
|
*/

export async function precomputeFantasyScores({
  profiles = [],
  rawPlayers = [],
  fixtures = [],
  results = [],
  teamRatings = [],
  activeSeason = '',
  startRound = 1,
  roundCount = 10,
  batchSize = 10,
  onProgress = null,
}) {

    const precomputeStartedAt =
    performance.now()

  const profiler = {
  fixtureModifier: 0,
  fantasyOutlook: 0,
  fvtScore: 0,
  fantasyDNA: 0,
  expectedPoints: 0,

  dnaModifiers: 0,
  dnaProfile: 0,

  playerScores: 0,
}

  const seasonProfiles =
    profiles.filter(
      (player) =>
        !activeSeason ||
        player.season ===
          activeSeason,
    )

  if (!seasonProfiles.length) {
    return rawPlayers
  }

  const scoresByPlayer =
    new Map()

  const fixtureModifierCache =
    new Map()

  for (
    let index = 0;
    index < seasonProfiles.length;
    index += batchSize
  ) {
    const batch =
      seasonProfiles.slice(
        index,
        index + batchSize,
      )

    batch.forEach(
      (player) => {
        const scores =
  createPlayerScores({
    player,

    referencePlayers:
      seasonProfiles,

    startRound,
    roundCount,

    fixtures,
    results,
    teamRatings,

    fixtureModifierCache,

    profiler,
  })

        scoresByPlayer.set(
          getPlayerKey(
            player,
          ),
          scores,
        )
      },
    )

    const completed =
      Math.min(
        index + batch.length,
        seasonProfiles.length,
      )

console.log(
  `Fantasy-precompute voortgang: ${completed}/${seasonProfiles.length}`,
  {
    fixtureModifierSeconds:
      (
        profiler.fixtureModifier /
        1000
      ).toFixed(2),

fixtureCacheEntries:
  fixtureModifierCache.size,

    fantasyOutlookSeconds:
      (
        profiler.fantasyOutlook /
        1000
      ).toFixed(2),

    fvtScoreSeconds:
      (
        profiler.fvtScore /
        1000
      ).toFixed(2),

    fantasyDNASeconds:
      (
        profiler.fantasyDNA /
        1000
      ).toFixed(2),

      expectedPointsSeconds:
  (
    profiler.expectedPoints /
    1000
  ).toFixed(2),

    dnaModifiersSeconds:
      (
        profiler.dnaModifiers /
        1000
      ).toFixed(2),

    dnaProfileSeconds:
      (
        profiler.dnaProfile /
        1000
      ).toFixed(2),
  },
)

    if (
      typeof onProgress ===
      'function'
    ) {
      onProgress({
        completed,
        total:
          seasonProfiles.length,

        percentage:
          Math.round(
            (
              completed /
              seasonProfiles.length
            ) * 100,
          ),
      })
    }

    /*
     * Geeft de browser tussen batches ruimte
     * om de interface en voortgang bij te werken.
     */
    await waitForBrowser()
  }

  const totalDuration =
    performance.now() -
    precomputeStartedAt

  const seconds = (
    milliseconds,
  ) =>
    (
      milliseconds /
      1000
    ).toFixed(2)

  console.group(
    'Fantasy Studio — Performanceprofiel',
  )

  console.log(
    'Spelers:',
    seasonProfiles.length,
  )

  console.log(
    'Fixture Modifier:',
    `${seconds(
      profiler.fixtureModifier,
    )} sec`,
  )

  console.log(
    'Fantasy Outlook:',
    `${seconds(
      profiler.fantasyOutlook,
    )} sec`,
  )

  console.log(
    'FVT Score:',
    `${seconds(
      profiler.fvtScore,
    )} sec`,
  )

  console.log(
    'Fantasy DNA:',
    `${seconds(
      profiler.fantasyDNA,
    )} sec`,
  )

  console.log(
  'Expected Points:',
  `${seconds(
    profiler.expectedPoints,
  )} sec`,
)

  console.log(
    'Create Player Scores totaal:',
    `${seconds(
      profiler.playerScores,
    )} sec`,
  )

  console.log(
    'Volledige precompute:',
    `${seconds(
      totalDuration,
    )} sec`,
  )

  console.log(
    'Gemiddeld per speler:',
    `${(
      totalDuration /
      seasonProfiles.length
    ).toFixed(2)} ms`,
  )

  console.groupEnd()

  return rawPlayers.map(
    (player) => {
      const scores =
        scoresByPlayer.get(
          getPlayerKey(
            player,
          ),
        )

      return scores
        ? {
            ...player,
            ...scores,
          }
        : player
    },
  )
}