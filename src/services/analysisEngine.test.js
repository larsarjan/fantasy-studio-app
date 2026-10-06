import assert from 'node:assert/strict'
import { PURCHASE_ACTION_THRESHOLDS, aggregateOpponentRows, buildAnalysis, buildBudget, buildMinutesSignals, buildOvervalued, buildPlayerMovers, buildTrendSignals, buildUnderRadar, calculateMarketScores, calculatePurchasePositionUpside, calculateSurpriseScore, calculateTalkingPointScore, classifyFixtureSwing, classifyPrimaryAction, determinePurchaseHorizon, formatPremiumComparison, selectActionCenter, selectExecutive, sortUpcomingFixtureSwings } from './analysisEngine.js'
import { canonicalClubKey, classifyMinutesTrend, getIntelligenceRound } from './intelligenceHelpers.js'

const rounds = (xp = 6, minutes = 88, type = 'single') => [1, 2, 3, 4, 5].map((round) => ({ round, type, fixtureCount: type === 'blank' ? 0 : type === 'double' ? 2 : 1, expectedPoints: type === 'blank' ? 0 : xp * (type === 'double' ? 2 : 1), expectedMinutes: type === 'blank' ? 0 : minutes * (type === 'double' ? 2 : 1), appearanceProbability: .98 }))
const player = (id, ownership, xp, minutes = 88, extra = {}) => ({ id, name: id, club: extra.club ?? 'Ajax', season: 'S', fantasyPosition: extra.position ?? 'middenvelder', endPrice: extra.price ?? 8, selectedPct: ownership, expectedPointsProjection: { rounds: rounds(xp, minutes, extra.type) }, outlook: { form: extra.form ?? 7 }, fvtFantasyScore: extra.fvt ?? 75, captainScore: 70, bonusScore: 65, ...extra })
const fixtures = [1, 2, 3, 4, 5].flatMap((round) => [{ id: `a${round}`, season: 'S', round, home: 'Ajax', away: 'PSV', difficultyHome: round < 3 ? 4 : 2, difficultyAway: round < 3 ? 2 : 4 }, { id: `u${round}`, season: 'S', round, home: 'FC Utrecht', away: 'AZ', difficultyHome: 2, difficultyAway: 4 }])
const players = [player('Low quality', 1, .5, 30), player('Hidden gem', 4, 7), player('Popular weak', 60, 1.5, 70), player('Value', 8, 6.5, 90, { price: 5, club: 'FC Utrecht' }), player('Blank', 2, 0, 0, { type: 'blank', club: 'AZ' })]
const analysis = buildAnalysis({ season: 'S', startRound: 3, horizon: 3, players, fixtures, results: [], teamRatings: [] })

