// Presentation adapter only: the central match engine owns identity, season
// filtering and Fantasy scoring. SPELERS contains placeholder zeroes.
const fields = {
  points: ['punten', 'totaal'],
  minutePoints: ['punten', 'speelminuten'],
  savePoints: ['punten', 'reddingen'],
  cleanSheetPoints: ['punten', 'cleanSheet'],
  goalsAgainstMinus: ['punten', 'tegendoelpunten'],
  minutes: ['statistieken', 'minuten'],
  goals: ['statistieken', 'goals'],
  assists: ['statistieken', 'assists'],
  optaBonus: ['statistieken', 'optaBonus'],
  saves: ['statistieken', 'reddingen'],
  cleanSheets: ['statistieken', 'cleanSheets'],
  penaltiesSaved: ['statistieken', 'penaltiesGestopt'],
  penaltiesMissed: ['statistieken', 'penaltiesGemist'],
  yellowCards: ['statistieken', 'geleKaarten'],
  redCards: ['statistieken', 'rodeKaarten'],
  goalsAgainst: ['statistieken', 'tegendoelpunten'],
}

export function comparisonNumber(value) {
  if (value === null || value === undefined || value === '' ||
      (typeof value === 'string' && !value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function withComparisonStats(player, profile) {
  const hasHistory = profile?.wedstrijden?.length > 0
  return {
    ...player,
    ...Object.fromEntries(Object.entries(fields).map(([key, [group, field]]) =>
      [key, hasHistory ? comparisonNumber(profile[group]?.[field]) : null])),
  }
}
