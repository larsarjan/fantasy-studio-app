import {
  getFixtures,
  getResults,
  getTeamRatings,
} from './database.js'

import {
  calculateFixtureDifficulty,
} from './difficultyEngine.js'

import {
  createModifier,
} from './modifierEngine.js'

/*
|--------------------------------------------------------------------------
| Fixture Intelligence Engine
|--------------------------------------------------------------------------
|
| Centrale analyse van aankomende wedstrijden voor individuele spelers.
|
| Deze service berekent uitsluitend wat een programma betekent voor een
| speler. Fantasy Outlook, Scout, Captain Radar en andere modules kunnen
| dezelfde uitkomst gebruiken zonder eigen programmalogica te bouwen.
|
| Schalen:
|
| - programmascore: 0 tot 10
| - moeilijkheid:   1 tot 5
| - betrouwbaarheid: 0 tot 100
|
| Een programmascore van 5 is neutraal.
|
*/

/*
|--------------------------------------------------------------------------
| Configuratie
|--------------------------------------------------------------------------
*/

const DEFAULT_FIXTURE_COUNT = 5
const DEFAULT_START_ROUND = 1

const NEUTRAL_FIXTURE_SCORE = 5
const NEUTRAL_DIFFICULTY = 3
const NEUTRAL_TEAM_RATING = 3

const DOUBLE_GAMEWEEK_BONUS = 0.8

/*
|--------------------------------------------------------------------------
| Posities
|--------------------------------------------------------------------------
*/

const POSITION_TYPES = {
  doelman: 'goalkeeper',
  keeper: 'goalkeeper',

  verdediger: 'defense',
  verdediging: 'defense',

  middenvelder: 'midfield',
  middenveld: 'midfield',

  spits: 'attack',
  aanvaller: 'attack',
  aanval: 'attack',
}

const POSITION_LABELS = {
  goalkeeper: 'Keeper',
  defense: 'Verdediger',
  midfield: 'Middenvelder',
  attack: 'Spits',
}

/*
 * Bepaalt hoe sterk iedere positie reageert op
 * een gunstige of ongunstige tegenstander.
 *
 * Aanvallers zijn het gevoeligst voor de matchup.
 * Keepers worden bewust iets richting neutraal getrokken,
 * omdat zware wedstrijden ook reddingen kunnen opleveren.
 */

const POSITION_SENSITIVITY = {
  goalkeeper: 0.72,
  defense: 0.82,
  midfield: 0.92,
  attack: 1,
}

/*
|--------------------------------------------------------------------------
| Teamrating per positie
|--------------------------------------------------------------------------
|
| Iedere positie gebruikt andere onderdelen van TEAM_RATINGS.
|
*/

const TEAM_RATING_WEIGHTS = {
  goalkeeper: {
    defense: 0.65,
    coach: 0.20,
    midfield: 0.15,
  },

  defense: {
    defense: 0.75,
    coach: 0.25,
  },

  midfield: {
    midfield: 0.70,
    attack: 0.20,
    coach: 0.10,
  },

  attack: {
    attack: 0.85,
    midfield: 0.10,
    coach: 0.05,
  },
}

/*
|--------------------------------------------------------------------------
| Getalhelpers
|--------------------------------------------------------------------------
*/

function toNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number)
    ? number
    : null
}

function clamp(
  value,
  minimum = 0,
  maximum = 10,
) {
  const number = Number(value)

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

function round(
  value,
  digits = 1,
) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return 0
  }

  const factor =
    10 ** digits

  return (
    Math.round(number * factor) /
    factor
  )
}

function average(values) {
  const usableValues =
    values
      .map(Number)
      .filter(Number.isFinite)

  if (!usableValues.length) {
    return null
  }

  return (
    usableValues.reduce(
      (total, value) =>
        total + value,
      0,
    ) /
    usableValues.length
  )
}

/*
|--------------------------------------------------------------------------
| Teksthelpers
|--------------------------------------------------------------------------
*/

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('nl-NL')
    .replace(/\s+/g, ' ')
}

function sameClub(
  leftClub,
  rightClub,
) {
  return (
    normalizeText(leftClub) ===
    normalizeText(rightClub)
  )
}

