// Persist identity and user choices, not derived profiles containing repeated
// match histories. The optimizer resolves these IDs against current profiles.
const playerFields = ['id', 'playerId', 'name', 'club', 'season', 'position', 'fantasyPosition', 'currentPrice', 'endPrice', 'startPrice', 'price']
function compactPlayer(player) {
  if (!player || typeof player !== 'object') return player
  return Object.fromEntries(playerFields.filter(key => Object.hasOwn(player, key)).map(key => [key, player[key]]))
}
function compactRecord(record) {
  return {
    ...record,
    ...(record.player ? { player: compactPlayer(record.player) } : {}),
    ...(Array.isArray(record.matches) ? { matches: record.matches.map(compactPlayer) } : {}),
  }
}
export function compactManagerImport(result) {
  if (!result) return result
  const copy = { ...result }
  for (const key of ['players', 'matchedPlayers', 'unmatchedPlayers', 'ambiguousPlayers']) {
    if (Array.isArray(result[key])) copy[key] = result[key].map(compactRecord)
  }
  return copy
}
