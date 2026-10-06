export const ELITE_COHORTS = Object.freeze([5, 10, 25, 50, 100, 250, 500, 1000])
export const ELITE_PLAYER_COHORTS = Object.freeze([1, ...ELITE_COHORTS])

export const ELITE_CONFIG = Object.freeze({
  season: '2026/2027',
  leagueId: 292,
  pageSize: 50,
  batchSize: 75,
  minimumEditorialCoverage: 90,
})

export const ELITE_GROUPS = Object.freeze(['#1', ...ELITE_COHORTS.map(size => `Top ${size}`), 'Hele spel'])
export const ELITE_CHIPS = Object.freeze({
  '2capt': 'Dynamisch Duo',
  frush: 'Aanvalluh!!',
  rich: 'Suikeroom',
  wildcard: 'Wildcard',
})

const text = value => String(value ?? '').trim()
const number = value => {
  if (value === null || value === undefined || text(value) === '') return null
  const parsed = Number(text(value).replace('%', '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}
const integer = value => {
  const parsed = number(value)
  return Number.isInteger(parsed) ? parsed : null
}
const boolean = value => value === true || value === 1 || ['true', 'waar', 'ja', '1'].includes(text(value).toLowerCase())
const first = (row, keys) => {
  for (const key of keys) if (text(row?.[key])) return row[key]
  return ''
}

export function exactCohort(entries, size) {
  const limit = integer(size)
  if (!limit || limit < 1) return []
  const seen = new Set()
  return [...(entries ?? [])]
    .sort((a, b) => (number(a.standingIndex ?? a.StandingIndex) ?? Infinity) - (number(b.standingIndex ?? b.StandingIndex) ?? Infinity) || (number(a.rank ?? a.Rank) ?? Infinity) - (number(b.rank ?? b.Rank) ?? Infinity) || text(a.entry ?? a.EntryId).localeCompare(text(b.entry ?? b.EntryId)))
    .filter(entry => {
      const id = text(entry.entry ?? entry.EntryId)
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
    .slice(0, limit)
}

export function eliteCoverage(validTeams, requestedTeams) {
  const valid = Math.max(0, integer(validTeams) ?? 0)
  const requested = Math.max(0, integer(requestedTeams) ?? 0)
  const percentage = requested ? valid / requested * 100 : null
  return {
    validTeams: valid,
    requestedTeams: requested,
    percentage,
    level: percentage === null ? 'onbekend' : percentage >= 98 ? 'hoog' : percentage >= 90 ? 'behoorlijk' : percentage >= 70 ? 'middel' : 'laag',
    usableForEditorial: percentage !== null && percentage >= ELITE_CONFIG.minimumEditorialCoverage,
  }
}

export function normalizeElitePlayerStat(row) {
  const season = text(first(row, ['Seizoen', 'Season', 'season']))
  const gameweek = integer(first(row, ['Gameweek', 'Speelronde', 'gameweek']))
  const cohort = integer(first(row, ['Cohort', 'CohortSize', 'cohort']))
  const playerId = text(first(row, ['SpelerID', 'PlayerId', 'FantasyStudioPlayerId', 'playerId']))
  if (!season || !gameweek || !ELITE_PLAYER_COHORTS.includes(cohort) || !playerId) return null
  const requestedTeams = integer(first(row, ['RequestedTeams', 'AangevraagdeTeams'])) ?? cohort
  const validTeams = integer(first(row, ['ValidTeams', 'GeldigeTeams'])) ?? 0
  const metric = (countKeys, pctKeys) => {
    const count = integer(first(row, countKeys)) ?? 0
    const explicit = number(first(row, pctKeys))
    return { count, percentage: explicit ?? (validTeams ? count / validTeams * 100 : null) }
  }
  return {
    season, gameweek, cohort, playerId,
    espnPlayerId: text(first(row, ['ESPNPlayerId', 'EspnPlayerId'])),
    requestedTeams, validTeams,
    coverage: eliteCoverage(validTeams, requestedTeams),
    selected: metric(['SelectedCount', 'GekozenAantal'], ['SelectedPct', 'GekozenPct']),
    starter: metric(['StarterCount', 'BasisAantal'], ['StarterPct', 'BasisPct']),
    bench: metric(['BenchCount', 'BankAantal'], ['BenchPct', 'BankPct']),
    captain: metric(['CaptainCount', 'CaptainAantal'], ['CaptainPct']),
    vice: metric(['ViceCount', 'ViceAantal'], ['VicePct']),
    bought: metric(['BoughtCount', 'GekochtAantal'], ['BoughtPct', 'GekochtPct']),
    sold: metric(['SoldCount', 'VerkochtAantal'], ['SoldPct', 'VerkochtPct']),
    netTransfers: integer(first(row, ['NetTransfers', 'NettoTransfers'])) ?? 0,
    marketSelectedPercentage: number(first(row, ['MarketSelectedPct', 'MarktGekozenPct'])),
    eliteGapPercentagePoints: number(first(row, ['EliteGapPctPoints', 'EliteVerschilPctPunten'])),
    selectionRank: integer(first(row, ['EliteSelectionRank', 'SelectieRank'])),
    captainRank: integer(first(row, ['CaptainRank'])),
    templateScore: number(first(row, ['TemplateScore', 'EliteScore'])),
  }
}

export function normalizeEliteTransfer(row) {
  const season = text(first(row, ['Seizoen', 'Season']))
  const gameweek = integer(first(row, ['Gameweek', 'Speelronde']))
  const cohort = integer(first(row, ['Cohort']))
  const playerId = text(first(row, ['SpelerID', 'PlayerId', 'FantasyStudioPlayerId']))
  if (!season || !gameweek || !ELITE_COHORTS.includes(cohort) || !playerId) return null
  return {
    season, gameweek, cohort, playerId,
    previousCohortManagers: integer(first(row, ['PreviousCohortManagers'])) ?? 0,
    currentCohortManagers: integer(first(row, ['CurrentCohortManagers'])) ?? 0,
    comparisonManagers: integer(first(row, ['ComparisonManagers'])) ?? 0,
    boughtCount: integer(first(row, ['BoughtCount'])) ?? 0,
    soldCount: integer(first(row, ['SoldCount'])) ?? 0,
    heldCount: integer(first(row, ['HeldCount'])) ?? 0,
    netTransfers: integer(first(row, ['NetTransfers'])) ?? 0,
    ownershipMovement: integer(first(row, ['OwnershipMovement'])) ?? 0,
  }
}

export function createEliteSnapshotKey(snapshot) {
  return [snapshot?.season ?? snapshot?.Seizoen, snapshot?.gameweek ?? snapshot?.Gameweek, snapshot?.entryId ?? snapshot?.EntryId, snapshot?.playerId ?? snapshot?.ESPNPlayerId].map(text).join('|')
}

export function aggregateElitePlayerStats({ snapshots = [], managers = [], players = [], season, gameweek, cohorts = ELITE_COHORTS }) {
  const ranked = exactCohort(managers.filter(manager => text(manager.season ?? manager.Seizoen) === text(season) && integer(manager.gameweek ?? manager.Gameweek) === Number(gameweek)), Math.max(...cohorts))
  const snapshotsByEntry = new Map()
  for (const snapshot of snapshots) {
    if (text(snapshot.season ?? snapshot.Seizoen) !== text(season) || integer(snapshot.gameweek ?? snapshot.Gameweek) !== Number(gameweek)) continue
    const entryId = text(snapshot.entryId ?? snapshot.EntryId)
    if (!snapshotsByEntry.has(entryId)) snapshotsByEntry.set(entryId, [])
    snapshotsByEntry.get(entryId).push(snapshot)
  }
  const marketById = new Map(players.map(player => [text(player.id ?? player.playerId), number(player.selectedByPercent ?? player.ownership)]))
  const result = []
  for (const cohort of cohorts) {
    const requested = exactCohort(ranked, cohort)
    const valid = requested.filter(manager => snapshotsByEntry.has(text(manager.entry ?? manager.EntryId)))
    const counters = new Map()
    for (const manager of valid) {
      for (const pick of snapshotsByEntry.get(text(manager.entry ?? manager.EntryId)) ?? []) {
        const playerId = text(pick.playerId ?? pick.FantasyStudioPlayerId)
        if (!playerId) continue
        const item = counters.get(playerId) ?? { selected: 0, starter: 0, bench: 0, captain: 0, vice: 0 }
        item.selected += 1
        item.starter += Number(pick.multiplier ?? pick.Multiplier) > 0 ? 1 : 0
        item.bench += Number(pick.multiplier ?? pick.Multiplier) === 0 ? 1 : 0
        item.captain += boolean(pick.isCaptain ?? pick.IsCaptain) ? 1 : 0
        item.vice += boolean(pick.isViceCaptain ?? pick.IsViceCaptain) ? 1 : 0
        counters.set(playerId, item)
      }
    }
    const sorted = [...counters.entries()].sort((a, b) => b[1].selected - a[1].selected || a[0].localeCompare(b[0]))
    sorted.forEach(([playerId, counts], index) => {
      const validTeams = valid.length
      const pct = value => validTeams ? value / validTeams * 100 : null
      const market = marketById.get(playerId) ?? null
      result.push({ season, gameweek: Number(gameweek), cohort, playerId, requestedTeams: cohort, validTeams, coverage: eliteCoverage(validTeams, cohort), selected: { count: counts.selected, percentage: pct(counts.selected) }, starter: { count: counts.starter, percentage: pct(counts.starter) }, bench: { count: counts.bench, percentage: pct(counts.bench) }, captain: { count: counts.captain, percentage: pct(counts.captain) }, vice: { count: counts.vice, percentage: pct(counts.vice) }, marketSelectedPercentage: market, eliteGapPercentagePoints: market === null ? null : pct(counts.selected) - market, selectionRank: index + 1 })
    })
  }
  return result
}

export function calculateEliteTransfers({ previousSnapshots = [], currentSnapshots = [], previousManagers = [], currentManagers = [], cohort }) {
  const previous = new Set(exactCohort(previousManagers, cohort).map(manager => text(manager.entry ?? manager.EntryId)))
  const current = new Set(exactCohort(currentManagers, cohort).map(manager => text(manager.entry ?? manager.EntryId)))
  const common = [...previous].filter(id => current.has(id))
  const squads = rows => {
    const map = new Map()
    for (const row of rows) {
      const entry = text(row.entryId ?? row.EntryId); const player = text(row.playerId ?? row.FantasyStudioPlayerId)
      if (!entry || !player) continue
      if (!map.has(entry)) map.set(entry, new Set())
      map.get(entry).add(player)
    }
    return map
  }
  const before = squads(previousSnapshots); const after = squads(currentSnapshots); const totals = new Map()
  for (const entry of common) {
    const oldSquad = before.get(entry) ?? new Set(); const newSquad = after.get(entry) ?? new Set()
    for (const id of new Set([...oldSquad, ...newSquad])) {
      const row = totals.get(id) ?? { playerId: id, boughtCount: 0, soldCount: 0, heldCount: 0 }
      if (!oldSquad.has(id) && newSquad.has(id)) row.boughtCount += 1
      if (oldSquad.has(id) && !newSquad.has(id)) row.soldCount += 1
      if (oldSquad.has(id) && newSquad.has(id)) row.heldCount += 1
      totals.set(id, row)
    }
  }
  return [...totals.values()].map(row => ({ ...row, cohort, comparisonManagers: common.length, previousCohortManagers: previous.size, currentCohortManagers: current.size, netTransfers: row.boughtCount - row.soldCount })).sort((a, b) => b.netTransfers - a.netTransfers || a.playerId.localeCompare(b.playerId))
}

export function selectEliteView(rows, { season = '', gameweek = null, cohort = 100 } = {}) {
  const normalized = (rows ?? []).map(row => row?.coverage ? row : normalizeElitePlayerStat(row)).filter(Boolean)
  const availableRounds = [...new Set(normalized.filter(row => !season || row.season === season).map(row => row.gameweek))].sort((a, b) => a - b)
  const round = Number.isInteger(Number(gameweek)) && Number(gameweek) > 0 ? Number(gameweek) : availableRounds.at(-1) ?? null
  return normalized.filter(row => (!season || row.season === season) && row.gameweek === round && row.cohort === Number(cohort)).sort((a, b) => (b.selected.percentage ?? -Infinity) - (a.selected.percentage ?? -Infinity) || a.playerId.localeCompare(b.playerId))
}

export function createElitePlayerLookup(rows, { season = '', gameweek = null, cohort = 100 } = {}) {
  return new Map(selectEliteView(rows, { season, gameweek, cohort: Number(cohort) }).map(row => [text(row.playerId), row]))
}

export function getEliteRoundStatus(round, chipUsage = [], season = '') {
  const statuses = (chipUsage ?? []).filter(row => {
    const rowSeason = text(row.season ?? row.Seizoen)
    return Number(row.round ?? row.Speelronde) === Number(round) && (!season || rowSeason === season)
  }).map(row => text(row.status ?? row.Status).toLowerCase())
  if (statuses.includes('lopend')) return 'Lopend'
  if (statuses.includes('definitief')) return 'Definitief'
  return 'Locked'
}

export function getAvailableLockedEliteRounds(playerStats, { season = '', chipUsage = [], limit = 2 } = {}) {
  const rounds = [...new Set((playerStats ?? []).map(row => row?.coverage ? row : normalizeElitePlayerStat(row)).filter(Boolean).filter(row => (!season || row.season === season) && row.validTeams > 0).map(row => row.gameweek))].sort((a, b) => a - b)
  return rounds.slice(-Math.max(1, Number(limit) || 2)).map(round => ({ round, status: getEliteRoundStatus(round, chipUsage, season) }))
}

export function isEliteCohortControlVisible(columnGroup) {
  return text(columnGroup).toLowerCase() === 'elite'
}

export function eliteNumericSort(rows, key, direction = 'desc') {
  const sign = direction === 'asc' ? 1 : -1
  return [...(rows ?? [])].sort((left, right) => {
    const a = typeof key === 'function' ? key(left) : left?.[key]
    const b = typeof key === 'function' ? key(right) : right?.[key]
    const av = number(a); const bv = number(b)
    if (av === null && bv === null) return text(left?.playerId).localeCompare(text(right?.playerId))
    if (av === null) return 1
    if (bv === null) return -1
    return (av - bv) * sign || text(left?.playerId).localeCompare(text(right?.playerId))
  })
}

export function chipName(code) {
  const normalized = text(code).toLowerCase()
  if (normalized === 'none') return 'Geen chip'
  return ELITE_CHIPS[normalized] ?? (normalized ? `Onbekende chip (${normalized})` : 'Geen chip')
}

export function chipUsageKey(row) {
  return [row?.season ?? row?.Seizoen, row?.round ?? row?.Speelronde, row?.chipCode ?? row?.ChipCode, row?.group ?? row?.Groep].map(text).join('|')
}

export function normalizeChipUsage(row) {
  const season = text(first(row, ['Seizoen', 'Season']))
  const round = integer(first(row, ['Speelronde', 'Gameweek']))
  const chipCode = text(first(row, ['ChipCode'])).toLowerCase()
  const group = text(first(row, ['Groep']))
  if (!season || !round || !chipCode || !group) return null
  const managers = integer(first(row, ['Managers']))
  const count = Math.max(0, integer(first(row, ['ChipAantal'])) ?? 0)
  const explicitPercentage = number(first(row, ['ChipPercentage']))
  return {
    season, round, status: text(first(row, ['Status'])) || 'Locked', chipCode,
    chip: text(first(row, ['Chip'])) || chipName(chipCode), group, managers, count,
    percentage: explicitPercentage ?? (managers && managers > 0 ? count / managers * 100 : null),
    source: text(first(row, ['Bron'])), updatedAt: text(first(row, ['BijgewerktOp'])),
  }
}

export function normalizeEliteFormation(row) {
  const season = text(first(row, ['Seizoen', 'Season'])), gameweek = integer(first(row, ['Gameweek', 'Speelronde'])), cohort = integer(first(row, ['Cohort'])), formation = text(first(row, ['Formation', 'Formatie']))
  const parts = formation.split('-').map(Number)
  if (!season || !gameweek || !ELITE_PLAYER_COHORTS.includes(cohort) || parts.length !== 3 || parts.reduce((sum, value) => sum + value, 0) !== 10 || parts[0] < 3 || parts[0] > 5 || parts[1] < 2 || parts[1] > 5 || parts[2] < 1 || parts[2] > 3) return null
  return { season, gameweek, cohort, validTeams: integer(first(row, ['ValidTeams'])) ?? 0, formation, count: integer(first(row, ['FormationCount'])) ?? 0, percentage: number(first(row, ['FormationPct'])) }
}

export function normalizeEliteClubExposure(row) {
  const season = text(first(row, ['Seizoen', 'Season'])), gameweek = integer(first(row, ['Gameweek', 'Speelronde'])), cohort = integer(first(row, ['Cohort'])), club = text(first(row, ['Club']))
  if (!season || !gameweek || !ELITE_PLAYER_COHORTS.includes(cohort) || !club) return null
  return { season, gameweek, cohort, club, validTeams: integer(first(row, ['ValidTeams'])) ?? 0, averageSquadPlayers: number(first(row, ['AverageSquadPlayers'])), teamsWith1: { count: integer(first(row, ['TeamsWith1Count'])) ?? 0, percentage: number(first(row, ['TeamsWith1Pct'])) }, teamsWith2: { count: integer(first(row, ['TeamsWith2Count'])) ?? 0, percentage: number(first(row, ['TeamsWith2Pct'])) }, teamsWith3: { count: integer(first(row, ['TeamsWith3Count'])) ?? 0, percentage: number(first(row, ['TeamsWith3Pct'])) }, averageStarters: number(first(row, ['AverageStarters'])) }
}

export function aggregateEliteChipUsage(managers, requestedGroups = ['#1', ...ELITE_COHORTS.map(size => `Top ${size}`)]) {
  const ordered = exactCohort(managers, 1000)
  return requestedGroups.flatMap(group => {
    const size = group === '#1' ? 1 : integer(group.replace(/[^0-9]/g, ''))
    const cohort = exactCohort(ordered, size)
    return [...Object.keys(ELITE_CHIPS), 'none'].map(chipCode => {
      const count = cohort.filter(manager => (text(manager.activeChip ?? manager.ActiveChip).toLowerCase() || 'none') === chipCode).length
      return { group, chipCode, chip: chipName(chipCode), managers: cohort.length, count, percentage: cohort.length ? count / cohort.length * 100 : null, source: 'manager-picks' }
    })
  })
}

export function resolveGlobalChipDenominator(event, { existingUsage = [], currentManagers = null } = {}) {
  const round = integer(event?.id)
  const existing = (existingUsage ?? []).map(row => row?.chipCode ? row : normalizeChipUsage(row)).filter(row => row && row.round === round && row.group === 'Hele spel' && row.managers > 0)
  const frozen = existing[0]?.managers ?? null
  if (event?.finished) return frozen
  const current = integer(currentManagers)
  return current && current > 0 ? current : frozen
}

export function parseGlobalChipPlays(events, { season = ELITE_CONFIG.season, denominatorByRound = {}, existingUsage = [], currentManagers = null } = {}) {
  return (events ?? []).flatMap(event => {
    const round = integer(event.id)
    if (!round) return []
    const counts = new Map()
    for (const play of event.chip_plays ?? []) {
      const code = text(play.chip_name).toLowerCase()
      if (!code) continue
      counts.set(code, (counts.get(code) ?? 0) + Math.max(0, integer(play.num_played) ?? 0))
    }
    const configured = integer(denominatorByRound[round])
    const denominator = configured && configured > 0 ? configured : resolveGlobalChipDenominator(event, { existingUsage, currentManagers })
    const status = event.finished ? 'Definitief' : event.is_current ? 'Lopend' : 'Locked'
    return [...counts].map(([chipCode, count]) => ({ season, round, status, chipCode, chip: chipName(chipCode), group: 'Hele spel', managers: denominator, count, percentage: denominator ? count / denominator * 100 : null, source: 'bootstrap' }))
  })
}

export function formatEliteMetric(metric, denominator) {
  if (!metric || metric.percentage === null || !Number.isFinite(metric.percentage)) return '—'
  return `${metric.count} / ${denominator} · ${metric.percentage.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%`
}