/*
|--------------------------------------------------------------------------
| Positiehelpers
|--------------------------------------------------------------------------
*/

function getPositionType(player) {
  const position =
    normalizeText(
      player?.fantasyPosition ??
      player?.position,
    )

  return (
    POSITION_TYPES[position] ??
    'midfield'
  )
}

function getPositionLabel(
  positionType,
) {
  return (
    POSITION_LABELS[positionType] ??
    'Speler'
  )
}

/*
|--------------------------------------------------------------------------
| Seizoen en teamratings
|--------------------------------------------------------------------------
*/

function resolveSeason(
  player,
  fixtures,
) {
  if (player?.season) {
    return player.season
  }

  return [
    ...new Set(
      fixtures
        .map(
          (fixture) =>
            fixture.season,
        )
        .filter(Boolean),
    ),
  ]
    .sort()
    .at(-1) ?? ''
}

function findTeamRating(
  teamRatings,
  club,
) {
  return (
    teamRatings.find(
      (rating) =>
        sameClub(
          rating.club,
          club,
        ),
    ) ??
    null
  )
}

function normalizeTeamRating(
  value,
) {
  const number =
    toNumber(value)

  if (number === null) {
    return null
  }

  /*
   * TEAM_RATINGS gebruikt momenteel
   * hoofdzakelijk een schaal van 1–5.
   *
   * Wanneer later een schaal van 0–100
   * wordt gebruikt, wordt die automatisch
   * omgerekend naar 1–5.
   */

  if (number > 5) {
    return clamp(
      1 +
        (number / 100) *
          4,
      1,
      5,
    )
  }

  return clamp(
    number,
    1,
    5,
  )
}

function calculateTeamPositionRating(
  teamRating,
  positionType,
) {
  if (!teamRating) {
    return {
      value:
        NEUTRAL_TEAM_RATING,

      available:
        false,

      components: {},
    }
  }

  const weights =
    TEAM_RATING_WEIGHTS[
      positionType
    ] ??
    TEAM_RATING_WEIGHTS.midfield

  const components = {}

  let weightedTotal = 0
  let weightTotal = 0

  Object.entries(
    weights,
  ).forEach(
    ([key, weight]) => {
      const rating =
        normalizeTeamRating(
          teamRating[key],
        )

      components[key] = {
        rating,
        weight,
      }

      if (rating === null) {
        return
      }

      weightedTotal +=
        rating *
        weight

      weightTotal +=
        weight
    },
  )

  if (!weightTotal) {
    return {
      value:
        NEUTRAL_TEAM_RATING,

      available:
        false,

      components,
    }
  }

  return {
    value:
      clamp(
        weightedTotal /
          weightTotal,
        1,
        5,
      ),

    available:
      true,

    components,
  }
}

function calculateTeamQualityScore(
  teamRating,
  positionType,
) {
  const positionRating =
    calculateTeamPositionRating(
      teamRating,
      positionType,
    )

  return {
    score:
      clamp(
        (
          (
            positionRating.value -
            1
          ) /
          4
        ) *
          10,
        0,
        10,
      ),

    available:
      positionRating.available,

    rating:
      positionRating.value,

    components:
      positionRating.components,
  }
}

/*
|--------------------------------------------------------------------------
| Wedstrijdgegevens
|--------------------------------------------------------------------------
*/

function resolveVenue(
  fixture,
  club,
) {
  if (
    sameClub(
      fixture.home,
      club,
    )
  ) {
    return 'home'
  }

  return 'away'
}

function resolveOpponent(
  fixture,
  club,
) {
  if (
    sameClub(
      fixture.home,
      club,
    )
  ) {
    return fixture.away
  }

  return fixture.home
}

function isFixtureForClub(
  fixture,
  club,
) {
  return (
    sameClub(
      fixture.home,
      club,
    ) ||
    sameClub(
      fixture.away,
      club,
    )
  )
}

function resolveManualDifficulty(
  fixture,
  club,
) {
  const venue =
    resolveVenue(
      fixture,
      club,
    )

  return (
    toNumber(
      venue === 'home'
        ? fixture.difficultyHome
        : fixture.difficultyAway,
    ) ??
    NEUTRAL_DIFFICULTY
  )
}

