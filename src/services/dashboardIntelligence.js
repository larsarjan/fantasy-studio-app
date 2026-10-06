import {
  getChipUsage,
  getElitePlayerStats,
  getEliteTransfers,
  getFixtures,
  getPlayerMatchStats,
  getPlayerProfiles,
  getResults,
  getSyncStatus,
  getTeamRatings,
} from './database.js'
import { buildAnalysis } from './analysisEngine.js'
import { buildCaptainRadar } from './captainRadarEngine.js'
import { buildDifferentialAnalysis } from './differentialEngine.js'
import { getEliteRoundStatus, selectEliteView } from './eliteManagerIntelligence.js'
import { canonicalClubKey, finite, getIntelligenceRound, text } from './intelligenceHelpers.js'
import { buildPlayerMatch } from './playerMatchStatsEngine.js'

const STANDARD_HORIZON = 3

function sameFixture(result, fixture) {
  return Number(result?.round) === Number(fixture?.round) &&
    canonicalClubKey(result?.home) === canonicalClubKey(fixture?.home) &&
    canonicalClubKey(result?.away) === canonicalClubKey(fixture?.away)
}

function fixtureTimestamp(fixture) {
  const value = `${text(fixture?.date)}T${text(fixture?.time) || '00:00'}`
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Infinity
}

export function buildDashboardRoundStatus({ season, round, fixtures = [], results = [], playerMatchStats = [] } = {}) {
  const roundFixtures = fixtures.filter(fixture =>
    (!season || text(fixture.season) === text(season)) && Number(fixture.round) === Number(round))
  const seasonResults = results.filter(result => !season || text(result.season) === text(season))
  const playedFixtureIds = new Set(playerMatchStats.filter(row =>
    row?.matchStatus === true && (!season || text(row.season) === text(season)) && Number(row.round) === Number(round),
  ).map(row => text(row.fixtureId)).filter(Boolean))
  const played = roundFixtures.filter(fixture =>
    seasonResults.some(result => sameFixture(result, fixture)) || playedFixtureIds.has(text(fixture.id)))
  const remaining = roundFixtures.filter(fixture => !played.includes(fixture))
  const status = !roundFixtures.length || !played.length
    ? 'Vooruitblik'
    : remaining.length
      ? 'Lopend'
      : 'Definitief'
  return {
    season,
    round: Number(round) || 0,
    status,
    totalMatches: roundFixtures.length,
    playedMatches: played.length,
    remainingMatches: remaining.length,
    nextFixture: [...remaining].sort((a, b) => fixtureTimestamp(a) - fixtureTimestamp(b) || text(a.id).localeCompare(text(b.id), 'nl'))[0] ?? null,
    fixtures: roundFixtures,
    playedFixtures: played,
  }
}

const sortBy = key => (left, right) => finite(right?.[key], -Infinity) - finite(left?.[key], -Infinity) || text(left?.id).localeCompare(text(right?.id), 'nl')

export function formatDashboardDeadlineStatus(status) {
  return text(status).toLowerCase() === 'definitief' ? 'definitief' : 'vergrendeld'
}

function playerIdentity(value) {
  return text(value?.playerId ?? value?.id ?? value?.row?.playerId ?? value?.row?.id)
}