assert.equal(analysis.insights.some((i) => i.entityId === 'Low quality' && i.category === 'UNDER THE RADAR'), false, 'lage ownership zonder kwaliteit is geen topper')
assert.equal(analysis.insights.some((i) => i.entityId === 'Hidden gem' && ['UNDER THE RADAR', 'OWNERSHIP GAP'].includes(i.category)), true, 'sterke xP plus low ownership levert signaal')
assert.equal(analysis.players.find((p) => p.id === 'Blank').expectedPoints, 0, 'blank blijft nul')
assert.equal(buildAnalysis({ season: 'S', startRound: 3, horizon: 1, players, fixtures, results: [], teamRatings: [] }).horizon, 1)
assert.equal(buildAnalysis({ season: 'S', startRound: 3, horizon: 3, players, fixtures, results: [], teamRatings: [] }).horizon, 3)
assert.equal(buildAnalysis({ season: 'S', startRound: 1, horizon: 5, players: [player('DGW', 5, 5, 85, { type: 'double' })], fixtures, results: [], teamRatings: [] }).players[0].projection.dgwCount, 5, 'DGW wordt opgeteld')
assert.ok(analysis.players.every((p) => Number.isFinite(p.trajectoryScore)), 'geen NaN')
assert.ok(analysis.matrix.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'matrix is geldig')
assert.ok(analysis.clubs.every((c) => Number.isFinite(c.score)), 'club pulse is veilig')
assert.deepEqual(analysis.players.map((p) => p.id), buildAnalysis({ season: 'S', startRound: 3, horizon: 3, players, fixtures, results: [], teamRatings: [] }).players.map((p) => p.id), 'ranking deterministisch')
assert.ok(calculateTalkingPointScore({ signal: 200, relevance: 80, surprise: 80, confidence: 80, recency: 80 }).score <= 100)
assert.ok(calculateSurpriseScore({ qualityPercentile: 100, ownershipPercentile: 0, fixtureSwing: 80 }) <= 100)
assert.ok(analysis.budget.positions.length > 0, 'budget sweet spots bestaan')
assert.ok(analysis.positions.every((p) => Number.isFinite(p.value)), 'position power ranking is geldig')
assert.ok(Array.isArray(analysis.actions), 'action center deterministisch')
assert.ok(analysis.insights.every((i) => i.metrics && i.breakdown), 'evidence breakdown aanwezig')
assert.equal(buildAnalysis({ season: 'S', startRound: 3, horizon: 3, players: [], fixtures, results: [], teamRatings: [] }).insights.length, 0, 'empty state veilig')

