// The result screen uses identity, projections and aggregates. Match-by-match
// histories stay in the main-thread database; do not return them in every
// lineup, transfer and season-plan copy of the same player.
export function compactOptimizerResult(value, seen = new WeakMap()) {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  const copy = Array.isArray(value) ? [] : {}
  seen.set(value, copy)
  const player = value.id != null && value.name != null && (value.position != null || value.fantasyPosition != null)
  const matchProfile = value.spelerId != null && value.statistieken != null && value.samenvatting != null
  for (const [key, item] of Object.entries(value)) {
    if (player && ['matchHistory', 'recentMatches'].includes(key)) continue
    if (matchProfile && ['wedstrijden', 'recenteWedstrijden', 'matches', 'recentMatches'].includes(key)) continue
    copy[key] = compactOptimizerResult(item, seen)
  }
  return copy
}
