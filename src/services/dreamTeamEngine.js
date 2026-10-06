import {
  getPlayers,
  getResults,
} from './database.js'

import {
  getPlayerMatchHistory,
} from './playerMatchStatsEngine.js'

import {
  calculateStandings,
  normalizeClubName,
} from './historyAnalytics.js'


/* =========================================================
   FANTASY STUDIO — DREAM TEAM ENGINE
========================================================= */


/*
 * Geldige basisformaties.
 *
 * Altijd:
 * - 1 keeper
 * - 11 spelers totaal
 * - minimaal 3 verdedigers
 * - minimaal 2 middenvelders
 * - minimaal 1 aanvaller
 */
const VALID_FORMATIONS = [
  {
    label: '3-4-3',
    keeper: 1,
    verdediger: 3,
    middenvelder: 4,
    aanvaller: 3,
  },
  {
    label: '3-5-2',
    keeper: 1,
    verdediger: 3,
    middenvelder: 5,
    aanvaller: 2,
  },
  {
    label: '4-3-3',
    keeper: 1,
    verdediger: 4,
    middenvelder: 3,
    aanvaller: 3,
  },
  {
    label: '4-4-2',
    keeper: 1,
    verdediger: 4,
    middenvelder: 4,
    aanvaller: 2,
  },
  {
    label: '4-5-1',
    keeper: 1,
    verdediger: 4,
    middenvelder: 5,
    aanvaller: 1,
  },
  {
    label: '5-2-3',
    keeper: 1,
    verdediger: 5,
    middenvelder: 2,
    aanvaller: 3,
  },
  {
    label: '5-3-2',
    keeper: 1,
    verdediger: 5,
    middenvelder: 3,
    aanvaller: 2,
  },
  {
    label: '5-4-1',
    keeper: 1,
    verdediger: 5,
    middenvelder: 4,
    aanvaller: 1,
  },
]


function cleanText(value) {
  return String(
    value ?? '',
  ).trim()
}


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


function sameValue(
  left,
  right,
) {
  return (
    cleanText(left)
      .toLowerCase() ===
    cleanText(right)
      .toLowerCase()
  )
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


/* =========================================================
   SPELERS VAN HET SEIZOEN
========================================================= */


function getSeasonPlayers(
  season,
) {
  return getPlayers()
    .filter(
      (player) =>
        sameValue(
          player?.season,
          season,
        ),
    )
}

function getBottomHalfClubsAfterRound({
  season,
  round,
}) {
  const roundNumber =
    Number(round)

  if (
    !cleanText(season) ||
    !Number.isFinite(roundNumber)
  ) {
    return []
  }

  const resultsThroughRound =
    getResults()
      .filter(
        (result) =>
          sameValue(
            result?.season,
            season,
          ),
      )
      .filter(
        (result) =>
          Number(
            result?.round,
          ) <= roundNumber,
      )

  if (!resultsThroughRound.length) {
    return []
  }

  const standings =
    calculateStandings(
      resultsThroughRound,
      season,
    )

  return standings
    .slice(
      9,
      18,
    )
    .map(
      (team) => ({
        position:
          standings.indexOf(team) + 1,

        club:
          team.club,

        clubKey:
          normalizeClubName(
            team.club,
          ),

        played:
          team.played,

        points:
          team.points,

        goalDifference:
          team.goalDifference,
      }),
    )
}

/* =========================================================
   SPEELRONDEPUNTEN PER SPELER
========================================================= */


function createRoundCandidate({
  player,
  season,
  roundNumber,
}) {
  const matches =
    getPlayerMatchHistory(
      player,
      {
        season,
      },
    )
      .filter(
        (match) =>
          Number(
            match?.round,
          ) ===
          Number(
            roundNumber,
          ),
      )

  if (!matches.length) {
    return null
  }

  /*
   * We tellen bewust ALLE wedstrijden
   * in dezelfde speelronde op.
   *
   * Daardoor werkt dit later ook direct
   * bij een double gameweek.
   */
  const fantasyPoints =
    matches.reduce(
      (
        total,
        match,
      ) =>
        total +
        toNumber(
          match?.punten?.totaal,
        ),
      0,
    )

  const minutes =
    matches.reduce(
      (
        total,
        match,
      ) =>
        total +
        toNumber(
          match?.minutes,
        ),
      0,
    )

  const firstMatch =
    matches[0]

  return {
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
        firstMatch?.positie,
      ),

    fantasyPoints:
      round(
        fantasyPoints,
        1,
      ),

    minutes:
      round(
        minutes,
        0,
      ),

    selectedPct:
      toNumber(
        player?.selectedPct,
      ),

    startPrice:
      toNumber(
        player?.startPrice,
      ),

    endPrice:
      toNumber(
        player?.endPrice,
      ),

    matches,
  }
}


