/*
|--------------------------------------------------------------------------
| Expected Points Engine
|--------------------------------------------------------------------------
|
| Centrale orkestrator voor verwachte Fantasy-punten.
|
| Deze engine verbindt bestaande Fantasy Studio-modules:
|
| - Expected Points History Adapter
| - Expected Points Fixture Adapter
| - Fantasy Outlook
| - Expected Points Calculation
|
| Deze engine:
|
| - berekent geen nieuwe historische statistieken;
| - berekent geen wedstrijdmoeilijkheid;
| - definieert geen Fantasy-regels;
| - vergelijkt geen spelers;
| - kiest geen team.
|
| Hij verzamelt uitsluitend bestaande intelligence
| en levert één compleet Expected Points-resultaat.
|
*/

import {
  getExpectedPointsHistory,
} from './expectedPointsHistory.js'

import {
  getExpectedPointsFixture,
} from './expectedPointsFixture.js'

import {
  calculateExpectedPoints,
} from './expectedPointsCalculation.js'

import {
  calculateFantasyOutlook,
} from '../fantasyOutlookEngine.js'

import {
  getExpectedPointsPlayerData,
} from './expectedPointsPlayerData.js'

import {
  getExpectedPointsPreseasonProfile,
} from './expectedPointsPreseasonProfile.js'

/*
|--------------------------------------------------------------------------
| Configuratie
|--------------------------------------------------------------------------
*/

const DEFAULT_RECENT_MATCH_COUNT =
  5

const DEFAULT_USE_CACHE =
  true

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

function cleanText(
  value,
) {
  return String(
    value ?? '',
  ).trim()
}

/*
|--------------------------------------------------------------------------
| Opties normaliseren
|--------------------------------------------------------------------------
*/

function normalizeOptions(
  options = {},
) {
  return {
    season:
      options.season ??
      '',

    recentMatchCount:
      Math.max(
        1,
        Number(
          options.recentMatchCount,
        ) ||
        DEFAULT_RECENT_MATCH_COUNT,
      ),

    useCache:
      options.useCache !==
      false,

    /*
     * Optionele vooraf opgehaalde databronnen.
     *
     * Handig voor precompute, tests en batchverwerking.
     */
    results:
      Array.isArray(
        options.results,
      )
        ? options.results
        : undefined,

    teamRatings:
      Array.isArray(
        options.teamRatings,
      )
        ? options.teamRatings
        : undefined,

    /*
     * Reeds berekende intelligence mag worden
     * meegegeven om dubbel rekenwerk te voorkomen.
     */
    history:
      options.history ??
      null,

    fixtureProfile:
      options.fixtureProfile ??
      null,

    outlook:
      options.outlook ??
      null,
  }
}

/*
|--------------------------------------------------------------------------
| Geldigheid controleren
|--------------------------------------------------------------------------
*/

function isValidPlayer(
  player,
) {
  return Boolean(
    player &&
    cleanText(
      player.id,
    ) &&
    cleanText(
      player.club,
    ),
  )
}

function isValidFixture(
  fixture,
) {
  return Boolean(
    fixture &&
    (
      cleanText(
        fixture.id,
      ) ||
      (
        cleanText(
          fixture.home,
        ) &&
        cleanText(
          fixture.away,
        )
      )
    ),
  )
}

/*
|--------------------------------------------------------------------------
| Context bouwen
|--------------------------------------------------------------------------
*/

