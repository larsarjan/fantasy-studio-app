import {
  getFixtures,
  getPlayerMatchStats,
} from './database.js'

/*
|--------------------------------------------------------------------------
| Player Match Stats Engine
|--------------------------------------------------------------------------
|
| Centrale intelligentielaag voor wedstrijdstatistieken per speler.
|
| Deze engine:
|
| - koppelt spelerswedstrijden aan fixtures;
| - normaliseert statussen en statistieken;
| - bouwt wedstrijdgeschiedenis;
| - berekent totalen en gemiddelden;
| - selecteert recente wedstrijden;
| - vormt later de bron voor Vorm en puntenopbouw.
|
*/

/*
|--------------------------------------------------------------------------
| Configuratie
|--------------------------------------------------------------------------
*/

const DEFAULT_RECENT_MATCH_COUNT =
  5

const PLAYED_STATUSES = [
  'basis',
  'wissel',
]

const NON_PLAYING_STATUSES = [
  'niet ingevallen',
  'niet bij de selectie',
  'geblesseerd',
  'geschorst',
  'uitgesteld',
]

/*
|--------------------------------------------------------------------------
| Teksthelpers
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  return String(value ?? '')
    .trim()
}

function normalizeText(value) {
  return cleanText(value)
    .toLocaleLowerCase(
      'nl-NL',
    )
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .replace(
      /\s+/g,
      ' ',
    )
}

function sameValue(
  leftValue,
  rightValue,
) {
  return (
    normalizeText(
      leftValue,
    ) ===
    normalizeText(
      rightValue,
    )
  )
}

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

  return Number.isFinite(number)
    ? number
    : fallback
}

function round(
  value,
  digits = 1,
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
      number *
      factor,
    ) /
    factor
  )
}

function average(
  values,
) {
  const numbers =
    values.filter(
      (value) =>
        Number.isFinite(
          Number(value),
        ),
    )

  if (!numbers.length) {
    return 0
  }

  return (
    numbers.reduce(
      (
        total,
        value,
      ) =>
        total +
        Number(value),
      0,
    ) /
    numbers.length
  )
}

/*
|--------------------------------------------------------------------------
| Status
|--------------------------------------------------------------------------
*/

function normalizeMatchStatus(
  status,
) {
  const normalized =
    normalizeText(
      status,
    )

  if (
    normalized ===
    'basis'
  ) {
    return 'starter'
  }

  if (
    normalized ===
    'wissel'
  ) {
    return 'substitute'
  }

  if (
    normalized ===
    'niet ingevallen'
  ) {
    return 'unused-sub'
  }

  if (
    normalized ===
    'niet bij de selectie'
  ) {
    return 'not-selected'
  }

  if (
    normalized ===
    'geblesseerd'
  ) {
    return 'injured'
  }

  if (
    normalized ===
    'geschorst'
  ) {
    return 'suspended'
  }

  if (
    normalized ===
    'uitgesteld'
  ) {
    return 'postponed'
  }

  return normalized ||
    'unknown'
}

function hasPlayed(
  matchStat,
) {
  const status =
    normalizeText(
      matchStat?.status,
    )

  return (
    PLAYED_STATUSES.includes(
      status,
    ) ||
    toNumber(
      matchStat?.minutes,
    ) > 0
  )
}

function hasNotPlayed(
  matchStat,
) {
  const status =
    normalizeText(
      matchStat?.status,
    )

  return (
    NON_PLAYING_STATUSES.includes(
      status,
    ) &&
    !hasPlayed(
      matchStat,
    )
  )
}

/*
|--------------------------------------------------------------------------
| Fixtures
|--------------------------------------------------------------------------
*/

function findFixture(
  fixtureId,
  fixtures,
) {
  return (
    fixtures.find(
      (fixture) =>
        sameValue(
          fixture.id,
          fixtureId,
        ),
    ) ??
    null
  )
}

function resolveOpponent({
  player,
  fixture,
}) {
  if (!fixture) {
    return ''
  }

  if (
    sameValue(
      player?.club,
      fixture.home,
    )
  ) {
    return fixture.away
  }

  if (
    sameValue(
      player?.club,
      fixture.away,
    )
  ) {
    return fixture.home
  }

  return ''
}

function resolveVenue({
  player,
  fixture,
}) {
  if (!fixture) {
    return 'unknown'
  }

  if (
    sameValue(
      player?.club,
      fixture.home,
    )
  ) {
    return 'home'
  }

  if (
    sameValue(
      player?.club,
      fixture.away,
    )
  ) {
    return 'away'
  }

  return 'unknown'
}

