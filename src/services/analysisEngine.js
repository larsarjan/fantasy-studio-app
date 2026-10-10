import { getPlayerMatchHistory } from './playerMatchStatsEngine.js'
import { buildPlayerIntelligence, canonicalClubKey, canonicalClubName, clamp, createIntelligenceContext, finite, getPlayerHorizonProjection, mean, percentile, rankDeterministic, round, text } from './intelligenceHelpers.js'
import { buildStructuralFixtureIntelligence } from './structuralFixtureIntelligence.js'
import { buildCompositeStories, selectEditorialStories } from './editorialIntelligence.js'
import { normalizePosition } from './positionNormalization.js'
import { availabilityPolicy, availabilityVersion } from './availability.js'

export const ANALYSIS_CONFIG = Object.freeze({
  talkingPointWeights: Object.freeze({ signal: .30, relevance: .25, surprise: .20, confidence: .15, recency: .10 }),
  thresholds: Object.freeze({ lowOwnership: 10, strongQuality: 65, fixtureSwing: 15, minutesMove: 18, insightMinimum: 58, opponentMinimumMatches: 3, radarMinimum: 67, overvaluedMinimum: 62 }),
})

// Gekalibreerd voor Strict B: fixturekwaliteit telt uitsluitend via de xP-projecties mee.
export const PURCHASE_ACTION_THRESHOLDS = Object.freeze({
  buyScore: 72,
  buyAvailability: 72,
  buyReliability: 65,
  considerScore: 63,
  considerAvailability: 60,
})

const cache = new Map()
const confidence = ({ sample = 0, availability = 0, horizon = 3, missing = 0 }) => {
  const score = clamp(sample * 8 + availability * .55 + (horizon === 1 ? 15 : horizon === 3 ? 8 : 0) - missing * 15)
  return { score: round(score), level: score >= 72 ? 'hoog' : score >= 45 ? 'middel' : 'laag' }
}

export function calculateTalkingPointScore(input, config = ANALYSIS_CONFIG) {
  const scores = { signal: clamp(input.signal), relevance: clamp(input.relevance), surprise: clamp(input.surprise), confidence: clamp(input.confidence), recency: clamp(input.recency) }
  const breakdown = Object.fromEntries(Object.entries(config.talkingPointWeights).map(([key, weight]) => [key, { score: round(scores[key]), weight, contribution: round(scores[key] * weight, 2) }]))
  return { score: round(clamp(Object.values(breakdown).reduce((sum, item) => sum + item.contribution, 0))), breakdown }
}

export const calculateSurpriseScore = ({ qualityPercentile, ownershipPercentile, fixtureSwing = 0, minutesDelta = 0, valuePercentile = 50 }) => round(clamp(Math.abs(finite(qualityPercentile) - finite(ownershipPercentile)) * .55 + Math.abs(finite(fixtureSwing)) * .8 + Math.abs(finite(minutesDelta)) * .35 + Math.abs(finite(valuePercentile) - 50) * .25))

export const classifyFixtureSwing = (delta, threshold = ANALYSIS_CONFIG.thresholds.fixtureSwing) => finite(delta) >= threshold ? 'positive' : finite(delta) <= -threshold ? 'negative' : 'stable'
export const sortUpcomingFixtureSwings = (items) => [...items].sort((a,b)=>finite(a.startRound)-finite(b.startRound)||Math.abs(finite(b.delta))-Math.abs(finite(a.delta))||text(a.club).localeCompare(text(b.club),'nl'))
export const formatPremiumComparison = ({ priceDifference, xpDifference }) => `€ ${round(Math.abs(priceDifference))} mln duurder · ${round(Math.abs(xpDifference))} xP ${xpDifference >= 0 ? 'extra' : 'minder'}`

export function calculateMarketScores(player, population) {
  const perFixture = (p) => p.fixtureCount ? p.expectedPoints / p.fixtureCount : 0
  const quality = percentile(population.map(perFixture), perFixture(player))
  const owned = player.ownership === null ? 50 : percentile(population.map((p) => p.ownership), player.ownership)
  const value = percentile(population.map((p) => p.value), player.value)
  const purchaseValue = percentile(population.map((p) => p.purchaseValue), player.purchaseValue)
  const horizonQuality = percentile(population.map((p) => p.purchaseProjection?.expectedPoints), player.purchaseProjection?.expectedPoints)
  const holdQuality = percentile(population.map((p) => p.purchaseHoldValue), player.purchaseHoldValue)
  const positionPeers = population.filter((candidate) => candidate.position === player.position)
  const positionUpside = percentile(positionPeers.map((candidate) => candidate.positionUpsideRaw), player.positionUpsideRaw)
  return {
    qualityPercentile: round(quality), ownershipPercentile: round(owned), valuePercentile: round(value),
    underRadarScore: round(clamp(20 + (quality * .40 + value * .18 + player.fixtureScore * .14 + player.availability * .13 + (100 - owned) * .05) * .82)),
    legacyBuyScore: round(clamp(18 + (quality * .34 + value * .20 + player.fixtureScore * .14 + player.availability * .17 + Math.max(0, player.fixtureSwing) * .05) * .82)),
    buyScore: round(clamp(18 + (quality * .25 + purchaseValue * .17 + player.availability * .16 + horizonQuality * .12 + holdQuality * .04 + positionUpside * .02) * .82)),
    purchaseValuePercentile: round(purchaseValue),
    purchaseHorizonQuality: round(horizonQuality),
    purchaseHoldQuality: round(holdQuality),
    positionUpsideScore: round(positionUpside),
    cautionScore: round(clamp(15 + ((100 - quality) * .28 + owned * .20 + (100 - player.availability) * .30 + Math.max(0, -player.fixtureSwing) * .08) * .88)),
  }
}

function firstFinite(player, fields) {
  for (const field of fields) {
    const value = player?.[field]
    if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) return Number(value)
  }
  return 0
}