function buildContext({
  player,
  fixture,
  history,
  fixtureProfile,
  outlook,
}) {
  return {
    player: {
      id:
        cleanText(
          player?.id,
        ),

      name:
        cleanText(
          player?.name,
        ),

      club:
        cleanText(
          player?.club,
        ),

      season:
        cleanText(
          player?.season,
        ),

      position:
        cleanText(
          player
            ?.fantasyPosition ??
          player?.position,
        ),
    },

    fixture: {
      id:
        cleanText(
          fixtureProfile
            ?.fixtureId ??
          fixture?.id,
        ),

      round:
        Number(
          fixtureProfile
            ?.round ??
          fixture?.round,
        ) || 0,

      opponent:
        cleanText(
          fixtureProfile
            ?.opponent,
        ),

      venue:
        cleanText(
          fixtureProfile
            ?.venue,
        ),

      difficulty:
        toNumber(
          fixtureProfile
            ?.difficulty,
          3,
        ),

      confidence:
        toNumber(
          fixtureProfile
            ?.confidence,
        ),
    },

    history: {
      appearances:
        toNumber(
          history
            ?.sample
            ?.appearances,
        ),

      minutes:
        toNumber(
          history
            ?.sample
            ?.minutes,
        ),

      fantasyPointsPer90:
        toNumber(
          history
            ?.overall
            ?.fantasyPointsPer90,
        ),
    },

    outlook: {
      score:
        toNumber(
          outlook?.score,
          5,
        ),

      form:
        toNumber(
          outlook
            ?.scores
            ?.form ??
          outlook
            ?.form
            ?.score,
          5,
        ),

      availability:
        toNumber(
          outlook
            ?.scores
            ?.availability,
          5,
        ),

      risk:
        toNumber(
          outlook
            ?.scores
            ?.risk,
          5,
        ),
    },
  }
}

/*
|--------------------------------------------------------------------------
| Intelligence voorbereiden
|--------------------------------------------------------------------------
*/

function buildHistoryOptions(
  options,
) {
  const historyOptions = {
    recentMatchCount:
      options.recentMatchCount,
  }

  if (
    options.season
  ) {
    historyOptions.season =
      options.season
  }

  return historyOptions
}

function resolveHistory({
  player,
  options,
}) {
  if (
    options.history
  ) {
    return options.history
  }

  return getExpectedPointsHistory(
    player,
    buildHistoryOptions(
      options,
    ),
  )
}

function resolveFixtureProfile({
  player,
  fixture,
  options,
}) {
  if (
    options.fixtureProfile
  ) {
    return options.fixtureProfile
  }

  const fixtureOptions = {
    useCache:
      options.useCache,
  }

  if (
    Array.isArray(
      options.results,
    )
  ) {
    fixtureOptions.results =
      options.results
  }

  if (
    Array.isArray(
      options.teamRatings,
    )
  ) {
    fixtureOptions.teamRatings =
      options.teamRatings
  }

  return getExpectedPointsFixture(
    player,
    fixture,
    fixtureOptions,
  )
}

function resolveOutlook({
  player,
  fixtureProfile,
  options,
}) {
  if (
    options.outlook
  ) {
    return options.outlook
  }

  return calculateFantasyOutlook(
    player,
    {
      fixtureScore:
        fixtureProfile
          ?.score ??
        5,
    },
  )
}

/*
|--------------------------------------------------------------------------
| Productieprofiel samenstellen
|--------------------------------------------------------------------------
|
| Combineert het preseason-profiel met de actuele
| productie uit het lopende seizoen.
|
| De Season Transition Engine bepaalt hoeveel
| gewicht iedere bron krijgt.
|
*/

const PRODUCTION_RATE_KEYS = [
  'goalsPer90',
  'assistsPer90',
  'cleanSheetRate',
  'savesPer90',
  'penaltySavesPer90',
  'bonusPerMatch',
  'yellowCardsPer90',
  'redCardsPer90',
  'ownGoalsPer90',
  'penaltiesMissedPer90',
  'goalsConcededPer90',
]

function buildProductionHistory({
  history,
  preseasonProfile,
  playerData,
}) {
  const transition =
    playerData?.seasonTransition

  const preseasonOverall =
    preseasonProfile?.overall ??
    {}

  const currentOverall =
    history?.overall ??
    {}

  const blendedOverall = {
    ...currentOverall,
  }

  const production =
  transition?.production ??
  {}

const preseasonWeight =
  toNumber(
    production.preseasonWeight,
    1,
  )

const currentSeasonWeight =
  toNumber(
    production.currentSeasonWeight,
    0,
  )

PRODUCTION_RATE_KEYS.forEach(
  (key) => {
    blendedOverall[key] =
      round(
        (
          toNumber(
            preseasonOverall[key],
          ) *
            preseasonWeight
        ) +
        (
          toNumber(
            currentOverall[key],
          ) *
            currentSeasonWeight
        ),
        4,
      )
  },
)

  return {
    ...history,

    overall:
      blendedOverall,

    productionSource: {
      mode:
        transition
          ?.production
          ?.phase ??
        'preseason',

      preseasonWeight:
        transition
          ?.production
          ?.preseasonWeight ??
        1,

      currentSeasonWeight:
        transition
          ?.production
          ?.currentSeasonWeight ??
        0,

      preseasonProfile,

      currentHistory:
        history,
    },
  }
}