/*
|--------------------------------------------------------------------------
| Positie
|--------------------------------------------------------------------------
*/

function normalizePosition(
  player,
) {
  const position =
    normalizeText(
      player?.fantasyPosition ??
      player?.position,
    )

  if (
    [
      'gk',
      'keeper',
      'doelman',
      'goalkeeper',
    ].includes(position)
  ) {
    return 'keeper'
  }

  if (
    [
      'def',
      'verdediger',
      'defender',
      'back',
      'cv',
      'cb',
      'lb',
      'rb',
    ].includes(position)
  ) {
    return 'verdediger'
  }

  if (
    [
      'mid',
      'middenvelder',
      'midfielder',
      'cm',
      'dm',
      'am',
    ].includes(position)
  ) {
    return 'middenvelder'
  }

  if (
    [
      'fwd',
      'att',
      'aanvaller',
      'forward',
      'spits',
      'winger',
      'st',
      'lw',
      'rw',
    ].includes(position)
  ) {
    return 'aanvaller'
  }

  return 'onbekend'
}

/*
|--------------------------------------------------------------------------
| Punten per onderdeel
|--------------------------------------------------------------------------
*/

function calculateSpeelminutenPunten(
  minuten,
) {
  const gespeeldeMinuten =
    toNumber(
      minuten,
    )

  if (
    gespeeldeMinuten <= 0
  ) {
    return 0
  }

  if (
    gespeeldeMinuten < 60
  ) {
    return 1
  }

  return 2
}

function getDoelpuntWaarde(
  positie,
) {
  const waarden = {
    keeper:
      10,

    verdediger:
      6,

    middenvelder:
      5,

    aanvaller:
      4,
  }

  return (
    waarden[
      positie
    ] ??
    0
  )
}

function calculateDoelpuntPunten({
  goals,
  positie,
}) {
  return (
    toNumber(
      goals,
    ) *
    getDoelpuntWaarde(
      positie,
    )
  )
}

function calculateAssistPunten(
  assists,
) {
  return (
    toNumber(
      assists,
    ) *
    3
  )
}

function calculateCleanSheetPunten({
  cleanSheet,
  positie,
}) {
  if (!cleanSheet) {
    return 0
  }

  if (
    positie ===
      'keeper' ||
    positie ===
      'verdediger'
  ) {
    return 4
  }

  if (
    positie ===
    'middenvelder'
  ) {
    return 1
  }

  return 0
}

function calculateReddingenPunten({
  saves,
  positie,
}) {
  if (
    positie !==
    'keeper'
  ) {
    return 0
  }

  return Math.floor(
    toNumber(
      saves,
    ) /
    3,
  )
}

function calculatePenaltyGestoptPunten(
  penaltiesSaved,
) {
  return (
    toNumber(
      penaltiesSaved,
    ) *
    5
  )
}

function calculatePenaltyGemistPunten(
  penaltiesMissed,
) {
  return (
    toNumber(
      penaltiesMissed,
    ) *
    -2
  )
}

function calculateTegendoelpuntPunten({
  goalsConceded,
  positie,
}) {
  if (
    positie !==
      'keeper' &&
    positie !==
      'verdediger'
  ) {
    return 0
  }

  return (
    Math.floor(
      toNumber(
        goalsConceded,
      ) /
      2,
    ) *
    -1
  )
}

function calculateGeleKaartPunten(
  yellowCards,
) {
  return (
    toNumber(
      yellowCards,
    ) *
    -1
  )
}

function calculateRodeKaartPunten(
  redCards,
) {
  return (
    toNumber(
      redCards,
    ) *
    -3
  )
}

function calculateEigenDoelpuntPunten(
  ownGoals,
) {
  return (
    toNumber(
      ownGoals,
    ) *
    -2
  )
}

/*
|--------------------------------------------------------------------------
| Puntenopbouw van één wedstrijd
|--------------------------------------------------------------------------
*/