const roundFixtures = [1, 2, 3].flatMap((round) => [{ season: 'S', round, home: `H${round}`, away: `A${round}` }])
const completed = roundFixtures.filter((f) => f.round < 3).map((f) => ({ season: 'S', home: f.home, away: f.away }))
assert.equal(getIntelligenceRound('S', roundFixtures, completed), 3, 'current round automatisch')
assert.equal(getIntelligenceRound('S', roundFixtures, roundFixtures.map((f) => ({ season: 'S', home: f.home, away: f.away }))), 3, 'completed season veilig')
assert.equal(classifyMinutesTrend([20, 30, 80, 90]).signal, 'breakout', 'duidelijke minutenstijging')
assert.equal(classifyMinutesTrend([90, 85, 35, 25]).signal, 'decline', 'duidelijke minutendaling')
assert.equal(classifyMinutesTrend([80, 82, 84, 83]).signal, 'stable', 'minieme stijging is geen breakout')
assert.equal(classifyMinutesTrend([80, 90]).signal, 'insufficient', 'kleine sample wordt niet opgeblazen')
assert.equal(classifyFixtureSwing(20), 'positive', 'positieve fixture swing')
assert.equal(classifyFixtureSwing(-20), 'negative', 'negatieve fixture swing')
assert.equal(classifyFixtureSwing(5), 'stable', 'micro swing blijft stil')
assert.ok(analysis.players.every((p) => ['rising', 'stable', 'falling'].includes(p.trajectory)), 'trajectory-label aanwezig')
assert.ok(analysis.players.every((p) => Number.isFinite(p.buyScore)), 'Buy Score aanwezig')
assert.ok(analysis.players.every((p) => Number.isFinite(p.cautionScore)), 'Caution Score aanwezig')
assert.ok(analysis.players.every((p) => Number.isFinite(p.underRadarScore)), 'Under Radar Score aanwezig')
const hidden = analysis.players.find((p) => p.id === 'Hidden gem'), weak = analysis.players.find((p) => p.id === 'Low quality')
assert.ok(hidden.underRadarScore > weak.underRadarScore, 'kwaliteit domineert lage ownership')
assert.ok(calculateMarketScores(hidden, analysis.players).buyScore >= 0, 'marktscores zijn zelfstandig reproduceerbaar')
const strictBBase = { ...hidden, fixtureScore: 20, fixtureSwing: 0 }
const strictBFixture = { ...strictBBase, fixtureScore: 100 }
const strictBSwing = { ...strictBBase, fixtureSwing: 100 }
const strictBBaseScores = calculateMarketScores(strictBBase, analysis.players)
assert.equal(calculateMarketScores(strictBFixture, analysis.players).buyScore, strictBBaseScores.buyScore, 'directe fixtureScore heeft nul invloed op Strict-B-buyScore')
assert.equal(calculateMarketScores(strictBSwing, analysis.players).buyScore, strictBBaseScores.buyScore, 'positieve fixtureSwing heeft nul invloed op Strict-B-buyScore')
assert.equal(calculateMarketScores({ ...strictBBase, fixtureScore:strictBBase.fixtureScore + 8, fixtureSwing:strictBBase.fixtureSwing + 8 }, analysis.players).buyScore, strictBBaseScores.buyScore, 'DOUBLE_GAMEWEEK_BONUS kan buyScore niet via fixtureScore of fixtureSwing bereiken')
assert.notEqual(calculateMarketScores(strictBFixture, analysis.players).legacyBuyScore, strictBBaseScores.legacyBuyScore, 'legacyBuyScore behoudt de historische directe fixtureweging')
assert.notEqual(calculateMarketScores(strictBSwing, analysis.players).legacyBuyScore, strictBBaseScores.legacyBuyScore, 'legacyBuyScore behoudt de historische positieve swingweging')
assert.equal(strictBSwing.fixtureSwing, 100, 'fixtureSwing blijft als informatieve property bestaan')
assert.deepEqual(PURCHASE_ACTION_THRESHOLDS, { buyScore:72, buyAvailability:72, buyReliability:65, considerScore:63, considerAvailability:60 }, 'Strict-B-thresholds zijn expliciet vastgelegd')
const actionProfile = { fixtureCount:1, cautionScore:0, qualityPercentile:50 }
assert.equal(classifyPrimaryAction({ ...actionProfile, buyScore:72, availability:72, reliability:65 }), 'buy', 'BUY gebruikt grens 72 met ongewijzigde availability/reliability-gates')
assert.notEqual(classifyPrimaryAction({ ...actionProfile, buyScore:72, availability:71.9, reliability:65 }), 'buy', 'BUY availability-gate blijft 72')
assert.notEqual(classifyPrimaryAction({ ...actionProfile, buyScore:72, availability:72, reliability:64.9 }), 'buy', 'BUY reliability-gate blijft 65')
assert.equal(classifyPrimaryAction({ ...actionProfile, buyScore:63, availability:60, reliability:0 }), 'consider', 'CONSIDER gebruikt grens 63 met availability-gate 60')
const aliases = buildAnalysis({ season: 'S', startRound: 1, horizon: 1, players: [player('nec-a', 2, 4, 90, { club: 'N.E.C.' }), player('nec-b', 3, 5, 90, { club: 'N.E.C' }), player('nec-c', 4, 6, 90, { club: 'NEC' }), player('hee-a', 3, 5, 90, { club: 'SC Heerenveen' }), player('hee-b', 3, 5, 90, { club: 'sc Heerenveen' })], fixtures, results: [], teamRatings: [] })
assert.equal(aliases.clubs.filter((c) => canonicalClubKey(c.club) === 'nec').length, 1, 'N.E.C.-aliases worden één club')
assert.equal(aliases.clubs.filter((c) => canonicalClubKey(c.club) === 'heerenveen').length, 1, 'Heerenveen-aliases worden één club')
assert.equal(new Set(aliases.clubs.map((c) => canonicalClubKey(c.club))).size, aliases.clubs.length, 'exact één aggregaat per canonical club')
assert.ok(new Set(analysis.players.map((p) => p.trajectoryScore)).size > 2, 'verschillende profielen satureren niet tot dezelfde score')
assert.ok(analysis.players.filter((p) => p.trajectoryScore === 100).length <= 1, '100 blijft uitzonderlijk')
assert.equal(new Set(analysis.players.map((p) => p.primaryAction)).size > 1, true, 'verschillende profielen leveren verschillende acties')
assert.equal(Object.values(analysis.actionGroups).flat().length, analysis.players.length, 'iedere speler heeft exact één primaire actie')
assert.equal(new Set(Object.values(analysis.actionGroups).flat().map((p) => p.id)).size, analysis.players.length, 'actiecategorieën overlappen niet')
assert.equal(analysis.stats.minutesAlerts, analysis.minutesSignals.length, 'overview gebruikt dezelfde minutes intelligence')
assert.ok(analysis.minutesSignals.every((s) => Math.abs(s.delta)>=18&&['minutes-up','minutes-down'].includes(s.type)), 'geen minutenontwikkeling zonder significante verandering')
assert.equal(new Set(analysis.overviewInsights.map((i) => i.entityId || i.club)).size, analysis.overviewInsights.length, 'talking points zijn per entiteit geclusterd')
assert.equal(new Set(analysis.actions.map((a) => a.insight.entityId || a.insight.club)).size, analysis.actions.length, 'Action Center is gededupliceerd')
const lowSample = aggregateOpponentRows([{ opponent: 'NEC', position: 'aanvaller', minutes: 90, points: 5 }, { opponent: 'N.E.C.', position: 'aanvaller', minutes: 45, points: 2 }])[0]
assert.equal(lowSample.pointsPer90, 4.7, 'kleine tegenstandersample blijft zichtbaar')
assert.equal(lowSample.positions.aanvaller.pointsPer90, 4.7, 'kleine positionele sample blijft zichtbaar')
assert.equal(lowSample.positions.aanvaller.confidence, 'middel', 'twee waarnemingen hebben middelhoge zekerheid')
const validSample = aggregateOpponentRows([1,2,3].map(() => ({ opponent: 'N.E.C', position: 'aanvaller', minutes: 90, points: 6 })))[0]
assert.equal(validSample.pointsPer90, 6, 'punten per 90 worden werkelijk op minuten genormaliseerd')
assert.equal(validSample.positions.aanvaller.confidence,'middel','drie waarnemingen hebben middelhoge zekerheid')
assert.equal(aggregateOpponentRows([{opponent:'Ajax',position:'keeper',minutes:90,points:5}])[0].positions.keeper.confidence,'laag','één waarneming heeft lage zekerheid')
assert.equal(aggregateOpponentRows([1,2,3,4,5].map(()=>({opponent:'Ajax',position:'keeper',minutes:90,points:5})))[0].positions.keeper.confidence,'behoorlijk','vijf onafhankelijke wedstrijden hebben behoorlijke zekerheid')
const positionSamples = aggregateOpponentRows([...['Doelman','keeper','goalkeeper'].map((position) => ({ opponent:'Go Ahead', position, minutes:90, points:4 })), ...['Spits','aanvaller','forward'].map((position) => ({ opponent:'Go Ahead Eagles', position, minutes:90, points:6 }))])[0]
assert.equal(positionSamples.positions.keeper.pointsPer90, 4, 'doelman-aliases produceren keeperstatistiek')
assert.equal(positionSamples.positions.aanvaller.pointsPer90, 6, 'spits-aliases produceren aanvalstatistiek')
assert.equal(positionSamples.opponent, 'Go Ahead Eagles', 'canonical tegenstander wordt samengevoegd')
const missingMinutes = aggregateOpponentRows([{ opponent:'Ajax', position:'Spits', minutes:null, points:8 }])
assert.equal(missingMinutes.length, 0, 'ontbrekende minuten worden veilig uitgesloten')
assert.equal(analysis.stats.fixtureSwings, analysis.stats.currentStructuralSwingCount + analysis.stats.upcomingSwingCount, 'Overview telt alleen current en upcoming structurele fixture-events')
const execInsight = (entityId, score=75) => ({ id:entityId, entityId, club:'Ajax', title:entityId, talkingPointScore:score })
const executive = selectExecutive({ positives:[execInsight('Rivera',90),execInsight('Valente',80)], negatives:[execInsight('Risk',75)], clubs:[{club:'Ajax',score:70},{club:'PSV',score:65}], players:[{id:'Budget',name:'Budget',value:2}], stories:[{...execInsight('Rivera',90),storyFamily:'market-mismatch'}] })
assert.equal(executive.underrated.entityId,'Rivera')
assert.equal(executive.development.entityId,'Valente','executive slot gebruikt volgende geldige subject')
assert.equal(new Set(Object.values(executive).filter(Boolean).map((item)=>item.entityId||item.club||item.id)).size,Object.values(executive).filter(Boolean).length,'executive subjects zijn divers')
const actionSelection = selectActionCenter([{...execInsight('Buy'),polarity:'positive',storyFamily:'market-mismatch'},{...execInsight('Risk'),polarity:'negative',storyFamily:'caution'},{...execInsight('Fixture'),polarity:'positive',storyFamily:'fixture'}])
assert.equal(new Set(actionSelection.map((item)=>item.insight.entityId)).size,actionSelection.length)
assert.ok(actionSelection.some((item)=>item.level==='voorzichtig'),'Action Center bewaart een cautionbeslissing')
assert.ok(analysis.players.every((p) => ['trajectoryScore','buyScore','cautionScore','underRadarScore'].every((key) => Number.isFinite(p[key]))), 'missing inputs worden nooit NaN/Infinity')
assert.ok(analysis.underRadar.length <= 25 && new Set(analysis.underRadar.map(p=>p.id)).size===analysis.underRadar.length, 'radar is positief, begrensd en uniek')
assert.ok(analysis.underRadar.every(p=>p.ownership<10&&p.availability>=65&&p.fixtureCount>0), 'radar bewaakt kwaliteit en lage populariteit')
assert.ok(analysis.overvalued.length<=20&&analysis.overvalued.every(x=>x.score>=62), 'overwaardering is begrensd en gebruikt de scoregrens')
const changed={...analysis.players[0],previousOwnership:20,ownership:24,previousExpectedPoints:2,expectedPoints:3}
const trendSignals=buildTrendSignals([changed])
assert.ok(trendSignals.some(x=>x.type==='ownership')&&trendSignals.some(x=>x.type==='projection'), 'trends vereisen aantoonbare vorige waarden')
assert.equal(buildTrendSignals([{...changed,previousOwnership:null,previousExpectedPoints:''}]).some(x=>['ownership','projection'].includes(x.type)),false,'lege vorige waarden worden niet als nul geïnterpreteerd')
assert.equal(buildUnderRadar(analysis.players,1).length<=1,true,'radarlimiet werkt')
assert.equal(buildOvervalued(analysis.players,1).length<=1,true,'overwaarderingslimiet werkt')
const earlyMinutes=(id,values,expected=75)=>({...analysis.players[0],id,name:id,availability:80,fixtureCount:1,expectedMinutes:expected,minutesTrend:{values,previous:values[0]??0,recent:values.at(-1)??0}})
assert.equal(buildMinutesSignals([earlyMinutes('up',[30,75])])[0].type,'minutes-up','early-season duidelijke stijging verschijnt')
assert.equal(buildMinutesSignals([earlyMinutes('down',[80,35],35)])[0].type,'minutes-down','early-season duidelijke daling verschijnt')
assert.equal(buildMinutesSignals([earlyMinutes('noise',[70,76])]).length,0,'minieme minutenruis blijft stil')
assert.ok(buildMinutesSignals(Array.from({length:20},(_,i)=>earlyMinutes(`m${i}`,i%2?[80,30]:[30,80]))).length<=10,'maximaal vijf minutenstijgers en vijf dalers')
assert.equal(buildTrendSignals([{...changed,previousOwnership:20,ownership:20,previousExpectedPoints:0,expectedPoints:0,minutesTrend:{values:[0,0],previous:0,recent:0}}]).length,0,'nul naar nul is geen daler of trend')
assert.ok(buildTrendSignals(Array.from({length:20},(_,i)=>({...changed,id:`t${i}`,previousOwnership:1,ownership:10+i}))).length<=12,'trends zijn begrensd op twaalf')
const minutesOnly={...changed,id:'minutes-only',minutesTrend:{values:[30,80],previous:30,recent:80},previousOwnership:null,previousExpectedPoints:null}
assert.equal(buildPlayerMovers([minutesOnly]).length,0,'pure minutenstijging maakt geen algemene stijger')
const multifactor={...changed,id:'multi',previousOwnership:2,ownership:6,previousExpectedPoints:2,expectedPoints:5,minutesTrend:{values:[30,80],previous:30,recent:80}}
assert.equal(buildPlayerMovers([multifactor])[0].player.id,'multi','multifactorverbetering wordt algemene stijger')
assert.equal(buildTrendSignals([minutesOnly]).length,0,'trends herhalen minutenontwikkeling niet')
assert.ok(buildMinutesSignals([minutesOnly]).every(x=>x.type.startsWith('minutes-')),'minutenontwikkeling blijft minuten-only')
const twoGamesManyRows=aggregateOpponentRows(Array.from({length:30},(_,i)=>({opponent:'Ajax',position:'middenvelder',minutes:90,points:5,fixtureId:`f${i%2}`})))[0]
assert.equal(twoGamesManyRows.matches,2,'unieke wedstrijden worden gededupliceerd')
assert.equal(twoGamesManyRows.observations,30,'spelerwaarnemingen blijven apart beschikbaar')
assert.equal(twoGamesManyRows.confidence,'middel','twee wedstrijden worden nooit hoog door veel spelerrecords')
const fiveGames=aggregateOpponentRows(Array.from({length:20},(_,i)=>({opponent:'PSV',position:'aanvaller',minutes:90,points:5,fixtureId:`p${i%5}`})))[0]
assert.equal(fiveGames.confidence,'behoorlijk','vijf onafhankelijke wedstrijden geven behoorlijke zekerheid')
assert.deepEqual(sortUpcomingFixtureSwings([{club:'B',startRound:9,delta:30},{club:'A',startRound:8,delta:16},{club:'C',startRound:9,delta:40}]).map(x=>x.club),['A','C','B'],'omslagpunten sorteren op ronde en daarna sterkte')
assert.equal(formatPremiumComparison({priceDifference:3.9,xpDifference:-17.9}),'€ 3.9 mln duurder · 17.9 xP minder','negatieve premiumtekst is natuurlijk')
assert.equal(formatPremiumComparison({priceDifference:3.9,xpDifference:2.4}),'€ 3.9 mln duurder · 2.4 xP extra','positieve premiumtekst is natuurlijk')
const keeperBudget=buildBudget([{...analysis.players[0],id:'g1',position:'keeper',price:5,expectedPoints:4,expectedMinutes:90,fixtureCount:1,value:.8},{...analysis.players[0],id:'g2',position:'keeper',price:7,expectedPoints:4.3,expectedMinutes:90,fixtureCount:1,value:.61}])
assert.equal(keeperBudget.positions[0].sweetSpot,'Geen duidelijk prijsvoordeel','homogene keepers krijgen geen schijnadvies')
assert.equal(positionSamples.positions.middenvelder.missingReason,'Geen geldige historische waarnemingen','ontbrekende tegenstanderdata krijgt een reden')