const fixtureDifficultyCache =
  new Map()

function getFixtureDifficultyCacheKey(
  fixture,
) {
  return [
    fixture?.season ?? '',
    fixture?.id ?? '',
    fixture?.round ?? '',
    fixture?.home ?? '',
    fixture?.away ?? '',
  ].join('::')
}

function resolveDynamicDifficulty({
  fixture,
  club,
  results,
  teamRatings,
}) {
  const cacheKey =
    getFixtureDifficultyCacheKey(
      fixture,
    )

  let calculation

  if (
    fixtureDifficultyCache.has(
      cacheKey,
    )
  ) {
    calculation =
      fixtureDifficultyCache.get(
        cacheKey,
      )
  } else {
    calculation =
      calculateFixtureDifficulty({
        fixture,
        results,
        teamRatings,
      })

    fixtureDifficultyCache.set(
      cacheKey,
      calculation ?? null,
    )
  }

  if (!calculation) {
    return null
  }

  if (
    sameClub(
      fixture.home,
      club,
    )
  ) {
    return (
      calculation.home ??
      null
    )
  }

  return (
    calculation.away ??
    null
  )
}

/*
|--------------------------------------------------------------------------
| Wedstrijdscore
|--------------------------------------------------------------------------
*/

function calculateMatchupScore(
  difficulty,
  positionType,
) {
  const safeDifficulty =
    clamp(
      difficulty,
      1,
      5,
    )

  /*
   * Omrekening:
   *
   * Moeilijkheid 1 → score 10
   * Moeilijkheid 3 → score 5
   * Moeilijkheid 5 → score 0
   */

  const rawScore =
    (
      (
        5 -
        safeDifficulty
      ) /
      4
    ) *
    10

  const sensitivity =
    POSITION_SENSITIVITY[
      positionType
    ] ??
    1

  /*
   * Posities met een lagere gevoeligheid
   * worden richting de neutrale score 5
   * getrokken.
   */

  return clamp(
    NEUTRAL_FIXTURE_SCORE +
      (
        rawScore -
        NEUTRAL_FIXTURE_SCORE
      ) *
        sensitivity,
    0,
    10,
  )
}

function calculateFixtureScore({
  matchupScore,
  teamQualityScore,
  hasTeamRating,
}) {
  /*
   * De wedstrijd zelf blijft leidend.
   *
   * Wanneer een teamrating beschikbaar is:
   *
   * - matchup:      75%
   * - teamkwaliteit: 25%
   *
   * Zonder teamrating gebruikt de engine
   * uitsluitend de matchupscore.
   */

  if (!hasTeamRating) {
    return clamp(
      matchupScore,
      0,
      10,
    )
  }

  return clamp(
    matchupScore *
      0.75 +
    teamQualityScore *
      0.25,
    0,
    10,
  )
}

/*
|--------------------------------------------------------------------------
| Betrouwbaarheid
|--------------------------------------------------------------------------
*/

function calculateFixtureConfidence({
  dynamicSide,
  hasTeamRating,
}) {
  const dynamicConfidence =
    toNumber(
      dynamicSide?.confidence,
    )

  if (
    dynamicConfidence !==
    null
  ) {
    return clamp(
      dynamicConfidence,
      0,
      100,
    )
  }

  if (hasTeamRating) {
    return 45
  }

  return 20
}

/*
|--------------------------------------------------------------------------
| Labels
|--------------------------------------------------------------------------
*/

function getFixtureLabel(score) {
  const value =
    clamp(
      score,
      0,
      10,
    )

  if (value >= 8.5) {
    return 'Uitstekende wedstrijd'
  }

  if (value >= 7.2) {
    return 'Gunstige wedstrijd'
  }

  if (value >= 5.8) {
    return 'Licht gunstige wedstrijd'
  }

  if (value >= 4.3) {
    return 'Neutrale wedstrijd'
  }

  if (value >= 3) {
    return 'Licht ongunstige wedstrijd'
  }

  if (value >= 1.5) {
    return 'Zware wedstrijd'
  }

  return 'Extreem zware wedstrijd'
}

