import {
  calculatePlayerMatchProfile,
} from '../services/playerMatchStatsEngine.js'

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function normalizeExpectedRole(value) {
  const role =
    normalizeText(value)

  const roleMap = {
    basis: 'starter',
    basisspeler: 'starter',
    starter: 'starter',
    'first-choice': 'starter',
    'eerste keus': 'starter',

    sterkhouder: 'key-player',
    sleutelspeler: 'key-player',
    sterspeler: 'key-player',
    star: 'key-player',
    'key-player': 'key-player',

    roulatie: 'rotation',
    rotatie: 'rotation',
    rotation: 'rotation',

    reserve: 'backup',
    bankspeler: 'backup',
    backup: 'backup',

    talent: 'prospect',
    prospect: 'prospect',

    onbekend: 'unknown',
    unknown: 'unknown',
  }

  return roleMap[role] ?? 'unknown'
}

function normalizeOptionalBoolean(
  value,
  fallback = null,
) {
  if (
    value === true ||
    value === false
  ) {
    return value
  }

  return fallback
}

function normalizeOptionalNumber(value) {
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

function buildScoutProfile(player) {
  const source =
    player.scoutProfile || {}

  const expectedRole =
    normalizeExpectedRole(
      source.expectedRole ??
      player.expectedRole,
    )

  /*
   * Bij een onbekende rol behandelen we
   * expectedStarter niet automatisch als false.
   *
   * false betekent:
   * bewust géén verwachte basisspeler.
   *
   * null betekent:
   * nog niet beoordeeld.
   */
  const expectedStarter =
    expectedRole === 'unknown'
      ? null
      : normalizeOptionalBoolean(
          source.expectedStarter ??
          player.expectedStarter,
          null,
        )

  return {
    expectedRole,
    expectedStarter,

    rotationRisk:
      normalizeOptionalBoolean(
        source.rotationRisk ??
        player.rotationRisk,
        false,
      ),

    injuryRisk:
      normalizeOptionalBoolean(
        source.injuryRisk ??
        player.injuryRisk,
        false,
      ),

    premiumSigning:
      normalizeOptionalBoolean(
        source.premiumSigning ??
        player.premiumSigning,
        false,
      ),

    newLeague:
      normalizeOptionalBoolean(
        source.newLeague ??
        player.newLeague,
        false,
      ),

    penalties:
      normalizeOptionalBoolean(
        source.penalties ??
        player.penalties,
        false,
      ),

    corners:
      normalizeOptionalBoolean(
        source.corners ??
        player.corners,
        false,
      ),

    freeKicks:
      normalizeOptionalBoolean(
        source.freeKicks ??
        player.freeKicks,
        false,
      ),

    status:
      String(
        source.status ??
        player.status ??
        '',
      ).trim(),

    chanceOfPlaying:
      normalizeOptionalNumber(
        source.chanceOfPlaying ??
        player.chanceOfPlaying,
      ),

    expectedMinutes:
      normalizeOptionalNumber(
        source.expectedMinutes ??
        player.expectedMinutes,
      ),

    confidence:
      normalizeText(
        source.confidence ??
        player.dataConfidence,
      ),

    overrides: {
      potential:
        normalizeOptionalNumber(
          source.overrides?.potential ??
          player.manualPotential,
        ),

      availability:
        normalizeOptionalNumber(
          source.overrides?.availability ??
          player.manualAvailability,
        ),

      risk:
        normalizeOptionalNumber(
          source.overrides?.risk ??
          player.manualRisk,
        ),
    },
  }
}

export function buildPlayerModel(
  player,
  context = {},
) {
  const scoutProfile =
    buildScoutProfile(
      player,
    )

  const history =
    context.history ?? {
      seasons: [],

      totals: {
        minutes: 0,
        points: 0,
        goals: 0,
        assists: 0,
        optaBonus: 0,
        cleanSheets: 0,
        saves: 0,
      },
    }

  const experience =
    context.experience ?? {
      score: 0,
      totalMinutes: 0,
      seasonCount: 0,
      minutesScore: 0,
      seasonsScore: 0,
    }

  const confidence =
    context.confidence ?? {
      score: 20,
      level: 'low',
      label: 'Laag',
      source: 'automatic',
      reasons: [],
    }

  /*
   * Het wedstrijdprofiel mag vanuit de
   * context worden meegegeven.
   *
   * Als dat niet gebeurt, berekent de centrale
   * spelerbuilder het profiel automatisch.
   */

  const matchProfile =
    context.matchProfile ??
    context.match ??
    calculatePlayerMatchProfile(
      player,
      {
        season:
          player?.season,
      },
    )

const matchStatistics =
  matchProfile?.statistieken ?? {}

const matchMinutes =
  Number(
    matchStatistics.minuten,
  ) || 0

const matchGoals =
  Number(
    matchStatistics.goals,
  ) || 0

const matchAssists =
  Number(
    matchStatistics.assists,
  ) || 0

const performance = {
  goalContributions:
    matchGoals +
    matchAssists,

  goalsPer90:
    matchMinutes > 0
      ? (
          matchGoals /
          matchMinutes
        ) * 90
      : 0,

  assistsPer90:
    matchMinutes > 0
      ? (
          matchAssists /
          matchMinutes
        ) * 90
      : 0,

  goalContributionsPer90:
    matchMinutes > 0
      ? (
          (
            matchGoals +
            matchAssists
          ) /
          matchMinutes
        ) * 90
      : 0,
}

const startPrice =
  Number(
    player.startPrice,
  ) || 0

const endPrice =
  Number(
    player.endPrice,
  ) || 0

const value = {
  pointsPerMillion:
    endPrice > 0
      ? Number(
          matchProfile
            ?.punten
            ?.totaal ?? 0,
        ) / endPrice
      : 0,

  priceChange:
    endPrice -
    startPrice,

  priceChangePercentage:
    startPrice > 0
      ? (
          (
            endPrice -
            startPrice
          ) /
          startPrice
        ) * 100
      : 0,
}

const defending = {
  cleanSheets:
    Number(
      matchProfile
        ?.statistieken
        ?.cleanSheets,
    ) || 0,

  saves:
    Number(
      matchProfile
        ?.statistieken
        ?.reddingen,
    ) || 0,

  penaltiesSaved:
    Number(
      matchProfile
        ?.statistieken
        ?.penaltiesGestopt,
    ) || 0,

  goalsConceded:
    Number(
      matchProfile
        ?.statistieken
        ?.tegendoelpunten,
    ) || 0,

  cleanSheetsPerMatch:
    Number(
      matchProfile
        ?.statistieken
        ?.gespeeldeWedstrijden,
    ) > 0
      ? (
          Number(
            matchProfile
              ?.statistieken
              ?.cleanSheets,
          ) || 0
        ) /
        Number(
          matchProfile
            ?.statistieken
            ?.gespeeldeWedstrijden,
        )
      : 0,

  savesPerMatch:
    Number(
      matchProfile
        ?.statistieken
        ?.gespeeldeWedstrijden,
    ) > 0
      ? (
          Number(
            matchProfile
              ?.statistieken
              ?.reddingen,
          ) || 0
        ) /
        Number(
          matchProfile
            ?.statistieken
            ?.gespeeldeWedstrijden,
        )
      : 0,

  savesPer90:
    Number(
      matchProfile
        ?.statistieken
        ?.minuten,
    ) > 0
      ? (
          (
            Number(
              matchProfile
                ?.statistieken
                ?.reddingen,
            ) || 0
          ) /
          Number(
            matchProfile
              ?.statistieken
              ?.minuten,
          )
        ) *
        90
      : 0,
}

const discipline = {
  yellowCards:
    Number(
      matchProfile
        ?.statistieken
        ?.geleKaarten,
    ) || 0,

  redCards:
    Number(
      matchProfile
        ?.statistieken
        ?.rodeKaarten,
    ) || 0,

  ownGoals:
    Number(
      matchProfile
        ?.statistieken
        ?.eigenDoelpunten,
    ) || 0,

  penaltiesMissed:
    Number(
      matchProfile
        ?.statistieken
        ?.penaltiesGemist,
    ) || 0,

  totalCards:
    (
      Number(
        matchProfile
          ?.statistieken
          ?.geleKaarten,
      ) || 0
    ) +
    (
      Number(
        matchProfile
          ?.statistieken
          ?.rodeKaarten,
      ) || 0
    ),

  cardsPerMatch:
    Number(
      matchProfile
        ?.statistieken
        ?.gespeeldeWedstrijden,
    ) > 0
      ? (
          (
            Number(
              matchProfile
                ?.statistieken
                ?.geleKaarten,
            ) || 0
          ) +
          (
            Number(
              matchProfile
                ?.statistieken
                ?.rodeKaarten,
            ) || 0
          )
        ) /
        Number(
          matchProfile
            ?.statistieken
            ?.gespeeldeWedstrijden,
        )
      : 0,

  cardsPer90:
    Number(
      matchProfile
        ?.statistieken
        ?.minuten,
    ) > 0
      ? (
          (
            (
              Number(
                matchProfile
                  ?.statistieken
                  ?.geleKaarten,
              ) || 0
            ) +
            (
              Number(
                matchProfile
                  ?.statistieken
                  ?.rodeKaarten,
              ) || 0
            )
          ) /
          Number(
            matchProfile
              ?.statistieken
              ?.minuten,
          )
        ) *
        90
      : 0,

  penaltyMissPoints:
    Number(
      matchProfile
        ?.punten
        ?.penaltyGemist,
    ) || 0,

  cardPoints:
    (
      Number(
        matchProfile
          ?.punten
          ?.geleKaarten,
      ) || 0
    ) +
    (
      Number(
        matchProfile
          ?.punten
          ?.rodeKaarten,
      ) || 0
    ),

  ownGoalPoints:
    Number(
      matchProfile
        ?.punten
        ?.eigenDoelpunten,
    ) || 0,

  totalPenaltyPoints:
    (
      Number(
        matchProfile
          ?.punten
          ?.penaltyGemist,
      ) || 0
    ) +
    (
      Number(
        matchProfile
          ?.punten
          ?.geleKaarten,
      ) || 0
    ) +
    (
      Number(
        matchProfile
          ?.punten
          ?.rodeKaarten,
      ) || 0
    ) +
    (
      Number(
        matchProfile
          ?.punten
          ?.eigenDoelpunten,
      ) || 0
    ),
}

  const profile = {
    scout:
      scoutProfile,

    history: {
      previousSeason:
        history.seasons?.[0] ??
        null,

      seasons:
        history.seasons ?? [],

      totals:
        history.totals ?? {
          minutes: 0,
          points: 0,
          goals: 0,
          assists: 0,
          optaBonus: 0,
          cleanSheets: 0,
          saves: 0,
        },
    },

    experience,

    confidence,

    /*
     * Actuele wedstrijdgegevens.
     *
     * Bevat:
     *
     * - wedstrijden;
     * - recente wedstrijden;
     * - statistieken;
     * - Fantasypunten;
     * - bijdragen;
     * - gemiddelden;
     * - samenvatting.
     */

   performance,

   value,

   defending,

   discipline,
   
    match:
      matchProfile,
  }

  return {
    ...player,

    profile,

    /*
     * Tijdelijke compatibiliteit:
     * bestaande modules en engines mogen
     * onderstaande velden voorlopig blijven
     * gebruiken.
     */

    scoutProfile,

    experience,

    confidence,

    matchProfile,

    matchHistory:
      matchProfile
        ?.wedstrijden ??
      [],

    recentMatches:
      matchProfile
        ?.recenteWedstrijden ??
      [],

    matchStatistics:
      matchProfile
        ?.statistieken ??
      {},

    fantasyPoints:
      matchProfile
        ?.punten ??
      {},

    contributions:
      matchProfile
        ?.bijdragen ??
      {},

    matchAverages:
      matchProfile
        ?.gemiddelden ??
      {},

    expectedRole:
      scoutProfile.expectedRole,

    expectedStarter:
      scoutProfile.expectedStarter,

    rotationRisk:
      scoutProfile.rotationRisk,

    injuryRisk:
      scoutProfile.injuryRisk,

    premiumSigning:
      scoutProfile.premiumSigning,

    newLeague:
      scoutProfile.newLeague,

    chanceOfPlaying:
      scoutProfile.chanceOfPlaying,

    expectedMinutes:
  scoutProfile.expectedMinutes,

/*
 * Waardeprofiel.
 */

 value,

pointsPerMillion:
  value.pointsPerMillion,

priceChange:
  value.priceChange,

priceChangePercentage:
  value.priceChangePercentage,

/*
 * Actuele seizoenstotalen uit
 * PLAYER_MATCH_STATS.
 *
 * Deze waarden overschrijven bewust
 * de oude seizoensvelden uit SPELERS.
 */

points:
  matchProfile
    ?.punten
    ?.totaal ??
  player.points ??
  0,

minutes:
  matchProfile
    ?.statistieken
    ?.minuten ??
  player.minutes ??
  0,

goals:
  matchProfile
    ?.statistieken
    ?.goals ??
  player.goals ??
  0,

assists:
  matchProfile
    ?.statistieken
    ?.assists ??
  player.assists ??
  0,

saves:
  matchProfile
    ?.statistieken
    ?.reddingen ??
  player.saves ??
  0,

cleanSheets:
  matchProfile
    ?.statistieken
    ?.cleanSheets ??
  player.cleanSheets ??
  0,

optaBonus:
  matchProfile
    ?.statistieken
    ?.optaBonus ??
  player.optaBonus ??
  0,

penaltiesSaved:
  matchProfile
    ?.statistieken
    ?.penaltiesGestopt ??
  player.penaltiesSaved ??
  0,

penaltiesMissed:
  matchProfile
    ?.statistieken
    ?.penaltiesGemist ??
  player.penaltiesMissed ??
  0,

yellowCards:
  matchProfile
    ?.statistieken
    ?.geleKaarten ??
  player.yellowCards ??
  0,

redCards:
  matchProfile
    ?.statistieken
    ?.rodeKaarten ??
  player.redCards ??
  0,

ownGoals:
  matchProfile
    ?.statistieken
    ?.eigenDoelpunten ??
  player.ownGoals ??
  0,

matches:
  matchProfile
    ?.statistieken
    ?.gespeeldeWedstrijden ??
  0,

starts:
  matchProfile
    ?.statistieken
    ?.basisplaatsen ??
  0,

substituteAppearances:
  matchProfile
    ?.statistieken
    ?.invalbeurten ??
  0,

pointsPerMatch:
  matchProfile
    ?.gemiddelden
    ?.puntenPerWedstrijd ??
  0,

pointsPer90:
  matchProfile
    ?.gemiddelden
    ?.puntenPer90 ??
  0,

minutesPerAppearance:
  matchProfile
    ?.gemiddelden
    ?.minutesPerAppearance ??
  0,

startPercentage:
  matchProfile
    ?.gemiddelden
    ?.startPercentage ??
  0,

  performance,

goalContributions:
  performance
    .goalContributions,

goalsPer90:
  performance
    .goalsPer90,

assistsPer90:
  performance
    .assistsPer90,

goalContributionsPer90:
  performance
    .goalContributionsPer90,

    defending,

cleanSheetsPerMatch:
  defending.cleanSheetsPerMatch,

savesPerMatch:
  defending.savesPerMatch,

savesPer90:
  defending.savesPer90,

goalsConceded:
  defending.goalsConceded,

discipline,

totalCards:
  discipline.totalCards,

cardsPerMatch:
  discipline.cardsPerMatch,

cardsPer90:
  discipline.cardsPer90,

cardPoints:
  discipline.cardPoints,

ownGoalPoints:
  discipline.ownGoalPoints,

penaltyMissPoints:
  discipline.penaltyMissPoints,

totalPenaltyPoints:
  discipline.totalPenaltyPoints,
}
}