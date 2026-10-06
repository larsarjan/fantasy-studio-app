function normalizePlayerId(value) {
  return String(value ?? '')
    .trim()
}

function getSeasonStartYear(season) {
  const match =
    String(season ?? '')
      .match(/\d{4}/)

  if (!match) {
    return 0
  }

  return Number(match[0]) || 0
}

function samePlayerId(
  leftPlayer,
  rightPlayer,
) {
  return (
    normalizePlayerId(leftPlayer?.id) !== '' &&
    normalizePlayerId(leftPlayer?.id) ===
      normalizePlayerId(rightPlayer?.id)
  )
}

export function findPlayerHistory(
  players,
  playerId,
) {
  const normalizedId =
    normalizePlayerId(playerId)

  if (!normalizedId) {
    return []
  }

  return players
    .filter(
      (player) =>
        normalizePlayerId(player.id) ===
        normalizedId,
    )
    .sort(
      (left, right) =>
        getSeasonStartYear(right.season) -
        getSeasonStartYear(left.season),
    )
}

export function findPreviousSeasonPlayer(
  players,
  currentPlayer,
) {
  if (!currentPlayer) {
    return null
  }

  const currentSeasonYear =
    getSeasonStartYear(
      currentPlayer.season,
    )

  const previousRecords =
    players
      .filter(
        (candidate) =>
          samePlayerId(
            candidate,
            currentPlayer,
          ),
      )
      .filter(
        (candidate) =>
          getSeasonStartYear(
            candidate.season,
          ) < currentSeasonYear,
      )
      .sort(
        (left, right) =>
          getSeasonStartYear(right.season) -
          getSeasonStartYear(left.season),
      )

  return previousRecords[0] ?? null
}

export function createPreviousSeasonStats(
  players,
  currentPlayer,
) {
  const previousPlayer =
    findPreviousSeasonPlayer(
      players,
      currentPlayer,
    )

  if (!previousPlayer) {
    return null
  }

  const minutes =
    Number(previousPlayer.minutes) || 0

  const points =
    Number(previousPlayer.points) || 0

  const pointsPer90 =
    minutes > 0
      ? (points / minutes) * 90
      : null

  return {
    playerId:
      previousPlayer.id,

    season:
      previousPlayer.season,

    club:
      previousPlayer.club,

    position:
      previousPlayer.position,

    points,

    minutes,

    pointsPer90,

    goals:
      Number(previousPlayer.goals) || 0,

    assists:
      Number(previousPlayer.assists) || 0,

    optaBonus:
      Number(previousPlayer.optaBonus) || 0,

    cleanSheets:
      Number(previousPlayer.cleanSheets) || 0,

    saves:
      Number(previousPlayer.saves) || 0,

    selectedPct:
      previousPlayer.selectedPct ?? null,

    startPrice:
      previousPlayer.startPrice ?? null,

    endPrice:
      previousPlayer.endPrice ?? null,
  }
}
export function createPlayerHistorySummary(
  players,
  currentPlayer,
) {
  if (!currentPlayer) {
    return {
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
  }

  const currentSeasonYear =
    getSeasonStartYear(
      currentPlayer.season,
    )

  const seasons =
    findPlayerHistory(
      players,
      currentPlayer.id,
    )
      .filter(
        (seasonPlayer) =>
          getSeasonStartYear(
            seasonPlayer.season,
          ) < currentSeasonYear,
      )

  const totals =
    seasons.reduce(
      (summary, seasonPlayer) => {
        summary.minutes +=
          Number(seasonPlayer.minutes) || 0

        summary.points +=
          Number(seasonPlayer.points) || 0

        summary.goals +=
          Number(seasonPlayer.goals) || 0

        summary.assists +=
          Number(seasonPlayer.assists) || 0

        summary.optaBonus +=
          Number(seasonPlayer.optaBonus) || 0

        summary.cleanSheets +=
          Number(seasonPlayer.cleanSheets) || 0

        summary.saves +=
          Number(seasonPlayer.saves) || 0

        return summary
      },
      {
        minutes: 0,
        points: 0,
        goals: 0,
        assists: 0,
        optaBonus: 0,
        cleanSheets: 0,
        saves: 0,
      },
    )

  return {
    seasons,
    totals,
  }
}