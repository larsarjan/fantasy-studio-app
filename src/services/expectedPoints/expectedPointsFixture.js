/*
|--------------------------------------------------------------------------
| Expected Points - Fixture Adapter
|--------------------------------------------------------------------------
|
| Deze module vertaalt de bestaande output van
| Fixture Intelligence naar componentmodifiers
| voor de Expected Points Calculation Engine.
|
| Deze module:
|
| - berekent geen wedstrijdmoeilijkheid;
| - analyseert geen teamsterkte;
| - analyseert geen recente teamvorm;
| - haalt geen schema of uitslagen op;
| - berekent geen Expected Points.
|
| Fixture Intelligence blijft eigenaar van de
| volledige wedstrijdanalyse.
|
*/

import {
  EXPECTED_POINTS_FIXTURE_CONFIG,
} from './expectedPointsConfig.js'

import {
  calculateFixtureIntelligence,
} from '../fixtureIntelligenceEngine.js'

/*
|--------------------------------------------------------------------------
| Getalhelpers
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
  digits = 4,
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

/*
|--------------------------------------------------------------------------
| Configuratie uitlezen
|--------------------------------------------------------------------------
*/

function getNeutralScore() {
  return toNumber(
    EXPECTED_POINTS_FIXTURE_CONFIG
      ?.neutralScore,
    5,
  )
}

function getMinimumMultiplier() {
  return toNumber(
    EXPECTED_POINTS_FIXTURE_CONFIG
      ?.multiplier
      ?.minimum,
    0.70,
  )
}

function getMaximumMultiplier() {
  return toNumber(
    EXPECTED_POINTS_FIXTURE_CONFIG
      ?.multiplier
      ?.maximum,
    1.30,
  )
}

function getComponentSensitivity(
  key,
) {
  return toNumber(
    EXPECTED_POINTS_FIXTURE_CONFIG
      ?.componentSensitivity
      ?.[key],
    1,
  )
}

/*
|--------------------------------------------------------------------------
| Neutraal Fixture Intelligence-profiel
|--------------------------------------------------------------------------
|
| Dit profiel wordt alleen gebruikt wanneer de
| bestaande Fixture Intelligence geen resultaat
| kan leveren.
|
| Een ontbrekende analyse mag niet automatisch
| als gunstig of ongunstig worden geïnterpreteerd.
|
*/

function createNeutralIntelligence(
  player,
  fixture,
) {
  return {
    fixtureId:
      fixture?.id ?? '',

    season:
      fixture?.season ?? '',

    round:
      Number(
        fixture?.round,
      ) || 0,

    date:
      fixture?.date ?? '',

    time:
      fixture?.time ?? '',

    club:
      player?.club ?? '',

    opponent:
      '',

    venue:
      'unknown',

    isHome:
      false,

    positionType:
      'unknown',

    positionLabel:
      'Speler',

    score:
      getNeutralScore(),

    rawScore:
      getNeutralScore(),

    label:
      'Neutrale wedstrijd',

    confidence:
      0,

    difficulty:
      3,

    components:
      {},

    explanation: [
      'Er was geen bruikbare Fixture Intelligence beschikbaar; de wedstrijd wordt neutraal beoordeeld.',
    ],

    source:
      'neutral-fallback',
  }
}

/*
|--------------------------------------------------------------------------
| Fixture Intelligence ophalen
|--------------------------------------------------------------------------
*/

function getFixtureIntelligence({
  player,
  fixture,
  results,
  teamRatings,
}) {
  const options = {
    player,
    fixture,
  }

  if (
    Array.isArray(
      results,
    )
  ) {
    options.results =
      results
  }

  if (
    Array.isArray(
      teamRatings,
    )
  ) {
    options.teamRatings =
      teamRatings
  }

  return (
    calculateFixtureIntelligence(
      options,
    ) ??
    createNeutralIntelligence(
      player,
      fixture,
    )
  )
}

/*
|--------------------------------------------------------------------------
| Programmascore naar basismultiplier
|--------------------------------------------------------------------------
|
| Fixture Intelligence gebruikt:
|
| 0  = extreem ongunstig
| 5  = neutraal
| 10 = extreem gunstig
|
| Deze adapter vertaalt die bestaande score
| naar een begrensde productiemultiplier.
|
*/