export function getDreamTeamRoundCandidates({
  season,
  round,
}) {
  const roundNumber =
    Number(round)

  if (
    !cleanText(season) ||
    !Number.isFinite(
      roundNumber,
    )
  ) {
    return []
  }

  return getSeasonPlayers(
    season,
  )
    .map(
      (player) =>
        createRoundCandidate({
          player,
          season,
          roundNumber,
        }),
        )
    .filter(Boolean)
    .filter(
      (candidate) =>
        Number(candidate?.minutes) > 0,
    )
}


/* =========================================================
   SORTERING
========================================================= */


function compareCandidates(
  left,
  right,
) {
  const pointsDifference =
    toNumber(
      right?.fantasyPoints,
    ) -
    toNumber(
      left?.fantasyPoints,
    )

  if (pointsDifference !== 0) {
    return pointsDifference
  }

  /*
   * Bij gelijk aantal punten:
   * speler met meeste minuten eerst.
   */
  const minutesDifference =
    toNumber(
      right?.minutes,
    ) -
    toNumber(
      left?.minutes,
    )

  if (minutesDifference !== 0) {
    return minutesDifference
  }

  return cleanText(
    left?.name,
  ).localeCompare(
    cleanText(
      right?.name,
    ),
    'nl-NL',
  )
}


function getCandidatesForPosition(
  candidates,
  position,
) {
  return candidates
    .filter(
      (candidate) =>
        sameValue(
          candidate?.position,
          position,
        ),
    )
    .sort(
      compareCandidates,
    )
}

function getCandidatePrice(
  candidate,
) {
  const endPrice =
    Number(
      candidate?.endPrice,
    )

  if (
    Number.isFinite(endPrice) &&
    endPrice > 0
  ) {
    return endPrice
  }

  const startPrice =
    Number(
      candidate?.startPrice,
    )

  if (
    Number.isFinite(startPrice) &&
    startPrice > 0
  ) {
    return startPrice
  }

  return 0
}

/* =========================================================
   ÉÉN FORMATIE BOUWEN
========================================================= */


function buildFormationTeam({
  candidates,
  formation,
}) {
  const keepers =
    getCandidatesForPosition(
      candidates,
      'keeper',
    )
      .slice(
        0,
        formation.keeper,
      )

  const defenders =
    getCandidatesForPosition(
      candidates,
      'verdediger',
    )
      .slice(
        0,
        formation.verdediger,
      )

  const midfielders =
    getCandidatesForPosition(
      candidates,
      'middenvelder',
    )
      .slice(
        0,
        formation.middenvelder,
      )

  const attackers =
    getCandidatesForPosition(
      candidates,
      'aanvaller',
    )
      .slice(
        0,
        formation.aanvaller,
      )

  if (
    keepers.length !==
      formation.keeper ||
    defenders.length !==
      formation.verdediger ||
    midfielders.length !==
      formation.middenvelder ||
    attackers.length !==
      formation.aanvaller
  ) {
    return null
  }

  const players = [
    ...keepers,
    ...defenders,
    ...midfielders,
    ...attackers,
  ]

  const totalPoints =
    players.reduce(
      (
        total,
        player,
      ) =>
        total +
        toNumber(
          player?.fantasyPoints,
        ),
      0,
    )

  const totalMinutes =
    players.reduce(
      (
        total,
        player,
      ) =>
        total +
        toNumber(
          player?.minutes,
        ),
      0,
    )

  return {
    formation:
      formation.label,

    formationConfig:
      {
        ...formation,
      },

    players,

    positions: {
      keeper:
        keepers,

      defenders,

      midfielders,

      attackers,
    },

    totalPoints:
      round(
        totalPoints,
        1,
      ),

    totalMinutes:
      round(
        totalMinutes,
        0,
      ),
  }
}