function getProgramLabel(score) {
  const value =
    clamp(
      score,
      0,
      10,
    )

  if (value >= 8.5) {
    return 'Uitstekend programma'
  }

  if (value >= 7.2) {
    return 'Gunstig programma'
  }

  if (value >= 5.8) {
    return 'Licht gunstig programma'
  }

  if (value >= 4.3) {
    return 'Programma in balans'
  }

  if (value >= 3) {
    return 'Licht ongunstig programma'
  }

  if (value >= 1.5) {
    return 'Zwaar programma'
  }

  return 'Extreem zwaar programma'
}

/*
|--------------------------------------------------------------------------
| Uitleg per wedstrijd
|--------------------------------------------------------------------------
*/

function buildFixtureExplanation({
  club,
  opponent,
  venue,
  positionType,
  score,
  difficulty,
  teamQuality,
  dynamicSide,
}) {
  const explanation = []

  explanation.push(
    `${club} speelt ${
      venue === 'home'
        ? 'thuis'
        : 'uit'
    } tegen ${opponent}.`,
  )

  explanation.push(
    `Voor een ${getPositionLabel(
      positionType,
    ).toLowerCase()} levert deze wedstrijd ` +
    `een score van ${round(
      score,
      1,
    )} uit 10 op.`,
  )

  explanation.push(
    `De algemene wedstrijdmoeilijkheid is ` +
    `${round(
      difficulty,
      1,
    )} uit 5.`,
  )

  if (
    teamQuality.available
  ) {
    explanation.push(
      `De teamkwaliteit voor deze positie ` +
      `is ${round(
        teamQuality.rating,
        1,
      )} uit 5.`,
    )
  }

  const recentForm =
    toNumber(
      dynamicSide
        ?.components
        ?.recentForm,
    )

  if (
    recentForm !== null &&
    recentForm >= 70
  ) {
    explanation.push(
      'De sterke recente vorm van de tegenstander ' +
      'maakt deze wedstrijd zwaarder.',
    )
  }

  if (
    recentForm !== null &&
    recentForm <= 35
  ) {
    explanation.push(
      'De zwakke recente vorm van de tegenstander ' +
      'maakt deze wedstrijd gunstiger.',
    )
  }

  return explanation
}

/*
|--------------------------------------------------------------------------
| Komende wedstrijden
|--------------------------------------------------------------------------
*/

/**
 * Haalt de eerstvolgende wedstrijden
 * van een club op.
 *
 * De functie houdt rekening met:
 *
 * - seizoen;
 * - startende speelronde;
 * - aantal wedstrijden;
 * - thuis- en uitwedstrijden.
 */

export function getUpcomingFixtures({
  player,
  club = player?.club,
  season,
  startRound =
    DEFAULT_START_ROUND,
  count =
    DEFAULT_FIXTURE_COUNT,
  fixtures =
    getFixtures(),
}) {
  if (!club) {
    return []
  }

  const activeSeason =
    season ??
    resolveSeason(
      player,
      fixtures,
    )

  return fixtures
    .filter(
      (fixture) =>
        !activeSeason ||
        fixture.season ===
          activeSeason,
    )
    .filter(
      (fixture) =>
        Number(
          fixture.round,
        ) >=
        Number(
          startRound,
        ),
    )
    .filter(
      (fixture) =>
        isFixtureForClub(
          fixture,
          club,
        ),
    )
    .sort(
      (left, right) => {
        const roundDifference =
          Number(left.round) -
          Number(right.round)

        if (
          roundDifference !== 0
        ) {
          return roundDifference
        }

        const dateDifference =
          String(
            left.date ?? '',
          ).localeCompare(
            String(
              right.date ?? '',
            ),
          )

        if (
          dateDifference !== 0
        ) {
          return dateDifference
        }

        return String(
          left.time ?? '',
        ).localeCompare(
          String(
            right.time ?? '',
          ),
        )
      },
    )
    .slice(
      0,
      Math.max(
        0,
        Number(count) || 0,
      ),
    )
}