function hasWideDefensiveRole(player) {
  const roles = [player?.tacticalRole, player?.tacticalRoles, player?.subPosition, player?.secondaryPosition]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .map(value => text(value).toLowerCase())
  return roles.some(role => /(^|[^a-z])(lwb|rwb|lb|rb|wingback|wing-back|left back|right back)([^a-z]|$)/.test(role))
}

export function calculatePurchasePositionUpside(player) {
  const position = player?.position
  const goals = firstFinite(player, ['goalsPer90', 'expectedGoalsPer90', 'xGPer90', 'xG'])
  const assists = firstFinite(player, ['assistsPer90', 'expectedAssistsPer90', 'xAPer90', 'xA'])
  const bonus = firstFinite(player, ['bonusPer90', 'optaBonusPer90'])
  const setPieces = firstFinite(player, ['cornersPer90', 'cornersTakenPer90'])
  if (position === 'keeper') return firstFinite(player, ['savesPer90']) + bonus * .25
  if (position === 'verdediger') return goals * 1.2 + assists + bonus * .25 + setPieces * .03 + (hasWideDefensiveRole(player) ? .08 : 0)
  if (position === 'middenvelder') return goals + assists + bonus * .25 + setPieces * .02
  if (position === 'aanvaller') return goals * 1.1 + assists * .7 + bonus * .25
  return 0
}

