import {
  FANTASY_GAME_RULES,
  normalizeFantasyPosition,
  validateStartingLineup,
} from '../fantasyGameRulesEngine.js'

/*
|--------------------------------------------------------------------------
| Optimizer — beste opstelling
|--------------------------------------------------------------------------
|
| Deze module bepaalt voor één vaste selectie
| en één specifieke speelronde:
|
| - de beste geldige formatie;
| - de beste basiself;
| - de captain;
| - de vice-captain;
| - de bankvolgorde;
| - het totale aantal verwachte punten.
|
| Deze module:
|
| - selecteert nog geen volledige selectie;
| - plant nog geen transfers;
| - verwerkt nog geen chips;
| - berekent Expected Points niet opnieuw.
|
| Alle projecties worden gelezen uit:
|
| player.expectedPointsProjection.rounds
|
*/

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

function roundValue(
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

function normalizePlayerId(
  player,
) {
  return String(
    player?.id ??
    '',
  )
}

/*
|--------------------------------------------------------------------------
| Positie
|--------------------------------------------------------------------------
*/

function getPlayerPosition(
  player,
) {
  return normalizeFantasyPosition(
    player
      ?.fantasyPosition ??
    player
      ?.position,
  )
}

/*
|--------------------------------------------------------------------------
| Projectie voor één speelronde
|--------------------------------------------------------------------------
*/

export function getPlayerRoundProjection(
  player,
  round,
) {
  const roundNumber =
    Number(round)

  const projectionRounds =
    Array.isArray(
      player
        ?.expectedPointsProjection
        ?.rounds,
    )
      ? player
          .expectedPointsProjection
          .rounds
      : []

  const projection =
    projectionRounds.find(
      (item) =>
        Number(
          item?.round,
        ) ===
        roundNumber,
    )

  if (!projection) {
    return {
      round:
        roundNumber,

      expectedPoints:
        0,

      expectedMinutes:
        0,

      appearanceProbability:
        0,

      fixtureCount:
        0,

      type:
        'missing',

      hasProjection:
        false,
    }
  }

  return {
    round:
      roundNumber,

    expectedPoints:
      roundValue(
        projection
          ?.expectedPoints,
        2,
      ),

    expectedMinutes:
      roundValue(
        projection
          ?.expectedMinutes,
        1,
      ),

    appearanceProbability:
      roundValue(
        projection
          ?.appearanceProbability,
        4,
      ),

    fixtureCount:
      Math.max(
        0,
        Math.floor(
          toNumber(
            projection
              ?.fixtureCount,
          ),
        ),
      ),

    type:
      projection?.type ??
      'normal',

    hasProjection:
      true,
  }
}

/*
|--------------------------------------------------------------------------
| Projectie over meerdere speelrondes
|--------------------------------------------------------------------------
|
| Telt de afzonderlijke projecties van een speler
| bij elkaar op voor een periode van 1 t/m 10 rondes.
|
| Expected Points en minuten worden opgeteld.
| De speelkans wordt gemiddeld over de geselecteerde periode.
|
*/

export function getPlayerPeriodProjection(
  player,
  startRound,
  roundCount = 1,
) {
  const normalizedStartRound =
    Math.max(
      1,
      Math.floor(
        toNumber(
          startRound,
          1,
        ),
      ),
    )

  const normalizedRoundCount =
    Math.max(
      1,
      Math.min(
        10,
        Math.floor(
          toNumber(
            roundCount,
            1,
          ),
        ),
      ),
    )

  const rounds =
    Array.from(
      {
        length:
          normalizedRoundCount,
      },
      (
        _,
        index,
      ) =>
        normalizedStartRound +
        index,
    )

  const projections =
    rounds.map(
      (round) =>
        getPlayerRoundProjection(
          player,
          round,
        ),
    )

  const expectedPoints =
    projections.reduce(
      (
        total,
        projection,
      ) =>
        total +
        projection.expectedPoints,
      0,
    )

  const expectedMinutes =
    projections.reduce(
      (
        total,
        projection,
      ) =>
        total +
        projection.expectedMinutes,
      0,
    )

  const appearanceProbability =
    projections.length
      ? projections.reduce(
          (
            total,
            projection,
          ) =>
            total +
            projection
              .appearanceProbability,
          0,
        ) /
        projections.length
      : 0

  const fixtureCount =
    projections.reduce(
      (
        total,
        projection,
      ) =>
        total +
        projection.fixtureCount,
      0,
    )

  const missingProjectionRounds =
    projections
      .filter(
        (projection) =>
          !projection.hasProjection,
      )
      .map(
        (projection) =>
          projection.round,
      )

  return {
    startRound:
      normalizedStartRound,

    endRound:
      rounds.at(-1) ??
      normalizedStartRound,

    roundCount:
      normalizedRoundCount,

    rounds:
      projections,

    expectedPoints:
      roundValue(
        expectedPoints,
        2,
      ),

    expectedPointsPerRound:
      roundValue(
        expectedPoints /
          normalizedRoundCount,
        2,
      ),

    expectedMinutes:
      roundValue(
        expectedMinutes,
        1,
      ),

    expectedMinutesPerRound:
      roundValue(
        expectedMinutes /
          normalizedRoundCount,
        1,
      ),

    appearanceProbability:
      roundValue(
        appearanceProbability,
        4,
      ),

    fixtureCount,

    type:
      normalizedRoundCount === 1
        ? projections[0]
            ?.type ??
          'normal'
        : 'period',

    hasProjection:
      missingProjectionRounds
        .length === 0,

    missingProjectionRounds,
  }
}

/*
|--------------------------------------------------------------------------
| Speler voorbereiden
|--------------------------------------------------------------------------
*/

function createPlayerCandidate(
  player,
  {
    startRound,
    roundCount,
  },
) {
  const projection =
    getPlayerPeriodProjection(
      player,
      startRound,
      roundCount,
    )

  return {
    player,

    playerId:
      normalizePlayerId(
        player,
      ),

    position:
      getPlayerPosition(
        player,
      ),

    expectedPoints:
      projection
        .expectedPoints,

    expectedPointsPerRound:
      projection
        .expectedPointsPerRound,

    expectedMinutes:
      projection
        .expectedMinutes,

    expectedMinutesPerRound:
      projection
        .expectedMinutesPerRound,

    appearanceProbability:
      projection
        .appearanceProbability,

    fixtureCount:
      projection
        .fixtureCount,

    projectionType:
      projection.type,

    hasProjection:
      projection
        .hasProjection,

    missingProjectionRounds:
      projection
        .missingProjectionRounds,

    roundProjections:
      projection.rounds,

    fvtFantasyScore:
      toNumber(
        player
          ?.fvtFantasyScore,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Spelers vergelijken
|--------------------------------------------------------------------------
|
| Hoofdcriterium:
| verwachte punten in de gekozen speelronde.
|
| Gelijke stand:
|
| 1. verwachte minuten;
| 2. kans op speeltijd;
| 3. FVT Fantasy Score;
| 4. naam.
|
*/

function compareCandidates(
  left,
  right,
) {
  return (
    right.expectedPoints -
      left.expectedPoints ||

    right.expectedMinutes -
      left.expectedMinutes ||

    right.appearanceProbability -
      left.appearanceProbability ||

    right.fvtFantasyScore -
      left.fvtFantasyScore ||

    String(
      left.player?.name ??
      '',
    ).localeCompare(
      String(
        right.player?.name ??
        '',
      ),
      'nl-NL',
    )
  )
}

/*
|--------------------------------------------------------------------------
| Kandidaten groeperen
|--------------------------------------------------------------------------
*/

function groupCandidatesByPosition(
  candidates,
) {
  const groups = {
    goalkeeper: [],
    defender: [],
    midfielder: [],
    forward: [],
    unknown: [],
  }

  candidates.forEach(
    (candidate) => {
      const position =
        candidate.position

      if (
        !groups[position]
      ) {
        groups.unknown.push(
          candidate,
        )

        return
      }

      groups[position].push(
        candidate,
      )
    },
  )

  Object.values(
    groups,
  ).forEach(
    (players) => {
      players.sort(
        compareCandidates,
      )
    },
  )

  return groups
}

/*
|--------------------------------------------------------------------------
| Geldige formaties genereren
|--------------------------------------------------------------------------
|
| De formaties worden afgeleid van de officiële
| spelregels. Daardoor hoeven we geen tweede lijst
| met hardgecodeerde formaties bij te houden.
|
*/

export function getValidOptimizerFormations() {
  const lineupRules =
    FANTASY_GAME_RULES
      .startingLineup

  const squadRules =
    FANTASY_GAME_RULES
      .squad
      .positions

  const totalOutfieldPlayers =
    lineupRules.totalPlayers -
    lineupRules
      .goalkeepers
      .exact

  const formations = []

  for (
    let defenders =
      lineupRules
        .defenders
        .minimum;

    defenders <=
      squadRules.defender;

    defenders += 1
  ) {
    for (
      let forwards =
        lineupRules
          .forwards
          .minimum;

      forwards <=
        squadRules.forward;

      forwards += 1
    ) {
      const midfielders =
        totalOutfieldPlayers -
        defenders -
        forwards

      if (
        midfielders < 0 ||
        midfielders >
          squadRules.midfielder
      ) {
        continue
      }

      formations.push({
        goalkeeper:
          lineupRules
            .goalkeepers
            .exact,

        defender:
          defenders,

        midfielder:
          midfielders,

        forward:
          forwards,

        label:
          `${defenders}-${midfielders}-${forwards}`,
      })
    }
  }

  return formations.sort(
    (
      left,
      right,
    ) =>
      left.defender -
        right.defender ||

      left.midfielder -
        right.midfielder ||

      left.forward -
        right.forward,
  )
}

/*
|--------------------------------------------------------------------------
| Eén formatie opbouwen
|--------------------------------------------------------------------------
*/

function buildLineupForFormation({
  groups,
  formation,
}) {
  if (
    groups.goalkeeper.length <
      formation.goalkeeper ||

    groups.defender.length <
      formation.defender ||

    groups.midfielder.length <
      formation.midfielder ||

    groups.forward.length <
      formation.forward
  ) {
    return null
  }

  const starters = [
    ...groups.goalkeeper.slice(
      0,
      formation.goalkeeper,
    ),

    ...groups.defender.slice(
      0,
      formation.defender,
    ),

    ...groups.midfielder.slice(
      0,
      formation.midfielder,
    ),

    ...groups.forward.slice(
      0,
      formation.forward,
    ),
  ]

  const validation =
    validateStartingLineup(
      starters.map(
        (candidate) =>
          candidate.player,
      ),
    )

  if (
    !validation.valid
  ) {
    return null
  }

  return {
    formation,
    starters,
    validation,
  }
}

/*
|--------------------------------------------------------------------------
| Captain en vice-captain
|--------------------------------------------------------------------------
*/

function selectCaptaincy(
  starters,
) {
  const ranked =
    [...starters].sort(
      compareCandidates,
    )

  return {
    captain:
      ranked[0] ??
      null,

    viceCaptain:
      ranked[1] ??
      null,
  }
}

/*
|--------------------------------------------------------------------------
| Bank bepalen
|--------------------------------------------------------------------------
|
| De reservekeeper staat altijd als aparte
| keeper op de bank.
|
| De drie veldspelers worden voorlopig
| gerangschikt op:
|
| 1. verwachte punten;
| 2. verwachte minuten;
| 3. speelkans;
| 4. FVT Fantasy Score.
|
| Later kan deze volgorde verder worden
| geoptimaliseerd op automatische wissels
| en behoud van een geldige formatie.
|
*/

function buildBench({
  allCandidates,
  starters,
}) {
  const starterIds =
    new Set(
      starters.map(
        (candidate) =>
          candidate.playerId,
      ),
    )

  const remaining =
    allCandidates.filter(
      (candidate) =>
        !starterIds.has(
          candidate.playerId,
        ),
    )

  const goalkeeper =
    remaining
      .filter(
        (candidate) =>
          candidate.position ===
          'goalkeeper',
      )
      .sort(
        compareCandidates,
      )[0] ??
    null

  const outfield =
    remaining
      .filter(
        (candidate) =>
          candidate.position !==
            'goalkeeper',
      )
      .sort(
        compareCandidates,
      )

  return {
    goalkeeper,

    outfield,

    ordered: [
      ...outfield,
      ...(goalkeeper
        ? [goalkeeper]
        : []),
    ],
  }
}

/*
|--------------------------------------------------------------------------
| Score van één opstelling
|--------------------------------------------------------------------------
*/

function calculateLineupScore({
  starters,
  captain,
}) {
  const baseExpectedPoints =
    starters.reduce(
      (
        total,
        candidate,
      ) =>
        total +
        candidate.expectedPoints,
      0,
    )

  const captainMultiplier =
    toNumber(
      FANTASY_GAME_RULES
        .captain
        .normalMultiplier,
      2,
    )

  const captainBonus =
    captain
      ? captain.expectedPoints *
        Math.max(
          0,
          captainMultiplier -
          1,
        )
      : 0

  return {
    baseExpectedPoints:
      roundValue(
        baseExpectedPoints,
        2,
      ),

    captainBonus:
      roundValue(
        captainBonus,
        2,
      ),

    totalExpectedPoints:
      roundValue(
        baseExpectedPoints +
        captainBonus,
        2,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Resultaat geschikt maken voor andere modules
|--------------------------------------------------------------------------
*/

function serializeCandidate(
  candidate,
) {
  if (!candidate) {
    return null
  }

  return {
    player:
      candidate.player,

    playerId:
      candidate.playerId,

    position:
      candidate.position,

        expectedPoints:
      candidate.expectedPoints,

    expectedPointsPerRound:
      candidate.expectedPointsPerRound,

    expectedMinutes:
      candidate.expectedMinutes,

    expectedMinutesPerRound:
      candidate.expectedMinutesPerRound,

    appearanceProbability:
      candidate.appearanceProbability,

    fixtureCount:
      candidate.fixtureCount,

    projectionType:
      candidate.projectionType,

        hasProjection:
      candidate.hasProjection,

    missingProjectionRounds:
      candidate.missingProjectionRounds,

    roundProjections:
      candidate.roundProjections,

    fvtFantasyScore:
      candidate.fvtFantasyScore,
  }
}

/*
|--------------------------------------------------------------------------
| Formaties vergelijken
|--------------------------------------------------------------------------
*/

function compareLineupResults(
  left,
  right,
) {
  return (
    right.score
      .totalExpectedPoints -
      left.score
        .totalExpectedPoints ||

    right.score
      .baseExpectedPoints -
      left.score
        .baseExpectedPoints ||

    right.captain
      .expectedPoints -
      left.captain
        .expectedPoints ||

    left.formation.label
      .localeCompare(
        right.formation.label,
        'nl-NL',
      )
  )
}

/*
|--------------------------------------------------------------------------
| Centrale optimalisatiefunctie
|--------------------------------------------------------------------------
*/

function optimizeLineup({
  squad = [],
  startRound,
  roundCount = 1,
} = {}) {
  const normalizedStartRound =
    Math.floor(
      Number(
        startRound,
      ),
    )

  const normalizedRoundCount =
    Math.floor(
      Number(
        roundCount,
      ),
    )

  if (
    !Number.isFinite(
      normalizedStartRound,
    ) ||
    normalizedStartRound < 1
  ) {
    return {
      valid: false,

      errors: [
        'Er is geen geldige beginronde opgegeven.',
      ],

      startRound:
        null,

      endRound:
        null,

      roundCount:
        null,

      result:
        null,
    }
  }

  if (
    !Number.isFinite(
      normalizedRoundCount,
    ) ||
    normalizedRoundCount < 1 ||
    normalizedRoundCount > 10
  ) {
    return {
      valid: false,

      errors: [
        'Het aantal speelrondes moet tussen 1 en 10 liggen.',
      ],

      startRound:
        normalizedStartRound,

      endRound:
        null,

      roundCount:
        null,

      result:
        null,
    }
  }

  const endRound =
    normalizedStartRound +
    normalizedRoundCount -
    1

  const players =
    Array.isArray(
      squad,
    )
      ? squad.filter(Boolean)
      : []

  if (
    players.length !==
    FANTASY_GAME_RULES
      .squad
      .totalPlayers
  ) {
    return {
      valid: false,

      errors: [
        `De optimizer verwacht precies ${
          FANTASY_GAME_RULES
            .squad
            .totalPlayers
        } spelers; ontvangen: ${
          players.length
        }.`,
      ],

      startRound:
        normalizedStartRound,

      endRound,

      roundCount:
        normalizedRoundCount,

      result:
        null,
    }
  }

  const candidates =
    players.map(
      (player) =>
        createPlayerCandidate(
          player,
          {
            startRound:
              normalizedStartRound,

            roundCount:
              normalizedRoundCount,
          },
        ),
    )

  const unknownPositions =
    candidates.filter(
      (candidate) =>
        candidate.position ===
        'unknown',
    )

  if (
    unknownPositions.length
  ) {
    return {
      valid: false,

      errors: [
        `${
          unknownPositions.length
        } speler(s) hebben geen herkende Fantasy-positie.`,
      ],

      startRound:
        normalizedStartRound,

      endRound,

      roundCount:
        normalizedRoundCount,

      result:
        null,
    }
  }

  const groups =
    groupCandidatesByPosition(
      candidates,
    )

  const formations =
    getValidOptimizerFormations()

  const possibleLineups =
    formations
      .map(
        (formation) => {
          const lineup =
            buildLineupForFormation({
              groups,
              formation,
            })

          if (!lineup) {
            return null
          }

          const captaincy =
            selectCaptaincy(
              lineup.starters,
            )

          const bench =
            buildBench({
              allCandidates:
                candidates,

              starters:
                lineup.starters,
            })

          const score =
            calculateLineupScore({
              starters:
                lineup.starters,

              captain:
                captaincy.captain,
            })

          return {
            formation,

            starters:
              lineup.starters,

            captain:
              captaincy.captain,

            viceCaptain:
              captaincy.viceCaptain,

            bench,

            score,

            validation:
              lineup.validation,
          }
        },
      )
      .filter(Boolean)
      .sort(
        compareLineupResults,
      )

  const best =
    possibleLineups[0] ??
    null

  if (!best) {
    return {
      valid: false,

      errors: [
        'Voor deze selectie kon geen geldige basisopstelling worden samengesteld.',
      ],

      startRound:
        normalizedStartRound,

      endRound,

      roundCount:
        normalizedRoundCount,

      result:
        null,
    }
  }

  const missingProjectionPlayers =
    candidates.filter(
      (candidate) =>
        !candidate.hasProjection,
    )

  return {
    valid: true,

    errors: [],

    warnings:
      missingProjectionPlayers.length
        ? [
            `Voor ${
              missingProjectionPlayers.length
            } speler(s) ontbreekt minimaal één projectie binnen speelronde ${
              normalizedStartRound
            } tot en met ${
              endRound
            }. Ontbrekende rondes zijn als 0 xP verwerkt.`,
          ]
        : [],

    round:
      normalizedRoundCount === 1
        ? normalizedStartRound
        : null,

    startRound:
      normalizedStartRound,

    endRound,

    roundCount:
      normalizedRoundCount,

    testedFormations:
      possibleLineups.length,

    result: {
      formation:
        best
          .formation
          .label,

      formationDetails: {
        goalkeeper:
          best
            .formation
            .goalkeeper,

        defender:
          best
            .formation
            .defender,

        midfielder:
          best
            .formation
            .midfielder,

        forward:
          best
            .formation
            .forward,
      },

      expectedPoints:
        best
          .score
          .totalExpectedPoints,

      expectedPointsPerRound:
        roundValue(
          best
            .score
            .totalExpectedPoints /
            normalizedRoundCount,
          2,
        ),

      baseExpectedPoints:
        best
          .score
          .baseExpectedPoints,

      baseExpectedPointsPerRound:
        roundValue(
          best
            .score
            .baseExpectedPoints /
            normalizedRoundCount,
          2,
        ),

      captainBonus:
        best
          .score
          .captainBonus,

      captainBonusPerRound:
        roundValue(
          best
            .score
            .captainBonus /
            normalizedRoundCount,
          2,
        ),

      starters:
        best
          .starters
          .map(
            serializeCandidate,
          ),

      captain:
        serializeCandidate(
          best.captain,
        ),

      viceCaptain:
        serializeCandidate(
          best.viceCaptain,
        ),

      bench: {
        goalkeeper:
          serializeCandidate(
            best
              .bench
              .goalkeeper,
          ),

        outfield:
          best
            .bench
            .outfield
            .map(
              serializeCandidate,
            ),

        ordered:
          best
            .bench
            .ordered
            .map(
              serializeCandidate,
            ),
      },
    },

    alternatives:
      possibleLineups
        .slice(
          1,
          4,
        )
        .map(
          (lineup) => ({
            formation:
              lineup
                .formation
                .label,

            expectedPoints:
              lineup
                .score
                .totalExpectedPoints,

            expectedPointsPerRound:
              roundValue(
                lineup
                  .score
                  .totalExpectedPoints /
                  normalizedRoundCount,
                2,
              ),

            baseExpectedPoints:
              lineup
                .score
                .baseExpectedPoints,

            captain:
              serializeCandidate(
                lineup.captain,
              ),
          })),
  }
}

/*
|--------------------------------------------------------------------------
| Publieke functies
|--------------------------------------------------------------------------
*/

/**
 * Bepaalt de beste opstelling voor één speelronde.
 *
 * Deze functie blijft bestaan voor alle bestaande
 * modules die de lineup-optimizer al gebruiken.
 */
export function optimizeLineupForRound({
  squad = [],
  round,
} = {}) {
  return optimizeLineup({
    squad,

    startRound:
      round,

    roundCount:
      1,
  })
}

/**
 * Bepaalt de beste vaste opstelling over een
 * periode van één tot en met tien speelrondes.
 */
export function optimizeLineupForPeriod({
  squad = [],
  startRound = 1,
  roundCount = 1,
} = {}) {
  return optimizeLineup({
    squad,
    startRound,
    roundCount,
  })
}