/*
|--------------------------------------------------------------------------
| Analyse van één wedstrijd
|--------------------------------------------------------------------------
*/

/**
 * Analyseert één wedstrijd voor
 * één specifieke speler.
 *
 * Retourneert onder andere:
 *
 * - score van 0 tot 10;
 * - moeilijkheid van 1 tot 5;
 * - betrouwbaarheid;
 * - positie-afhankelijke teamkwaliteit;
 * - automatische uitleg.
 */

export function calculateFixtureIntelligence({
  player,
  fixture,
  results =
    getResults(),
  teamRatings =
    getTeamRatings(),
}) {
  if (
    !player ||
    !fixture ||
    !player.club
  ) {
    return null
  }

  if (
    !isFixtureForClub(
      fixture,
      player.club,
    )
  ) {
    return null
  }

  const club =
    player.club

  const positionType =
    getPositionType(
      player,
    )

  const opponent =
    resolveOpponent(
      fixture,
      club,
    )

  const venue =
    resolveVenue(
      fixture,
      club,
    )

  const dynamicSide =
    resolveDynamicDifficulty({
      fixture,
      club,
      results,
      teamRatings,
    })

  const difficulty =
    toNumber(
      dynamicSide?.difficulty,
    ) ??
    resolveManualDifficulty(
      fixture,
      club,
    )

  const matchupScore =
    calculateMatchupScore(
      difficulty,
      positionType,
    )

  const teamRating =
    findTeamRating(
      teamRatings,
      club,
    )

  const teamQuality =
    calculateTeamQualityScore(
      teamRating,
      positionType,
    )

  const score =
    calculateFixtureScore({
      matchupScore,
      teamQualityScore:
        teamQuality.score,
      hasTeamRating:
        teamQuality.available,
    })

  const confidence =
    calculateFixtureConfidence({
      dynamicSide,
      hasTeamRating:
        teamQuality.available,
    })

  const explanation =
    buildFixtureExplanation({
      club,
      opponent,
      venue,
      positionType,
      score,
      difficulty,
      teamQuality,
      dynamicSide,
    })

  return {
    fixtureId:
      fixture.id,

    season:
      fixture.season,

    round:
      Number(
        fixture.round,
      ) || 0,

    date:
      fixture.date ?? '',

    time:
      fixture.time ?? '',

    club,

    opponent,

    venue,

    isHome:
      venue === 'home',

    positionType,

    positionLabel:
      getPositionLabel(
        positionType,
      ),

    score:
      round(
        score,
        1,
      ),

    rawScore:
      score,

    label:
      getFixtureLabel(
        score,
      ),

    confidence:
      round(
        confidence,
        0,
      ),

    difficulty:
      round(
        difficulty,
        1,
      ),

    components: {
      matchupScore:
        round(
          matchupScore,
          2,
        ),

      teamQualityScore:
        round(
          teamQuality.score,
          2,
        ),

      teamPositionRating:
        round(
          teamQuality.rating,
          2,
        ),

      teamRatingAvailable:
        teamQuality.available,

      dynamicDifficulty:
        dynamicSide
          ?.components ??
        null,
    },

    explanation,

    source:
      dynamicSide
        ? 'dynamic'
        : 'fixture-fallback',
  }
}

/*
|--------------------------------------------------------------------------
| Speelrondes groeperen
|--------------------------------------------------------------------------
*/

/**
 * Groepeert wedstrijdanalyses
 * per speelronde.
 */

function groupFixturesByRound(
  fixtureReports,
) {
  const rounds =
    new Map()

  fixtureReports.forEach(
    (report) => {
      const roundNumber =
        Number(
          report.round,
        )

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
          report,
        )
    },
  )

  return rounds
}

/**
 * Bouwt één rapport voor
 * een speelronde.
 *
 * Mogelijke types:
 *
 * - blank:  geen wedstrijd;
 * - single: één wedstrijd;
 * - double: dubbele speelronde.
 */

