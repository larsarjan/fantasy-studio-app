import {normalizeClubName as normalizeCanonicalClubName} from './historyAnalytics.js'
export const COMPARE_CLUB_GROUPS = Object.freeze({
  top3: ['PSV', 'Feyenoord', 'Ajax'],
  europe: ['N.E.C.', 'AZ', 'FC Twente'],
  challengers: ['FC Utrecht', 'sc Heerenveen', 'FC Groningen'],
  midfield: ['Sparta Rotterdam', 'Go Ahead Eagles', 'Fortuna Sittard'],
  relegation: ['PEC Zwolle', 'Excelsior', 'Telstar'],
  promoted: ['ADO Den Haag', 'Cambuur Leeuwarden', 'Willem II'],
})

export const compareClubGroupLabels = Object.freeze({
  manual: 'Handmatig', top3: 'Traditionele top 3', europe: 'Europees spelende clubs', challengers: 'Uitdagers', midfield: 'Middenmoot', relegation: 'Degradatiekandidaten', promoted: 'Promovendi',
})

export function resolveCompareClubGroup(group, availableClubs) {
  return (COMPARE_CLUB_GROUPS[group] ?? []).map((wanted) => availableClubs.find((club) => normalizeCanonicalClubName(club) === normalizeCanonicalClubName(wanted)) ?? '')
}

