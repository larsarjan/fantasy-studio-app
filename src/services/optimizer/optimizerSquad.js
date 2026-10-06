import {
  FANTASY_GAME_RULES,
  normalizeFantasyPosition,
  validateSquad,
} from '../fantasyGameRulesEngine.js'

import {
  getPlayerRoundProjection,
} from './optimizerLineup.js'

import {
  calculateOptimizerCandidateScore,
} from './optimizerCandidateScore.js'


/*
|--------------------------------------------------------------------------
| Fantasy Studio — Squad Optimizer
|--------------------------------------------------------------------------
|
| Deze engine zoekt de beste geldige selectie van vijftien spelers.
|
| De selectie moet voldoen aan de centrale spelregels:
|
| - exact 2 keepers;
| - exact 5 verdedigers;
| - exact 5 middenvelders;
| - exact 3 aanvallers;
| - maximaal 3 spelers per club;
| - binnen het beschikbare budget;
| - maximale totale Expected Points.
|
| De spelregels worden nooit lokaal opnieuw gedefinieerd.
| fantasyGameRulesEngine.js blijft de enige bron van waarheid.
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

  return Number.isFinite(number)
    ? number
    : fallback
}

function round(
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

function normalizeStartRound(
  value,
) {
  return Math.max(
    1,
    Math.min(
      34,
      Math.round(
        Number(value) || 1,
      ),
    ),
  )
}

function normalizeRoundCount({
  startRound,
  roundCount,
}) {
  const maximumRoundCount =
    Math.max(
      1,
      Math.min(
        10,
        35 - startRound,
      ),
    )

  return Math.max(
    1,
    Math.min(
      maximumRoundCount,
      Math.round(
        Number(roundCount) || 1,
      ),
    ),
  )
}

function createRoundNumbers({
  startRound,
  roundCount,
}) {
  return Array.from(
    {
      length:
        roundCount,
    },
    (
      _,
      index,
    ) =>
      startRound + index,
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

function getPlayerName(
  player,
) {
  return (
    player?.name ||
    'Onbekende speler'
  )
}

function getPlayerClub(
  player,
) {
  return String(
    player?.club ?? '',
  ).trim()
}

function getPlayerPosition(
  player,
) {
  return normalizeFantasyPosition(
    player?.fantasyPosition ??
    player?.position,
  )
}

function getPlayerPrice(
  player,
) {
  const candidates = [
    player?.currentPrice,
    player?.endPrice,
    player?.price,
    player?.startPrice,
  ]

  for (
    const candidate
    of candidates
  ) {
    if (
      candidate === null ||
      candidate === undefined ||
      (typeof candidate === 'string' && candidate.trim() === '')
    ) {
      continue
    }

    const price =
      Number(candidate)

    if (
      Number.isFinite(price) &&
      price >= 0
    ) {
      return round(
        price,
        1,
      )
    }
  }

  return null
}

/*
|--------------------------------------------------------------------------
| Prijs naar gehele rekeneenheden
|--------------------------------------------------------------------------
|
| Fantasyprijzen veranderen in stappen van €0,1 miljoen.
|
| Om floating-pointproblemen te voorkomen rekenen we intern met:
|
| €5,4 miljoen → 54 eenheden
| €100 miljoen → 1000 eenheden
|
*/

function priceToUnits(
  value,
) {
  const price =
    Number(value)

  if (!Number.isFinite(price)) {
    return null
  }

  return Math.round(
    price * 10,
  )
}

function unitsToPrice(
  units,
) {
  return round(
    Number(units) / 10,
    1,
  )
}

/*
|--------------------------------------------------------------------------
| Periodeprojectie
|--------------------------------------------------------------------------
*/