function buildRoundReport(
  roundNumber,
  fixtureReports,
) {
  if (
    !fixtureReports.length
  ) {
    return {
      round:
        roundNumber,

      type:
        'blank',

      score:
        0,

      confidence:
        100,

      fixtures:
        [],

      explanation:
        'Geen wedstrijd: in deze speelronde ' +
        'kunnen geen punten worden behaald.',
    }
  }

  if (
    fixtureReports.length ===
    1
  ) {
    const fixtureReport =
      fixtureReports[0]

    return {
      round:
        roundNumber,

      type:
        'single',

      score:
        fixtureReport.score,

      confidence:
        fixtureReport.confidence,

      fixtures:
        fixtureReports,

      explanation:
        fixtureReport
          .explanation
          .join(' '),
    }
  }

  const averageScore =
    average(
      fixtureReports.map(
        (report) =>
          report.score,
      ),
    ) ??
    NEUTRAL_FIXTURE_SCORE

  /*
   * Een dubbele speelronde krijgt
   * een bonus vanwege de extra kans
   * op minuten en Fantasypunten.
   */

  const score =
    clamp(
      averageScore +
        DOUBLE_GAMEWEEK_BONUS,
      0,
      10,
    )

  const confidence =
    average(
      fixtureReports.map(
        (report) =>
          report.confidence,
      ),
    ) ??
    0

  return {
    round:
      roundNumber,

    type:
      'double',

    score:
      round(
        score,
        1,
      ),

    confidence:
      round(
        confidence,
        0,
      ),

    fixtures:
      fixtureReports,

    explanation:
      'Dubbele speelronde: de gemiddelde ' +
      'wedstrijdscore krijgt een bonus ' +
      'voor de extra wedstrijd.',
  }
}

/*
|--------------------------------------------------------------------------
| Programma-analyse
|--------------------------------------------------------------------------
*/

/**
 * Analyseert het programma van één speler
 * over een vast aantal speelrondes.
 *
 * De functie verwerkt:
 *
 * - normale speelrondes;
 * - lege speelrondes;
 * - dubbele speelrondes;
 * - beste wedstrijd;
 * - zwaarste wedstrijd;
 * - betrouwbaarheid;
 * - volledige uitleg.
 */