function distinctCandidates(values = []) {
  const seen = new Set()
  return values.filter(value => {
    const id = playerIdentity(value)
    if (!value || !id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function selectCardCandidate(candidates, usedPlayers) {
  const available = distinctCandidates(candidates)
  const selected = available.find(candidate => !usedPlayers.has(playerIdentity(candidate))) ?? available[0] ?? null
  const id = playerIdentity(selected)
  if (id) usedPlayers.add(id)
  return selected
}

function playerCard(player, extra = {}) {
  if (!player) return null
  return {
    playerId: text(player.id ?? player.playerId),
    name: text(player.name ?? player.playerName),
    club: text(player.club),
    price: Number.isFinite(Number(player.price ?? player.currentPrice ?? player.endPrice)) ? Number(player.price ?? player.currentPrice ?? player.endPrice) : null,
    expectedPoints: Number.isFinite(Number(player.expectedPoints)) ? Number(player.expectedPoints) : null,
    expectedMinutes: Number.isFinite(Number(player.expectedMinutes)) ? Number(player.expectedMinutes) : null,
    ownership: player.ownership === null || player.ownership === undefined ? null : Number(player.ownership ?? player.selectedPct),
    ...extra,
  }
}

function buildEliteSummary({ elitePlayerStats, eliteTransfers, chipUsage, season, playersById }) {
  const rows = selectEliteView(elitePlayerStats, { season, cohort: 100 })
  if (!rows.length || !rows.some(row => row.validTeams > 0 && row.coverage?.usableForEditorial !== false)) {
    return { available: false, cohort: 100, round: null, status: null }
  }
  const round = rows[0].gameweek
  const status = getEliteRoundStatus(round, chipUsage, season)
  const usableRows = rows.filter(row => row.validTeams > 0 && row.coverage?.usableForEditorial !== false)
  const transfers = (eliteTransfers ?? []).filter(row => row.season === season && row.gameweek === round && row.cohort === 100)
  const mostSelected = usableRows[0] ?? null
  const biggestBuy = [...transfers].sort((a, b) => b.netTransfers - a.netTransfers || text(a.playerId).localeCompare(text(b.playerId), 'nl'))[0] ?? null
  const biggestSale = [...transfers].sort((a, b) => a.netTransfers - b.netTransfers || text(a.playerId).localeCompare(text(b.playerId), 'nl'))[0] ?? null
  const biggestGap = [...usableRows].filter(row => Number.isFinite(row.eliteGapPercentagePoints)).sort((a, b) => Math.abs(b.eliteGapPercentagePoints) - Math.abs(a.eliteGapPercentagePoints) || text(a.playerId).localeCompare(text(b.playerId), 'nl'))[0] ?? null
  const candidates = [
    biggestBuy && { type: 'buy', strength: Math.abs(biggestBuy.netTransfers), row: biggestBuy, title: 'Sterke netto aankoop' },
    biggestSale && { type: 'sale', strength: Math.abs(biggestSale.netTransfers), row: biggestSale, title: 'Opvallende netto verkoop' },
    biggestGap && { type: 'gap', strength: Math.abs(biggestGap.eliteGapPercentagePoints), row: biggestGap, title: 'Groot verschil met de markt' },
  ].filter(Boolean).sort((a, b) => b.strength - a.strength)
  const signal = candidates[0] ?? null
  const enrich = row => row ? { ...row, player: playersById.get(text(row.playerId)) ?? null } : null
  const signals = candidates.map(candidate => ({ ...candidate, row: enrich(candidate.row) }))
  return {
    available: true,
    cohort: 100,
    round,
    status,
    deadlineStatus: formatDashboardDeadlineStatus(status),
    deadlineLabel: `Deadline SR${round} · ${formatDashboardDeadlineStatus(status)}`,
    signal: signal ? { ...signal, row: enrich(signal.row) } : null,
    signals,
    mostSelected: enrich(mostSelected),
    biggestBuy: enrich(biggestBuy),
    biggestSale: enrich(biggestSale),
    biggestGap: enrich(biggestGap),
  }
}

function buildChipSignal(chipUsage, season, round) {
  const rows = (chipUsage ?? []).filter(row => row.season === season && Number(row.round) === Number(round))
  const top = rows.filter(row => row.group === 'Top 100' && Number.isFinite(row.percentage))
  const globalByChip = new Map(rows.filter(row => row.group === 'Hele spel' && Number.isFinite(row.percentage)).map(row => [row.chipCode, row]))
  const comparisons = top.map(row => {
    const global = globalByChip.get(row.chipCode)
    return global ? { chip: row.chip, chipCode: row.chipCode, topPercentage: row.percentage, globalPercentage: global.percentage, difference: row.percentage - global.percentage, status: row.status || global.status } : null
  }).filter(Boolean).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || text(a.chipCode).localeCompare(text(b.chipCode), 'nl'))
  const signal = comparisons.find(item => Math.abs(item.difference) >= 3 || item.topPercentage >= 10) ?? null
  return signal
    ? { relevant: true, round, ...signal, deadlineStatus: formatDashboardDeadlineStatus(signal.status), deadlineLabel: `Deadline SR${round} · ${formatDashboardDeadlineStatus(signal.status)}` }
    : { relevant: false, round, message: 'Geen sterk chipsignaal deze ronde.' }
}

function buildFixtureSpotlight(roundStatus, analysis) {
  const clubs = new Map((analysis?.clubs ?? []).map(club => [canonicalClubKey(club.club), club]))
  const players = analysis?.players ?? []
  const options = roundStatus.fixtures.map(fixture => {
    const home = clubs.get(canonicalClubKey(fixture.home))
    const away = clubs.get(canonicalClubKey(fixture.away))
    const assets = players.filter(player => [canonicalClubKey(fixture.home), canonicalClubKey(fixture.away)].includes(canonicalClubKey(player.club))).sort(sortBy('expectedPoints')).slice(0, 4)
    const score = finite(home?.score, 0) + finite(away?.score, 0) + assets.reduce((sum, player) => sum + finite(player.expectedPoints), 0)
    return { fixture, score, assets }
  }).sort((a, b) => b.score - a.score || text(a.fixture.id).localeCompare(text(b.fixture.id), 'nl'))
  const selected = options[0]
  if (!selected) return null
  return {
    ...selected.fixture,
    score: selected.score,
    players: selected.assets.map(player => playerCard(player)),
    reason: selected.assets.length ? 'Deze wedstrijd combineert de meeste relevante geprojecteerde Fantasy-opties.' : 'Deze wedstrijd heeft binnen de beschikbare fixturedata het sterkste gezamenlijke profiel.',
  }
}

export function buildDashboardLiveSummary({ playerMatchStats, playersById, fixtures = [], season, round, status }) {
  if (status !== 'Lopend' && status !== 'Definitief') return null
  const rows = (playerMatchStats ?? []).filter(row => row.matchStatus === true && row.season === season && Number(row.round) === Number(round))
  if (!rows.length) return null
  const fixturesById = new Map(fixtures.map(fixture => [text(fixture.id), fixture]))
  const totals = new Map()
  rows.forEach(row => {
    const playerId = text(row.playerId)
    const player = playersById.get(playerId) ?? null
    if (!player) return
    const match = buildPlayerMatch({ player, matchStat: row, fixture: fixturesById.get(text(row.fixtureId)) ?? null })
    const current = totals.get(playerId) ?? { playerId, player, fantasyPoints: 0, minutes: 0, fixtures: 0 }
    current.fantasyPoints += finite(match?.punten?.totaal)
    current.minutes += finite(match?.minutes)
    current.fixtures += 1
    totals.set(playerId, current)
  })
  const performers = [...totals.values()]
    .sort((a, b) => b.fantasyPoints - a.fantasyPoints || b.minutes - a.minutes || text(a.playerId).localeCompare(text(b.playerId), 'nl'))
    .slice(0, 5)
  return { provisional: status !== 'Definitief', rows: rows.length, performers }
}

export function buildDashboardIntelligence(options = {}) {
  const players = options.players ?? getPlayerProfiles()
  const fixtures = options.fixtures ?? getFixtures()
  const results = options.results ?? getResults()
  const teamRatings = options.teamRatings ?? getTeamRatings()
  const elitePlayerStats = options.elitePlayerStats ?? getElitePlayerStats()
  const eliteTransfers = options.eliteTransfers ?? getEliteTransfers()
  const chipUsage = options.chipUsage ?? getChipUsage()
  const playerMatchStats = options.playerMatchStats ?? getPlayerMatchStats()
  const season = text(options.season) || text(players[0]?.season) || text(fixtures[0]?.season)
  const round = Number(options.round) || getIntelligenceRound(season, fixtures, results)
  const roundStatus = buildDashboardRoundStatus({ season, round, fixtures, results, playerMatchStats })
  const analysis = options.analysis ?? buildAnalysis({ season, startRound: round, horizon: STANDARD_HORIZON, players, fixtures, results, teamRatings })
  const captainRadar = options.captainRadar ?? buildCaptainRadar({ season, round, players, fixtures, results, teamRatings, syncVersion: options.syncVersion ?? getSyncStatus()?.lastSync })
  const differentialAnalysis = options.differentialAnalysis ?? buildDifferentialAnalysis({ season, startRound: round, horizon: STANDARD_HORIZON, players, fixtures, results, teamRatings })
  const playersById = new Map(players.map(player => [text(player.id), player]))

  const buyCandidates = [...(analysis?.actionGroups?.buy ?? [])].sort(sortBy('buyScore'))
  const sellCandidates = [...(analysis?.actionGroups?.sell ?? [])].sort(sortBy('cautionScore'))
  const captainCandidates = distinctCandidates([captainRadar?.recommendations?.bestCaptain, captainRadar?.recommendations?.safestCaptain, captainRadar?.recommendations?.differentialCaptain, captainRadar?.recommendations?.viceCaptain])
  const captainAlternative = captainRadar?.recommendations?.viceCaptain ?? captainRadar?.recommendations?.safestCaptain ?? null
  const elite = buildEliteSummary({ elitePlayerStats, eliteTransfers, chipUsage, season, playersById })
  const differentialCandidates = distinctCandidates([differentialAnalysis?.heroes?.best, differentialAnalysis?.heroes?.safe, differentialAnalysis?.heroes?.budget, ...(analysis?.underRadar ?? [])])
  const usedPlayers = new Set()
  const captain = selectCardCandidate(captainCandidates, usedPlayers)
  const buy = distinctCandidates(buyCandidates)[0] ?? null
  const buyId = playerIdentity(buy)
  if (buyId) usedPlayers.add(buyId)
  const sell = selectCardCandidate(sellCandidates, usedPlayers)
  const differential = selectCardCandidate(differentialCandidates, usedPlayers)
  const eliteSignal = selectCardCandidate(elite.signals ?? [], usedPlayers)
  if (eliteSignal) elite.signal = eliteSignal
  const warning = selectCardCandidate(sellCandidates.filter(candidate => finite(candidate.cautionScore) >= 62), usedPlayers)
  const cards = {
    captain: playerCard(captain, { score: captain?.radarScore ?? null, reason: captain?.reasons?.[0] ?? 'Beste bestaande Captain Radar-score.', alternative: playerCard(captainAlternative) }),
    buy: playerCard(buy, { score: buy?.buyScore ?? null, reason: buy?.purchaseReason || (buy ? `${finite(buy.expectedPoints)} xP over de komende ${STANDARD_HORIZON} speelrondes.` : '') }),
    sell: playerCard(sell, { score: sell?.cautionScore ?? null, reason: sell ? (sell.expectedMinutes < 60 ? 'Minutenverwachting en speelzekerheid vragen aandacht.' : 'Het bestaande risicoprofiel is ongunstiger dan de marktpositie.') : 'Geen sterk verkoopsignaal; vasthouden blijft verdedigbaar.' }),
    differential: playerCard(differential, { score: differential?.edgeScore ?? differential?.underRadarScore ?? null, reason: differential ? 'Lage populariteit gecombineerd met een sterke bestaande projectie.' : '' }),
    elite: elite.signal,
    warning: playerCard(warning, { score: warning?.cautionScore ?? null, reason: warning ? 'Sterkste betrouwbare combinatie van minuten-, beschikbaarheids- en projectierisico.' : '' }),
  }

  const actions = [
    cards.buy && { type: 'buy', label: `Overweeg ${cards.buy.name} te kopen`, screen: 'analysis' },
    cards.captain && { type: 'captain', label: `Captain ${cards.captain.name}`, screen: 'captain' },
    cards.warning && { type: 'warning', label: `Controleer het risico rond ${cards.warning.name}`, screen: 'players' },
  ].filter(Boolean).slice(0, 3)

  const movers = analysis?.playerMovers ?? []
  const market = {
    rise: movers.find(item => item.score > 0) ?? analysis?.trends?.find(item => item.delta > 0) ?? null,
    fall: movers.find(item => item.score < 0) ?? analysis?.trends?.find(item => item.delta < 0) ?? null,
  }

  return {
    season,
    round,
    horizon: STANDARD_HORIZON,
    roundStatus,
    cards,
    actions,
    market,
    elite,
    fixtureSpotlight: buildFixtureSpotlight(roundStatus, analysis),
    chipSignal: buildChipSignal(chipUsage, season, round),
    live: buildDashboardLiveSummary({ playerMatchStats, playersById, fixtures, season, round, status: roundStatus.status }),
    generatedAt: new Date().toISOString(),
  }
}
