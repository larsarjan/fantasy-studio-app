import {
  getFixtures,
  getResults,
  getTeamRatings,
} from './database.js'

import {
  calculateFantasyOutlook,
} from './fantasyOutlookEngine.js'

import {
  calculateFvtScore,
} from './fvtScoreEngine.js'

import {
  calculateFantasyScoutReport,
} from './fantasyScoutEngine.js'

import {
  createFixtureModifier,
} from './fixtureIntelligenceEngine.js'

import {
  calculatePlayerFantasyDNA,
} from './fantasyDNABuilder.js'

/*
|--------------------------------------------------------------------------
| Fantasy Outlook Comparison Engine
|--------------------------------------------------------------------------
|
| Centrale vergelijking van twee tot vier spelers.
|
| Deze engine:
|
| - gebruikt dezelfde Outlook-, FVT-, Scout- en DNA-engines;
| - berekent het programma over 1 t/m 10 speelrondes;
| - bepaalt winnaars per onderdeel;
| - maakt een toekomstgerichte eindrangschikking;
| - voorkomt een harde winnaar bij vrijwel gelijke scores.
|
| De presentatie rekent zelf niets uit.
|
*/

/*
|--------------------------------------------------------------------------
| Definities
|--------------------------------------------------------------------------
*/

export const OUTLOOK_COMPARISON_PILLARS = [
  {
    key: 'potential',
    label: 'Fantasy-potentie',
    icon: '🚀',
  },

  {
    key: 'availability',
    label: 'Speelzekerheid',
    icon: '🟢',
  },

  {
    key: 'fixtures',
    label: 'Programma',
    icon: '📅',
  },

  {
    key: 'form',
    label: 'Vorm',
    icon: '🔥',
  },

  {
    key: 'value',
    label: 'Waarde',
    icon: '💰',
  },

  {
    key: 'risk',
    label: 'Laag risico',
    icon: '🛡️',
  },
]

export const OUTLOOK_COMPARISON_PROFILES = [
  {
    key: 'captain',
    label: 'Captain',
    icon: '👑',
  },

  {
    key: 'differential',
    label: 'Differential',
    icon: '💎',
  },

  {
    key: 'budget',
    label: 'Budgetoptie',
    icon: '💸',
  },

  {
    key: 'bonus',
    label: 'Bonuskanon',
    icon: '🎯',
  },

  {
    key: 'longTerm',
    label: 'Lange termijn',
    icon: '📈',
  },

  {
    key: 'transfer',
    label: 'Transferprioriteit',
    icon: '🔄',
  },
]

/*
|--------------------------------------------------------------------------
| Algemene helpers
|--------------------------------------------------------------------------
*/