/*
|--------------------------------------------------------------------------
| Waarschuwingen
|--------------------------------------------------------------------------
*/

function buildWarnings({
  history,
  fixtureProfile,
  outlook,
  calculation,
}) {
  const warnings = []

  if (
    !history
  ) {
    warnings.push(
      'Er kon geen historisch Expected Points-profiel worden opgebouwd.',
    )
  } else {
    const appearances =
      toNumber(
        history
          ?.sample
          ?.appearances,
      )

    const minutes =
      toNumber(
        history
          ?.sample
          ?.minutes,
      )

    if (
      appearances <= 0
    ) {
      warnings.push(
        'Er zijn nog geen geregistreerde optredens beschikbaar voor de historische projectie.',
      )
    }

    if (
      minutes <= 0
    ) {
      warnings.push(
        'Er zijn nog geen historische speelminuten beschikbaar.',
      )
    }
  }

  if (
    fixtureProfile
      ?.source ===
    'neutral-fallback'
  ) {
    warnings.push(
      'De wedstrijd gebruikt een neutrale fixturefallback.',
    )
  }

  if (
    toNumber(
      fixtureProfile
        ?.confidence,
    ) <
    30
  ) {
    warnings.push(
      'De betrouwbaarheid van de wedstrijdanalyse is beperkt.',
    )
  }

  if (
    outlook
      ?.form
      ?.hasData ===
    false
  ) {
    warnings.push(
      'Er is nog geen actuele vormdata beschikbaar; vorm wordt neutraal behandeld.',
    )
  }

  if (
    calculation
      ?.positionFallbackUsed ===
    true
  ) {
    warnings.push(
      'De positie werd niet herkend; tijdelijk is de middenvelderpositie gebruikt.',
    )
  }

  return [
    ...new Set(
      warnings,
    ),
  ]
}

/*
|--------------------------------------------------------------------------
| Eén speler — één wedstrijd
|--------------------------------------------------------------------------
*/

/**
 * Bouwt één volledige Expected Points-projectie
 * voor één speler in één wedstrijd.
 */