function buildFantasyRulesFormationTeam({
  candidates,
  formation,
  maximumBudget = 100,
  maximumPlayersPerClub = 3,
}) {
  const positionGroups = [
    {
      position: 'keeper',
      count: formation.keeper,
    },
    {
      position: 'verdediger',
      count: formation.verdediger,
    },
    {
      position: 'middenvelder',
      count: formation.middenvelder,
    },
    {
      position: 'aanvaller',
      count: formation.aanvaller,
    },
  ]

  const pools =
    Object.fromEntries(
      positionGroups.map(
        ({
          position,
        }) => [
          position,

          getCandidatesForPosition(
            candidates,
            position,
          ),
        ],
      ),
    )

  if (
    positionGroups.some(
      ({
        position,
        count,
      }) =>
        pools[position].length <
        count,
    )
  ) {
    return null
  }

  /*
   * Voor iedere positie berekenen we vooraf:
   *
   * - hoeveel punten maximaal nog haalbaar zijn
   * - hoeveel budget minimaal nog nodig is
   *
   * Daarmee kunnen enorme delen van de
   * zoekboom veilig worden overgeslagen.
   */
  const bounds = {}

  positionGroups.forEach(
    ({
      position,
      count,
    }) => {
      const pool =
        pools[position]

      const maxPoints =
        Array.from(
          {
            length:
              pool.length + 1,
          },
          () =>
            Array(
              count + 1,
            ).fill(
              -Infinity,
            ),
        )

      const minPrice =
        Array.from(
          {
            length:
              pool.length + 1,
          },
          () =>
            Array(
              count + 1,
            ).fill(
              Infinity,
            ),
        )

      for (
        let index = 0;
        index <= pool.length;
        index += 1
      ) {
        maxPoints[index][0] = 0
        minPrice[index][0] = 0
      }

      for (
        let index =
          pool.length - 1;

        index >= 0;

        index -= 1
      ) {
        const player =
          pool[index]

        const points =
          toNumber(
            player?.fantasyPoints,
          )

        const price =
          getCandidatePrice(
            player,
          )

        for (
          let amount = 1;
          amount <= count;
          amount += 1
        ) {
          const skipPoints =
            maxPoints[
              index + 1
            ][amount]

          const takePoints =
            maxPoints[
              index + 1
            ][amount - 1]

          maxPoints[index][amount] =
            Math.max(
              skipPoints,

              Number.isFinite(
                takePoints,
              )
                ? points +
                  takePoints
                : -Infinity,
            )

          const skipPrice =
            minPrice[
              index + 1
            ][amount]

          const takePrice =
            minPrice[
              index + 1
            ][amount - 1]

          minPrice[index][amount] =
            Math.min(
              skipPrice,

              Number.isFinite(
                takePrice,
              )
                ? price +
                  takePrice
                : Infinity,
            )
        }
      }

      bounds[position] = {
        maxPoints,
        minPrice,
      }
    },
  )

  /*
   * Begin met de positie die relatief
   * het minste zoekwerk oplevert.
   *
   * Dit verandert niets aan de uitkomst,
   * maar maakt de zoektocht sneller.
   */
  function combinationLog(
    total,
    choose,
  ) {
    const amount =
      Math.min(
        choose,
        total - choose,
      )

    let result = 0

    for (
      let index = 1;
      index <= amount;
      index += 1
    ) {
      result +=
        Math.log(
          total -
            amount +
            index,
        ) -
        Math.log(index)
    }

    return result
  }

  const searchGroups =
    [...positionGroups]
      .sort(
        (
          left,
          right,
        ) =>
          combinationLog(
            pools[
              left.position
            ].length,
            left.count,
          ) -
          combinationLog(
            pools[
              right.position
            ].length,
            right.count,
          ),
      )

  let bestTeam = null

  function isBetterTeam(
    candidateTeam,
    currentBest,
  ) {
    if (!currentBest) {
      return true
    }

    if (
      candidateTeam.totalPoints !==
      currentBest.totalPoints
    ) {
      return (
        candidateTeam.totalPoints >
        currentBest.totalPoints
      )
    }

    if (
      candidateTeam.totalMinutes !==
      currentBest.totalMinutes
    ) {
      return (
        candidateTeam.totalMinutes >
        currentBest.totalMinutes
      )
    }

    return (
      candidateTeam.totalPrice <
      currentBest.totalPrice
    )
  }

  function finishTeam({
    selected,
    totalPrice,
    totalPoints,
    totalMinutes,
  }) {
    const team = {
      formation:
        formation.label,

      formationConfig: {
        ...formation,
      },

      players: [
        ...selected,
      ],

      positions: {
        keeper:
          selected.filter(
            (player) =>
              sameValue(
                player?.position,
                'keeper',
              ),
          ),

        defenders:
          selected.filter(
            (player) =>
              sameValue(
                player?.position,
                'verdediger',
              ),
          ),

        midfielders:
          selected.filter(
            (player) =>
              sameValue(
                player?.position,
                'middenvelder',
              ),
          ),

        attackers:
          selected.filter(
            (player) =>
              sameValue(
                player?.position,
                'aanvaller',
              ),
          ),
      },

      totalPoints:
        round(
          totalPoints,
          1,
        ),

      totalMinutes:
        round(
          totalMinutes,
          0,
        ),

      totalPrice:
        round(
          totalPrice,
          1,
        ),
    }

    if (
      isBetterTeam(
        team,
        bestTeam,
      )
    ) {
      bestTeam = team
    }
  }

  function getRemainingBounds(
    groupIndex,
  ) {
    let maximumPoints = 0
    let minimumPrice = 0

    for (
      let index = groupIndex;
      index <
        searchGroups.length;
      index += 1
    ) {
      const group =
        searchGroups[index]

      const groupBounds =
        bounds[group.position]

      const points =
        groupBounds
          .maxPoints[0][
            group.count
          ]

      const price =
        groupBounds
          .minPrice[0][
            group.count
          ]

      if (
        !Number.isFinite(
          points,
        ) ||
        !Number.isFinite(
          price,
        )
      ) {
        return {
          maximumPoints:
            -Infinity,

          minimumPrice:
            Infinity,
        }
      }

      maximumPoints +=
        points

      minimumPrice +=
        price
    }

    return {
      maximumPoints,
      minimumPrice,
    }
  }

  function choosePositionGroup({
    groupIndex,
    selected,
    clubCounts,
    totalPrice,
    totalPoints,
    totalMinutes,
  }) {
    if (
      groupIndex >=
      searchGroups.length
    ) {
      finishTeam({
        selected,
        totalPrice,
        totalPoints,
        totalMinutes,
      })

      return
    }

    /*
     * Als zelfs de goedkoopste mogelijke
     * resterende spelers het budget
     * overschrijden, stoppen we direct.
     */
    const remainingBounds =
      getRemainingBounds(
        groupIndex,
      )

    if (
      totalPrice +
        remainingBounds
          .minimumPrice >
      maximumBudget +
        0.0001
    ) {
      return
    }

    /*
     * Als zelfs het theoretische maximum
     * niet meer boven het huidige beste
     * team kan komen, hoeven we deze tak
     * niet verder te bekijken.
     */
    if (
      bestTeam &&
      totalPoints +
        remainingBounds
          .maximumPoints <
        bestTeam.totalPoints
    ) {
      return
    }

    const {
      position,
      count,
    } =
      searchGroups[
        groupIndex
      ]

    const pool =
      pools[position]

    const groupBounds =
      bounds[position]

    function choosePlayers({
      startIndex,
      remaining,
      groupSelection,
      localClubCounts,
      localTotalPrice,
      localTotalPoints,
      localTotalMinutes,
    }) {
      if (
        remaining === 0
      ) {
        choosePositionGroup({
          groupIndex:
            groupIndex + 1,

          selected: [
            ...selected,
            ...groupSelection,
          ],

          clubCounts:
            localClubCounts,

          totalPrice:
            localTotalPrice,

          totalPoints:
            localTotalPoints,

          totalMinutes:
            localTotalMinutes,
        })

        return
      }

      if (
        pool.length -
          startIndex <
        remaining
      ) {
        return
      }

      /*
       * Budget-bound binnen deze
       * specifieke positie.
       */
      const cheapestCurrent =
        groupBounds
          .minPrice[
            startIndex
          ][remaining]

      if (
        !Number.isFinite(
          cheapestCurrent,
        )
      ) {
        return
      }

      let laterMinimumPrice = 0
      let laterMaximumPoints = 0

      for (
        let index =
          groupIndex + 1;

        index <
          searchGroups.length;

        index += 1
      ) {
        const laterGroup =
          searchGroups[index]

        laterMinimumPrice +=
          bounds[
            laterGroup.position
          ].minPrice[0][
            laterGroup.count
          ]

        laterMaximumPoints +=
          bounds[
            laterGroup.position
          ].maxPoints[0][
            laterGroup.count
          ]
      }

      if (
        localTotalPrice +
          cheapestCurrent +
          laterMinimumPrice >
        maximumBudget +
          0.0001
      ) {
        return
      }

      /*
       * Punten-bound binnen de positie.
       */
      const maximumCurrent =
        groupBounds
          .maxPoints[
            startIndex
          ][remaining]

      if (
        bestTeam &&
        localTotalPoints +
          maximumCurrent +
          laterMaximumPoints <
          bestTeam.totalPoints
      ) {
        return
      }

      for (
        let index =
          startIndex;

        index <
          pool.length;

        index += 1
      ) {
        const player =
          pool[index]

        const club =
          cleanText(
            player?.club,
          )

        const currentClubCount =
          localClubCounts.get(
            club,
          ) ?? 0

        if (
          currentClubCount >=
          maximumPlayersPerClub
        ) {
          continue
        }

        const playerPrice =
          getCandidatePrice(
            player,
          )

        const nextPrice =
          localTotalPrice +
          playerPrice

        if (
          nextPrice >
          maximumBudget +
            0.0001
        ) {
          continue
        }

        const nextClubCounts =
          new Map(
            localClubCounts,
          )

        nextClubCounts.set(
          club,
          currentClubCount + 1,
        )

        choosePlayers({
          startIndex:
            index + 1,

          remaining:
            remaining - 1,

          groupSelection: [
            ...groupSelection,
            player,
          ],

          localClubCounts:
            nextClubCounts,

          localTotalPrice:
            nextPrice,

          localTotalPoints:
            localTotalPoints +
            toNumber(
              player
                ?.fantasyPoints,
            ),

          localTotalMinutes:
            localTotalMinutes +
            toNumber(
              player?.minutes,
            ),
        })
      }
    }

    choosePlayers({
      startIndex: 0,

      remaining:
        count,

      groupSelection: [],

      localClubCounts:
        new Map(
          clubCounts,
        ),

      localTotalPrice:
        totalPrice,

      localTotalPoints:
        totalPoints,

      localTotalMinutes:
        totalMinutes,
    })
  }

  choosePositionGroup({
    groupIndex: 0,

    selected: [],

    clubCounts:
      new Map(),

    totalPrice: 0,

    totalPoints: 0,

    totalMinutes: 0,
  })

  return bestTeam
}