function calculateWedstrijdPunten({
  player,
  matchStat,
}) {
  const positie =
    normalizePosition(
      player,
    )

  const punten = {
    speelminuten:
      calculateSpeelminutenPunten(
        matchStat.minutes,
      ),

    goals:
      calculateDoelpuntPunten({
        goals:
          matchStat.goals,

        positie,
      }),

    assists:
      calculateAssistPunten(
        matchStat.assists,
      ),

    cleanSheet:
      calculateCleanSheetPunten({
        cleanSheet:
          Boolean(
            matchStat.cleanSheet,
          ),

        positie,
      }),

    reddingen:
      calculateReddingenPunten({
        saves:
          matchStat.saves,

        positie,
      }),

    penaltyGestopt:
      calculatePenaltyGestoptPunten(
        matchStat.penaltiesSaved,
      ),

    penaltyGemist:
      calculatePenaltyGemistPunten(
        matchStat.penaltiesMissed,
      ),

    tegendoelpunten:
      calculateTegendoelpuntPunten({
        goalsConceded:
          matchStat.goalsConceded,

        positie,
      }),

    geleKaarten:
      calculateGeleKaartPunten(
        matchStat.yellowCards,
      ),

    rodeKaarten:
      calculateRodeKaartPunten(
        matchStat.redCards,
      ),

    eigenDoelpunten:
      calculateEigenDoelpuntPunten(
        matchStat.ownGoals,
      ),

    /*
     * OPTA Bonus wordt handmatig
     * als 0, 1, 2 of 3 ingevoerd.
     */
    optaBonus:
      toNumber(
        matchStat.optaBonus,
      ),
  }

  const totaal =
    Object
      .values(
        punten,
      )
      .reduce(
        (
          som,
          waarde,
        ) =>
          som +
          toNumber(
            waarde,
          ),
        0,
      )

  return {
    ...punten,

    totaal,
  }
}

/*
|--------------------------------------------------------------------------
| Bijdragen van één wedstrijd
|--------------------------------------------------------------------------
|
| Bijdragen groeperen de Fantasypunten
| op een begrijpelijke manier.
|
*/

function calculateWedstrijdBijdragen(
  punten,
) {
  const bijdragen = {
    speelminuten:
      punten.speelminuten,

    aanvallend:
      punten.goals +
      punten.assists,

    verdedigend:
      punten.cleanSheet +
      punten.reddingen +
      punten.penaltyGestopt +
      punten.tegendoelpunten,

    bonus:
      punten.optaBonus,

    discipline:
      punten.penaltyGemist +
      punten.geleKaarten +
      punten.rodeKaarten +
      punten.eigenDoelpunten,
  }

  return {
    ...bijdragen,

    totaal:
      Object
        .values(
          bijdragen,
        )
        .reduce(
          (
            som,
            waarde,
          ) =>
            som +
            toNumber(
              waarde,
            ),
          0,
        ),
  }
}

/*
|--------------------------------------------------------------------------
| Wedstrijd normaliseren
|--------------------------------------------------------------------------
*/

