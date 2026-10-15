import {calculateFixtureDifficulty} from './difficultyEngine.js'
const difficultyMeta={1:{label:'Zeer makkelijk'},2:{label:'Makkelijk'},3:{label:'Gemiddeld'},4:{label:'Moeilijk'},5:{label:'Zeer moeilijk'}}
export function fixtureViewForClub(fixture, club, {results=[],teamRatings=[]}={}) {
  const isHome = fixture.home === club

  const calculation =
    calculateFixtureDifficulty({
      fixture,
      results,
      teamRatings,
    })

  const dynamicView = isHome
    ? calculation?.home
    : calculation?.away

  return {
  club,

  opponent:
    isHome
      ? fixture.away
      : fixture.home,

  venue:
    isHome
      ? 'T'
      : 'U',

  difficulty:
    dynamicView?.difficulty ??
    (
      isHome
        ? fixture.difficultyHome
        : fixture.difficultyAway
    ),

  label:
    dynamicView?.label ??
    difficultyMeta[
      isHome
        ? fixture.difficultyHome
        : fixture.difficultyAway
    ]?.label ??
    'Gemiddeld',

  color:
    dynamicView?.color ??
    '#facc15',

  confidence:
    dynamicView?.confidence ?? 0,

  components:
    dynamicView?.components ?? {},

  effectiveWeights:
    dynamicView?.effectiveWeights ?? {},

  sampleSizes:
    dynamicView?.sampleSizes ?? {},
}
}

export function clubSchemaSummary(
  list,
  club,
  data={},
) {
  if (!list.length) {
    return {
      value:
        '—',

      rounds:
        [],
    }
  }

  const NO_FIXTURE_DIFFICULTY =
    5.5

  const DOUBLE_GAMEWEEK_BONUS =
    0.8

  const groupedRounds =
    new Map()

  list.forEach((fixture) => {
    const round =
      Number(
        fixture.round,
      )

    if (
      !groupedRounds.has(
        round,
      )
    ) {
      groupedRounds.set(
        round,
        [],
      )
    }

    groupedRounds
      .get(round)
      .push(fixture)
  })

  const startRound =
    Math.min(
      ...groupedRounds.keys(),
    )

  const endRound =
    Math.max(
      ...groupedRounds.keys(),
    )

  const roundResults = []

  for (
    let round = startRound;
    round <= endRound;
    round++
  ) {
    const fixtures =
      groupedRounds.get(
        round,
      ) || []

    if (!fixtures.length) {
      roundResults.push({
        round,

        value:
          NO_FIXTURE_DIFFICULTY,

        label:
          'Geen wedstrijd',

        explanation:
          'Geen wedstrijd betekent geen mogelijkheid om fantasypunten te behalen.',
      })

      continue
    }

    if (fixtures.length === 1) {
      const fixture =
        fixtures[0]

      const view =
        fixtureViewForClub(
          fixture,
          club, data,
        )

      roundResults.push({
        round,

        value:
          Number(
            view.difficulty,
          ),

        label:
          `${view.opponent} (${
            view.venue
          })`,

        explanation:
          `${Number(
            view.difficulty,
          ).toFixed(
            1,
          )}/5 · ${view.label}`,
      })

      continue
    }

    const fixtureScores =
      fixtures.map(
        (fixture) =>
          Number(
            fixtureViewForClub(
              fixture,
              club, data,
            ).difficulty,
          ),
      )

    const averageDifficulty =
      fixtureScores.reduce(
        (
          total,
          value,
        ) =>
          total +
          value,
        0,
      ) /
      fixtureScores.length

    const adjustedDifficulty =
      Math.max(
        1,
        averageDifficulty -
          DOUBLE_GAMEWEEK_BONUS,
      )

    roundResults.push({
      round,

      value:
        adjustedDifficulty,

      label:
        'Dubbele speelronde',

      explanation:
        `${fixtureScores
          .map(
            (value) =>
              value.toFixed(1),
          )
          .join(
            ' + ',
          )} gemiddeld, daarna 0,8 bonus`,
    })
  }

  const total =
    roundResults.reduce(
      (
        sum,
        round,
      ) =>
        sum +
        round.value,
      0,
    )

  return {
    value:
      (
        total /
        roundResults.length
      ).toFixed(2),

    rounds:
      roundResults,
  }
}