export function calculatePlayerFixtureOutlook({
  player,
  startRound =
    DEFAULT_START_ROUND,
  roundCount =
    DEFAULT_FIXTURE_COUNT,
  fixtures =
    getFixtures(),
  results =
    getResults(),
  teamRatings =
    getTeamRatings(),
}) {
  if (!player?.club) {
    return {
      score:
        NEUTRAL_FIXTURE_SCORE,

      rawScore:
        NEUTRAL_FIXTURE_SCORE,

      confidence:
        0,

      label:
        'Geen programma beschikbaar',

      startRound:
        Number(
          startRound,
        ),

      endRound:
        Number(
          startRound,
        ),

      roundCount:
        Number(
          roundCount,
        ),

      fixtures:
        [],

      rounds:
        [],

      bestFixture:
        null,

      worstFixture:
        null,

      blankRounds:
        0,

      doubleRounds:
        0,

      explanation: [
        'De speler heeft geen gekoppelde club.',
      ],
    }
  }

  const normalizedStartRound =
    Number(
      startRound,
    ) ||
    DEFAULT_START_ROUND

  const normalizedRoundCount =
    Math.max(
      1,
      Number(
        roundCount,
      ) ||
      DEFAULT_FIXTURE_COUNT,
    )

  const endRound =
    normalizedStartRound +
    normalizedRoundCount -
    1

  const season =
    resolveSeason(
      player,
      fixtures,
    )

  const relevantFixtures =
    fixtures
      .filter(
        (fixture) =>
          !season ||
          fixture.season ===
            season,
      )
      .filter(
        (fixture) =>
          Number(
            fixture.round,
          ) >=
            normalizedStartRound &&
          Number(
            fixture.round,
          ) <=
            endRound,
      )
      .filter(
        (fixture) =>
          isFixtureForClub(
            fixture,
            player.club,
          ),
      )

  const fixtureReports =
    relevantFixtures
      .map(
        (fixture) =>
          calculateFixtureIntelligence({
            player,
            fixture,
            results,
            teamRatings,
          }),
      )
      .filter(Boolean)

  const fixturesByRound =
    groupFixturesByRound(
      fixtureReports,
    )

  const roundReports =
    Array.from(
      {
        length:
          normalizedRoundCount,
      },
      (_, index) => {
        const roundNumber =
          normalizedStartRound +
          index

        return buildRoundReport(
          roundNumber,
          fixturesByRound.get(
            roundNumber,
          ) ??
          [],
        )
      },
    )

  /*
|--------------------------------------------------------------------------
| Aflopende weging van speelronden
|--------------------------------------------------------------------------
|
| De eerstvolgende speelronde is het belangrijkst.
|
| SR1: 35%
| SR2: 25%
| SR3: 18%
| SR4: 12%
| SR5: 10%
|
*/

const fixtureRoundWeights = [
  0.35,
  0.25,
  0.18,
  0.12,
  0.10,
]

const weightedRoundReports =
  roundReports.map(
    (
      roundReport,
      index,
    ) => {
      const weight =
        fixtureRoundWeights[
          index
        ] ??
        0

      const roundScore =
        Number(
          roundReport.score,
        )

      const normalizedScore =
        Number.isFinite(
          roundScore,
        )
          ? roundScore
          : NEUTRAL_FIXTURE_SCORE

      return {
        ...roundReport,

        weight,

        weightPercentage:
          round(
            weight * 100,
            0,
          ),

        weightedContribution:
          normalizedScore *
          weight,
      }
    },
  )

const availableWeight =
  weightedRoundReports.reduce(
    (
      total,
      roundReport,
    ) =>
      total +
      roundReport.weight,
    0,
  )

const score =
  availableWeight > 0
    ? weightedRoundReports.reduce(
        (
          total,
          roundReport,
        ) =>
          total +
          roundReport
            .weightedContribution,
        0,
      ) /
      availableWeight
    : NEUTRAL_FIXTURE_SCORE

  const confidence =
    average(
      fixtureReports.map(
        (fixtureReport) =>
          fixtureReport.confidence,
      ),
    ) ??
    0

  const sortedBestFirst =
    [
      ...fixtureReports,
    ].sort(
      (left, right) =>
        right.score -
        left.score,
    )

  const sortedWorstFirst =
    [
      ...fixtureReports,
    ].sort(
      (left, right) =>
        left.score -
        right.score,
    )

  const bestFixture =
    sortedBestFirst[0] ??
    null

  const worstFixture =
    sortedWorstFirst[0] ??
    null

  const blankRounds =
    roundReports.filter(
      (roundReport) =>
        roundReport.type ===
        'blank',
    ).length

  const doubleRounds =
    roundReports.filter(
      (roundReport) =>
        roundReport.type ===
        'double',
    ).length

  const explanation = [
    `Het programma over ${normalizedRoundCount} ` +
    `speelrondes krijgt een score van ` +
    `${round(
      score,
      1,
    )} uit 10.`,
  ]

  if (bestFixture) {
    explanation.push(
      `De gunstigste wedstrijd is tegen ` +
      `${bestFixture.opponent} ` +
      `(${
        bestFixture.isHome
          ? 'thuis'
          : 'uit'
      }).`,
    )
  }

  if (worstFixture) {
    explanation.push(
      `De zwaarste wedstrijd is tegen ` +
      `${worstFixture.opponent} ` +
      `(${
        worstFixture.isHome
          ? 'thuis'
          : 'uit'
      }).`,
    )
  }

  if (blankRounds > 0) {
    explanation.push(
      `${blankRounds} lege speelronde${
        blankRounds === 1
          ? ''
          : 'n'
      } verlaagt de programmascore.`,
    )
  }

  if (doubleRounds > 0) {
    explanation.push(
      `${doubleRounds} dubbele speelronde${
        doubleRounds === 1
          ? ''
          : 'n'
      } verhoogt de programmascore.`,
    )
  }

  return {
    score:
      round(
        score,
        1,
      ),

    rawScore:
      score,

    confidence:
      round(
        confidence,
        0,
      ),

    label:
      getProgramLabel(
        score,
      ),

    season,

    startRound:
      normalizedStartRound,

    endRound,

    roundCount:
      normalizedRoundCount,

    fixtures:
      fixtureReports,

    rounds:
  weightedRoundReports,

    bestFixture,

    worstFixture,

    blankRounds,

    doubleRounds,

    explanation,
  }
}