/* =========================================================
   BESTE GELDIGE FORMATIE
========================================================= */


function compareTeams(
  left,
  right,
) {
  const pointsDifference =
    toNumber(
      right?.totalPoints,
    ) -
    toNumber(
      left?.totalPoints,
    )

  if (pointsDifference !== 0) {
    return pointsDifference
  }

  /*
   * Alleen een tie-break.
   * Fantasy-punten blijven altijd leidend.
   */
  return (
    toNumber(
      right?.totalMinutes,
    ) -
    toNumber(
      left?.totalMinutes,
    )
  )
}


export function calculateFreeDreamTeam({
  season,
  round,
}) {
  const candidates =
    getDreamTeamRoundCandidates({
      season,
      round,
    })

  const possibleTeams =
    VALID_FORMATIONS
      .map(
        (formation) =>
          buildFormationTeam({
            candidates,
            formation,
          }),
      )
      .filter(Boolean)
      .sort(
        compareTeams,
      )

  const bestTeam =
    possibleTeams[0] ??
    null

  if (!bestTeam) {
    return {
      season:
        cleanText(
          season,
        ),

      round:
        Number(
          round,
        ) || 0,

      type:
        'free',

      candidates,

      formation:
        '',

      players:
        [],

      positions: {
        keeper: [],
        defenders: [],
        midfielders: [],
        attackers: [],
      },

      totalPoints:
        0,

      valid:
        false,

      message:
        'Er zijn nog niet genoeg spelers met afgeronde wedstrijddata om een geldig Dream Team samen te stellen.',
    }
  }

  return {
    season:
      cleanText(
        season,
      ),

    round:
      Number(
        round,
      ) || 0,

    type:
      'free',

    candidates,

    ...bestTeam,

    valid:
      true,

    message:
      '',
  }
}