export function determinePurchaseHorizon({ season, startRound, fixtures = [] } = {}) {
  const firstRound = finite(startRound, 1)
  const maxRound = firstRound + 4
  const counts = new Map()
  for (const fixture of fixtures) {
    const roundNumber = finite(fixture?.round)
    if ((!season || text(fixture?.season) === text(season)) && roundNumber >= firstRound && roundNumber <= maxRound) {
      for (const club of [fixture?.home, fixture?.away]) {
        const key = `${roundNumber}:${canonicalClubKey(club)}`
        if (canonicalClubKey(club)) counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  const latestNearbyDouble = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => Number(key.split(':')[0]))
    .sort((a, b) => b - a)[0]
  return latestNearbyDouble ? Math.min(5, Math.max(4, latestNearbyDouble - firstRound + 1)) : 4
}

function buildPurchaseReason(player) {
  const a = availabilityPolicy(player)
  if(a.reason)return `${a.buyEligible?'Beschikbaarheid meegewogen:':'Geen koopadvies:'} ${a.reason}`
  const dgwRounds = player.purchaseDgwRounds ?? []
  if (dgwRounds.length && player.purchaseHorizonQuality >= 65) return `Sterke ${player.purchaseHorizon}-speelrondenprojectie; in SR${dgwRounds.join(' en SR')} tellen beide werkelijke fixtureprojecties mee.`
  if (dgwRounds.length) return `DGW in SR${dgwRounds.join(' en SR')} telt mee via de werkelijke fixtureprojecties.`
  if (player.positionUpsideScore >= 70 && player.positionUpsideRaw > 0) {
    if (player.position === 'keeper') return 'Goede directe projectie met aantoonbaar reddingen- en bonuspotentieel.'
    return `Goede directe projectie en aantoonbare aanvallende upside als ${player.position}.`
  }
  if (player.purchaseHoldQuality >= 65) return `Sterke projectie en houdwaarde over ${player.purchaseHorizon} speelrondes.`
  if (player.purchaseHoldQuality < 35) return 'Goede korte termijn, maar de projectie over de volledige aankoophorizon blijft achter.'
  return `Solide projectie over de komende ${player.purchaseHorizon} speelrondes.`
}

export function classifyPrimaryAction(player) {
  const a=availabilityPolicy(player)
  if(!a.buyEligible||a.pct<=50) return a.returnDays!==null && a.returnDays>=0 && a.returnDays<=7 ? 'hold' : 'sell'
  if (!player.fixtureCount || player.availability < 45 || player.cautionScore >= 72) return 'sell'
  if (player.buyScore >= PURCHASE_ACTION_THRESHOLDS.buyScore && player.availability >= PURCHASE_ACTION_THRESHOLDS.buyAvailability && player.reliability >= PURCHASE_ACTION_THRESHOLDS.buyReliability) return 'buy'
  if (player.buyScore >= PURCHASE_ACTION_THRESHOLDS.considerScore && player.availability >= PURCHASE_ACTION_THRESHOLDS.considerAvailability) return 'consider'
  if (player.qualityPercentile >= 58 && player.availability >= 65) return 'hold'
  return player.cautionScore >= 62 ? 'sell' : 'consider'
}

function createInsight({ category, entityType = 'player', entity, title, conclusion, why, fantasy, signal, relevance = 75, surprise, confidenceResult, metrics, round: roundNumber, horizon, polarity = 'positive' }) {
  const scored = calculateTalkingPointScore({ signal, relevance, surprise, confidence: confidenceResult.score, recency: 100 })
  return { id: `${category}:${entityType}:${entity?.id || entity?.club || title}`, category, entityType, entityId: entity?.id || '', subjectName: entity?.name || entity?.club || '', club: entity?.club || '', title, conclusion, why, fantasy, polarity, metrics, confidence: confidenceResult, surpriseScore: round(surprise), talkingPointScore: scored.score, breakdown: scored.breakdown, round: roundNumber, horizon }
}

function playerInsights(players, context) {
  const xp = players.map((p) => p.expectedPoints), ownership = players.map((p) => p.ownership), values = players.map((p) => p.value)
  const insights = []
  for (const player of players) {
    const qualityPct = percentile(xp, player.expectedPoints), ownedPct = percentile(ownership, player.ownership), valuePct = percentile(values, player.value)
    const surprise = calculateSurpriseScore({ qualityPercentile: qualityPct, ownershipPercentile: ownedPct, fixtureSwing: player.fixtureSwing, minutesDelta: player.minutesTrend.delta, valuePercentile: valuePct })
    const conf = confidence({ sample: player.minutesTrend.sample, availability: player.availability, horizon: context.horizon, missing: player.fixtureCount ? 0 : 1 })
    const metrics = { xP: player.expectedPoints, xMin: player.expectedMinutes, fixture: player.fixtureScore, vorm: player.formScore, gekozen: player.ownership, prijs: player.price, FVT: finite(player.fvtFantasyScore), qualityPercentile: round(qualityPct), ownershipPercentile: round(ownedPct) }
    if (player.ownership !== null && player.ownership < 10 && qualityPct >= 78 && player.availability >= 65) insights.push(createInsight({ category: 'UNDER THE RADAR', entity: player, title: `${player.name} blijft onder de radar`, conclusion: `${round(player.expectedPoints)} xP bij slechts ${round(player.ownership)}% ownership.`, why: 'De projectierang ligt duidelijk boven de ownershiprang.', fantasy: 'Marktbreed interessante optie voordat populariteit mogelijk stijgt.', signal: qualityPct, surprise, confidenceResult: conf, metrics, round: context.startRound, horizon: context.horizon }))
    if (player.ownership !== null && qualityPct - ownedPct >= 28 && qualityPct >= 65) insights.push(createInsight({ category: 'OWNERSHIP GAP', entity: player, title: `De markt onderschat ${player.name}`, conclusion: `Projectiepercentiel ${round(qualityPct)} tegenover ownershippercentiel ${round(ownedPct)}.`, why: 'Kwaliteit en populariteit lopen betekenisvol uiteen.', fantasy: 'Een relevante markt-mismatch om te volgen.', signal: qualityPct - ownedPct + 45, surprise, confidenceResult: conf, metrics, round: context.startRound, horizon: context.horizon }))
    if (player.ownership !== null && ownedPct - qualityPct >= 32 && ownedPct >= 75) insights.push(createInsight({ category: 'OWNERSHIP TRAP', entity: player, title: `${player.name} is populairder dan zijn projectie`, conclusion: `Ownershippercentiel ${round(ownedPct)} ligt ruim boven projectiepercentiel ${round(qualityPct)}.`, why: 'De markt betaalt mogelijk voor recente reputatie in plaats van toekomstprojectie.', fantasy: 'Voorzichtig beoordelen; dit is geen automatisch verkoopadvies.', signal: ownedPct - qualityPct + 40, relevance: 70, surprise, confidenceResult: conf, metrics, round: context.startRound, horizon: context.horizon, polarity: 'negative' }))
    if (player.minutesTrend.sample >= 3 && player.minutesTrend.delta >= ANALYSIS_CONFIG.thresholds.minutesMove) insights.push(createInsight({ category: 'MINUTES BREAKOUT', entity: player, title: `${player.name} wint duidelijk minuten`, conclusion: `${player.minutesTrend.previous} → ${player.minutesTrend.recent} gemiddelde minuten.`, why: 'De gewogen recente rol is structureel groter dan aan het begin van de sample.', fantasy: 'Meer speeltijd maakt zijn toekomstige projectie relevanter.', signal: 55 + player.minutesTrend.delta, surprise, confidenceResult: conf, metrics, round: context.startRound, horizon: context.horizon }))
    if (player.minutesTrend.sample >= 3 && player.minutesTrend.delta <= -ANALYSIS_CONFIG.thresholds.minutesMove) insights.push(createInsight({ category: 'MINUTES DECLINE', entity: player, title: `${player.name} verliest minuten`, conclusion: `${player.minutesTrend.previous} → ${player.minutesTrend.recent} gemiddelde minuten.`, why: 'De recente rol is betekenisvol kleiner geworden.', fantasy: 'Minutenrisico beperkt floor en projectiezekerheid.', signal: 55 + Math.abs(player.minutesTrend.delta), surprise, confidenceResult: conf, metrics, round: context.startRound, horizon: context.horizon, polarity: 'negative' }))
    if (valuePct >= 85 && qualityPct >= 65) insights.push(createInsight({ category: 'VALUE EMERGING', entity: player, title: `${player.name} biedt opvallende value`, conclusion: `${round(player.expectedPoints)} xP voor € ${round(player.price)} mln.`, why: 'Zijn projectie per miljoen behoort tot de beste binnen de markt.', fantasy: 'Interessant voor algemene budgetallocatie.', signal: valuePct, surprise, confidenceResult: conf, metrics, round: context.startRound, horizon: context.horizon }))
  }
  return insights
}

function structuralFixtureInsights(structural, context) {
  const insights = []
  for (const item of structural) {
    const entity = { club: item.club }
    const metrics = { previous5: item.previousAverage, next5: item.nextAverage, following5: item.followingAverage, swing: item.structuralSwing, sample: item.sample }
    if (item.structuralSwing !== null) insights.push(createInsight({ category: item.structuralSwing > 0 ? 'FIXTURE SWING +' : 'FIXTURE SWING -', entityType: 'club', entity, title: `${item.club} krijgt structureel een ${item.structuralSwing > 0 ? 'gunstiger' : 'zwaarder'} programma`, conclusion: `Vorige reeks ${round(item.previousAverage)} · komende vijf ${round(item.nextAverage)} · swing ${item.structuralSwing > 0 ? '+' : ''}${round(item.structuralSwing)}.`, why: `De vergelijking gebruikt ${item.sample} geldige fixtures; blanks en ontbrekende wedstrijden tellen niet als nul.`, fantasy: item.structuralSwing > 0 ? 'Een algemeen koopvenster kan ontstaan.' : 'De toekomstige marktverwachting verdient extra voorzichtigheid.', signal: 55 + Math.abs(item.structuralSwing), surprise: Math.abs(item.structuralSwing), confidenceResult: item.confidence, metrics, round: context.startRound, horizon: 5, polarity: item.structuralSwing > 0 ? 'positive' : 'negative' }))
    if (item.greenRun) insights.push(createInsight({ category: 'GREEN RUN', entityType: 'club', entity, title: `${item.club} heeft een groene reeks`, conclusion: `De komende vijf fixtures scoren gemiddeld ${round(item.nextAverage)}.`, why: 'Minimaal vier geldige fixtures zijn gunstig of het blokgemiddelde ligt boven de Green Run-grens.', fantasy: 'Structureel goede planningcontext, ook zonder grote swing.', signal: item.nextAverage, surprise: 35, confidenceResult: item.confidence, metrics, round: context.startRound, horizon: 5 }))
    if (item.greenRunStart) insights.push(createInsight({ category: 'GREEN RUN START', entityType: 'club', entity, title: `De groene reeks van ${item.club} begint na deze ronde`, conclusion: `Na de eerstvolgende fixture stijgt het vierwedstrijdengemiddelde naar ${round(mean(item.nextScores.slice(1)))}.`, why: 'De eerste fixture is nog niet gunstig, maar minstens drie van de vier daaropvolgende fixtures wel.', fantasy: 'Een algemeen buy window begint binnen één speelronde.', signal: mean(item.nextScores.slice(1)), surprise: 45, confidenceResult: item.confidence, metrics, round: context.startRound, horizon: 5 }))
    if (item.scheduleCliff) insights.push(createInsight({ category: 'SCHEDULE CLIFF', entityType: 'club', entity, title: `${item.club} nadert een schedule cliff`, conclusion: `Komende vijf ${round(item.nextAverage)} tegenover daarna ${round(item.followingAverage)} (${round(item.scheduleCliffDelta)}).`, why: 'De volledig toekomstige 5-vs-5 vergelijking laat een duidelijke omslag zien.', fantasy: 'Relevant voor algemeen exit-timing en het einde van een koopvenster.', signal: 55 + Math.abs(item.scheduleCliffDelta), surprise: Math.abs(item.scheduleCliffDelta), confidenceResult: item.confidence, metrics, round: context.startRound, horizon: 10, polarity: 'negative' }))
    for (const swing of item.upcomingSwings ?? []) insights.push(createInsight({ category: swing.type === 'positive' ? 'UPCOMING SWING +' : 'UPCOMING SWING -', entityType: 'club', entity, title: `Vanaf speelronde ${swing.startRound} wordt het schema voor ${item.club} duidelijk ${swing.type === 'positive' ? 'beter' : 'zwaarder'}`, conclusion: `Voor SR${swing.startRound} gemiddeld ${swing.beforeAverage}; vanaf SR${swing.startRound} ${swing.afterAverage} (${swing.delta > 0 ? '+' : ''}${swing.delta}).`, why: `${swing.sample} geldige fixtures · afstand ${swing.distance} rondes · ${swing.confidence.level} confidence. Nabijgelegen omslagpunten zijn geclusterd.`, fantasy: swing.type === 'positive' ? 'Een marktbreed buy window komt dichterbij.' : 'Een algemeen exit window nadert.', signal: 55 + Math.abs(swing.delta), relevance: swing.relevance, surprise: Math.abs(swing.delta), confidenceResult: swing.confidence, metrics: { start: swing.startRound, before: swing.beforeAverage, after: swing.afterAverage, swing: swing.delta, sample: swing.sample }, round: context.startRound, horizon: swing.distance + 5, polarity: swing.type === 'positive' ? 'positive' : 'negative' }))
    if (item.upcomingGreenRunStart && !item.greenRunStart) { const run=item.upcomingGreenRunStart; insights.push(createInsight({ category:'GREEN RUN START',entityType:'club',entity,title:`Vanaf speelronde ${run.startRound} opent het schema voor ${item.club}`,conclusion:`De vijf fixtures vanaf SR${run.startRound} scoren gemiddeld ${run.average}.`,why:`De groene reeks begint over ${run.distance} ronde${run.distance===1?'':'s'} en is nu nog niet actief.`,fantasy:'Een pre-emptief, marktbreed buy window om te volgen.',signal:run.average,relevance:90-run.distance*5,surprise:40,confidenceResult:item.confidence,metrics:{start:run.startRound,next5:run.average},round:context.startRound,horizon:run.distance+5})) }
  }
  return insights
}

function buildClubs(players) {
  return Object.entries(Object.groupBy(players, (item) => item.clubKey || canonicalClubKey(item.club))).map(([clubKey, assets]) => {
    const club = canonicalClubName(assets[0]?.club || clubKey)
    const top = [...assets].sort((a, b) => b.expectedPoints - a.expectedPoints)
    const attack = assets.filter((p) => ['aanvaller', 'middenvelder'].includes(p.position)), defence = assets.filter((p) => ['keeper', 'verdediger'].includes(p.position))
    const score = clamp(mean(assets.map((p) => p.trajectoryScore)) * .45 + mean(assets.map((p) => p.fixtureScore)) * .25 + mean(assets.map((p) => p.formScore)) * .15 + percentile(players.map((p) => p.value), mean(assets.map((p) => p.value))) * .15)
    return { club, score: round(score), projectedPoints: round(assets.reduce((sum, p) => sum + p.expectedPoints, 0)), attack: round(mean(attack.map((p) => p.trajectoryScore))), defence: round(mean(defence.map((p) => p.trajectoryScore))), fixture: round(mean(assets.map((p) => p.fixtureScore))), form: round(mean(assets.map((p) => p.formScore))), value: round(mean(assets.map((p) => p.value)), 2), ownership: round(mean(assets.map((p) => p.ownership))), ownershipOpportunity: round(clamp(100 - mean(assets.map((p) => p.ownership)) * 4)), fixtureSwing: round(mean(assets.map((p) => p.fixtureSwing))), topPlayer: top[0] ?? null, bestValue: [...assets].sort((a, b) => b.value - a.value)[0] ?? null, differential: top.find((p) => p.ownership < 10) ?? null, risk: [...assets].sort((a, b) => a.reliability - b.reliability)[0] ?? null, assets }
  }).sort((a, b) => b.score - a.score || a.club.localeCompare(b.club, 'nl')).map((club, index) => ({ ...club, rank: index + 1 }))
}

export function aggregateOpponentRows(rows) {
  const validRows = rows.map((row,index) => ({ ...row, position:normalizePosition(row.position), fixtureKey:text(row.fixtureKey||row.fixtureId||row.matchId)||`row-${index}` })).filter((row) => canonicalClubKey(row.opponent) && row.position !== 'onbekend' && finite(row.minutes) > 0 && Number.isFinite(Number(row.points)))
  return Object.entries(Object.groupBy(validRows, (row) => canonicalClubKey(row.opponent))).map(([, matches]) => {
    const grouped = Object.groupBy(matches, (m) => m.position)
    const positions = Object.fromEntries(['keeper','verdediger','middenvelder','aanvaller'].map((position) => {
      const items = grouped[position] ?? [], games=new Set(items.map(x=>x.fixtureKey)).size, hasSample=items.length>0, level=games>=9?'hoog':games>=5?'behoorlijk':games>=2?'middel':'laag'
      return [position, { matches:games, observations:items.length, totalMinutes:round(items.reduce((s,m)=>s+m.minutes,0)), totalPoints:round(items.reduce((s,m)=>s+m.points,0)), pointsPer90:hasSample?round(items.reduce((s,m)=>s+m.points,0)/items.reduce((s,m)=>s+m.minutes,0)*90):null, confidence:hasSample?level:'geen', missingReason:hasSample?'':'Geen geldige historische waarnemingen' }]
    }))
    const games=new Set(matches.map(x=>x.fixtureKey)).size, level=games>=9?'hoog':games>=5?'behoorlijk':games>=2?'middel':'laag'
    return { opponent:canonicalClubName(matches[0].opponent),matches:games,observations:matches.length,totalMinutes:round(matches.reduce((s,m)=>s+m.minutes,0)),points:round(matches.reduce((s,m)=>s+m.points,0)),pointsPer90:round(matches.reduce((s,m)=>s+m.points,0)/matches.reduce((s,m)=>s+m.minutes,0)*90),confidence:level,positions }
  }).sort((a,b)=>finite(b.pointsPer90,-1)-finite(a.pointsPer90,-1)||a.opponent.localeCompare(b.opponent,'nl'))
}

export function buildOpponentStats(players, context) {
  const rows = [], seen = new Set()
  for (const player of players) for (const match of getPlayerMatchHistory(player, { season: context.season })) {
    const opponent = canonicalClubName(match?.fixture?.opponent || match?.opponent), minutes = finite(match.minutes), rawPoints = match?.punten?.totaal ?? match?.fantasyPoints ?? match?.points, points = Number(rawPoints)
    const matchKey = `${player.id}|${match?.fixture?.id || match?.fixtureId || match?.id || match?.round || ''}|${canonicalClubKey(opponent)}`
    if (opponent && minutes > 0 && Number.isFinite(points) && !seen.has(matchKey)) { seen.add(matchKey); rows.push({ opponent, position: player.position, minutes, points, fixtureKey:match?.fixture?.id||match?.fixtureId||match?.id||`${match?.round||''}:${canonicalClubKey(opponent)}` }) }
  }
  return aggregateOpponentRows(rows)
}

export function buildBudget(players) {
  const eligible = players.filter((p) => p.price > 0 && p.fixtureCount > 0 && p.expectedMinutes >= 45)
  const makeBands = (assets) => Object.entries(Object.groupBy(assets, (p) => `${Math.floor(p.price / 2) * 2}-${Math.floor(p.price / 2) * 2 + 2}`)).map(([band, items]) => ({ band:`€ ${band} mln`, from:Number(band.split('-')[0]), players:items.length, averageXp:round(mean(items.map(p=>p.expectedPoints))), value:round(mean(items.map(p=>p.value)),2) })).sort((a,b)=>a.from-b.from)
  const bands = makeBands(eligible)
  const byPosition = Object.entries(Object.groupBy(eligible, p=>p.position)).map(([position, assets]) => {
    const positionBands=makeBands(assets), reliable=positionBands.filter(b=>b.players>=Math.min(3,assets.length)), candidates=reliable.length?reliable:positionBands
    const sweet=[...candidates].sort((a,b)=>b.averageXp-a.averageXp||b.value-a.value||a.from-b.from)[0]
    const homogeneous=positionBands.length<2||Math.max(...positionBands.map(b=>b.averageXp))-Math.min(...positionBands.map(b=>b.averageXp))<.75
    const averageXp=round(mean(assets.map(p=>p.expectedPoints))),top=[...assets].sort((a,b)=>b.expectedPoints-a.expectedPoints||a.price-b.price)[0],averagePrice=round(mean(assets.map(p=>p.price))),spread=round((top?.expectedPoints??0)-averageXp)
    const lineupConclusion=homogeneous?`Extra budget levert bij ${position} momenteel weinig aantoonbaar verschil in verwachte punten op.`:spread>=3?`De beste ${position} ligt ${spread} xP boven het gemiddelde; extra kwaliteit kan hier duidelijk renderen.`:`Er zijn meerdere vergelijkbare opties bij ${position}; besparen kost gemiddeld weinig verwachte punten.`
    return { position, averagePrice, averageXp, topXp:round(top?.expectedPoints??0), topPrice:round(top?.price??0), spread, value:round(mean(assets.map(p=>p.value)),2), reliability:round(mean(assets.map(p=>p.reliability))), ownership:round(mean(assets.map(p=>p.ownership))), depth:assets.filter(p=>p.trajectoryScore>=65).length, usefulOptions:assets.length, bands:positionBands, priceRange:assets.length?`€ ${round(Math.min(...assets.map(p=>p.price)))}–${round(Math.max(...assets.map(p=>p.price)))} mln`:'Onvoldoende data', sweetSpot:homogeneous?'Geen duidelijk prijsvoordeel':sweet?.band??'Onvoldoende data', conclusion:homogeneous?'De prijsklassen presteren te gelijkwaardig voor een betrouwbaar sweet spot-advies.':`De sterkste bruikbare projectie ligt rond ${sweet.band}; waarde per miljoen is niet alleen doorslaggevend.`, lineupConclusion }
  }).sort((a,b)=>b.value-a.value||a.position.localeCompare(b.position,'nl'))
  const premiumTax=[...eligible].sort((a,b)=>b.price-a.price).slice(0,8).map((premium)=>{const alternative=eligible.filter(p=>p.position===premium.position&&p.price<premium.price&&p.expectedPoints>=premium.expectedPoints*.85).sort((a,b)=>b.expectedPoints-a.expectedPoints||a.price-b.price)[0];return alternative?{premium,alternative,priceDifference:round(premium.price-alternative.price),xpDifference:round(premium.expectedPoints-alternative.expectedPoints)}:null}).filter(Boolean)
  return { bands, positions:byPosition, premiumTax }
}

const firstFiniteField = (object, keys) => { for (const key of keys) { const raw=object?.[key]; if(raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw))) return Number(raw) } return null }
export function buildMinutesSignals(players, perDirection=5) {
  const signals=[]
  for(const player of players){
    const values=player.minutesTrend?.values??[], currentProjection=player.fixtureCount?round(player.expectedMinutes/player.fixtureCount):0
    let previous=null, current=null, source=''
    if(values.length>=3){previous=player.minutesTrend.previous;current=player.minutesTrend.recent;source=`Laatste wedstrijden gemiddeld ${current} minuten tegenover ${previous} daarvoor`}
    else if(values.length===2){previous=values[0];current=values[1];source=`Laatste wedstrijd ${current} minuten tegenover ${previous} daarvoor`}
    else if(values.length===1&&Math.abs(currentProjection-values[0])>=20){previous=values[0];current=currentProjection;source=`Verwachting ${current} minuten tegenover ${previous} in de laatste wedstrijd`}
    if(previous===null||current===null) continue
    const delta=round(current-previous)
    if(Math.abs(delta)<18||Math.max(previous,current)<30||player.availability<25) continue
    const confidenceLevel=values.length>=4?'hoog':values.length>=2?'middel':'laag'
    signals.push({id:`minutes:${player.id}`,player,type:delta>0?'minutes-up':'minutes-down',label:delta>0?'Minuten stijgen':'Minuten dalen',previous,current,delta,score:round(Math.abs(delta)/5+player.availability/20),confidence:{level:confidenceLevel,score:values.length>=4?80:values.length>=2?58:35},source})
  }
  return ['minutes-up','minutes-down'].flatMap(type=>signals.filter(x=>x.type===type).sort((a,b)=>b.score-a.score||String(a.player.id).localeCompare(String(b.player.id),'nl')).slice(0,perDirection))
}
export function buildTrendSignals(players, limit=12) {
  const out=[]
  for(const p of players){
    const previousOwnership=firstFiniteField(p,['previousOwnership','ownershipPrevious','selectedPctPrevious']), previousXp=firstFiniteField(p,['previousExpectedPoints','expectedPointsPrevious']), previousForm=firstFiniteField(p,['previousFormScore','formScorePrevious']), previousFixture=firstFiniteField(p,['previousFixtureScore','fixtureScorePrevious']), previousReliability=firstFiniteField(p,['previousReliability','reliabilityPrevious'])
    if(previousOwnership!==null&&p.ownership!==null&&Math.abs(p.ownership-previousOwnership)>=1) out.push({id:`ownership:${p.id}`,player:p,type:'ownership',label:p.ownership>previousOwnership?'Populariteit stijgt':'Populariteit daalt',previous:previousOwnership,current:p.ownership,delta:round(p.ownership-previousOwnership),score:Math.abs(p.ownership-previousOwnership),confidence:{level:'middel',score:60}})
    if(previousXp!==null&&Math.abs(p.expectedPoints-previousXp)>=.5) out.push({id:`xp:${p.id}`,player:p,type:'projection',label:p.expectedPoints>previousXp?'Verwachte punten stijgen':'Verwachte punten dalen',previous:previousXp,current:p.expectedPoints,delta:round(p.expectedPoints-previousXp),score:Math.abs(p.expectedPoints-previousXp)*4,confidence:{level:'middel',score:65}})
    if(previousForm!==null&&Math.abs(p.formScore-previousForm)>=8) out.push({id:`form:${p.id}`,player:p,type:'form',label:p.formScore>previousForm?'Vorm stijgt':'Vorm daalt',previous:previousForm,current:p.formScore,delta:round(p.formScore-previousForm),score:Math.abs(p.formScore-previousForm)/4,confidence:{level:'middel',score:58}})
    if(previousFixture!==null&&Math.abs(p.fixtureScore-previousFixture)>=10) out.push({id:`fixture:${p.id}`,player:p,type:'fixture',label:p.fixtureScore>previousFixture?'Schema verbetert':'Schema verslechtert',previous:previousFixture,current:p.fixtureScore,delta:round(p.fixtureScore-previousFixture),score:Math.abs(p.fixtureScore-previousFixture)/5,confidence:{level:'middel',score:62}})
    if(previousReliability!==null&&Math.abs(p.reliability-previousReliability)>=10) out.push({id:`reliability:${p.id}`,player:p,type:'reliability',label:p.reliability>previousReliability?'Speelzekerheid stijgt':'Speelzekerheid daalt',previous:previousReliability,current:p.reliability,delta:round(p.reliability-previousReliability),score:Math.abs(p.reliability-previousReliability)/5,confidence:{level:'middel',score:62}})
  }
  const bestPerStory=new Map()
  for(const item of out){const key=`${item.player.id}:${item.type}`;if(!bestPerStory.has(key)||bestPerStory.get(key).score<item.score)bestPerStory.set(key,item)}
  return [...bestPerStory.values()].sort((a,b)=>b.score-a.score||(b.confidence?.score??0)-(a.confidence?.score??0)||b.player.expectedPoints-a.player.expectedPoints||a.id.localeCompare(b.id,'nl')).slice(0,limit)
}
export function buildPlayerMovers(players, limitPerDirection=8){
  const changes=buildTrendSignals(players,Math.max(48,players.length*5)), grouped=Object.groupBy(changes,x=>String(x.player.id))
  const movers=Object.values(grouped).filter(items=>new Set(items.map(x=>x.type)).size>=2).map(items=>{const signed=items.reduce((sum,item)=>sum+(item.delta>=0?item.score:-item.score),0);return {player:items[0].player,score:round(signed),signals:items}}).filter(x=>Math.abs(x.score)>=2).sort((a,b)=>Math.abs(b.score)-Math.abs(a.score)||String(a.player.id).localeCompare(String(b.player.id),'nl'))
  return [...movers.filter(x=>x.score>0).slice(0,limitPerDirection),...movers.filter(x=>x.score<0).slice(0,limitPerDirection)]
}
export function buildUnderRadar(players, limit=25){return [...players].filter(p=>p.ownership!==null&&p.ownership<ANALYSIS_CONFIG.thresholds.lowOwnership&&p.availability>=65&&p.reliability>=55&&p.fixtureCount>0&&p.underRadarScore>=ANALYSIS_CONFIG.thresholds.radarMinimum).sort((a,b)=>b.underRadarScore-a.underRadarScore||b.expectedPoints-a.expectedPoints||String(a.id).localeCompare(String(b.id),'nl')).slice(0,limit)}
export function buildOvervalued(players, limit=20){return players.map(player=>{const zeroContext=player.expectedMinutes<=0||player.fixtureCount<=0, score=round(clamp(player.cautionScore*.45+player.ownershipPercentile*.30+(100-player.qualityPercentile)*.25-(zeroContext?12:0)));const alternative=players.filter(p=>p.id!==player.id&&p.position===player.position&&p.price<player.price&&p.availability>=65&&p.expectedPoints>player.expectedPoints).sort((a,b)=>b.expectedPoints-a.expectedPoints||a.price-b.price)[0]??null;return {player,score,alternative,context:zeroContext?'Geen verwachte minuten of wedstrijd in de gekozen periode':''}}).filter(x=>x.player.ownership!==null&&x.player.ownership>=10&&x.player.price>0&&x.score>=ANALYSIS_CONFIG.thresholds.overvaluedMinimum).sort((a,b)=>b.score-a.score||String(a.player.id).localeCompare(String(b.player.id),'nl')).slice(0,limit)}

