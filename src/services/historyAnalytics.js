import {
  buildFixtureConfidence,
} from './confidenceEngine.js'

const CLUB_ALIASES = {
  'n.e.c.': 'nec',
  'n.e.c': 'nec',
  'n e c': 'nec',
  nec: 'nec',

  'sc heerenveen': 'heerenveen',
  heerenveen: 'heerenveen',

  'go ahead eagles': 'go ahead eagles',
  'go ahead': 'go ahead eagles',
  gae: 'go ahead eagles',

  'ado den haag': 'ado den haag',

  'cambuur leeuwarden': 'cambuur',
  'sc cambuur': 'cambuur',
  cambuur: 'cambuur',

  'almere city fc': 'almere city',
  'almere city': 'almere city',
}

export function normalizeClubName(value) {
  const normalized = String(value || '')
    .trim()
    .toLocaleLowerCase('nl-NL')
    .replace(/\s+/g, ' ')

  return CLUB_ALIASES[normalized] || normalized
}

export function normalizeSeason(value) {
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, '')

  const years = text.match(/\d{4}|\d{2}/g)

  if (!years || years.length < 2) {
    return text
  }

  let startYear = years[0]
  let endYear = years[1]

  if (startYear.length === 2) {
    startYear = `20${startYear}`
  }

  if (endYear.length === 2) {
    endYear = `20${endYear}`
  }

  return `${startYear}/${endYear}`
}

export function sameClub(leftClub, rightClub) {
  return (
    normalizeClubName(leftClub) ===
    normalizeClubName(rightClub)
  )
}