export function calculatePlayerFixtureExpectedPoints(
  player,
  fixture,
  options = {},
) {
  if (
    !isValidPlayer(
      player,
    ) ||
    !isValidFixture(
      fixture,
    )
  ) {
    return null
  }

  const normalizedOptions =
    normalizeOptions(
      options,
    )

  const history =
    resolveHistory({
      player,
      options:
        normalizedOptions,
    })

  if (
    !history
  ) {
    return null
  }

  const fixtureProfile =
    resolveFixtureProfile({
      player,
      fixture,
      options:
        normalizedOptions,
    })

  if (
    !fixtureProfile
  ) {
    return null
  }

const outlook =
  resolveOutlook({
    player,
    fixtureProfile,
    options:
      normalizedOptions,
  })

const playerData =
  getExpectedPointsPlayerData(
    player,
    {
      history,
      outlook,
    },
  )

if (
  !playerData
) {
  return null
}

const preseasonProfile =
  getExpectedPointsPreseasonProfile(
    playerData,
    {
      outlook,
    },
  )

if (
  !preseasonProfile
) {
  return null
}

const productionHistory =
  buildProductionHistory({
    history,
    preseasonProfile,
    playerData,
  })

const calculation =
  calculateExpectedPoints({
    playerData,

    history:
      productionHistory,

    fixture:
      fixtureProfile,

    outlook,
  })

  if (
    !calculation
  ) {
    return null
  }

  const context =
    buildContext({
      player,
      fixture,
      history,
      fixtureProfile,
      outlook,
    })

  const warnings =
    buildWarnings({
      history,
      fixtureProfile,
      outlook,
      calculation,
    })

  return {
    playerId:
      cleanText(
        player.id,
      ),

    playerName:
      cleanText(
        player.name,
      ),

    season:
      cleanText(
        fixture
          ?.season ??
        player
          ?.season,
      ),

    fixtureId:
      cleanText(
        fixtureProfile
          ?.fixtureId ??
        fixture
          ?.id,
      ),

    round:
      Number(
        fixtureProfile
          ?.round ??
        fixture
          ?.round,
      ) || 0,

    expectedPoints:
      round(
        calculation
          .expectedPoints,
      ),

    expectedMinutes:
      round(
        calculation
          .expectedMinutes,
        1,
      ),

    conditionalMinutes:
      round(
        calculation
          .conditionalMinutes,
        1,
      ),

    appearanceProbability:
      round(
        calculation
          .appearanceProbability,
        4,
      ),

    sixtyMinuteProbability:
      round(
        calculation
          .sixtyMinuteProbability,
        4,
      ),

    position:
      calculation.position,

    opponent:
      fixtureProfile
        .opponent ??
      '',

    venue:
      fixtureProfile
        .venue ??
      'unknown',

    isHome:
      fixtureProfile
        .isHome ===
      true,

    fixtureScore:
      round(
        fixtureProfile
          .score,
        1,
      ),

    fixtureDifficulty:
      round(
        fixtureProfile
          .difficulty,
        1,
      ),

    fixtureConfidence:
      round(
        fixtureProfile
          .confidence,
        0,
      ),

    breakdown:
      calculation.breakdown,

    events:
      calculation.events,

    modifiers:
      calculation.modifiers,

    context,

    warnings,

    /*
     * De gebruikte specialistische resultaten
     * blijven beschikbaar voor uitleg, debugging
     * en toekomstige projectielagen.
     */
    intelligence: {
  playerData,

  history,

  preseasonProfile,

  productionHistory,

  fixture:
    fixtureProfile,

  outlook,
},

    source: {
      id:
        'expected-points-engine',

      label:
        'Expected Points Engine',

      type:
        'automatic',
    },
  }
}

/*
|--------------------------------------------------------------------------
| Wedstrijden groeperen per speelronde
|--------------------------------------------------------------------------
*/

function groupFixturesByRound(
  fixtures,
) {
  const rounds =
    new Map()

  fixtures.forEach(
    (
      fixture,
    ) => {
      const roundNumber =
        Number(
          fixture?.round,
        ) || 0

      if (
        !rounds.has(
          roundNumber,
        )
      ) {
        rounds.set(
          roundNumber,
          [],
        )
      }

      rounds
        .get(
          roundNumber,
        )
        .push(
          fixture,
        )
    },
  )

  return rounds
}

/*
|--------------------------------------------------------------------------
| Speelrondetype
|--------------------------------------------------------------------------
*/

function getRoundType(
  projections,
) {
  if (
    !projections.length
  ) {
    return 'blank'
  }

  if (
    projections.length >
    1
  ) {
    return 'double'
  }

  return 'single'
}

/*
|--------------------------------------------------------------------------
| Speelronde samenvatten
|--------------------------------------------------------------------------
*/

function buildRoundProjection({
  round,
  projections,
}) {
  const type =
    getRoundType(
      projections,
    )

  const expectedPoints =
    projections.reduce(
      (
        total,
        projection,
      ) =>
        total +
        toNumber(
          projection
            ?.expectedPoints,
        ),
      0,
    )

  const expectedMinutes =
    projections.reduce(
      (
        total,
        projection,
      ) =>
        total +
        toNumber(
          projection
            ?.expectedMinutes,
        ),
      0,
    )

  const appearanceProbability =
    projections.length
      ? 1 -
        projections.reduce(
          (
            probabilityNone,
            projection,
          ) =>
            probabilityNone *
            (
              1 -
              toNumber(
                projection
                  ?.appearanceProbability,
              )
            ),
          1,
        )
      : 0

  const warnings = [
    ...new Set(
      projections.flatMap(
        (
          projection,
        ) =>
          projection
            ?.warnings ??
          [],
      ),
    ),
  ]

  return {
    round:
      Number(
        round,
      ) || 0,

    type,

    fixtureCount:
      projections.length,

    expectedPoints:
      roundNumber(
        expectedPoints,
        2,
      ),

    expectedMinutes:
      roundNumber(
        expectedMinutes,
        1,
      ),

    appearanceProbability:
      roundNumber(
        appearanceProbability,
        4,
      ),

    fixtures:
      projections,

    warnings,
  }
}