export function calculateFantasyRulesDreamTeam({
  season,
  round,
  maximumBudget = 100,
  maximumPlayersPerClub = 3,
}) {
  const candidates =
    getDreamTeamRoundCandidates({
      season,
      round,
    })

  const possibleTeams =
    VALID_FORMATIONS
      .map(
        (formation) =>
          buildFantasyRulesFormationTeam({
            candidates,
            formation,
            maximumBudget,
            maximumPlayersPerClub,
          }),
      )
      .filter(Boolean)
      .sort(
        compareTeams,
      )

  const bestTeam =
    possibleTeams[0] ??
    null

  if (!bestTeam) {
    return {
      season:
        cleanText(
          season,
        ),

      round:
        Number(
          round,
        ) || 0,

      type:
        'fantasy-rules',

      candidates,

      formation:
        '',

      players:
        [],

      positions: {
        keeper: [],
        defenders: [],
        midfielders: [],
        attackers: [],
      },

      totalPoints:
        0,

      totalPrice:
        0,

      maximumBudget,

      maximumPlayersPerClub,

      valid:
        false,

      message:
        'Er kon geen geldig Dream Team binnen het budget en de Fantasy-regels worden samengesteld.',
    }
  }

  return {
    season:
      cleanText(
        season,
      ),

    round:
      Number(
        round,
      ) || 0,

    type:
      'fantasy-rules',

    candidates,

    maximumBudget,

    maximumPlayersPerClub,

    ...bestTeam,

    valid:
      true,

    message:
      '',
  }
}

