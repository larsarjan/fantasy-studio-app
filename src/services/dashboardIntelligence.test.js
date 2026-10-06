import assert from 'node:assert/strict'
import { buildDashboardIntelligence, buildDashboardLiveSummary, buildDashboardRoundStatus, formatDashboardDeadlineStatus } from './dashboardIntelligence.js'
import { formatDashboardFixtureMoment, renderDashboardMarketBlock } from '../modules/dashboard.js'

const season = '2026/2027'
const fixtures = [
  { id: 'f1', season, round: 3, home: 'Ajax', away: 'PSV', date: '2026-08-22', time: '18:45' },
  { id: 'f2', season, round: 3, home: 'Feyenoord', away: 'Utrecht', date: '2026-08-23', time: '14:30' },
]
const result1 = { id: 'r1', season, round: 3, home: 'Ajax', away: 'PSV', homeScore: 2, awayScore: 1 }
const result2 = { id: 'r2', season, round: 3, home: 'Feyenoord', away: 'Utrecht', homeScore: 1, awayScore: 1 }

assert.equal(buildDashboardRoundStatus({ season, round: 3, fixtures, results: [] }).status, 'Vooruitblik')
const running = buildDashboardRoundStatus({ season, round: 3, fixtures, results: [result1] })
assert.equal(running.status, 'Lopend')
assert.equal(running.playedMatches, 1)
assert.equal(running.remainingMatches, 1)
assert.equal(buildDashboardRoundStatus({ season, round: 3, fixtures, results: [result1, result2] }).status, 'Definitief')
assert.equal(buildDashboardRoundStatus({ season, round: 3, fixtures, results: [], playerMatchStats: [{ season, round: 3, fixtureId: 'f1', matchStatus: true }] }).status, 'Lopend')

const players = [
  { id: '1', name: 'Captain', club: 'Ajax', position: 'MID', season, endPrice: 10, selectedPct: 25 },
  { id: '2', name: 'Koop', club: 'PSV', position: 'MID', season, endPrice: 7, selectedPct: 8 },
  { id: '3', name: 'Risico', club: 'Utrecht', position: 'DEF', season, endPrice: 8, selectedPct: 20 },
  { id: '4', name: 'Differential', club: 'Feyenoord', position: 'FWD', season, endPrice: 6, selectedPct: 4 },
  { id: '5', name: 'Alternatief', club: 'Ajax', position: 'MID', season, endPrice: 6, selectedPct: 5 },
]
const analysis = {
  players: [
    { ...players[1], price: 7, expectedPoints: 18, expectedMinutes: 250, buyScore: 88, club: 'PSV' },
    { ...players[2], price: 8, expectedPoints: 5, expectedMinutes: 35, cautionScore: 82, club: 'Utrecht' },
    { ...players[0], price: 10, expectedPoints: 20, expectedMinutes: 260, club: 'Ajax' },
    { ...players[3], price: 6, expectedPoints: 16, expectedMinutes: 240, club: 'Feyenoord' },
  ],
  clubs: [
    { club: 'Ajax', score: 80 }, { club: 'PSV', score: 78 },
    { club: 'Feyenoord', score: 65 }, { club: 'Utrecht', score: 50 },
  ],
  actionGroups: {
    buy: [{ ...players[1], price: 7, expectedPoints: 18, expectedMinutes: 250, buyScore: 88 }],
    sell: [{ ...players[2], price: 8, expectedPoints: 5, expectedMinutes: 35, cautionScore: 82 }],
  },
  underRadar: [],
  playerMovers: [],
  trends: [],
}
const captainRadar = {
  recommendations: {
    bestCaptain: { ...players[0], currentPrice: 10, expectedPoints: 9, expectedMinutes: 88, radarScore: 91, reasons: ['Hoogste bestaande Captain Radar-score.'] },
    viceCaptain: { ...players[1], currentPrice: 7, expectedPoints: 8, expectedMinutes: 86, radarScore: 85 },
  },
}
const differentialAnalysis = {
  heroes: { best: { ...players[3], price: 6, expectedPoints: 8, expectedMinutes: 84, ownership: 4, edgeScore: 79 } },
}
const elitePlayerStats = [
  { season, gameweek: 2, cohort: 100, playerId: '1', validTeams: 100, coverage: { usableForEditorial: true }, selected: { count: 80, percentage: 80 }, eliteGapPercentagePoints: 10 },
  { season, gameweek: 3, cohort: 100, playerId: '2', validTeams: 100, coverage: { usableForEditorial: true }, selected: { count: 70, percentage: 70 }, eliteGapPercentagePoints: 25 },
]
const eliteTransfers = [
  { season, gameweek: 3, cohort: 100, playerId: '2', netTransfers: 20, boughtCount: 25, soldCount: 5 },
  { season, gameweek: 3, cohort: 100, playerId: '3', netTransfers: -18, boughtCount: 1, soldCount: 19 },
]
const chipUsage = [
  { season, round: 3, status: 'Lopend', group: 'Top 100', chipCode: 'rich', chip: 'Suikeroom', percentage: 16 },
  { season, round: 3, status: 'Lopend', group: 'Hele spel', chipCode: 'rich', chip: 'Suikeroom', percentage: 12.9 },
]
const playerMatchStats = [{ season, round: 3, fixtureId: 'f1', playerId: '1', matchStatus: true, minutes: 90, goals: 1, assists: 1, optaBonus: 3 }]