export function formatHistoryDate(dateValue) {
  if (!dateValue) {
    return 'Onbekende datum'
  }

  const date = new Date(`${dateValue}T12:00:00`)

  if (Number.isNaN(date.getTime())) {
    return String(dateValue)
  }

  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function getHistorySeasons(results) {
  return [
    ...new Set(
      results
        .map((result) => result.season)
        .filter(Boolean),
    ),
  ].sort((left, right) =>
    right.localeCompare(left, 'nl'),
  )
}

export function getHistoryClubs(results, season = '') {
  const filteredResults = season
    ? results.filter(
        (result) => result.season === season,
      )
    : results

  return [
    ...new Set(
      filteredResults
        .flatMap((result) => [
          result.home,
          result.away,
        ])
        .filter(Boolean),
    ),
  ].sort((left, right) =>
    left.localeCompare(right, 'nl'),
  )
}

export function resultForClub(result, club) {
  const isHome = sameClub(result.home, club)

  const goalsFor = isHome
    ? result.homeScore
    : result.awayScore

  const goalsAgainst = isHome
    ? result.awayScore
    : result.homeScore

  let outcome = 'G'
  let points = 1

  if (goalsFor > goalsAgainst) {
    outcome = 'W'
    points = 3
  }

  if (goalsFor < goalsAgainst) {
    outcome = 'V'
    points = 0
  }

  return {
    ...result,

    isHome,

    venue: isHome ? 'Thuis' : 'Uit',

    opponent: isHome
      ? result.away
      : result.home,

    goalsFor,
    goalsAgainst,
    outcome,
    points,

    cleanSheet: goalsAgainst === 0,

    bothTeamsScored:
      goalsFor > 0 && goalsAgainst > 0,

    over25:
      goalsFor + goalsAgainst > 2,
  }
}

export function getClubMatches(
  results,
  club,
  options = {},
) {
  const {
    venue,
    limit,
    beforeDate,
    season,
} = options

  const matches = results
    .filter(
      (result) =>
        sameClub(result.home, club) ||
        sameClub(result.away, club),
    )
    .filter(
  (result) =>
    !season ||
    normalizeSeason(result.season) ===
      normalizeSeason(season),
)
    .filter(
      (result) =>
        !beforeDate ||
        result.date < beforeDate,
    )
    .filter((result) => {
      if (venue === 'home') {
        return sameClub(result.home, club)
      }

      if (venue === 'away') {
        return sameClub(result.away, club)
      }

      return true
    })
    .sort((left, right) =>
      right.date.localeCompare(left.date),
    )
    .map((result) =>
      resultForClub(result, club),
    )

  if (limit) {
    return matches.slice(0, limit)
  }

  return matches
}

export function summarizeMatches(matches) {
  if (!matches.length) {
    return {
      played: 0,

      wins: 0,
      draws: 0,
      losses: 0,

      points: 0,
      pointsPerGame: 0,

      goalsFor: 0,
      goalsAgainst: 0,

      averageGoalsFor: 0,
      averageGoalsAgainst: 0,

      cleanSheets: 0,
      cleanSheetPercentage: 0,

      bothTeamsScored: 0,
      bothTeamsScoredPercentage: 0,

      over25: 0,
      over25Percentage: 0,
    }
  }

  const totals = matches.reduce(
    (summary, match) => {
      if (match.outcome === 'W') {
        summary.wins += 1
      }

      if (match.outcome === 'G') {
        summary.draws += 1
      }

      if (match.outcome === 'V') {
        summary.losses += 1
      }

      summary.points += match.points

      summary.goalsFor += match.goalsFor
      summary.goalsAgainst += match.goalsAgainst

      if (match.cleanSheet) {
        summary.cleanSheets += 1
      }

      if (match.bothTeamsScored) {
        summary.bothTeamsScored += 1
      }

      if (match.over25) {
        summary.over25 += 1
      }

      return summary
    },
    {
      wins: 0,
      draws: 0,
      losses: 0,

      points: 0,

      goalsFor: 0,
      goalsAgainst: 0,

      cleanSheets: 0,
      bothTeamsScored: 0,
      over25: 0,
    },
  )

  const played = matches.length

  return {
    ...totals,

    played,

    pointsPerGame:
      totals.points / played,

    averageGoalsFor:
      totals.goalsFor / played,

    averageGoalsAgainst:
      totals.goalsAgainst / played,

    cleanSheetPercentage:
      (totals.cleanSheets / played) * 100,

    bothTeamsScoredPercentage:
      (totals.bothTeamsScored / played) * 100,

    over25Percentage:
      (totals.over25 / played) * 100,
  }
}

export function calculateStandings(
  results,
  season,
) {
  const teamMap = new Map()

  function createTeam(club) {
    const key = normalizeClubName(club)

    if (!teamMap.has(key)) {
      teamMap.set(key, {
        key,
        club,

        played: 0,

        wins: 0,
        draws: 0,
        losses: 0,

        goalsFor: 0,
        goalsAgainst: 0,

        points: 0,
      })
    }

    return teamMap.get(key)
  }

  results
    .filter(
      (result) =>
        !season ||
        result.season === season,
    )
    .forEach((result) => {
      const homeTeam = createTeam(result.home)
      const awayTeam = createTeam(result.away)

      homeTeam.played += 1
      awayTeam.played += 1

      homeTeam.goalsFor += result.homeScore
      homeTeam.goalsAgainst += result.awayScore

      awayTeam.goalsFor += result.awayScore
      awayTeam.goalsAgainst += result.homeScore

      if (result.homeScore > result.awayScore) {
        homeTeam.wins += 1
        awayTeam.losses += 1
        homeTeam.points += 3
      } else if (
        result.homeScore < result.awayScore
      ) {
        awayTeam.wins += 1
        homeTeam.losses += 1
        awayTeam.points += 3
      } else {
        homeTeam.draws += 1
        awayTeam.draws += 1

        homeTeam.points += 1
        awayTeam.points += 1
      }
    })

  return [...teamMap.values()]
    .map((team) => ({
      ...team,

      goalDifference:
        team.goalsFor -
        team.goalsAgainst,
    }))
    .sort(
      (left, right) =>
        right.points - left.points ||

        right.goalDifference -
          left.goalDifference ||

        right.goalsFor -
          left.goalsFor ||

        left.club.localeCompare(
          right.club,
          'nl',
        ),
    )
}
/* ==========================================================
   ONDERLINGE RESULTATEN
========================================================== */

export function getHeadToHead(
  results,
  homeClub,
  awayClub,
  limit = 20,
) {
  return results
    .filter(
      (result) =>
        (sameClub(result.home, homeClub) &&
          sameClub(result.away, awayClub)) ||
        (sameClub(result.home, awayClub) &&
          sameClub(result.away, homeClub)),
    )
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date),
    )
    .slice(0, limit)
}