export function calculateBottomHalfDreamTeam({
  season,
  round,
}) {
  const bottomHalf =
    getBottomHalfClubsAfterRound({
      season,
      round,
    })

  const allowedClubs =
    new Set(
      bottomHalf.map(
        (team) =>
          team.clubKey,
      ),
    )

  const candidates =
    getDreamTeamRoundCandidates({
      season,
      round,
    })
      .filter(
        (candidate) =>
          allowedClubs.has(
            normalizeClubName(
              candidate?.club,
            ),
          ),
      )

  const possibleTeams =
    VALID_FORMATIONS
      .map(
        (formation) =>
          buildFormationTeam({
            candidates,
            formation,
          }),
      )
      .filter(Boolean)
      .sort(
        compareTeams,
      )

  const bestTeam =
    possibleTeams[0] ??
    null

  if (!bestTeam) {
    return {
      season:
        cleanText(
          season,
        ),

      round:
        Number(
          round,
        ) || 0,

      type:
        'bottom-half',

      bottomHalf,

      candidates,

      formation:
        '',

      players:
        [],

      positions: {
        keeper: [],
        defenders: [],
        midfielders: [],
        attackers: [],
      },

      totalPoints:
        0,

      valid:
        false,

      message:
        bottomHalf.length
          ? 'Er zijn nog niet genoeg spelers van clubs uit het rechterrijtje met afgeronde wedstrijddata om een geldig Dream Team samen te stellen.'
          : 'Er is nog geen volledige stand beschikbaar om het rechterrijtje te bepalen.',
    }
  }

  return {
    season:
      cleanText(
        season,
      ),

    round:
      Number(
        round,
      ) || 0,

    type:
      'bottom-half',

    bottomHalf,

    candidates,

    ...bestTeam,

    valid:
      true,

    message:
      '',
  }
}

