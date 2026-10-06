function clamp(value) {
  return Math.max(
    0,
    Math.min(100, value),
  )
}

function round(value) {
  return Math.round(value * 10) / 10
}

/*
|--------------------------------------------------------------------------
| Minuten-score
|--------------------------------------------------------------------------
|
| Een vloeiende curve.
|
| 0 minuten = 0
| ~3000 minuten ≈ 58
| ~6000 minuten ≈ 82
| ~9000 minuten ≈ 92
|
*/

function getMinutesScore(
  minutes,
) {
  return clamp(
    100 *
      (
        1 -
        Math.exp(
          -minutes / 3500,
        )
      ),
  )
}

/*
|--------------------------------------------------------------------------
| Seizoenen-score
|--------------------------------------------------------------------------
|
| Alleen seizoenen met
| minimaal 450 minuten
| tellen mee.
|
*/

function getSeasonScore(
  seasons,
) {
  const completed =
    seasons.filter(
      (season) =>
        Number(season.minutes) >=
        450,
    ).length

  return clamp(
    completed * 25,
  )
}

export function calculateExperience(
  history,
) {
  const totalMinutes =
    history?.totals?.minutes ??
    0

  const seasons =
    history?.seasons ?? []

  const minutesScore =
    getMinutesScore(
      totalMinutes,
    )

  const seasonsScore =
    getSeasonScore(
      seasons,
    )

  const score =
    round(
      minutesScore * 0.8 +
      seasonsScore * 0.2,
    )

  return {
    score,

    totalMinutes,

    seasonCount:
      seasons.length,

    minutesScore:
      round(minutesScore),

    seasonsScore:
      round(seasonsScore),
  }
}