const inputs = { players, fixtures, results: [result1], analysis, captainRadar, differentialAnalysis, elitePlayerStats, eliteTransfers, chipUsage, playerMatchStats, season, round: 3 }
const snapshot = JSON.stringify(inputs)
const dashboard = buildDashboardIntelligence(inputs)

assert.equal(dashboard.roundStatus.status, 'Lopend')
assert.equal(dashboard.cards.captain.playerId, '1')
assert.equal(dashboard.cards.captain.score, 91)
assert.equal(dashboard.cards.buy.playerId, '2')
assert.equal(dashboard.cards.warning.playerId, '3')
assert.equal(dashboard.cards.differential.playerId, '4')
assert.equal(dashboard.elite.round, 3)
assert.equal(dashboard.elite.cohort, 100)
assert.equal(dashboard.elite.status, 'Lopend')
assert.equal(dashboard.live.provisional, true)
assert.equal(dashboard.live.performers[0].playerId, '1')
assert.equal(dashboard.live.performers[0].fantasyPoints, 13)
assert.equal(dashboard.chipSignal.relevant, true)
assert.equal(JSON.stringify(inputs), snapshot)

const noOptionalData = buildDashboardIntelligence({
  players, fixtures, results: [], analysis, captainRadar, differentialAnalysis,
  elitePlayerStats: [], eliteTransfers: [], chipUsage: [], playerMatchStats: [], season, round: 3,
})
assert.equal(noOptionalData.roundStatus.status, 'Vooruitblik')
assert.equal(noOptionalData.elite.available, false)
assert.equal(noOptionalData.live, null)
assert.equal(noOptionalData.chipSignal.relevant, false)

const finalDashboard = buildDashboardIntelligence({ ...inputs, results: [result1, result2] })
assert.equal(finalDashboard.roundStatus.status, 'Definitief')
assert.equal(finalDashboard.live.provisional, false)

const emptyDashboard = buildDashboardIntelligence({
  players: [], fixtures: [], results: [], teamRatings: [], elitePlayerStats: [], eliteTransfers: [], chipUsage: [], playerMatchStats: [],
  analysis: { players: [], clubs: [], actionGroups: {}, underRadar: [], playerMovers: [], trends: [] },
  captainRadar: { recommendations: {} }, differentialAnalysis: { heroes: {} }, season, round: 1,
})
assert.equal(emptyDashboard.roundStatus.status, 'Vooruitblik')
assert.equal(emptyDashboard.cards.captain, null)
assert.equal(emptyDashboard.fixtureSpotlight, null)