function deduplicateInsights(insights) {
  const seen = new Set()
  return [...insights].sort((a, b) => b.talkingPointScore - a.talkingPointScore || a.id.localeCompare(b.id)).filter((item) => { const key = `${item.entityType}:${item.entityId || item.club}:${item.category.replace(/[+-]/g, '').trim()}`; if (seen.has(key) || item.talkingPointScore < ANALYSIS_CONFIG.thresholds.insightMinimum) return false; seen.add(key); return true })
}

export function diversifyInsights(insights, limit = 8) {
  const entities = new Set(), clubs = new Map(), output = []
  for (const insight of insights) {
    const entity = insight.entityId || `${insight.entityType}:${insight.club}`
    if (entities.has(entity) || (insight.club && (clubs.get(insight.club) || 0) >= 2)) continue
    entities.add(entity); if (insight.club) clubs.set(insight.club, (clubs.get(insight.club) || 0) + 1)
    output.push(insight)
    if (output.length >= limit) break
  }
  return output
}

export function selectExecutive({ positives, negatives, clubs, players, stories }) {
  const used = new Set()
  const subject = (item) => item?.entityId || item?.club || item?.id
  const take = (items, minimum = 0) => {
    const item = items.find((candidate) => candidate && !used.has(subject(candidate)) && finite(candidate.talkingPointScore, finite(candidate.score)) >= minimum) ?? null
    if (item) used.add(subject(item)); return item
  }
  const underratedCandidates = stories.filter((item) => item.storyFamily === 'market-mismatch')
  const underrated = take(underratedCandidates, 58)
  const development = take(positives, 58), decline = take(negatives, 58), hotClub = take(clubs, 45), coldClub = take([...clubs].reverse(), 0)
  const budget = take([...players].sort((a, b) => b.value - a.value), 0)
  return { development, decline, hotClub, coldClub, budget, underrated }
}