export function buildPlayerMatch({
  player,
  matchStat,
  fixture,
}) {
  const minutes =
    toNumber(
      matchStat.minutes,
    )

  const played =
    hasPlayed(
      matchStat,
    )

  const statistieken = {
    minuten:
      minutes,

    goals:
      toNumber(
        matchStat.goals,
      ),

    assists:
      toNumber(
        matchStat.assists,
      ),

    cleanSheet:
      Boolean(
        matchStat.cleanSheet,
      ),

    reddingen:
      toNumber(
        matchStat.saves,
      ),

    tegendoelpunten:
      toNumber(
        matchStat.goalsConceded,
      ),

    penaltiesGestopt:
      toNumber(
        matchStat.penaltiesSaved,
      ),

    penaltiesGemist:
      toNumber(
        matchStat.penaltiesMissed,
      ),

    eigenDoelpunten:
      toNumber(
        matchStat.ownGoals,
      ),

    geleKaarten:
      toNumber(
        matchStat.yellowCards,
      ),

    rodeKaarten:
      toNumber(
        matchStat.redCards,
      ),

    optaBonus:
      toNumber(
        matchStat.optaBonus,
      ),
  }

  const punten =
    calculateWedstrijdPunten({
      player,

      matchStat: {
        ...matchStat,

        minutes:
          statistieken.minuten,

        goals:
          statistieken.goals,

        assists:
          statistieken.assists,

        cleanSheet:
          statistieken.cleanSheet,

        saves:
          statistieken.reddingen,

        goalsConceded:
          statistieken
            .tegendoelpunten,

        penaltiesSaved:
          statistieken
            .penaltiesGestopt,

        penaltiesMissed:
          statistieken
            .penaltiesGemist,

        ownGoals:
          statistieken
            .eigenDoelpunten,

        yellowCards:
          statistieken
            .geleKaarten,

        redCards:
          statistieken
            .rodeKaarten,

        optaBonus:
          statistieken.optaBonus,
      },
    })

  const bijdragen =
    calculateWedstrijdBijdragen(
      punten,
    )

  return {
    id:
      cleanText(
        matchStat.id,
      ),

    playerId:
      cleanText(
        matchStat.playerId,
      ),

    playerName:
      cleanText(
        matchStat.playerName,
      ) ||
      cleanText(
        player?.name,
      ),

    season:
      cleanText(
        matchStat.season,
      ),

    round:
      toNumber(
        matchStat.round,
      ),

    fixtureId:
      cleanText(
        matchStat.fixtureId,
      ),

    status:
      normalizeMatchStatus(
        matchStat.status,
      ),

    statusLabel:
      cleanText(
        matchStat.status,
      ),

    played,

    didNotPlay:
      hasNotPlayed(
        matchStat,
      ),

    started:
      normalizeText(
        matchStat.status,
      ) ===
      'basis',

    substituted:
      normalizeText(
        matchStat.status,
      ) ===
      'wissel',

    minutes,

    goals:
      toNumber(
        matchStat.goals,
      ),

    assists:
      toNumber(
        matchStat.assists,
      ),

    optaBonus:
      toNumber(
        matchStat.optaBonus,
      ),

    cleanSheet:
      Boolean(
        matchStat.cleanSheet,
      ),

    goalsConceded:
      toNumber(
        matchStat.goalsConceded,
      ),

    saves:
      toNumber(
        matchStat.saves,
      ),

    penaltiesSaved:
      toNumber(
        matchStat.penaltiesSaved,
      ),

    penaltiesMissed:
      toNumber(
        matchStat.penaltiesMissed,
      ),

    ownGoals:
      toNumber(
        matchStat.ownGoals,
      ),

    yellowCards:
      toNumber(
        matchStat.yellowCards,
      ),

    redCards:
      toNumber(
        matchStat.redCards,
      ),

    notes:
      cleanText(
        matchStat.notes,
      ),

          positie:
      normalizePosition(
        player,
      ),

    statistieken,

    punten,

    bijdragen,

    fixture: fixture
      ? {
          id:
            fixture.id,

          date:
            fixture.date ?? '',

          time:
            fixture.time ?? '',

          home:
            fixture.home,

          away:
            fixture.away,

          opponent:
            resolveOpponent({
              player,
              fixture,
            }),

          venue:
            resolveVenue({
              player,
              fixture,
            }),
        }
      : null,
  }
}

/*
|--------------------------------------------------------------------------
| Wedstrijdgeschiedenis
|--------------------------------------------------------------------------
*/

export function getPlayerMatchHistory(
  player,
  options = {},
) {
  const playerMatchStats =
    getPlayerMatchStats()

  const fixtures =
    getFixtures()

  const playerId =
    String(
      player?.id ??
      player?.playerId ??
      '',
    ).trim()

  const season =
    String(
      options.season ??
      player?.season ??
      '',
    ).trim()

  return playerMatchStats
    .filter(
      (matchStat) => {
        const samePlayer =
          String(
            matchStat?.playerId ??
            '',
          ).trim() ===
          playerId

        const sameSeason =
          !season ||
          String(
            matchStat?.season ??
            '',
          ).trim() ===
          season

        const matchFinished =
          matchStat?.matchStatus ===
          true

        return (
          samePlayer &&
          sameSeason &&
          matchFinished
        )
      },
    )
    .map(
      (matchStat) => {
        const fixture =
          findFixture(
            matchStat.fixtureId,
            fixtures,
          )

        return buildPlayerMatch({
          player,
          matchStat,
          fixture,
        })
      },
    )
    .sort(
      (left, right) =>
        Number(
          left?.round || 0,
        ) -
        Number(
          right?.round || 0,
        ),
    )
}

/*
|--------------------------------------------------------------------------
| Recente wedstrijden
|--------------------------------------------------------------------------
*/

function getRecentPlayerMatches(
  player,
  count =
    DEFAULT_RECENT_MATCH_COUNT,
  options = {},
) {
  const normalizedCount =
    Math.max(
      1,
      Number(count) ||
      DEFAULT_RECENT_MATCH_COUNT,
    )

  return getPlayerMatchHistory(
    player,
    options,
  )
    .filter(
      (match) =>
        match.fixture
          ?.venue !==
        'unknown',
    )
    .slice(
      -normalizedCount,
    )
}

/*
|--------------------------------------------------------------------------
| Ruwe totalen
|--------------------------------------------------------------------------
*/