export function calculateDifferentialDreamTeam({
  season,
  round,
  maximumSelectedPct = 5,
}) {
  const candidates =
    getDreamTeamRoundCandidates({
      season,
      round,
    })
      .filter(
        (candidate) =>
          Number.isFinite(
            Number(
              candidate?.selectedPct,
            ),
          ) &&
          Number(
            candidate?.selectedPct,
          ) <= maximumSelectedPct,
      )

  const possibleTeams =
    VALID_FORMATIONS
      .map(
        (formation) =>
          buildFormationTeam({
            candidates,
            formation,
          }),
      )
      .filter(Boolean)
      .sort(
        compareTeams,
      )

  const bestTeam =
    possibleTeams[0] ??
    null

  if (!bestTeam) {
    return {
      season:
        cleanText(
          season,
        ),

      round:
        Number(
          round,
        ) || 0,

      type:
        'differential',

      maximumSelectedPct,

      candidates,

      formation:
        '',

      players:
        [],

      positions: {
        keeper: [],
        defenders: [],
        midfielders: [],
        attackers: [],
      },

      totalPoints:
        0,

      valid:
        false,

      message:
        `Er zijn nog niet genoeg spelers met maximaal ${maximumSelectedPct}% gekozen om een geldig Dream Team samen te stellen.`,
    }
  }

  return {
    season:
      cleanText(
        season,
      ),

    round:
      Number(
        round,
      ) || 0,

    type:
      'differential',

    maximumSelectedPct,

    candidates,

    ...bestTeam,

    valid:
      true,

    message:
      '',
  }
}

/* =========================================================
   BESCHIKBARE SPEELRONDES
========================================================= */


export function getDreamTeamAvailableRounds(
  season,
) {
  const rounds =
    new Set()

  getSeasonPlayers(
    season,
  )
    .forEach(
      (player) => {
        getPlayerMatchHistory(
          player,
          {
            season,
          },
        )
          .forEach(
            (match) => {
              const round =
                Number(
                  match?.round,
                )

              if (
                Number.isFinite(round) &&
                round > 0
              ) {
                rounds.add(
                  round,
                )
              }
            },
          )
      },
    )

  return [
    ...rounds,
  ]
    .sort(
      (left, right) =>
        left -
        right,
    )
}


export {
  VALID_FORMATIONS,
}