/*
|--------------------------------------------------------------------------
| Hulpfunctie voor afronden
|--------------------------------------------------------------------------
|
| Deze aparte naam voorkomt verwarring met de
| variabele `round` in buildRoundProjection().
|
*/

function roundNumber(
  value,
  digits = 2,
) {
  return round(
    value,
    digits,
  )
}

/*
|--------------------------------------------------------------------------
| Relevante fixtures selecteren
|--------------------------------------------------------------------------
*/

function filterPlayerFixtures({
  player,
  fixtures,
  startRound,
  roundCount,
}) {
  const normalizedClub =
    cleanText(
      player?.club,
    )
      .toLocaleLowerCase(
        'nl-NL',
      )

  const endRound =
    startRound +
    roundCount -
    1

  return fixtures
    .filter(
      (
        fixture,
      ) => {
        const fixtureRound =
          Number(
            fixture?.round,
          )

        return (
          fixtureRound >=
            startRound &&
          fixtureRound <=
            endRound
        )
      },
    )
    .filter(
      (
        fixture,
      ) => {
        const home =
          cleanText(
            fixture?.home,
          )
            .toLocaleLowerCase(
              'nl-NL',
            )

        const away =
          cleanText(
            fixture?.away,
          )
            .toLocaleLowerCase(
              'nl-NL',
            )

        return (
          home ===
            normalizedClub ||
          away ===
            normalizedClub
        )
      },
    )
    .sort(
      (
        left,
        right,
      ) =>
        Number(
          left?.round,
        ) -
          Number(
            right?.round,
          ) ||

        String(
          left?.date ??
          '',
        ).localeCompare(
          String(
            right?.date ??
            '',
          ),
        ) ||

        String(
          left?.time ??
          '',
        ).localeCompare(
          String(
            right?.time ??
            '',
          ),
        ),
    )
}

/*
|--------------------------------------------------------------------------
| Eén speler — meerdere speelrondes
|--------------------------------------------------------------------------
*/

/**
 * Bouwt Expected Points voor één speler over
 * meerdere speelrondes.
 *
 * Ondersteunt:
 *
 * - normale speelrondes;
 * - lege speelrondes;
 * - dubbele speelrondes;
 * - meerdere wedstrijden binnen dezelfde ronde.
 */