function convertScoreToBaseMultiplier(
  fixtureScore,
) {
  const neutralScore =
    getNeutralScore()

  const normalizedDifference =
    (
      clamp(
        fixtureScore,
        0,
        10,
      ) -
      neutralScore
    ) /
    5

  /*
   * Een maximale afwijking van neutraal
   * verandert de basisproductie met 30%.
   *
   * Deze vertaling is centrale Expected
   * Points-configuratie, geen nieuwe analyse
   * van de wedstrijd.
   */
  const multiplier =
    1 +
    normalizedDifference *
      0.30

  return round(
    clamp(
      multiplier,
      getMinimumMultiplier(),
      getMaximumMultiplier(),
    ),
  )
}

/*
|--------------------------------------------------------------------------
| Componentmodifier
|--------------------------------------------------------------------------
|
| Niet iedere Fantasy-gebeurtenis reageert even
| sterk op een gunstige of ongunstige wedstrijd.
|
| De gevoeligheden staan uitsluitend in
| EXPECTED_POINTS_FIXTURE_CONFIG.
|
*/

function calculateComponentModifier(
  baseMultiplier,
  component,
) {
  const sensitivity =
    getComponentSensitivity(
      component,
    )

  const modifier =
    1 +
    (
      baseMultiplier -
      1
    ) *
      sensitivity

  return round(
    clamp(
      modifier,
      getMinimumMultiplier(),
      getMaximumMultiplier(),
    ),
  )
}

/*
|--------------------------------------------------------------------------
| Standaard componentmodifiers
|--------------------------------------------------------------------------
*/