export function getVenueHeadToHead(
  results,
  homeClub,
  awayClub,
  limit = 10,
  beforeDate = '',
) {
  return results
    .filter(
      (result) =>
        sameClub(result.home, homeClub) &&
        sameClub(result.away, awayClub),
    )
    .filter(
      (result) =>
        !beforeDate ||
        result.date < beforeDate,
    )
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date),
    )
    .slice(0, limit)
}

export function summarizeHeadToHead(
  results,
  homeClub,
) {
  let wins = 0
  let draws = 0
  let losses = 0

  let goalsFor = 0
  let goalsAgainst = 0

  results.forEach((match) => {
    const clubResult = resultForClub(
      match,
      homeClub,
    )

    goalsFor += clubResult.goalsFor
    goalsAgainst += clubResult.goalsAgainst

    if (clubResult.outcome === 'W') wins++

    if (clubResult.outcome === 'G') draws++

    if (clubResult.outcome === 'V') losses++
  })

  return {
    matches: results.length,

    wins,
    draws,
    losses,

    goalsFor,
    goalsAgainst,

    averageGoalsFor:
      results.length
        ? goalsFor / results.length
        : 0,

    averageGoalsAgainst:
      results.length
        ? goalsAgainst / results.length
        : 0,
  }
}

/* ==========================================================
   VORM
========================================================== */

export function getRecentForm(
  results,
  club,
  season = '',
  amount = 5,
) {
  return getClubMatches(results, club, {
    season,
    limit: amount,
  })
}

export function getFormString(matches) {
  return matches
    .map((match) => match.outcome)
    .join('')
}

/* ==========================================================
   THUIS / UIT
========================================================== */

export function getHomeForm(
  results,
  club,
  season = '',
  amount = 5,
) {
  return getClubMatches(results, club, {
    season,
    venue: 'home',
    limit: amount,
  })
}

export function getAwayForm(
  results,
  club,
  season = '',
  amount = 5,
) {
  return getClubMatches(results, club, {
    season,
    venue: 'away',
    limit: amount,
  })
}

/* ==========================================================
   FANTASY INDICATIE
========================================================== */

export function buildFantasyAdvice(
  homeSummary,
  awaySummary,
) {
  const advice = []

  if (
    homeSummary.averageGoalsFor >= 2
  ) {
    advice.push({
      type: 'attack-home',
      title:
        'Aanvallers thuisclub interessant',
      rating: 5,
    })
  }

  if (
    awaySummary.averageGoalsFor >= 2
  ) {
    advice.push({
      type: 'attack-away',
      title:
        'Aanvallers uitclub interessant',
      rating: 5,
    })
  }

  if (
    homeSummary.cleanSheetPercentage >=
    50
  ) {
    advice.push({
      type: 'defense-home',
      title:
        'Verdedigers thuisclub interessant',
      rating: 4,
    })
  }

  if (
    awaySummary.cleanSheetPercentage >=
    50
  ) {
    advice.push({
      type: 'defense-away',
      title:
        'Verdedigers uitclub interessant',
      rating: 4,
    })
  }

  return advice
}
/* ==========================================================
   WEDSTRIJDANALYSE
========================================================== */

function clamp(value, minimum, maximum) {
  return Math.max(
    minimum,
    Math.min(maximum, value),
  )
}

function roundToOne(value) {
  return Math.round(value * 10) / 10
}