export function calculatePlayerExpectedPointsRange(
  player,
  fixtures,
  {
    startRound = 1,
    roundCount = 5,
    ...options
  } = {},
) {
  if (
    !isValidPlayer(
      player,
    ) ||
    !Array.isArray(
      fixtures,
    )
  ) {
    return null
  }

  const safeStartRound =
    Math.max(
      1,
      Number(
        startRound,
      ) || 1,
    )

  const safeRoundCount =
    Math.max(
      1,
      Number(
        roundCount,
      ) || 5,
    )

  const relevantFixtures =
    filterPlayerFixtures({
      player,
      fixtures,

      startRound:
        safeStartRound,

      roundCount:
        safeRoundCount,
    })

  const fixturesByRound =
    groupFixturesByRound(
      relevantFixtures,
    )

  const rounds =
    Array.from(
      {
        length:
          safeRoundCount,
      },
      (
        _,
        index,
      ) => {
        const roundNumber =
          safeStartRound +
          index

        const roundFixtures =
          fixturesByRound.get(
            roundNumber,
          ) ??
          []

        const projections =
          roundFixtures
            .map(
              (
                fixture,
              ) =>
                calculatePlayerFixtureExpectedPoints(
                  player,
                  fixture,
                  options,
                ),
            )
            .filter(Boolean)

        return buildRoundProjection({
          round:
            roundNumber,

          projections,
        })
      },
    )

  const totalExpectedPoints =
    rounds.reduce(
      (
        total,
        roundProjection,
      ) =>
        total +
        toNumber(
          roundProjection
            .expectedPoints,
        ),
      0,
    )

  const totalExpectedMinutes =
    rounds.reduce(
      (
        total,
        roundProjection,
      ) =>
        total +
        toNumber(
          roundProjection
            .expectedMinutes,
        ),
      0,
    )

  const blankRounds =
    rounds.filter(
      (
        roundProjection,
      ) =>
        roundProjection.type ===
        'blank',
    ).length

  const doubleRounds =
    rounds.filter(
      (
        roundProjection,
      ) =>
        roundProjection.type ===
        'double',
    ).length

  const warnings = [
    ...new Set(
      rounds.flatMap(
        (
          roundProjection,
        ) =>
          roundProjection
            .warnings ??
          [],
      ),
    ),
  ]

  return {
    playerId:
      cleanText(
        player.id,
      ),

    playerName:
      cleanText(
        player.name,
      ),

    club:
      cleanText(
        player.club,
      ),

    season:
      cleanText(
        player.season,
      ),

    startRound:
      safeStartRound,

    endRound:
      safeStartRound +
      safeRoundCount -
      1,

    roundCount:
      safeRoundCount,

    fixtureCount:
      relevantFixtures.length,

    blankRounds,

    doubleRounds,

    totalExpectedPoints:
      round(
        totalExpectedPoints,
        2,
      ),

    averageExpectedPointsPerRound:
      round(
        divide(
          totalExpectedPoints,
          safeRoundCount,
        ),
        2,
      ),

    totalExpectedMinutes:
      round(
        totalExpectedMinutes,
        1,
      ),

    averageExpectedMinutesPerRound:
      round(
        divide(
          totalExpectedMinutes,
          safeRoundCount,
        ),
        1,
      ),

    rounds,

    fixtures:
      rounds.flatMap(
        (
          roundProjection,
        ) =>
          roundProjection
            .fixtures,
      ),

    warnings,

    source: {
      id:
        'expected-points-engine',

      label:
        'Expected Points Engine',

      type:
        'automatic',
    },
  }
}

/*
|--------------------------------------------------------------------------
| Delingshelper
|--------------------------------------------------------------------------
|
| Wordt gebruikt voor gemiddelden binnen
| meerweekse projecties en batchresultaten.
|
*/

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
| Range-cache
|--------------------------------------------------------------------------
|
| De specialistische Fixture Adapter heeft al
| een eigen cache.
|
| Deze cache bewaart het complete resultaat van:
|
| speler + fixtures + geselecteerde periode.
|
| Vooraf meegegeven intelligence en aangepaste
| databronnen worden bewust niet gecachet, omdat
| die per berekening kunnen verschillen.
|
*/

const EXPECTED_POINTS_RANGE_CACHE =
  new Map()

function canUseRangeCache(
  options = {},
) {
  return (
    options.useCache !== false &&

    !options.history &&

    !options.fixtureProfile &&

    !options.outlook &&

    !Array.isArray(
      options.results,
    ) &&

    !Array.isArray(
      options.teamRatings,
    )
  )
}

function getFixtureCacheIdentity(
  fixture,
) {
  return [
    fixture?.id ?? '',
    fixture?.season ?? '',
    fixture?.round ?? '',
    fixture?.home ?? '',
    fixture?.away ?? '',
    fixture?.date ?? '',
    fixture?.time ?? '',
  ].join(':')
}

function getRelevantFixtureCacheIdentity({
  player,
  fixtures,
  startRound,
  roundCount,
}) {
  const relevantFixtures =
    filterPlayerFixtures({
      player,
      fixtures,
      startRound,
      roundCount,
    })

  return relevantFixtures
    .map(
      getFixtureCacheIdentity,
    )
    .join('|')
}