export function getSquadPlayerPeriodProjection(
  player,
  {
    startRound = 1,
    roundCount = 1,
  } = {},
) {
  const normalizedStartRound =
    normalizeStartRound(
      startRound,
    )

  const normalizedRoundCount =
    normalizeRoundCount({
      startRound:
        normalizedStartRound,

      roundCount,
    })

  const rounds =
    createRoundNumbers({
      startRound:
        normalizedStartRound,

      roundCount:
        normalizedRoundCount,
    })

  const roundProjections =
    rounds.map(
      (roundNumber) => {
        const projection =
          getPlayerRoundProjection(
            player,
            roundNumber,
          )

        return {
          round:
            roundNumber,

          hasProjection:
            Boolean(
              projection
                ?.hasProjection,
            ),

          expectedPoints:
            toNumber(
              projection
                ?.expectedPoints,
            ),

          expectedMinutes:
            toNumber(
              projection
                ?.expectedMinutes,
            ),
        }
      },
    )

  const projectedRounds =
    roundProjections.filter(
      (projection) =>
        projection.hasProjection,
    )

  const expectedPoints =
    projectedRounds.reduce(
      (
        total,
        projection,
      ) =>
        total +
        projection.expectedPoints,
      0,
    )

  const expectedMinutes =
    projectedRounds.reduce(
      (
        total,
        projection,
      ) =>
        total +
        projection.expectedMinutes,
      0,
    )

  return {
    startRound:
      normalizedStartRound,

    endRound:
      normalizedStartRound +
      normalizedRoundCount -
      1,

    roundCount:
      normalizedRoundCount,

    rounds:
      roundProjections,

    projectedRoundCount:
      projectedRounds.length,

    hasProjection:
      projectedRounds.length > 0,

    hasCompleteProjection:
      projectedRounds.length ===
      normalizedRoundCount,

    expectedPoints:
      round(
        expectedPoints,
        4,
      ),

    expectedMinutes:
      round(
        expectedMinutes,
        2,
      ),

    expectedPointsPerRound:
      round(
        expectedPoints /
          normalizedRoundCount,
        4,
      ),

    expectedMinutesPerRound:
      round(
        expectedMinutes /
          normalizedRoundCount,
        2,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Kandidaat opbouwen
|--------------------------------------------------------------------------
*/

function createCandidate(
  player,
  period,
  philosophy,
) {
  const club =
    getPlayerClub(
      player,
    )

  const position =
    getPlayerPosition(
      player,
    )

  const price =
    getPlayerPrice(
      player,
    )

  const projection =
    getSquadPlayerPeriodProjection(
      player,
      period,
    )

const managerScore =
  calculateOptimizerCandidateScore({
    player,
    projection,
    philosophy,
  })

  return {
    player,

    id:
      String(
        player?.id ??
        player?.playerId ??
        `${getPlayerName(player)}-${club}`,
      ),

    name:
      getPlayerName(
        player,
      ),

    club,

    normalizedClub:
      normalizeText(
        club,
      ),

    position,

    price,

    priceUnits:
      priceToUnits(
        price,
      ),

    expectedPoints:
      projection.expectedPoints,

    expectedMinutes:
      projection.expectedMinutes,

    projectedRoundCount:
      projection.projectedRoundCount,

    hasProjection:
      projection.hasProjection,

    hasCompleteProjection:
      projection.hasCompleteProjection,

    projection,

managerScore:
  managerScore.score,

managerScoreDetails:
  managerScore,

fvtFantasyScore:
  toNumber(
    player?.fvtFantasyScore,
  ),
  }
}

function compareCandidates(
  left,
  right,
) {
  return (
  right.managerScore -
    left.managerScore ||

  right.expectedPoints -
    left.expectedPoints ||

  right.expectedMinutes -
    left.expectedMinutes ||

  right.projectedRoundCount -
    left.projectedRoundCount ||

  right.fvtFantasyScore -
    left.fvtFantasyScore ||

  left.price -
    right.price ||

  left.name.localeCompare(
    right.name,
    'nl-NL',
  )
)
}

/*
|--------------------------------------------------------------------------
| Positieaantallen
|--------------------------------------------------------------------------
*/

function createEmptyPositionCounts() {
  return {
    goalkeeper:
      0,

    defender:
      0,

    midfielder:
      0,

    forward:
      0,
  }
}

function addPosition(
  counts,
  position,
) {
  return {
    ...counts,

    [position]:
      (
        counts[position] ||
        0
      ) + 1,
  }
}

function addPositionCounts(
  left,
  right,
) {
  return {
    goalkeeper:
      left.goalkeeper +
      right.goalkeeper,

    defender:
      left.defender +
      right.defender,

    midfielder:
      left.midfielder +
      right.midfielder,

    forward:
      left.forward +
      right.forward,
  }
}

function positionCountsFit(
  counts,
) {
  const required =
    FANTASY_GAME_RULES
      .squad
      .positions

  return (
    counts.goalkeeper <=
      required.goalkeeper &&

    counts.defender <=
      required.defender &&

    counts.midfielder <=
      required.midfielder &&

    counts.forward <=
      required.forward
  )
}

function positionCountsAreComplete(
  counts,
) {
  const required =
    FANTASY_GAME_RULES
      .squad
      .positions

  return (
    counts.goalkeeper ===
      required.goalkeeper &&

    counts.defender ===
      required.defender &&

    counts.midfielder ===
      required.midfielder &&

    counts.forward ===
      required.forward
  )
}

/*
|--------------------------------------------------------------------------
| Opties per club maken
|--------------------------------------------------------------------------
|
| Omdat maximaal drie spelers van één club zijn toegestaan, maken we per
| club alle geldige mogelijkheden van nul, één, twee of drie spelers.
|
| Mogelijkheden met dezelfde:
|
| - positieverdeling;
| - totale prijs;
|
| worden samengevoegd. Alleen de combinatie met de hoogste xP blijft over.
|
| Daardoor blijft de uiteindelijke optimalisatie beheersbaar zonder dat
| de officiële clubrestrictie verloren gaat.
|
*/

function createEmptyClubOption() {
  return {
    candidates: [],

    positionCounts:
      createEmptyPositionCounts(),

    playerCount:
      0,

    priceUnits:
      0,

    expectedPoints:
      0,

    expectedMinutes:
      0,

    fvtFantasyScore:
      0,
  }
}

function createClubOptionKey(
  option,
) {
  return [
    option.positionCounts
      .goalkeeper,

    option.positionCounts
      .defender,

    option.positionCounts
      .midfielder,

    option.positionCounts
      .forward,

    option.priceUnits,

    [...(option.requiredPlayerIds ?? [])].sort().join(','),
  ].join('|')
}

function isBetterOption(
  candidate,
  current,
) {
  if (!current) {
    return true
  }

  return (
    candidate.expectedPoints >
      current.expectedPoints ||

    (
      candidate.expectedPoints ===
        current.expectedPoints &&
      candidate.expectedMinutes >
        current.expectedMinutes
    ) ||

    (
      candidate.expectedPoints ===
        current.expectedPoints &&
      candidate.expectedMinutes ===
        current.expectedMinutes &&
      candidate.fvtFantasyScore >
        current.fvtFantasyScore
    )
  )
}

function createClubOptions(
  clubCandidates,
  maximumPerClub,
  requiredPlayerIds,
) {
  const bestOptions =
    new Map()

  function saveOption(
    option,
  ) {
    const key =
      createClubOptionKey(
        option,
      )

    const current =
      bestOptions.get(
        key,
      )

    if (
      isBetterOption(
        option,
        current,
      )
    ) {
      bestOptions.set(
        key,
        option,
      )
    }
  }

  function visit({
    startIndex,
    selected,
    positionCounts,
    priceUnits,
    expectedPoints,
    expectedMinutes,
    fvtFantasyScore,
  }) {
    saveOption({
      candidates:
        selected,

      positionCounts,

      playerCount:
        selected.length,

      priceUnits,

      expectedPoints:
        round(
          expectedPoints,
          4,
        ),

      expectedMinutes:
        round(
          expectedMinutes,
          2,
        ),

      fvtFantasyScore:
        round(
          fvtFantasyScore,
          2,
        ),

      requiredPlayerIds: selected
        .map((candidate) => candidate.id)
        .filter((id) => requiredPlayerIds.has(id)),
    })

    if (
      selected.length >=
      maximumPerClub
    ) {
      return
    }

    for (
      let index =
        startIndex;
      index <
        clubCandidates.length;
      index += 1
    ) {
      const candidate =
        clubCandidates[
          index
        ]

      const nextCounts =
        addPosition(
          positionCounts,
          candidate.position,
        )

      if (
        !positionCountsFit(
          nextCounts,
        )
      ) {
        continue
      }

      visit({
        startIndex:
          index + 1,

        selected: [
          ...selected,
          candidate,
        ],

        positionCounts:
          nextCounts,

        priceUnits:
          priceUnits +
          candidate.priceUnits,

        expectedPoints:
          expectedPoints +
          candidate.expectedPoints,

        expectedMinutes:
          expectedMinutes +
          candidate.expectedMinutes,

        fvtFantasyScore:
          fvtFantasyScore +
          candidate.fvtFantasyScore,
      })
    }
  }

  const emptyOption =
    createEmptyClubOption()

  visit({
    startIndex:
      0,

    selected:
      emptyOption.candidates,

    positionCounts:
      emptyOption.positionCounts,

    priceUnits:
      emptyOption.priceUnits,

    expectedPoints:
      emptyOption.expectedPoints,

    expectedMinutes:
      emptyOption.expectedMinutes,

    fvtFantasyScore:
      emptyOption.fvtFantasyScore,
  })

  return [
    ...bestOptions.values(),
  ]
}

/*
|--------------------------------------------------------------------------
| Dynamische optimalisatie
|--------------------------------------------------------------------------
|
| Clubs worden één voor één verwerkt.
|
| Per tussenstand onthouden we:
|
| - hoeveel spelers per positie zijn gekozen;
| - hoeveel budget is gebruikt;
| - welke spelers zijn gekozen;
| - hoeveel xP die combinatie oplevert.
|
| Voor exact dezelfde tussenstand blijft alleen de beste combinatie over.
|
*/

function createStateKey(
  state,
) {
  return [
    state.positionCounts
      .goalkeeper,

    state.positionCounts
      .defender,

    state.positionCounts
      .midfielder,

    state.positionCounts
      .forward,

    state.priceUnits,

    [...(state.requiredPlayerIds ?? [])].sort().join(','),
  ].join('|')
}

function createInitialState() {
  return {
    candidates: [],

    positionCounts:
      createEmptyPositionCounts(),

    playerCount:
      0,

    priceUnits:
      0,

    expectedPoints:
      0,

    expectedMinutes:
      0,

    fvtFantasyScore:
      0,

    requiredPlayerIds: [],
  }
}

function mergeStateWithClubOption(
  state,
  option,
) {
  return {
    candidates: [
      ...state.candidates,
      ...option.candidates,
    ],

    positionCounts:
      addPositionCounts(
        state.positionCounts,
        option.positionCounts,
      ),

    playerCount:
      state.playerCount +
      option.playerCount,

    priceUnits:
      state.priceUnits +
      option.priceUnits,

    expectedPoints:
      round(
        state.expectedPoints +
        option.expectedPoints,
        4,
      ),

    expectedMinutes:
      round(
        state.expectedMinutes +
        option.expectedMinutes,
        2,
      ),

    fvtFantasyScore:
      round(
        state.fvtFantasyScore +
        option.fvtFantasyScore,
        2,
      ),

    requiredPlayerIds: [
      ...(state.requiredPlayerIds ?? []),
      ...(option.requiredPlayerIds ?? []),
    ],
  }
}

function optimizeClubGroups({
  clubGroups,
  budgetUnits,
  unlimitedBudget,
  maximumPlayersPerClub,
  requiredPlayerIds,
}) {
  let states =
    new Map([
      [
        createStateKey(
          createInitialState(),
        ),

        createInitialState(),
      ],
    ])

  for (
    const clubCandidates
    of clubGroups
  ) {
    const clubOptions =
      createClubOptions(
        clubCandidates,
        maximumPlayersPerClub,
        requiredPlayerIds,
      )

    const nextStates =
      new Map()

    for (
      const state
      of states.values()
    ) {
      for (
        const option
        of clubOptions
      ) {
        const nextState =
          mergeStateWithClubOption(
            state,
            option,
          )

        if (
          nextState.playerCount >
          FANTASY_GAME_RULES
            .squad
            .totalPlayers
        ) {
          continue
        }

        if (
          !positionCountsFit(
            nextState
              .positionCounts,
          )
        ) {
          continue
        }

        if (
          !unlimitedBudget &&
          nextState.priceUnits >
            budgetUnits
        ) {
          continue
        }

        const key =
          createStateKey(
            nextState,
          )

        const current =
          nextStates.get(
            key,
          )

        if (
          isBetterOption(
            nextState,
            current,
          )
        ) {
          nextStates.set(
            key,
            nextState,
          )
        }
      }
    }

    states =
      nextStates
  }

  return [
    ...states.values(),
  ]
}

/*
|--------------------------------------------------------------------------
| Beste complete selectie vinden
|--------------------------------------------------------------------------
*/

function findBestCompleteState(
  states,
  requiredPlayerIds,
) {
  const completeStates =
    states.filter(
      (state) =>
        state.playerCount ===
          FANTASY_GAME_RULES
            .squad
            .totalPlayers &&

        positionCountsAreComplete(
          state.positionCounts,
        ) &&

        (state.requiredPlayerIds ?? []).length === requiredPlayerIds.size,
    )

  completeStates.sort(
    (
      left,
      right,
    ) =>
      right.expectedPoints -
        left.expectedPoints ||

      right.expectedMinutes -
        left.expectedMinutes ||

      right.fvtFantasyScore -
        left.fvtFantasyScore ||

      left.priceUnits -
        right.priceUnits,
  )

  return (
    completeStates[0] ??
    null
  )
}

/*
|--------------------------------------------------------------------------
| Publieke squad-optimizer
|--------------------------------------------------------------------------
*/

export function optimizeSquadForPeriod({
  players = [],
  startRound = 1,
  roundCount = 1,

  budget =
    FANTASY_GAME_RULES
      .budget
      .startingBudget,

  unlimitedBudget = false,

  philosophy = {},

  maximumPlayersPerClub = FANTASY_GAME_RULES.squad.maxPlayersPerClub,

  lockedPlayerIds = [],

  bannedPlayerIds = [],

  minimumAvailability = null,

  onProgress,

} = {}) {
  const emitProgress = (progress) => {
    if (typeof onProgress !== 'function') return
    try { onProgress(progress) } catch { /* voortgang is niet functioneel */ }
  }
  emitProgress({ stage: 'candidate-preparation' })
  const normalizedStartRound =
    normalizeStartRound(
      startRound,
    )

  const normalizedRoundCount =
    normalizeRoundCount({
      startRound:
        normalizedStartRound,

      roundCount,
    })

  const endRound =
    normalizedStartRound +
    normalizedRoundCount -
    1

  const normalizedBudget =
    Math.max(
      0,
      toNumber(
        budget,
        FANTASY_GAME_RULES
          .budget
          .startingBudget,
      ),
    )

  const budgetUnits =
    priceToUnits(
      normalizedBudget,
    )

  const sourcePlayers =
    Array.isArray(players)
      ? players.filter(Boolean)
      : []

  const normalizedMaximumPlayersPerClub = Math.max(
    1,
    Math.min(
      FANTASY_GAME_RULES.squad.maxPlayersPerClub,
      Math.floor(Number(maximumPlayersPerClub) || FANTASY_GAME_RULES.squad.maxPlayersPerClub),
    ),
  )
  const requiredPlayerIds = new Set(
    (Array.isArray(lockedPlayerIds) ? lockedPlayerIds : [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  )
  const excludedPlayerIds = new Set(
    (Array.isArray(bannedPlayerIds) ? bannedPlayerIds : [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  )
  const normalizedMinimumAvailability =
    minimumAvailability === null || minimumAvailability === undefined ||
    (typeof minimumAvailability === 'string' && minimumAvailability.trim() === '')
      ? null
      : Number(minimumAvailability)

  const errors = []
  const warnings = []

  if (
    !sourcePlayers.length
  ) {
    return {
      valid: false,

      errors: [
        'Er zijn geen spelers beschikbaar voor de squad-optimizer.',
      ],

      warnings,

      result: null,

      period: {
        startRound:
          normalizedStartRound,

        endRound,

        roundCount:
          normalizedRoundCount,
      },
    }
  }

  const period = {
    startRound:
      normalizedStartRound,

    roundCount:
      normalizedRoundCount,
  }

  const allCandidates =
    sourcePlayers
      .filter((player) => !excludedPlayerIds.has(String(player?.id ?? player?.playerId ?? '').trim()))
      .filter((player) => {
        if (!Number.isFinite(normalizedMinimumAvailability)) return true
        const value = [
          player?.chanceOfPlaying,
          player?.playingChance,
          player?.availability?.value,
          player?.availability,
        ]
          .filter((candidate) => (
            candidate !== null && candidate !== undefined &&
            !(typeof candidate === 'string' && candidate.trim() === '')
          ))
          .map(Number)
          .find(Number.isFinite)
        // Published sheets may omit manual availability. The existing expected
        // points model still supplies a round-specific appearance probability.
        // An explicit zero remains authoritative; unknown never becomes 100%.
        const projection = getPlayerRoundProjection(player, normalizedStartRound)
        const chance = value ?? (projection.hasProjection ? projection.appearanceProbability * 100 : undefined)
        return chance !== undefined && chance >= normalizedMinimumAvailability
      })
      .map(
        (player) =>
          createCandidate(
            player,
            period,
            philosophy,
          ),
      )
      .filter(
  (candidate) =>
    candidate.club &&
    candidate.normalizedClub &&
    candidate.position !==
      'unknown' &&
    candidate.price !==
      null &&
    candidate.priceUnits !==
      null,
)
      .sort(
        compareCandidates,
      )

  const availableCandidateIds = new Set(allCandidates.map((candidate) => candidate.id))
  const missingLockedIds = [...requiredPlayerIds].filter((id) => !availableCandidateIds.has(id))
  if (missingLockedIds.length) {
    errors.push(`Vergrendelde speler(s) zijn niet geldig beschikbaar: ${missingLockedIds.join(', ')}.`)
  }

  emitProgress({
    stage: 'candidate-preparation-completed',
    candidates: allCandidates.length,
  })

  const rejectedPlayers =
    sourcePlayers.length -
    allCandidates.length

  if (
    rejectedPlayers > 0
  ) {
    warnings.push(
      `${rejectedPlayers} speler(s) zijn niet meegenomen door een ontbrekende club, positie, prijs, projectie of te lage speelkans.`,
    )
  }

  const candidatesByPosition =
    allCandidates.reduce(
      (
        counts,
        candidate,
      ) => {
        counts[
          candidate.position
        ] += 1

        return counts
      },
      createEmptyPositionCounts(),
    )

  Object.entries(
    FANTASY_GAME_RULES
      .squad
      .positions,
  ).forEach(
    (
      [
        position,
        required,
      ],
    ) => {
      const available =
        candidatesByPosition[
          position
        ] || 0

      if (
        available <
        required
      ) {
        errors.push(
          `Er zijn slechts ${available} geldige spelers beschikbaar voor ${position}; minimaal ${required} nodig.`,
        )
      }
    },
  )

  if (
    errors.length
  ) {
    return {
      valid: false,

      errors,

      warnings,

      result: null,

      period: {
        startRound:
          normalizedStartRound,

        endRound,

        roundCount:
          normalizedRoundCount,
      },

      availableCandidates:
        allCandidates.length,

      candidatesByPosition,
    }
  }

  const clubMap =
    new Map()

  allCandidates.forEach(
    (candidate) => {
      if (
        !clubMap.has(
          candidate.normalizedClub,
        )
      ) {
        clubMap.set(
          candidate.normalizedClub,
          [],
        )
      }

      clubMap
        .get(
          candidate.normalizedClub,
        )
        .push(
          candidate,
        )
    },
  )

  const clubGroups = [
    ...clubMap.values(),
  ]

  emitProgress({
    stage: 'searching-combinations',
    candidates: allCandidates.length,
    clubs: clubGroups.length,
  })

  const states =
    optimizeClubGroups({
      clubGroups,

      budgetUnits,

      unlimitedBudget:
        Boolean(
          unlimitedBudget,
        ),

      maximumPlayersPerClub: normalizedMaximumPlayersPerClub,

      requiredPlayerIds,
    })

  const bestState =
    findBestCompleteState(
      states,
      requiredPlayerIds,
    )

  emitProgress({
    stage: 'evaluating-squad',
    states: states.length,
  })

  if (!bestState) {
    return {
      valid: false,

      errors: [
        unlimitedBudget
          ? 'Er kon geen geldige selectie worden samengesteld met de beschikbare spelers.'
          : `Er kon geen geldige selectie worden samengesteld binnen het budget van €${normalizedBudget.toFixed(
              1,
            )} miljoen.`,
      ],

      warnings,

      result: null,

      period: {
        startRound:
          normalizedStartRound,

        endRound,

        roundCount:
          normalizedRoundCount,
      },

      budget:
        normalizedBudget,

      unlimitedBudget:
        Boolean(
          unlimitedBudget,
        ),

      availableCandidates:
        allCandidates.length,

      availableClubs:
        clubGroups.length,

      candidatesByPosition,
    }
  }

  const squad =
    bestState.candidates
      .map(
        (candidate) =>
          candidate.player,
      )

  emitProgress({ stage: 'squad-found' })

  const validation =
    validateSquad(
      squad,
      {
        budget:
          normalizedBudget,

        unlimitedBudget:
          Boolean(
            unlimitedBudget,
          ),
      },
    )

  if (
    !validation.valid
  ) {
    return {
      valid: false,

      errors: [
        'De squad-optimizer vond een selectie die niet door de centrale Rules Engine werd goedgekeurd.',

        ...validation.errors,
      ],

      warnings: [
        ...warnings,
        ...validation.warnings,
      ],

      result: null,

      validation,

      period: {
        startRound:
          normalizedStartRound,

        endRound,

        roundCount:
          normalizedRoundCount,
      },
    }
  }

  const selectedCandidates =
    bestState.candidates
      .slice()
      .sort(
        (
          left,
          right,
        ) => {
          const positionOrder = {
            goalkeeper:
              0,

            defender:
              1,

            midfielder:
              2,

            forward:
              3,
          }

          return (
            positionOrder[
              left.position
            ] -
              positionOrder[
                right.position
              ] ||

            compareCandidates(
              left,
              right,
            )
          )
        },
      )

  return {
    valid: true,

    errors: [],

    warnings: [
      ...warnings,
      ...validation.warnings,
    ],

    result: {
      squad,

      candidates:
        selectedCandidates,

      expectedPoints:
        round(
          bestState.expectedPoints,
          2,
        ),

      expectedPointsPerRound:
        round(
          bestState.expectedPoints /
            normalizedRoundCount,
          2,
        ),

      expectedMinutes:
        round(
          bestState.expectedMinutes,
          0,
        ),

      totalPrice:
        validation.totalPrice,

      remainingBudget:
        validation.remainingBudget,

      budget:
        normalizedBudget,

      unlimitedBudget:
        Boolean(
          unlimitedBudget,
        ),

      positionCounts:
        validation.positionCounts,

      clubCounts:
        validation.clubCounts,
    },

    validation,

    period: {
      startRound:
        normalizedStartRound,

      endRound,

      roundCount:
        normalizedRoundCount,

      rounds:
        createRoundNumbers({
          startRound:
            normalizedStartRound,

          roundCount:
            normalizedRoundCount,
        }),
    },

    rules: {
      totalPlayers:
        FANTASY_GAME_RULES
          .squad
          .totalPlayers,

      positions: {
        ...FANTASY_GAME_RULES
          .squad
          .positions,
      },

      maxPlayersPerClub:
        normalizedMaximumPlayersPerClub,

      startingBudget:
        FANTASY_GAME_RULES
          .budget
          .startingBudget,
    },

    availableCandidates:
      allCandidates.length,

    availableClubs:
      clubGroups.length,

    candidatesByPosition,
  }
}

/*
|--------------------------------------------------------------------------
| Gemaksfunctie voor één speelronde
|--------------------------------------------------------------------------
*/

export function optimizeSquadForRound({
  players = [],
  round = 1,

  budget =
    FANTASY_GAME_RULES
      .budget
      .startingBudget,

  unlimitedBudget = false,

  philosophy = {},
  maximumPlayersPerClub = FANTASY_GAME_RULES.squad.maxPlayersPerClub,
  lockedPlayerIds = [],
  bannedPlayerIds = [],
  minimumAvailability = null,
  onProgress,
} = {}) {
  return optimizeSquadForPeriod({
    players,

    startRound:
      round,

    roundCount:
      1,

    budget,

    unlimitedBudget,

    philosophy,

    maximumPlayersPerClub,

    lockedPlayerIds,

    bannedPlayerIds,

    minimumAvailability,
    onProgress,
  })
}