function createRatingLabel(rating) {
  if (rating >= 4.5) {
    return 'Zeer interessant'
  }

  if (rating >= 3.7) {
    return 'Interessant'
  }

  if (rating >= 2.8) {
    return 'Redelijk'
  }

  if (rating >= 2) {
    return 'Voorzichtig'
  }

  return 'Hoog risico'
}

function createRatingClass(rating) {
  if (rating >= 4.5) {
    return 'excellent'
  }

  if (rating >= 3.7) {
    return 'good'
  }

  if (rating >= 2.8) {
    return 'neutral'
  }

  if (rating >= 2) {
    return 'caution'
  }

  return 'risk'
}

function calculateAttackRating(
  ownSummary,
  opponentSummary,
  homeAdvantage = 0,
) {
  const score =
    1.3 +
    ownSummary.averageGoalsFor * 1.05 +
    opponentSummary.averageGoalsAgainst * 0.65 +
    ownSummary.pointsPerGame * 0.25 +
    homeAdvantage

  return clamp(
    roundToOne(score),
    1,
    5,
  )
}

function calculateMidfieldRating(
  ownSummary,
  opponentSummary,
  homeAdvantage = 0,
) {
  const score =
    1.5 +
    ownSummary.averageGoalsFor * 0.8 +
    opponentSummary.averageGoalsAgainst * 0.45 +
    ownSummary.pointsPerGame * 0.28 +
    homeAdvantage

  return clamp(
    roundToOne(score),
    1,
    5,
  )
}

function calculateDefenseRating(
  ownSummary,
  opponentSummary,
  homeAdvantage = 0,
) {
  const score =
    4.6 -
    opponentSummary.averageGoalsFor * 1.05 -
    ownSummary.averageGoalsAgainst * 0.55 +
    ownSummary.cleanSheetPercentage / 45 +
    homeAdvantage

  return clamp(
    roundToOne(score),
    1,
    5,
  )
}

function calculateKeeperRating(
  ownSummary,
  opponentSummary,
  defenseRating,
) {
  const cleanSheetComponent =
    ownSummary.cleanSheetPercentage / 35

  const savePotentialComponent =
    opponentSummary.averageGoalsFor * 0.25

  const score =
    1.5 +
    cleanSheetComponent +
    savePotentialComponent +
    defenseRating * 0.28

  return clamp(
    roundToOne(score),
    1,
    5,
  )
}

function createAdviceItem(
  club,
  line,
  rating,
  explanation,
) {
  return {
    club,
    line,
    rating,
    label: createRatingLabel(rating),
    className: createRatingClass(rating),
    explanation,
  }
}