/*
|--------------------------------------------------------------------------
| Programma-modifier
|--------------------------------------------------------------------------
*/

/**
 * Zet de programma-analyse om naar
 * de centrale modifier-structuur.
 *
 * Deze modifier kan rechtstreeks worden
 * gebruikt door de Modifier Engine.
 */

export function createFixtureModifier({
  player,
  startRound =
    DEFAULT_START_ROUND,
  roundCount =
    DEFAULT_FIXTURE_COUNT,
  fixtures =
    getFixtures(),
  results =
    getResults(),
  teamRatings =
    getTeamRatings(),
}) {
  const outlook =
    calculatePlayerFixtureOutlook({
      player,
      startRound,
      roundCount,
      fixtures,
      results,
      teamRatings,
    })

  return createModifier({
    id:
      'fixtures',

    label:
      'Aankomend programma',

    category:
      'core',

    score:
      outlook.score,

    neutralScore:
      NEUTRAL_FIXTURE_SCORE,

    /*
     * Een scoreverschil van 1 punt
     * verandert de Fantasy Score met 0,10.
     *
     * Voorbeelden:
     *
     * programma 7,4:
     * (7,4 - 5) × 0,10 = +0,24
     *
     * programma 3,0:
     * (3,0 - 5) × 0,10 = -0,20
     */

    weight:
      0.10,

    minimumValue:
      -0.30,

    maximumValue:
      0.30,

    confidence:
      outlook.confidence,

    explanation:
      outlook.explanation.join(
        ' ',
      ),

    calculation: {
      formula:
        '(Programmascore - neutrale score) × weging',

      steps: [
        {
          label:
            'Programmascore',

          value:
            outlook.score,

          digits:
            1,
        },

        {
          label:
            'Neutrale score',

          value:
            NEUTRAL_FIXTURE_SCORE,

          digits:
            1,
        },

        {
          label:
            'Weging',

          value:
            10,

          digits:
            0,

          suffix:
            '%',
        },
      ],
    },

    details: {
      season:
        outlook.season,

      startRound:
        outlook.startRound,

      endRound:
        outlook.endRound,

      roundCount:
        outlook.roundCount,

      fixtureCount:
        outlook.fixtures.length,

      blankRounds:
        outlook.blankRounds,

      doubleRounds:
        outlook.doubleRounds,

      bestFixture:
        outlook.bestFixture,

      worstFixture:
        outlook.worstFixture,

      fixtures:
        outlook.fixtures,

      rounds:
        outlook.rounds,
    },

    source: {
      id:
        'fixture-intelligence',

      label:
        'Fixture Intelligence',

      type:
        'automatic',

      references: [
        'Wedstrijdschema',
        'Teamratings',
        'Historische uitslagen',
        'Positie van de speler',
      ],
    },
  })
}

/*
|--------------------------------------------------------------------------
| Publieke hulpfuncties
|--------------------------------------------------------------------------
*/

export function getAverageFixtureScore(
  options,
) {
  return (
    calculatePlayerFixtureOutlook(
      options,
    ).score
  )
}

export function getBestFixture(
  options,
) {
  return (
    calculatePlayerFixtureOutlook(
      options,
    ).bestFixture
  )
}

export function getWorstFixture(
  options,
) {
  return (
    calculatePlayerFixtureOutlook(
      options,
    ).worstFixture
  )
}

export function getFixtureExplanation(
  options,
) {
  return (
    calculatePlayerFixtureOutlook(
      options,
    ).explanation
  )
}

/* Gedeelde 0–10-kleurenschaal voor alle compacte fixturepresentaties. */
export function getFixtureScoreColor(score) {
  const value = Number(score) || 0
  if (value >= 8) return '#08a84e'
  if (value >= 6) return '#a9e65c'
  if (value >= 4) return '#ffdb0a'
  if (value >= 2) return '#f47a13'
  return '#d7192d'
}