function getRangeCacheKey({
  player,
  fixtures,
  startRound,
  roundCount,
  recentMatchCount,
  season,
}) {
  return [
    player?.season ?? '',
    player?.id ?? '',
    player?.club ?? '',

    player?.fantasyPosition ??
      player?.position ??
      '',

    season ?? '',

    startRound,
    roundCount,
    recentMatchCount,

    getRelevantFixtureCacheIdentity({
      player,
      fixtures,
      startRound,
      roundCount,
    }),
  ].join('::')
}

/*
|--------------------------------------------------------------------------
| Centrale publieke orkestrator
|--------------------------------------------------------------------------
|
| Dit is de aanbevolen hoofdfunctie voor:
|
| één speler
| +
| een reeks wedstrijden
| +
| een gekozen periode
|
| De functie gebruikt waar mogelijk de cache en
| valt anders terug op calculatePlayerExpectedPointsRange().
|
*/

/**
 * Centrale ingang voor een Expected Points-projectie
 * van één speler over meerdere speelrondes.
 */
export function calculateExpectedPointsEngine(
  player,
  fixtures,
  {
    startRound = 1,
    roundCount = 5,
    ...options
  } = {},
) {
  if (
    !isValidPlayer(
      player,
    ) ||
    !Array.isArray(
      fixtures,
    )
  ) {
    return null
  }

  const safeStartRound =
    Math.max(
      1,
      Number(
        startRound,
      ) || 1,
    )

  const safeRoundCount =
    Math.max(
      1,
      Number(
        roundCount,
      ) || 5,
    )

  const normalizedOptions =
    normalizeOptions(
      options,
    )

  const useCache =
    canUseRangeCache({
      ...options,

      useCache:
        normalizedOptions
          .useCache,
    })

  const cacheKey =
    getRangeCacheKey({
      player,
      fixtures,

      startRound:
        safeStartRound,

      roundCount:
        safeRoundCount,

      recentMatchCount:
        normalizedOptions
          .recentMatchCount,

      season:
        normalizedOptions
          .season,
    })

  if (
    useCache &&
    EXPECTED_POINTS_RANGE_CACHE.has(
      cacheKey,
    )
  ) {
    return EXPECTED_POINTS_RANGE_CACHE.get(
      cacheKey,
    )
  }

  const result =
    calculatePlayerExpectedPointsRange(
      player,
      fixtures,
      {
        ...options,

        startRound:
          safeStartRound,

        roundCount:
          safeRoundCount,
      },
    )

  if (
    result &&
    useCache
  ) {
    EXPECTED_POINTS_RANGE_CACHE.set(
      cacheKey,
      result,
    )
  }

  return result
}

/*
|--------------------------------------------------------------------------
| Meerdere spelers
|--------------------------------------------------------------------------
*/

/**
 * Berekent voor meerdere spelers dezelfde
 * geselecteerde periode.
 */
export function calculateExpectedPointsForPlayers(
  players,
  fixtures,
  options = {},
) {
  if (
    !Array.isArray(
      players,
    ) ||
    !Array.isArray(
      fixtures,
    )
  ) {
    return []
  }

  return players
    .map(
      (
        player,
      ) =>
        calculateExpectedPointsEngine(
          player,
          fixtures,
          options,
        ),
    )
    .filter(Boolean)
}

/*
|--------------------------------------------------------------------------
| Rangschikking
|--------------------------------------------------------------------------
|
| Deze functie kiest nog geen Fantasy-team.
|
| Hij sorteert uitsluitend de berekende projecties
| van hoog naar laag. De toekomstige Team Optimizer
| blijft eigenaar van de echte selectie.
|
*/

export function rankExpectedPointsResults(
  results,
) {
  if (
    !Array.isArray(
      results,
    )
  ) {
    return []
  }

  return results
    .filter(Boolean)
    .sort(
      (
        left,
        right,
      ) =>
        toNumber(
          right
            ?.totalExpectedPoints,
        ) -
          toNumber(
            left
              ?.totalExpectedPoints,
          ) ||

        toNumber(
          right
            ?.averageExpectedPointsPerRound,
        ) -
          toNumber(
            left
              ?.averageExpectedPointsPerRound,
          ) ||

        cleanText(
          left?.playerName,
        ).localeCompare(
          cleanText(
            right?.playerName,
          ),
          'nl-NL',
        ),
    )
    .map(
      (
        result,
        index,
      ) => ({
        ...result,

        rank:
          index + 1,
      }),
    )
}