export function buildFixtureAnalysis(
  results,
  homeClub,
  awayClub,
  fixtureDate = '',
  fixtureSeason = '',
) {
  const homeRecentMatches = getClubMatches(
    results,
    homeClub,
    {
    limit: 5,
    beforeDate: fixtureDate,
    season: fixtureSeason,
}
  )

  const awayRecentMatches = getClubMatches(
    results,
    awayClub,
    {
    limit: 5,
    beforeDate: fixtureDate,
    season: fixtureSeason,
},
  )

  const homeVenueMatches = getClubMatches(
    results,
    homeClub,
    {
    venue: 'home',
    limit: 10,
    beforeDate: fixtureDate,
    season: fixtureSeason,
},
  )

  const awayVenueMatches = getClubMatches(
    results,
    awayClub,
    {
    venue: 'away',
    limit: 10,
    beforeDate: fixtureDate,
    season: fixtureSeason,
},
  )

  const headToHeadMatches = getHeadToHead(
    results,
    homeClub,
    awayClub,
    10,
  )
  const venueHeadToHeadMatches =
    getVenueHeadToHead(
      results,
      homeClub,
      awayClub,
      10,
      fixtureDate,
    )

  const homeRecentSummary =
    summarizeMatches(homeRecentMatches)

  const awayRecentSummary =
    summarizeMatches(awayRecentMatches)

  const homeVenueSummary =
    summarizeMatches(homeVenueMatches)

  const awayVenueSummary =
    summarizeMatches(awayVenueMatches)

  const headToHeadSummary =
    summarizeHeadToHead(
      headToHeadMatches,
      homeClub,
    )
  const venueHeadToHeadSummary =
    summarizeHeadToHead(
      venueHeadToHeadMatches,
      homeClub,
    )
  const awayHeadToHeadSummary =
    summarizeHeadToHead(
      headToHeadMatches,
      awayClub,
    )

  const awayVenueHeadToHeadSummary =
    summarizeHeadToHead(
      venueHeadToHeadMatches,
      awayClub,
    )

  const homeCombinedSummary = {
    pointsPerGame:
      homeRecentSummary.pointsPerGame * 0.6 +
      homeVenueSummary.pointsPerGame * 0.4,

    averageGoalsFor:
      homeRecentSummary.averageGoalsFor * 0.6 +
      homeVenueSummary.averageGoalsFor * 0.4,

    averageGoalsAgainst:
      homeRecentSummary.averageGoalsAgainst * 0.6 +
      homeVenueSummary.averageGoalsAgainst * 0.4,

    cleanSheetPercentage:
      homeRecentSummary.cleanSheetPercentage * 0.5 +
      homeVenueSummary.cleanSheetPercentage * 0.5,

    bothTeamsScoredPercentage:
      homeRecentSummary.bothTeamsScoredPercentage * 0.5 +
      homeVenueSummary.bothTeamsScoredPercentage * 0.5,

    over25Percentage:
      homeRecentSummary.over25Percentage * 0.5 +
      homeVenueSummary.over25Percentage * 0.5,
  }

  const awayCombinedSummary = {
    pointsPerGame:
      awayRecentSummary.pointsPerGame * 0.6 +
      awayVenueSummary.pointsPerGame * 0.4,

    averageGoalsFor:
      awayRecentSummary.averageGoalsFor * 0.6 +
      awayVenueSummary.averageGoalsFor * 0.4,

    averageGoalsAgainst:
      awayRecentSummary.averageGoalsAgainst * 0.6 +
      awayVenueSummary.averageGoalsAgainst * 0.4,

    cleanSheetPercentage:
      awayRecentSummary.cleanSheetPercentage * 0.5 +
      awayVenueSummary.cleanSheetPercentage * 0.5,

    bothTeamsScoredPercentage:
      awayRecentSummary.bothTeamsScoredPercentage * 0.5 +
      awayVenueSummary.bothTeamsScoredPercentage * 0.5,

    over25Percentage:
      awayRecentSummary.over25Percentage * 0.5 +
      awayVenueSummary.over25Percentage * 0.5,
  }

  const homeAttackRating =
    calculateAttackRating(
      homeCombinedSummary,
      awayCombinedSummary,
      0.25,
    )

  const awayAttackRating =
    calculateAttackRating(
      awayCombinedSummary,
      homeCombinedSummary,
      0,
    )

  const homeMidfieldRating =
    calculateMidfieldRating(
      homeCombinedSummary,
      awayCombinedSummary,
      0.2,
    )

  const awayMidfieldRating =
    calculateMidfieldRating(
      awayCombinedSummary,
      homeCombinedSummary,
      0,
    )

  const homeDefenseRating =
    calculateDefenseRating(
      homeCombinedSummary,
      awayCombinedSummary,
      0.2,
    )

  const awayDefenseRating =
    calculateDefenseRating(
      awayCombinedSummary,
      homeCombinedSummary,
      0,
    )

  const homeKeeperRating =
    calculateKeeperRating(
      homeCombinedSummary,
      awayCombinedSummary,
      homeDefenseRating,
    )

  const awayKeeperRating =
    calculateKeeperRating(
      awayCombinedSummary,
      homeCombinedSummary,
      awayDefenseRating,
    )

  const expectedHomeGoals = clamp(
    roundToOne(
      homeCombinedSummary.averageGoalsFor * 0.55 +
      awayCombinedSummary.averageGoalsAgainst * 0.45,
    ),
    0,
    5,
  )

  const expectedAwayGoals = clamp(
    roundToOne(
      awayCombinedSummary.averageGoalsFor * 0.55 +
      homeCombinedSummary.averageGoalsAgainst * 0.45,
    ),
    0,
    5,
  )

  const expectedTotalGoals =
    roundToOne(
      expectedHomeGoals +
      expectedAwayGoals,
    )

  const bothTeamsScoreIndicator =
    roundToOne(
      (
        homeCombinedSummary.bothTeamsScoredPercentage +
        awayCombinedSummary.bothTeamsScoredPercentage
      ) / 2,
    )

  const over25Indicator =
    roundToOne(
      (
        homeCombinedSummary.over25Percentage +
        awayCombinedSummary.over25Percentage
      ) / 2,
    )

      const confidence =
    buildFixtureConfidence({
      homeRecentSummary,
      awayRecentSummary,

      homeVenueSummary,
      awayVenueSummary,

      homeHeadToHeadSummary:
        headToHeadSummary,

      awayHeadToHeadSummary,

      homeLocationHistorySummary:
        venueHeadToHeadSummary,

      awayLocationHistorySummary:
        awayVenueHeadToHeadSummary,

      expectedHomeGoals,
      expectedAwayGoals,
    })

  const fantasyAdvice = [
    createAdviceItem(
      homeClub,
      'Aanvallers',
      homeAttackRating,
      `${homeClub} scoort recent gemiddeld ${homeCombinedSummary.averageGoalsFor.toFixed(1)} doelpunten per duel.`,
    ),

    createAdviceItem(
      homeClub,
      'Middenvelders',
      homeMidfieldRating,
      'Interessant voor doelpunten, assists en mogelijke bonuspunten.',
    ),

    createAdviceItem(
      homeClub,
      'Verdedigers',
      homeDefenseRating,
      `${homeClub} houdt in ${homeCombinedSummary.cleanSheetPercentage.toFixed(0)}% van de relevante duels de nul.`,
    ),

    createAdviceItem(
      homeClub,
      'Keeper',
      homeKeeperRating,
      'Combinatie van clean-sheetkans en potentiële reddingspunten.',
    ),

    createAdviceItem(
      awayClub,
      'Aanvallers',
      awayAttackRating,
      `${awayClub} scoort recent gemiddeld ${awayCombinedSummary.averageGoalsFor.toFixed(1)} doelpunten per duel.`,
    ),

    createAdviceItem(
      awayClub,
      'Middenvelders',
      awayMidfieldRating,
      'Interessant voor doelpunten, assists en mogelijke bonuspunten.',
    ),

    createAdviceItem(
      awayClub,
      'Verdedigers',
      awayDefenseRating,
      `${awayClub} houdt in ${awayCombinedSummary.cleanSheetPercentage.toFixed(0)}% van de relevante duels de nul.`,
    ),

    createAdviceItem(
      awayClub,
      'Keeper',
      awayKeeperRating,
      'Combinatie van clean-sheetkans en potentiële reddingspunten.',
    ),
  ]

  return {
    homeClub,
    awayClub,

    homeRecentMatches,
    awayRecentMatches,

    homeVenueMatches,
    awayVenueMatches,

        headToHeadMatches,
    venueHeadToHeadMatches,

    homeRecentSummary,
    awayRecentSummary,

    homeVenueSummary,
    awayVenueSummary,

    homeCombinedSummary,
    awayCombinedSummary,

        headToHeadSummary,
    venueHeadToHeadSummary,

    expectedHomeGoals,
    expectedAwayGoals,
    expectedTotalGoals,

    bothTeamsScoreIndicator,
    over25Indicator,

confidence,

ratings: {
  home: confidence.homeRatings,
  away: confidence.awayRatings,
},

    fantasyAdvice,
  }
}