const purchaseFixtures = [3, 4, 5, 6, 7].flatMap(round => [
  { id:`pa${round}`, season:'P', round, home:'Ajax', away:`T${round}`, difficultyHome:3, difficultyAway:3 },
  ...(round === 5 ? [{ id:'pa5b', season:'P', round, home:'Ajax', away:'Extra', difficultyHome:3, difficultyAway:3 }] : []),
])
assert.equal(determinePurchaseHorizon({ season:'P', startRound:3, fixtures:purchaseFixtures }),4,'nabije DGW verlengt aankoopanalyse tot en met die cluster')
assert.equal(determinePurchaseHorizon({ season:'P', startRound:3, fixtures:purchaseFixtures.filter(fixture=>fixture.id!=='pa5b') }),4,'zonder DGW blijft de stabiele vier-rondenhorizon gelden')

const projectedPurchasePlayer = (id, position, points, extra={}) => ({
  id, name:id, club:'Ajax', season:'P', fantasyPosition:position, endPrice:7, selectedPct:8,
  expectedPointsProjection:{ rounds:points.map((expectedPoints,index)=>({ round:index+3, type:index===2&&extra.double?'double':'single', fixtureCount:index===2&&extra.double?2:1, expectedPoints, expectedMinutes:index===2&&extra.double?176:88, appearanceProbability:.98 })) },
  outlook:{ form:7 }, ...extra,
})
const comparePurchases = candidates => buildAnalysis({ season:'P', startRound:3, horizon:3, players:candidates, fixtures:purchaseFixtures, results:[], teamRatings:[] }).players
const backVsCb = comparePurchases([
  projectedPurchasePlayer('CB','verdediger',[6.2,6.1,6,2]),
  projectedPurchasePlayer('Back','verdediger',[6,6,6,7],{ tacticalRole:'RWB', assistsPer90:.28, xA:.22 }),
])
assert.ok(backVsCb.find(item=>item.id==='Back').buyScore > backVsCb.find(item=>item.id==='CB').buyScore,'aanvallende back met betere horizon passeert CB met minieme korte-termijnvoorsprong')
const strongCb = comparePurchases([
  projectedPurchasePlayer('Sterke CB','verdediger',[9,9,9,8]),
  projectedPurchasePlayer('Back 2','verdediger',[6,6,6,7],{ tacticalRole:'LWB', assistsPer90:.3, xA:.25 }),
])
assert.ok(strongCb.find(item=>item.id==='Sterke CB').buyScore > strongCb.find(item=>item.id==='Back 2').buyScore,'duidelijk sterkere CB wint ondanks upside van back')
const dgwComparison = comparePurchases([
  projectedPurchasePlayer('Redelijke DGW','middenvelder',[5,5,8,5],{ double:true }),
  projectedPurchasePlayer('Sterke SGW','middenvelder',[6,6,6,6]),
  projectedPurchasePlayer('Slechte DGW','middenvelder',[4,4,2,4],{ double:true }),
])
assert.equal(dgwComparison.find(item=>item.id==='Redelijke DGW').purchaseProjection.expectedPoints,23,'DGW-projecties tellen beide fixtures exact op')
assert.ok(dgwComparison.find(item=>item.id==='Sterke SGW').buyScore > dgwComparison.find(item=>item.id==='Slechte DGW').buyScore,'slechte DGW krijgt geen kunstmatige vaste bonus')
const holdComparison = comparePurchases([
  projectedPurchasePlayer('Korte piek','aanvaller',[9,2,2,2]),
  projectedPurchasePlayer('Houdbaar','aanvaller',[6,6,6,6]),
])
assert.ok(holdComparison.find(item=>item.id==='Houdbaar').buyScore > holdComparison.find(item=>item.id==='Korte piek').buyScore,'goede meerweekse houdwaarde weegt bij vergelijkbaar kort profiel')
assert.equal(calculatePurchasePositionUpside({ position:'verdediger' }),0,'ontbrekende subpositiedata verzint geen rol')
assert.ok(calculatePurchasePositionUpside({ position:'verdediger', tacticalRole:'RB', assistsPer90:.2 }) > 0,'expliciete backrol en attacking data leveren lichte upside')
assert.ok(dgwComparison.every(item=>Number.isFinite(item.buyScore)&&item.purchaseHorizon===4),'normale kooplogica blijft eindig en begrensd')
console.log('Analysis Engine: 91 kerncontroles geslaagd.')
