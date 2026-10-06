/*
|--------------------------------------------------------------------------
| Expected Points - History Adapter
|--------------------------------------------------------------------------
|
| Deze module vertaalt de bestaande output van
| Player Match Stats naar een vast formaat voor
| de Expected Points Engine.
|
| Deze module:
|
| - haalt geen eigen wedstrijddata op;
| - berekent geen Fantasy-regels opnieuw;
| - berekent geen vormscore;
| - berekent geen historische modifier;
| - berekent geen confidence-score.
|
| Player Match Stats blijft eigenaar van de
| historische wedstrijdstatistieken.
|
*/

import {
  calculatePlayerMatchProfile,
} from '../playerMatchStatsEngine.js'

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
      number *
      factor,
    ) /
    factor
  )
}

function divide(
  numerator,
  denominator,
) {
  const safeNumerator =
    toNumber(
      numerator,
    )

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
    safeNumerator /
    safeDenominator
  )
}

function calculatePer90(
  total,
  minutes,
) {
  if (
    toNumber(
      minutes,
    ) <= 0
  ) {
    return 0
  }

  return round(
    divide(
      total,
      minutes,
    ) *
      90,
    2,
  )
}

function calculatePerAppearance(
  total,
  appearances,
) {
  if (
    toNumber(
      appearances,
    ) <= 0
  ) {
    return 0
  }

  return round(
    divide(
      total,
      appearances,
    ),
    2,
  )
}

/*
|--------------------------------------------------------------------------
| Bronprofiel normaliseren
|--------------------------------------------------------------------------
*/

function getTotals(
  profile,
) {
  return (
    profile?.totals ??
    {}
  )
}

function getAverages(
  profile,
) {
  return (
    profile?.averages ??
    profile?.gemiddelden ??
    {}
  )
}

function getStatistics(
  profile,
) {
  return (
    profile?.statistieken ??
    {}
  )
}

/*
|--------------------------------------------------------------------------
| Steekproef
|--------------------------------------------------------------------------
*/

