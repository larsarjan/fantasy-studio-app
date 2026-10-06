function validRound(value) {
  const round = Number(value)
  return Number.isInteger(round) && round > 0 ? round : null
}

export function getLatestProcessedRound(items = [], season = '') {
  return items.reduce((latest, item) => {
    if (season && item?.season !== season) return latest
    const round = validRound(item?.round)
    return round === null ? latest : Math.max(latest, round)
  }, 0) || ''
}

export function compareResultsChronologically(left, right, fixtures = []) {
  const fixtureFor = (result) => fixtures.find((fixture) =>
    fixture?.season === result?.season && fixture?.home === result?.home &&
    fixture?.away === result?.away && (!result?.round || Number(fixture?.round) === Number(result.round)),
  )
  const timestamp = (result) => {
    const fixture = fixtureFor(result)
    return `${result?.date || fixture?.date || ''}T${fixture?.time || '00:00'}`
  }
  return timestamp(left).localeCompare(timestamp(right)) ||
    String(left?.home ?? '').localeCompare(String(right?.home ?? ''), 'nl')
}

export function filterEliteLineupRows(rows = [], profiles = new Map(), search = '', club = '') {
  const query = String(search ?? '').trim().toLocaleLowerCase('nl')
  return rows.filter((row) => {
    const player = profiles.get(String(row?.playerId))
    const name = String(player?.name ?? row?.playerId ?? '').toLocaleLowerCase('nl')
    return (!query || name.includes(query)) && (!club || player?.club === club)
  })
}

export function getHistoryPlayerProfileId(player) {
  const id = player?.id
  if (id === null || id === undefined || !String(id).trim()) return ''
  return String(id)
}