function toNumber(
  value,
) {
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
  maximum = 100,
) {
  const number =
    toNumber(value)

  if (number === null) {
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
    toNumber(value)

  if (number === null) {
    return 0
  }

  const factor =
    10 ** digits

  return (
    Math.round(
      number *
      factor,
    ) /
    factor
  )
}

function normalizeText(
  value,
) {
  return String(
    value ?? '',
  )
    .trim()
    .toLocaleLowerCase(
      'nl-NL',
    )
    .replace(
      /\s+/g,
      ' ',
    )
}

function createPlayerKey(
  player,
) {
  return [
    player?.season ?? '',
    player?.id ?? '',
  ].join('::')
}

/*
|--------------------------------------------------------------------------
| Actuele speelronde
|--------------------------------------------------------------------------
*/

function resultMatchesFixture(
  result,
  fixture,
) {
  return (
    String(
      result?.season ?? '',
    ) ===
      String(
        fixture?.season ?? '',
      ) &&

    normalizeText(
      result?.home,
    ) ===
      normalizeText(
        fixture?.home,
      ) &&

    normalizeText(
      result?.away,
    ) ===
      normalizeText(
        fixture?.away,
      )
  )
}

function isFixturePlayed(
  fixture,
  results,
) {
  return results.some(
    (result) =>
      resultMatchesFixture(
        result,
        fixture,
      ),
  )
}

/*
 * Geeft de eerste speelronde terug
 * die nog niet volledig is afgerond.
 */

export function getAutomaticOutlookStartRound({
  fixtures =
    getFixtures(),

  results =
    getResults(),
} = {}) {
  if (
    !fixtures.length
  ) {
    return 1
  }

  const rounds = [
    ...new Set(
      fixtures
        .map(
          (fixture) =>
            Number(
              fixture.round,
            ),
        )
        .filter(
          (roundNumber) =>
            Number.isFinite(
              roundNumber,
            ) &&
            roundNumber >= 1,
        ),
    ),
  ].sort(
    (
      left,
      right,
    ) =>
      left - right,
  )

  for (
    const roundNumber
    of rounds
  ) {
    const fixturesInRound =
      fixtures.filter(
        (fixture) =>
          Number(
            fixture.round,
          ) ===
          roundNumber,
      )

    const playedCount =
      fixturesInRound.filter(
        (fixture) =>
          isFixturePlayed(
            fixture,
            results,
          ),
      ).length

    if (
      playedCount <
      fixturesInRound.length
    ) {
      return roundNumber
    }
  }

  return (
    rounds.at(-1) ??
    1
  )
}

/*
|--------------------------------------------------------------------------
| Pijlers
|--------------------------------------------------------------------------
*/

function hasPillarData(
  outlook,
  key,
) {
  if (
    key === 'form'
  ) {
    return (
      outlook
        ?.form
        ?.hasData ===
      true
    )
  }

  if (
    key === 'value'
  ) {
    return (
      outlook
        ?.value
        ?.hasData ===
      true
    )
  }

  return (
    outlook
      ?.pillarData
      ?.[key]
      ?.hasData !==
    false
  )
}

function buildPillars(
  outlook,
  fvtScore,
) {
  return OUTLOOK_COMPARISON_PILLARS.map(
    (definition) => {
      /*
       * De FVT-engine presenteert risico
       * al positief:
       *
       * 10 = laag risico
       * 0 = hoog risico
       */
      const rawScore =
        definition.key ===
        'risk'
          ? fvtScore
              ?.pillars
              ?.risk
          : outlook
              ?.scores
              ?.[definition.key]

      const score =
        round(
          clamp(
            rawScore,
            0,
            10,
          ),
          1,
        )

      return {
        ...definition,

        score,

        scoreOutOfHundred:
          round(
            score * 10,
            0,
          ),

        hasData:
          hasPillarData(
            outlook,
            definition.key,
          ),
      }
    },
  )
}

/*
|--------------------------------------------------------------------------
| Fantasy-profielen
|--------------------------------------------------------------------------
*/

function buildFantasyProfiles(
  fantasyDNA,
) {
  const source =
    fantasyDNA
      ?.fantasyProfile ??
    {}

  return OUTLOOK_COMPARISON_PROFILES.map(
    (definition) => {
      const profile =
        source[
          definition.key
        ] ??
        null

      return {
        ...definition,

        score:
          round(
            clamp(
              profile?.score,
              0,
              100,
            ),
            0,
          ),

        label:
          profile?.label ??
          'Nog geen data',

        hasData:
          profile?.hasData ===
          true,
      }
    },
  )
}

/*
|--------------------------------------------------------------------------
| Programma
|--------------------------------------------------------------------------
*/

function buildFixtureRounds(
  fixtureModifier,
) {
  const rounds =
    fixtureModifier
      ?.details
      ?.rounds

  if (
    !Array.isArray(
      rounds,
    )
  ) {
    return []
  }

  return rounds.map(
    (roundReport) => {
      const fixtures =
        Array.isArray(
          roundReport.fixtures,
        )
          ? roundReport.fixtures
          : []

      let type =
        roundReport.type

      if (!type) {
        if (
          fixtures.length > 1
        ) {
          type = 'double'
        } else if (
          fixtures.length === 1
        ) {
          type = 'normal'
        } else {
          type = 'blank'
        }
      }

      return {
        round:
          Number(
            roundReport.round,
          ) || 0,

        type,

        score:
          round(
            roundReport.score,
            1,
          ),

        fixtures:
          fixtures.map(
            (fixture) => ({
              fixtureId:
                fixture.fixtureId ??
                fixture.id ??
                '',

              opponent:
                fixture.opponent ??
                'Onbekend',

              isHome:
                fixture.isHome ===
                true,

              venue:
                fixture.isHome ===
                true
                  ? 'T'
                  : 'U',

              score:
                round(
                  fixture.score ??
                  roundReport.score,
                  1,
                ),

              difficulty:
                round(
                  fixture.difficulty,
                  1,
                ),

              label:
                fixture.label ??
                '',
            }),
          ),
      }
    },
  )
}

/*
|--------------------------------------------------------------------------
| Eén speler volledig analyseren
|--------------------------------------------------------------------------
*/

function buildPlayerReport({
  player,
  startRound,
  roundCount,
  referencePlayers,
}) {
  const fixtureModifier =
    createFixtureModifier({
      player,

      startRound,

      roundCount,

      fixtures:
        getFixtures(),

      results:
        getResults(),

      teamRatings:
        getTeamRatings(),
    })

  const outlook =
    calculateFantasyOutlook(
      player,
      {
        fixtureScore:
          fixtureModifier?.score,
      },
    )

  const fvtScore =
    calculateFvtScore(
      player,
      {
        outlook,
      },
    )

  const fantasyDNA =
    calculatePlayerFantasyDNA(
      player,
      {
        baseScore:
          outlook
            ?.calculation
            ?.baseScore ??
          outlook?.score ??
          5,

        startRound,

        roundCount,

        outlook,

        fvtScore,

        fixtureModifier,

        referencePlayers,
      },
    )

  const scout =
    calculateFantasyScoutReport(
      player,
      outlook,
    )

  return {
    playerKey:
      createPlayerKey(
        player,
      ),

    player,

    outlook,

    fvtScore,

    fantasyDNA,

    scout,

    fixtureModifier,

    pillars:
      buildPillars(
        outlook,
        fvtScore,
      ),

    profiles:
      buildFantasyProfiles(
        fantasyDNA,
      ),

    fixtureRounds:
      buildFixtureRounds(
        fixtureModifier,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Winnaars per onderdeel
|--------------------------------------------------------------------------
*/

function getWinners({
  reports,
  getValue,
  tolerance = 0,
}) {
  const usable =
    reports
      .map(
        (report) => ({
          playerKey:
            report.playerKey,

          value:
            toNumber(
              getValue(
                report,
              ),
            ),
        }),
      )
      .filter(
        (item) =>
          item.value !==
          null,
      )

  if (
    !usable.length
  ) {
    return []
  }

  const bestValue =
    Math.max(
      ...usable.map(
        (item) =>
          item.value,
      ),
    )

  return usable
    .filter(
      (item) =>
        bestValue -
          item.value <=
        tolerance,
    )
    .map(
      (item) =>
        item.playerKey,
    )
}

function buildCategoryResults(
  reports,
) {
  const categories = [
    {
      key: 'fvtScore',
      label: 'FVT Fantasy Score',
      icon: '⭐',

      tolerance: 1,

      getValue:
        (report) =>
          report
            .fvtScore
            .score,
    },

    ...OUTLOOK_COMPARISON_PILLARS.map(
      (pillar) => ({
        key:
          `pillar-${pillar.key}`,

        label:
          pillar.label,

        icon:
          pillar.icon,

        tolerance: 3,

        getValue:
          (report) =>
            report
              .pillars
              .find(
                (item) =>
                  item.key ===
                  pillar.key,
              )
              ?.scoreOutOfHundred,
      }),
    ),

    {
      key: 'scout',
      label: 'Fantasy Scout',
      icon: '🔎',

      tolerance: 2,

      getValue:
        (report) =>
          report
            .scout
            .score,
    },

    ...OUTLOOK_COMPARISON_PROFILES.map(
      (profile) => ({
        key:
          `profile-${profile.key}`,

        label:
          profile.label,

        icon:
          profile.icon,

        tolerance: 2,

        getValue:
          (report) =>
            report
              .profiles
              .find(
                (item) =>
                  item.key ===
                  profile.key,
              )
              ?.score,
      }),
    ),
  ]

  return categories.map(
    (category) => ({
      key:
        category.key,

      label:
        category.label,

      icon:
        category.icon,

      winners:
        getWinners({
          reports,

          getValue:
            category.getValue,

          tolerance:
            category.tolerance,
        }),

      values:
        Object.fromEntries(
          reports.map(
            (report) => [
              report.playerKey,

              round(
                category.getValue(
                  report,
                ),
                1,
              ),
            ],
          ),
        ),
    }),
  )
}

/*
|--------------------------------------------------------------------------
| Rangschikking
|--------------------------------------------------------------------------
*/

function buildRanking(
  reports,
  categoryResults,
) {
  const categoryWins =
    Object.fromEntries(
      reports.map(
        (report) => [
          report.playerKey,
          0,
        ],
      ),
    )

  categoryResults.forEach(
    (category) => {
      /*
       * Alleen een unieke winnaar
       * krijgt een gewonnen onderdeel.
       */
      if (
        category
          .winners
          .length !== 1
      ) {
        return
      }

      const winner =
        category.winners[0]

      categoryWins[
        winner
      ] =
        (
          categoryWins[
            winner
          ] || 0
        ) + 1
    },
  )

  return reports
    .map(
      (report) => ({
        playerKey:
          report.playerKey,

        player:
          report.player,

        score:
          Number(
            report
              .fvtScore
              .score,
          ) || 0,

        confidence:
          Number(
            report
              .fvtScore
              .confidence
              .score,
          ) || 0,

        categoryWins:
          categoryWins[
            report.playerKey
          ] || 0,
      }),
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.score -
          left.score ||

        right.categoryWins -
          left.categoryWins ||

        right.confidence -
          left.confidence,
    )
    .map(
      (
        item,
        index,
      ) => ({
        ...item,

        rank:
          index + 1,
      }),
    )
}

/*
|--------------------------------------------------------------------------
| Conclusie
|--------------------------------------------------------------------------
*/

function buildDecision(
  ranking,
) {
  if (
    ranking.length < 2
  ) {
    return {
      type:
        'incomplete',

      winner:
        null,

      difference:
        0,

      title:
        'Kies minimaal twee spelers',

      text:
        'Selecteer minimaal twee spelers om de Fantasy Outlook-vergelijking te starten.',
    }
  }

  const first =
    ranking[0]

  const second =
    ranking[1]

  const difference =
    round(
      first.score -
        second.score,
      1,
    )

  if (
    difference < 2
  ) {
    return {
      type:
        'draw',

      winner:
        null,

      difference,

      title:
        'De spelers zijn vrijwel gelijkwaardig',

      text:
        `${first.player.name} en ${second.player.name} liggen binnen twee FVT-punten van elkaar. De beste keuze hangt vooral af van je strategie en de rest van je team.`,
    }
  }

  if (
    difference < 5
  ) {
    return {
      type:
        'edge',

      winner:
        first,

      difference,

      title:
        `${first.player.name} heeft een klein voordeel`,

      text:
        `${first.player.name} staat bovenaan, maar het verschil met ${second.player.name} is beperkt. Programma, speelzekerheid en het gewenste Fantasy-profiel kunnen de keuze nog beïnvloeden.`,
    }
  }

  return {
    type:
      'winner',

    winner:
      first,

    difference,

    title:
      `${first.player.name} is de beste keuze`,

    text:
      `${first.player.name} heeft voor de geselecteerde periode de sterkste totale Fantasy Outlook. Het verschil met ${second.player.name} bedraagt ${difference.toFixed(1)} FVT-punten.`,
  }
}

/*
|--------------------------------------------------------------------------
| Betrouwbaarheid
|--------------------------------------------------------------------------
*/

function buildConfidence(
  reports,
) {
  const scores =
    reports
      .map(
        (report) =>
          toNumber(
            report
              .fvtScore
              .confidence
              .score,
          ),
      )
      .filter(
        (score) =>
          score !== null,
      )

  if (
    !scores.length
  ) {
    return {
      score: 0,
      label: 'Beperkt',
    }
  }

  const score =
    round(
      scores.reduce(
        (
          total,
          value,
        ) =>
          total +
          value,
        0,
      ) /
      scores.length,
      0,
    )

  let label =
    'Beperkt'

  if (
    score >= 70
  ) {
    label =
      'Hoog'
  } else if (
    score >= 50
  ) {
    label =
      'Gemiddeld'
  }

  return {
    score,
    label,
  }
}

/*
|--------------------------------------------------------------------------
| Publieke functie
|--------------------------------------------------------------------------
*/

export function buildFantasyOutlookComparison({
  players = [],

  startRound =
    getAutomaticOutlookStartRound(),

  roundCount = 5,

  referencePlayers =
    players,
} = {}) {
  const selectedPlayers =
    players.filter(
      Boolean,
    )

  const safeStartRound =
    Math.max(
      1,
      Number(
        startRound,
      ) || 1,
    )

  /*
   * Alle gehele keuzes van 1 t/m 10
   * zijn toegestaan.
   */
  const safeRoundCount =
    Math.max(
      1,
      Math.min(
        10,
        Math.round(
          Number(
            roundCount,
          ) || 5,
        ),
      ),
    )

  const reports =
    selectedPlayers.map(
      (player) =>
        buildPlayerReport({
          player,

          startRound:
            safeStartRound,

          roundCount:
            safeRoundCount,

          referencePlayers,
        }),
    )

  const categoryResults =
    buildCategoryResults(
      reports,
    )

  const ranking =
    buildRanking(
      reports,
      categoryResults,
    )

  return {
    startRound:
      safeStartRound,

    roundCount:
      safeRoundCount,

    endRound:
      safeStartRound +
      safeRoundCount -
      1,

    reports,

    categoryResults,

    ranking,

    decision:
      buildDecision(
        ranking,
      ),

    confidence:
      buildConfidence(
        reports,
      ),
  }
}