function buildSample(
  profile,
) {
  const totals =
    getTotals(
      profile,
    )

  const statistics =
    getStatistics(
      profile,
    )

  return {
    registeredMatches:
      toNumber(
        totals.registeredMatches ??
        statistics
          .geregistreerdeWedstrijden,
      ),

    appearances:
      toNumber(
        totals.appearances ??
        statistics
          .gespeeldeWedstrijden,
      ),

    starts:
      toNumber(
        totals.starts ??
        statistics
          .basisplaatsen,
      ),

    substituteAppearances:
      toNumber(
        totals
          .substituteAppearances ??
        statistics
          .invalbeurten,
      ),

    unusedSubstitutions:
      toNumber(
        totals
          .unusedSubstitutions ??
        statistics
          .nietIngevallen,
      ),

    minutes:
      toNumber(
        totals.minutes ??
        statistics.minuten,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Totalen
|--------------------------------------------------------------------------
*/

function buildTotals(
  profile,
) {
  const totals =
    getTotals(
      profile,
    )

  const statistics =
    getStatistics(
      profile,
    )

  return {
    fantasyPoints:
      toNumber(
        totals
          ?.punten
          ?.totaal ??
        profile
          ?.punten
          ?.totaal ??
        profile
          ?.samenvatting
          ?.fantasypunten,
      ),

    goals:
      toNumber(
        totals.goals ??
        statistics.goals,
      ),

    assists:
      toNumber(
        totals.assists ??
        statistics.assists,
      ),

    cleanSheets:
      toNumber(
        totals.cleanSheets ??
        statistics.cleanSheets,
      ),

    saves:
      toNumber(
        totals.saves ??
        statistics.reddingen,
      ),

    penaltySaves:
      toNumber(
        totals.penaltiesSaved ??
        statistics
          .penaltiesGestopt,
      ),

    bonus:
      toNumber(
        totals.optaBonus ??
        statistics.optaBonus,
      ),

    yellowCards:
      toNumber(
        totals.yellowCards ??
        statistics.geleKaarten,
      ),

    redCards:
      toNumber(
        totals.redCards ??
        statistics.rodeKaarten,
      ),

    ownGoals:
      toNumber(
        totals.ownGoals ??
        statistics
          .eigenDoelpunten,
      ),

    penaltiesMissed:
      toNumber(
        totals.penaltiesMissed ??
        statistics
          .penaltiesGemist,
      ),

    goalsConceded:
      toNumber(
        totals.goalsConceded ??
        statistics
          .tegendoelpunten,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Productierates
|--------------------------------------------------------------------------
*/

function buildOverallRates(
  profile,
  sample,
  totals,
) {
  const averages =
    getAverages(
      profile,
    )

  return {
    fantasyPointsPerMatch:
      round(
        averages
          .puntenPerWedstrijd ??
        calculatePerAppearance(
          totals.fantasyPoints,
          sample.appearances,
        ),
        2,
      ),

    fantasyPointsPer90:
      round(
        averages
          .puntenPer90 ??
        calculatePer90(
          totals.fantasyPoints,
          sample.minutes,
        ),
        2,
      ),

    minutesPerAppearance:
      round(
        averages
          .minutesPerAppearance ??
        calculatePerAppearance(
          sample.minutes,
          sample.appearances,
        ),
        1,
      ),

    goalsPerMatch:
      round(
        averages
          .goalsPerAppearance ??
        calculatePerAppearance(
          totals.goals,
          sample.appearances,
        ),
        2,
      ),

    goalsPer90:
      round(
        averages.goalsPer90 ??
        calculatePer90(
          totals.goals,
          sample.minutes,
        ),
        2,
      ),

    assistsPerMatch:
      round(
        averages
          .assistsPerAppearance ??
        calculatePerAppearance(
          totals.assists,
          sample.appearances,
        ),
        2,
      ),

    assistsPer90:
      round(
        averages.assistsPer90 ??
        calculatePer90(
          totals.assists,
          sample.minutes,
        ),
        2,
      ),

    /*
     * Clean-sheetrate is een kans tussen
     * 0 en 1 per gespeeld duel.
     *
     * Voorbeeld:
     *
     * 4 clean sheets uit 10 optredens
     * geeft 0,40.
     */
    cleanSheetRate:
      round(
        divide(
          totals.cleanSheets,
          sample.appearances,
        ),
        4,
      ),

    cleanSheetsPer90:
      calculatePer90(
        totals.cleanSheets,
        sample.minutes,
      ),

    savesPerMatch:
      calculatePerAppearance(
        totals.saves,
        sample.appearances,
      ),

    savesPer90:
      round(
        averages.savesPer90 ??
        calculatePer90(
          totals.saves,
          sample.minutes,
        ),
        2,
      ),

    penaltySavesPerMatch:
      calculatePerAppearance(
        totals.penaltySaves,
        sample.appearances,
      ),

    penaltySavesPer90:
      calculatePer90(
        totals.penaltySaves,
        sample.minutes,
      ),

    bonusPerMatch:
      round(
        averages
          .bonusPerAppearance ??
        calculatePerAppearance(
          totals.bonus,
          sample.appearances,
        ),
        2,
      ),

    bonusPer90:
      round(
        averages.bonusPer90 ??
        calculatePer90(
          totals.bonus,
          sample.minutes,
        ),
        2,
      ),

    yellowCardsPer90:
      calculatePer90(
        totals.yellowCards,
        sample.minutes,
      ),

    redCardsPer90:
      calculatePer90(
        totals.redCards,
        sample.minutes,
      ),

    ownGoalsPer90:
      calculatePer90(
        totals.ownGoals,
        sample.minutes,
      ),

    penaltiesMissedPer90:
      calculatePer90(
        totals.penaltiesMissed,
        sample.minutes,
      ),

    goalsConcededPer90:
      calculatePer90(
        totals.goalsConceded,
        sample.minutes,
      ),

    startPercentage:
      round(
        averages
          .startPercentage ??
        (
          divide(
            sample.starts,
            sample.appearances,
          ) *
          100
        ),
        0,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Recent profiel
|--------------------------------------------------------------------------
*/

function buildRecentProfile(
  profile,
) {
  const recentMatches =
    Array.isArray(
      profile
        ?.recenteWedstrijden,
    )
      ? profile
          .recenteWedstrijden
      : Array.isArray(
          profile?.recentMatches,
        )
        ? profile.recentMatches
        : []

  return {
    matches:
      recentMatches,

    matchCount:
      recentMatches.length,

    playedCount:
      recentMatches.filter(
        (
          match,
        ) =>
          match?.played ===
            true ||
          Number(
            match?.minutes,
          ) > 0,
      ).length,
  }
}

/*
|--------------------------------------------------------------------------
| History-profiel bouwen
|--------------------------------------------------------------------------
*/

function buildExpectedPointsHistory(
  player,
  sourceProfile,
) {
  const sample =
    buildSample(
      sourceProfile,
    )

  const totals =
    buildTotals(
      sourceProfile,
    )

  const overall =
    buildOverallRates(
      sourceProfile,
      sample,
      totals,
    )

  return {
    playerId:
      String(
        player?.id ??
        sourceProfile
          ?.spelerId ??
        '',
      ),

    playerName:
      String(
        player?.name ??
        sourceProfile
          ?.spelerNaam ??
        '',
      ),

    season:
      String(
        sourceProfile
          ?.seizoen ??
        player?.season ??
        '',
      ),

    position:
      sourceProfile
        ?.positie ??
      player
        ?.fantasyPosition ??
      player?.position ??
      'unknown',

    overall,

    sample,

    totals,

    recent:
      buildRecentProfile(
        sourceProfile,
      ),

    /*
     * De originele output blijft beschikbaar
     * voor debugging en toekomstige uitbreiding.
     */
    sourceProfile,
  }
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

/**
 * Vertaalt het bestaande Player Match Stats-profiel
 * naar het formaat van de Expected Points Engine.
 */
export function getExpectedPointsHistory(
  player,
  options = {},
) {
  if (
    !player
  ) {
    return null
  }

  const sourceProfile =
    calculatePlayerMatchProfile(
      player,
      options,
    )

  if (
    !sourceProfile
  ) {
    return null
  }

  return buildExpectedPointsHistory(
    player,
    sourceProfile,
  )
}

/**
 * Bouwt historische Expected Points-profielen
 * voor meerdere spelers.
 */
export function getExpectedPointsHistoryBatch(
  players,
  options = {},
) {
  if (
    !Array.isArray(
      players,
    )
  ) {
    return []
  }

  return players
    .map(
      (
        player,
      ) =>
        getExpectedPointsHistory(
          player,
          options,
        ),
    )
    .filter(Boolean)
}