function buildStandardModifiers(
  baseMultiplier,
) {
  return {
    appearance:
      calculateComponentModifier(
        baseMultiplier,
        'appearance',
      ),

    goals:
      calculateComponentModifier(
        baseMultiplier,
        'goals',
      ),

    assists:
      calculateComponentModifier(
        baseMultiplier,
        'assists',
      ),

    cleanSheet:
      calculateComponentModifier(
        baseMultiplier,
        'cleanSheet',
      ),

    saves:
      calculateComponentModifier(
        baseMultiplier,
        'saves',
      ),

    penaltySaves:
      calculateComponentModifier(
        baseMultiplier,
        'penaltySaves',
      ),

    bonus:
      calculateComponentModifier(
        baseMultiplier,
        'bonus',
      ),

    cards:
      calculateComponentModifier(
        baseMultiplier,
        'cards',
      ),

    goalsConceded:
      calculateComponentModifier(
        baseMultiplier,
        'goalsConceded',
      ),

    ownGoals:
      calculateComponentModifier(
        baseMultiplier,
        'ownGoals',
      ),

    penaltiesMissed:
      calculateComponentModifier(
        baseMultiplier,
        'penaltiesMissed',
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Keepercorrectie voor reddingen
|--------------------------------------------------------------------------
|
| Een zware wedstrijd verlaagt doorgaans de kans
| op goals en clean sheets, maar kan juist meer
| reddingsmogelijkheden opleveren.
|
| De grootte van deze correctie komt uit de
| bestaande Expected Points-configuratie.
|
*/

function adjustGoalkeeperSaves({
  modifiers,
  baseMultiplier,
  positionType,
}) {
  if (
    positionType !==
    'goalkeeper'
  ) {
    return modifiers
  }

  const sensitivity =
    toNumber(
      EXPECTED_POINTS_FIXTURE_CONFIG
        ?.goalkeeperSaveSensitivity,
      0,
    )

  const inverseFixtureEffect =
    (
      1 -
      baseMultiplier
    ) *
    sensitivity

  return {
    ...modifiers,

    saves:
      round(
        clamp(
          modifiers.saves +
          inverseFixtureEffect,
          getMinimumMultiplier(),
          getMaximumMultiplier(),
        ),
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Definitief adapterprofiel
|--------------------------------------------------------------------------
*/

function buildExpectedPointsFixtureProfile({
  player,
  fixture,
  intelligence,
}) {
  const baseMultiplier =
    convertScoreToBaseMultiplier(
      intelligence.score,
    )

  const standardModifiers =
    buildStandardModifiers(
      baseMultiplier,
    )

  const modifiers =
    adjustGoalkeeperSaves({
      modifiers:
        standardModifiers,

      baseMultiplier,

      positionType:
        intelligence
          .positionType,
    })

  return {
    playerId:
      player?.id ?? '',

    fixtureId:
      intelligence.fixtureId ??
      fixture?.id ??
      '',

    season:
      intelligence.season ??
      fixture?.season ??
      '',

    round:
      Number(
        intelligence.round ??
        fixture?.round,
      ) || 0,

    date:
      intelligence.date ??
      fixture?.date ??
      '',

    time:
      intelligence.time ??
      fixture?.time ??
      '',

    club:
      intelligence.club ??
      player?.club ??
      '',

    opponent:
      intelligence.opponent ??
      '',

    venue:
      intelligence.venue ??
      'unknown',

    isHome:
      intelligence.isHome ===
      true,

    positionType:
      intelligence.positionType ??
      'unknown',

    positionLabel:
      intelligence.positionLabel ??
      'Speler',

    score:
      round(
        intelligence.score,
        1,
      ),

    rawScore:
      toNumber(
        intelligence.rawScore,
        intelligence.score,
      ),

    label:
      intelligence.label ??
      'Neutrale wedstrijd',

    difficulty:
      round(
        intelligence.difficulty,
        1,
      ),

    confidence:
      round(
        intelligence.confidence,
        0,
      ),

    baseMultiplier,

    modifiers,

    components:
      intelligence.components ??
      {},

    explanation:
      Array.isArray(
        intelligence.explanation,
      )
        ? intelligence.explanation
        : [],

    source:
      intelligence.source ??
      'fixture-intelligence',

    /*
     * De originele Fixture Intelligence-output
     * blijft beschikbaar voor debugging en
     * toekomstige uitbreiding.
     */
    sourceIntelligence:
      intelligence,
  }
}

/*
|--------------------------------------------------------------------------
| Cache
|--------------------------------------------------------------------------
*/

const FIXTURE_CACHE =
  new Map()

function getFixtureIdentity(
  fixture,
) {
  return (
    fixture?.id ??
    [
      fixture?.season ?? '',
      fixture?.round ?? '',
      fixture?.home ?? '',
      fixture?.away ?? '',
      fixture?.date ?? '',
    ].join('::')
  )
}

function getPlayerPosition(
  player,
) {
  return (
    player?.fantasyPosition ??
    player?.position ??
    ''
  )
}

function getCacheKey(
  player,
  fixture,
) {
  return [
    player?.season ?? '',
    player?.id ?? '',
    player?.club ?? '',
    getPlayerPosition(
      player,
    ),
    getFixtureIdentity(
      fixture,
    ),
  ].join('::')
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

/**
 * Vertaalt Fixture Intelligence voor één speler
 * en één wedstrijd naar Expected Points-modifiers.
 */
export function getExpectedPointsFixture(
  player,
  fixture,
  options = {},
) {
  if (
    !player ||
    !fixture
  ) {
    return null
  }

  const cacheKey =
    getCacheKey(
      player,
      fixture,
    )

  const useCache =
    options.useCache !==
    false

  if (
    useCache &&
    FIXTURE_CACHE.has(
      cacheKey,
    )
  ) {
    return FIXTURE_CACHE.get(
      cacheKey,
    )
  }

  const intelligence =
    getFixtureIntelligence({
      player,
      fixture,

      results:
        options.results,

      teamRatings:
        options.teamRatings,
    })

  const profile =
    buildExpectedPointsFixtureProfile({
      player,
      fixture,
      intelligence,
    })

  if (
    useCache
  ) {
    FIXTURE_CACHE.set(
      cacheKey,
      profile,
    )
  }

  return profile
}

/**
 * Bouwt Expected Points-fixtureprofielen
 * voor meerdere wedstrijden van één speler.
 */
export function getExpectedPointsFixtures(
  player,
  fixtures,
  options = {},
) {
  if (
    !Array.isArray(
      fixtures,
    )
  ) {
    return []
  }

  return fixtures
    .map(
      (
        fixture,
      ) =>
        getExpectedPointsFixture(
          player,
          fixture,
          options,
        ),
    )
    .filter(Boolean)
}

/**
 * Leegt de volledige fixturecache.
 */
export function clearExpectedPointsFixtureCache() {
  FIXTURE_CACHE.clear()
}

/*
|--------------------------------------------------------------------------
| Debughelpers
|--------------------------------------------------------------------------
*/

export function getExpectedPointsFixtureCacheSize() {
  return FIXTURE_CACHE.size
}

export function hasExpectedPointsFixtureCached(
  player,
  fixture,
) {
  if (
    !player ||
    !fixture
  ) {
    return false
  }

  return FIXTURE_CACHE.has(
    getCacheKey(
      player,
      fixture,
    ),
  )
}