export function selectActionCenter(stories) {
  const selected = [], used = new Set()
  const take = (predicate, level) => {
    const story = stories.find((item) => predicate(item) && !used.has(item.entityId || item.club || item.id))
    if (story) { used.add(story.entityId || story.club || story.id); selected.push({ level, insight: story }) }
  }
  take((item) => item.polarity !== 'negative', 'doen')
  take((item) => item.polarity === 'negative', 'voorzichtig')
  take((item) => item.polarity !== 'negative' && item.storyFamily !== selected[0]?.insight.storyFamily, 'overwegen')
  take(() => true, 'volgen')
  return selected
}

export function buildAnalysis(options = {}) {
  const context = createIntelligenceContext(options), key = `${context.season}|${context.startRound}|${context.horizon}|${context.syncVersion}|${availabilityVersion()}`
  if (!options.players && cache.has(key)) return cache.get(key)
  const purchaseHorizon = determinePurchaseHorizon(context)
  const rawPlayers = context.players.map((player) => {
    const intelligence = buildPlayerIntelligence(player, context)
    const purchaseProjection = getPlayerHorizonProjection(intelligence, { ...context, horizon: purchaseHorizon })
    const futureRounds = purchaseProjection.rounds.slice(1)
    const purchaseHoldValue = futureRounds.length ? futureRounds.reduce((sum, item) => sum + finite(item?.expectedPoints), 0) / futureRounds.length : 0
    const purchaseDgwRounds = purchaseProjection.rounds.filter(item => finite(item?.fixtureCount) > 1).map(item => finite(item.round))
    const purchaseDgwFixtures = purchaseProjection.rounds.reduce((sum, item) => sum + Math.max(0, finite(item?.fixtureCount) - 1), 0)
    const purchaseValue = intelligence.price > 0 ? purchaseProjection.expectedPoints / intelligence.price : 0
    return { ...intelligence, purchaseHorizon, purchaseProjection, purchaseValue: round(purchaseValue, 3), purchaseHoldValue: round(purchaseHoldValue, 2), purchaseDgwRounds, purchaseDgwFixtures, positionUpsideRaw: round(calculatePurchasePositionUpside(intelligence), 3) }
  })
  const players = rawPlayers.map((player) => {
    const scores = calculateMarketScores(player, rawPlayers)
    scores.buyScore = round(scores.buyScore * availabilityPolicy(player).factor)
    const composite = scores.qualityPercentile * .38 + scores.valuePercentile * .12 + player.fixtureScore * .15 + player.formScore * .12 + player.availability * .18 + player.reliability * .05
    const trajectoryScore = round(clamp(22 + composite * .72))
    const enriched = { ...player, ...scores, purchaseReason: '', trajectoryScore, trajectory: trajectoryScore >= 76 ? 'rising' : trajectoryScore < 52 ? 'falling' : 'stable' }
    enriched.purchaseReason = buildPurchaseReason(enriched)
    return { ...enriched, primaryAction: classifyPrimaryAction(enriched) }
  })
  const structuralFixtures = buildStructuralFixtureIntelligence({ players, startRound: context.startRound, fixtures: context.fixtures, results: context.results, teamRatings: context.teamRatings })
  const structuralByClub = new Map(structuralFixtures.map((item) => [item.clubKey, item]))
  const clubs = buildClubs(players).map((club) => ({ ...club, structuralFixture: structuralByClub.get(canonicalClubKey(club.club)) ?? null }))
  let insights = deduplicateInsights([...playerInsights(players, context), ...structuralFixtureInsights(structuralFixtures, context)])
  const minutesSignals = buildMinutesSignals(players)
  const budget = buildBudget(players)
  const opponentStats = buildOpponentStats(players, context)
  const statSource = opponentStats.flatMap((opponent) => Object.entries(opponent.positions).map(([position, data]) => ({ opponent, position, ...data }))).filter((item) => item.matches >= 5 && item.pointsPer90 !== null).sort((a, b) => b.pointsPer90 - a.pointsPer90)[0]
  if (statSource && statSource.pointsPer90 >= 5) { const plural={keeper:'Doelmannen',verdediger:'Verdedigers',middenvelder:'Middenvelders',aanvaller:'Aanvallers'}[statSource.position]||'Spelers'; insights = deduplicateInsights([...insights, createInsight({ category: 'STAT OF THE WEEK', entityType: 'stat', entity: { club: statSource.opponent.opponent }, title: `${plural} scoren opvallend goed tegen ${statSource.opponent.opponent}`, conclusion: `${plural} halen tegen ${statSource.opponent.opponent} gemiddeld ${round(statSource.pointsPer90)} Fantasy-punten per 90.`, why: `Gebaseerd op ${statSource.matches} geldige waarnemingen met canonical posities en speelminuten.`, fantasy: 'Een marktbrede tegenstandertrend om te volgen.', signal: 65 + statSource.pointsPer90, surprise: 45, confidenceResult: { score: statSource.matches >= 12 ? 85 : 65, level: statSource.matches >= 12 ? 'hoog' : 'middel' }, metrics: { puntenPer90: statSource.pointsPer90, sample: statSource.matches }, round: context.startRound, horizon: context.horizon })]) }
  const compositeStories = buildCompositeStories(insights), editorialStories = selectEditorialStories(compositeStories, 10), overviewInsights = editorialStories.slice(0, 8)
  const positives = overviewInsights.filter((i) => i.polarity === 'positive'), negatives = overviewInsights.filter((i) => i.polarity === 'negative')
  const actions = selectActionCenter(editorialStories)
  const executive = selectExecutive({ positives, negatives, clubs, players, stories: compositeStories })
  const trends=buildTrendSignals(players), underRadar=buildUnderRadar(players), overvalued=buildOvervalued(players)
  const playerMovers=buildPlayerMovers(players)
  const currentStructuralSwingCount=structuralFixtures.filter((item)=>item.structuralSwing!==null).length, upcomingSwingCount=structuralFixtures.reduce((sum,item)=>sum+(item.upcomingSwings?.length||0),0)
  const result = { ...context, players: rankDeterministic(players, 'trajectoryScore'), clubs, structuralFixtures, insights, compositeStories, editorialStories, overviewInsights, actions, minutesSignals, trends, playerMovers, underRadar, overvalued, actionGroups: Object.groupBy(players, (p) => p.primaryAction), opponentStats, budget, positions: budget.positions, matrix: players.filter((p) => p.fixtureCount && p.ownership !== null).map((p) => ({ id:p.id,name:p.name,club:p.club,position:p.position,x:p.ownership,y:p.expectedPoints,size:p.price,fixture:p.fixtureScore,score:p.trajectoryScore,underRadarScore:p.underRadarScore,trapScore:p.cautionScore,expectedMinutes:p.expectedMinutes,reliability:p.reliability })), executive, edgeAreas: budget.positions.slice(0,4).map(p=>({title:`${p.position}: ${p.sweetSpot}`,conclusion:p.conclusion,evidence:`${p.depth} sterke opties · ${p.value} xP per miljoen`})), stats:{strongInsights:overviewInsights.filter(i=>i.talkingPointScore>=75).length,underRadar:underRadar.length,fixtureSwings:currentStructuralSwingCount+upcomingSwingCount,currentStructuralSwingCount,upcomingSwingCount,minutesAlerts:minutesSignals.length,highConfidence:overviewInsights.filter(i=>i.confidence.level==='hoog').length} }
  if (!options.players) cache.set(key, result)
  return result
}

export function clearAnalysisCache() { cache.clear() }