const live = buildDashboardLiveSummary({
  playerMatchStats: [
    { season, round: 3, fixtureId: 'f1', playerId: '1', matchStatus: true, minutes: 90, goals: 1 },
    { season, round: 3, fixtureId: 'f2', playerId: '1', matchStatus: true, minutes: 30, assists: 1 },
    { season, round: 3, fixtureId: 'f1', playerId: '2', matchStatus: true, minutes: 0 },
    { season, round: 3, fixtureId: 'f1', playerId: 'missing', matchStatus: true, minutes: 90 },
  ],
  playersById: new Map(players.map(player => [player.id, player])), fixtures, season, round: 3, status: 'Lopend',
})
assert.equal(live.performers[0].playerId, '1')
assert.equal(live.performers[0].fantasyPoints, 11)
assert.equal(live.performers[0].minutes, 120)
assert.equal(live.performers[0].fixtures, 2)
assert.equal(live.performers.find(item => item.playerId === '2').fantasyPoints, 0)
assert.equal(live.performers.some(item => item.playerId === 'missing'), false)
assert.equal(Number.isNaN(live.performers[0].fantasyPoints), false)
const tiedLive = buildDashboardLiveSummary({
  playerMatchStats: [
    { season, round: 3, fixtureId: 'f1', playerId: '2', matchStatus: true, minutes: 0 },
    { season, round: 3, fixtureId: 'f1', playerId: '1', matchStatus: true, minutes: 0 },
  ],
  playersById: new Map(players.map(player => [player.id, player])), fixtures, season, round: 3, status: 'Definitief',
})
assert.deepEqual(tiedLive.performers.map(item => item.playerId), ['1', '2'])

const deduplicated = buildDashboardIntelligence({
  ...inputs,
  analysis: {
    ...analysis,
    actionGroups: {
      buy: [
        { ...players[0], buyScore: 95, expectedPoints: 20 },
        { ...players[1], buyScore: 90, expectedPoints: 18 },
      ],
      sell: [
        { ...players[1], cautionScore: 90, expectedMinutes: 30 },
        { ...players[2], cautionScore: 85, expectedMinutes: 35 },
        { ...players[4], cautionScore: 80, expectedMinutes: 40 },
      ],
    },
  },
  differentialAnalysis: { heroes: { best: { ...players[2], ownership: 4, edgeScore: 85 }, safe: { ...players[3], ownership: 5, edgeScore: 80 } } },
})
assert.deepEqual(
  [deduplicated.cards.captain.playerId, deduplicated.cards.buy.playerId, deduplicated.cards.sell.playerId, deduplicated.cards.differential.playerId, deduplicated.elite.signal.row.playerId, deduplicated.cards.warning.playerId],
  ['1', '1', '2', '3', '2', '5'],
)
assert.equal(deduplicated.cards.captain.playerId, deduplicated.cards.buy.playerId, 'Captain en Beste aankoop mogen dezelfde speler zijn')

const duplicateFallback = buildDashboardIntelligence({ ...inputs, analysis: { ...analysis, actionGroups: { ...analysis.actionGroups, sell: [analysis.actionGroups.sell[0]] } } })
assert.equal(duplicateFallback.cards.sell.playerId, '3')
assert.equal(duplicateFallback.cards.warning.playerId, '3')

const emptyMarketHtml = renderDashboardMarketBlock({ market: { rise: null, fall: null }, elite: { available: false } })
assert.equal((emptyMarketHtml.match(/Nog onvoldoende historische marktbewegingen/g) ?? []).length, 1)
assert.equal(emptyMarketHtml.includes('Geen betrouwbaar signaal'), false)
assert.equal(formatDashboardDeadlineStatus('Locked'), 'vergrendeld')
assert.equal(formatDashboardDeadlineStatus('Lopend'), 'vergrendeld')
assert.equal(formatDashboardDeadlineStatus('Definitief'), 'definitief')
assert.equal(dashboard.elite.deadlineLabel, 'Deadline SR3 · vergrendeld')
assert.equal(dashboard.chipSignal.deadlineLabel, 'Deadline SR3 · vergrendeld')
assert.match(formatDashboardFixtureMoment(fixtures[0]), /22 aug/)
assert.match(formatDashboardFixtureMoment(fixtures[0]), /18:45 uur/)
assert.equal(formatDashboardFixtureMoment({}), '')

console.log('Dashboard Intelligence-tests geslaagd.')