/*
|--------------------------------------------------------------------------
| Batchsamenvatting
|--------------------------------------------------------------------------
*/

export function summarizeExpectedPointsBatch(
  results,
) {
  const validResults =
    Array.isArray(
      results,
    )
      ? results.filter(Boolean)
      : []

  const totalExpectedPoints =
    validResults.reduce(
      (
        total,
        result,
      ) =>
        total +
        toNumber(
          result
            ?.totalExpectedPoints,
        ),
      0,
    )

  const totalFixtures =
    validResults.reduce(
      (
        total,
        result,
      ) =>
        total +
        toNumber(
          result
            ?.fixtureCount,
        ),
      0,
    )

  const totalBlankRounds =
    validResults.reduce(
      (
        total,
        result,
      ) =>
        total +
        toNumber(
          result
            ?.blankRounds,
        ),
      0,
    )

  const totalDoubleRounds =
    validResults.reduce(
      (
        total,
        result,
      ) =>
        total +
        toNumber(
          result
            ?.doubleRounds,
        ),
      0,
    )

  return {
    playerCount:
      validResults.length,

    totalExpectedPoints:
      round(
        totalExpectedPoints,
        2,
      ),

    averageExpectedPointsPerPlayer:
      round(
        divide(
          totalExpectedPoints,
          validResults.length,
        ),
        2,
      ),

    totalFixtures,

    totalBlankRounds,

    totalDoubleRounds,

    highestProjection:
      rankExpectedPointsResults(
        validResults,
      )[0] ??
      null,
  }
}

/*
|--------------------------------------------------------------------------
| Cachebeheer
|--------------------------------------------------------------------------
*/

export function clearExpectedPointsEngineCache() {
  EXPECTED_POINTS_RANGE_CACHE.clear()
}

export function getExpectedPointsEngineCacheSize() {
  return EXPECTED_POINTS_RANGE_CACHE.size
}

export function hasExpectedPointsEngineCached(
  player,
  fixtures,
  {
    startRound = 1,
    roundCount = 5,
    ...options
  } = {},
) {
  if (
    !isValidPlayer(
      player,
    ) ||
    !Array.isArray(
      fixtures,
    )
  ) {
    return false
  }

  const normalizedOptions =
    normalizeOptions(
      options,
    )

  const safeStartRound =
    Math.max(
      1,
      Number(
        startRound,
      ) || 1,
    )

  const safeRoundCount =
    Math.max(
      1,
      Number(
        roundCount,
      ) || 5,
    )

  const cacheKey =
    getRangeCacheKey({
      player,
      fixtures,

      startRound:
        safeStartRound,

      roundCount:
        safeRoundCount,

      recentMatchCount:
        normalizedOptions
          .recentMatchCount,

      season:
        normalizedOptions
          .season,
    })

  return EXPECTED_POINTS_RANGE_CACHE.has(
    cacheKey,
  )
}

/*
|--------------------------------------------------------------------------
| Engine-informatie
|--------------------------------------------------------------------------
*/

export function getExpectedPointsEngineInfo() {
  return {
    id:
      'expected-points-engine',

    label:
      'Expected Points Engine',

    version:
      '1.0.0',

    description:
      'Centrale orkestrator voor verwachte Fantasy-punten.',

    supports: {
      singleFixture:
        true,

      multipleRounds:
        true,

      blankRounds:
        true,

      doubleRounds:
        true,

      multiplePlayers:
        true,

      caching:
        true,
    },

    dependencies: [
      'Expected Points History Adapter',
      'Expected Points Fixture Adapter',
      'Fantasy Outlook Engine',
      'Expected Points Calculation',
      'Fantasy Game Rules Engine',
    ],
  }
}