function calculatePlayerMatchTotals(
  matches,
) {
  const safeMatches =
    Array.isArray(matches)
      ? matches
      : []

  return safeMatches.reduce(
    (
      totals,
      match,
    ) => {
      totals.registeredMatches +=
        1

      if (match.played) {
        totals.appearances +=
          1
      }

      if (match.started) {
        totals.starts +=
          1
      }

      if (match.substituted) {
        totals.substituteAppearances +=
          1
      }

      if (
        match.status ===
        'unused-sub'
      ) {
        totals.unusedSubstitutions +=
          1
      }

      totals.minutes +=
        match.minutes

      totals.goals +=
        match.goals

      totals.assists +=
        match.assists

      totals.optaBonus +=
        match.optaBonus

      totals.cleanSheets +=
        match.cleanSheet
          ? 1
          : 0

      totals.goalsConceded +=
        match.goalsConceded

      totals.saves +=
        match.saves

      totals.penaltiesSaved +=
        match.penaltiesSaved

      totals.penaltiesMissed +=
        match.penaltiesMissed

      totals.ownGoals +=
        match.ownGoals

      totals.yellowCards +=
        match.yellowCards

      totals.redCards +=
        match.redCards

              Object
        .keys(
          totals.punten,
        )
        .forEach(
          (key) => {
            totals
              .punten[
                key
              ] +=
              toNumber(
                match
                  .punten
                  ?.[key],
              )
          },
        )

      Object
        .keys(
          totals.bijdragen,
        )
        .forEach(
          (key) => {
            totals
              .bijdragen[
                key
              ] +=
              toNumber(
                match
                  .bijdragen
                  ?.[key],
              )
          },
        )

      return totals
    },
    {
      registeredMatches:
        0,

      appearances:
        0,

      starts:
        0,

      substituteAppearances:
        0,

      unusedSubstitutions:
        0,

      minutes:
        0,

      goals:
        0,

      assists:
        0,

      optaBonus:
        0,

      cleanSheets:
        0,

      goalsConceded:
        0,

      saves:
        0,

      penaltiesSaved:
        0,

      penaltiesMissed:
        0,

      ownGoals:
        0,

      yellowCards:
        0,

      redCards:
        0,

              punten: {
        speelminuten:
          0,

        goals:
          0,

        assists:
          0,

        cleanSheet:
          0,

        reddingen:
          0,

        penaltyGestopt:
          0,

        penaltyGemist:
          0,

        tegendoelpunten:
          0,

        geleKaarten:
          0,

        rodeKaarten:
          0,

        eigenDoelpunten:
          0,

        optaBonus:
          0,

        totaal:
          0,
      },

      bijdragen: {
        speelminuten:
          0,

        aanvallend:
          0,

        verdedigend:
          0,

        bonus:
          0,

        discipline:
          0,

        totaal:
          0,
      },
    },
  )
}

/*
|--------------------------------------------------------------------------
| Gemiddelden
|--------------------------------------------------------------------------
*/

function calculatePlayerMatchAverages(
  totals,
) {
  const appearances =
    totals.appearances

  const minutes =
    totals.minutes

  return {
    minutesPerAppearance:
      appearances > 0
        ? round(
            totals.minutes /
            appearances,
            1,
          )
        : 0,

    goalsPerAppearance:
      appearances > 0
        ? round(
            totals.goals /
            appearances,
            2,
          )
        : 0,

    assistsPerAppearance:
      appearances > 0
        ? round(
            totals.assists /
            appearances,
            2,
          )
        : 0,

    bonusPerAppearance:
      appearances > 0
        ? round(
            totals.optaBonus /
            appearances,
            2,
          )
        : 0,

    goalsPer90:
      minutes > 0
        ? round(
            (
              totals.goals /
              minutes
            ) *
              90,
            2,
          )
        : 0,

    assistsPer90:
      minutes > 0
        ? round(
            (
              totals.assists /
              minutes
            ) *
              90,
            2,
          )
        : 0,

    bonusPer90:
      minutes > 0
        ? round(
            (
              totals.optaBonus /
              minutes
            ) *
              90,
            2,
          )
        : 0,

    savesPer90:
      minutes > 0
        ? round(
            (
              totals.saves /
              minutes
            ) *
              90,
            2,
          )
        : 0,

    startPercentage:
      appearances > 0
        ? round(
            (
              totals.starts /
              appearances
            ) *
              100,
            0,
          )
        : 0,

            puntenPerWedstrijd:
      appearances > 0
        ? round(
            totals
              .punten
              .totaal /
            appearances,
            2,
          )
        : 0,

    puntenPer90:
      minutes > 0
        ? round(
            (
              totals
                .punten
                .totaal /
              minutes
            ) *
              90,
            2,
          )
        : 0,

    aanvallendePuntenPerWedstrijd:
      appearances > 0
        ? round(
            totals
              .bijdragen
              .aanvallend /
            appearances,
            2,
          )
        : 0,

    verdedigendePuntenPerWedstrijd:
      appearances > 0
        ? round(
            totals
              .bijdragen
              .verdedigend /
            appearances,
            2,
          )
        : 0,
  }
}

/*
|--------------------------------------------------------------------------
| Spelerwedstrijdprofiel
|--------------------------------------------------------------------------
*/

function calculatePlayerMatchProfile(
  player,
  options = {},
) {
  const wedstrijden =
    getPlayerMatchHistory(
      player,
      options,
    )

  const totalen =
    calculatePlayerMatchTotals(
      wedstrijden,
    )

  const gemiddelden =
    calculatePlayerMatchAverages(
      totalen,
    )

  const recenteWedstrijden =
    getRecentPlayerMatches(
      player,
      options.recentMatchCount ??
        DEFAULT_RECENT_MATCH_COUNT,
      options,
    )

  const statistieken = {
    geregistreerdeWedstrijden:
      totalen.registeredMatches,

    gespeeldeWedstrijden:
      totalen.appearances,

    basisplaatsen:
      totalen.starts,

    invalbeurten:
      totalen.substituteAppearances,

    nietIngevallen:
      totalen.unusedSubstitutions,

    minuten:
      totalen.minutes,

    goals:
      totalen.goals,

    assists:
      totalen.assists,

    doelpuntBetrokkenheid:
      totalen.goals +
      totalen.assists,

    optaBonus:
      totalen.optaBonus,

    cleanSheets:
      totalen.cleanSheets,

    tegendoelpunten:
      totalen.goalsConceded,

    reddingen:
      totalen.saves,

    penaltiesGestopt:
      totalen.penaltiesSaved,

    penaltiesGemist:
      totalen.penaltiesMissed,

    eigenDoelpunten:
      totalen.ownGoals,

    geleKaarten:
      totalen.yellowCards,

    rodeKaarten:
      totalen.redCards,
  }

  return {
    spelerId:
      cleanText(
        player?.id,
      ),

    spelerNaam:
      cleanText(
        player?.name,
      ),

    seizoen:
      cleanText(
        options.season ??
        player?.season,
      ),

    positie:
      normalizePosition(
        player,
      ),

    wedstrijden,

    recenteWedstrijden,

    statistieken,

    punten: {
      ...totalen.punten,
    },

    bijdragen: {
      ...totalen.bijdragen,
    },

    gemiddelden,

    samenvatting: {
      wedstrijden:
        statistieken
          .geregistreerdeWedstrijden,

      gespeeld:
        statistieken
          .gespeeldeWedstrijden,

      basisplaatsen:
        statistieken
          .basisplaatsen,

      minuten:
        statistieken.minuten,

      doelpuntBetrokkenheid:
        statistieken
          .doelpuntBetrokkenheid,

      cleanSheets:
        statistieken
          .cleanSheets,

      fantasypunten:
        totalen
          .punten
          .totaal,

      puntenPerWedstrijd:
        gemiddelden
          .puntenPerWedstrijd,

      puntenPer90:
        gemiddelden
          .puntenPer90,
    },

    /*
     * Tijdelijke compatibiliteit.
     *
     * Bestaande of tijdelijke code kan
     * totalen en de Engelse sleutels
     * voorlopig blijven gebruiken.
     */
    matches:
      wedstrijden,

    recentMatches:
      recenteWedstrijden,

    totals:
      totalen,

    averages:
      gemiddelden,

    summary: {
      registeredMatches:
        totalen
          .registeredMatches,

      appearances:
        totalen.appearances,

      starts:
        totalen.starts,

      minutes:
        totalen.minutes,

      returns:
        totalen.goals +
        totalen.assists,

      cleanSheets:
        totalen.cleanSheets,

      fantasyPoints:
        totalen
          .punten
          .totaal,
    },
  }
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

export {
  normalizeMatchStatus,
  getRecentPlayerMatches,
  calculatePlayerMatchTotals,
  calculatePlayerMatchAverages,
  calculatePlayerMatchProfile,
}
