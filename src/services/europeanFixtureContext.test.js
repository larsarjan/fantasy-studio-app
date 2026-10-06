import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { EUROPEAN_COMPETITIONS, applyEuropeanContextGate, buildEuropeanOverlayPlacements, calculateProgrammeDensity, calendarDayDifference, combineEuropeanSchedule, europeanFixtureTimestamp, findEuropeanFixtureContext, findLeagueFixturesAroundEuropeanFixture, formatEuropeanDate, getEuropeanFixturesForClub, normalizeEuropeanFixture, renderEuropeanCompetitionLogo, renderEuropeanCompareBadge, renderEuropeanContextBadges, renderEuropeanFixtureCard, renderEuropeanPlacementOverlay, resolveEuropeanCompetition } from './europeanFixtureContext.js'
import { calculateEuropeanOverlayPosition, createFixturesScreen, renderEuropeanContextOverlay, renderEuropeanFixtureDetailPanel, resolveEuropeanOverlayLayout } from '../modules/fixtures.js'

assert.equal(resolveEuropeanCompetition('UEFA Champions League').code,'UCL')
assert.equal(resolveEuropeanCompetition('UEFA Europa League').code,'UEL')
assert.equal(resolveEuropeanCompetition('UEFA Conference League').code,'UECL')
assert.equal(EUROPEAN_COMPETITIONS.UCL.accent,'#2F6BFF')
assert.equal(EUROPEAN_COMPETITIONS.UEL.accent,'#F57C00')
assert.equal(EUROPEAN_COMPETITIONS.UECL.accent,'#2BBE68')

const nec=normalizeEuropeanFixture({europeMatchId:'eu-1',club:'N.E.C.',datum:'2026-09-17',tijd:'21:00',competitie:'UEFA Europa League',fase:'League phase',speelrondeEuropa:'1',tegenstander:'Juventus',thuisUit:'U',status:'gepland',bron:'UEFA',bronUrl:'https://example.test'})
assert.equal(nec.club,'N.E.C.')
assert.equal(getEuropeanFixturesForClub([nec],'NEC').length,1)
assert.equal(nec.competition,'UEL')
assert.equal(normalizeEuropeanFixture({club:'Ajax',datum:'ongeldig',competitie:'UEFA Conference League'}),null)
assert.equal(europeanFixtureTimestamp({date:'2026-10-15',time:'21:00'}),europeanFixtureTimestamp({date:'15-10-2026',time:'21:00'}))
assert.ok(europeanFixtureTimestamp({date:'2026-10-10',time:'21:00'})<europeanFixtureTimestamp({date:'2026-10-15',time:'21:00'}))
assert.equal(calendarDayDifference(europeanFixtureTimestamp({date:'2026-10-18',time:'14:30'}),europeanFixtureTimestamp({date:'2026-10-15',time:'21:00'})),3)
assert.equal(europeanFixtureTimestamp({date:'2026-10-15',time:''},{requireTime:true}),null)

const before={...nec,europeMatchId:'before',date:'2026-09-17'}
const after={...nec,europeMatchId:'after',date:'2026-09-24',time:'14:30',competition:'UEL',opponent:'Levski Sofia',homeAway:'T'}
const domestic={id:'ered-1',date:'2026-09-20',time:'14:30',home:'NEC',away:'Feyenoord',round:5}
const context=findEuropeanFixtureContext(domestic,'N.E.C.',[before,after])
assert.equal(context.before[0].days,3)
assert.equal(context.after[0].days,4)
assert.equal(context.between,true)
assert.equal(context.shortRest,true)
assert.doesNotMatch(renderEuropeanContextBadges(context),/KORTE RUST|dagen ervoor|dagen erna|TUSSEN EUROPESE DUELS/)
assert.equal((renderEuropeanContextBadges(context).match(/european-context-badge/g)??[]).length,2)
const interactiveOverlay=renderEuropeanContextBadges(context,{interactive:true})
assert.match(interactiveOverlay,/data-europe-context-id="before"/)
assert.match(interactiveOverlay,/EUROPA LEAGUE/)
assert.match(interactiveOverlay,/<img[^>]+uel\.png/)
assert.match(interactiveOverlay,/Juventus \(U\)/)
assert.doesNotMatch(interactiveOverlay,/dagen ervoor|dagen erna|KORTE RUST|TUSSEN EUROPESE DUELS/)
assert.match(renderEuropeanContextBadges(findEuropeanFixtureContext(domestic,'Ajax',[{...before,club:'Ajax',competition:'UECL'}]),{interactive:true}),/CONFERENCE LEAGUE/)
assert.match(renderEuropeanContextBadges(findEuropeanFixtureContext(domestic,'PSV',[{...before,club:'PSV',competition:'UCL'}]),{interactive:true}),/CHAMPIONS LEAGUE/)

for (const [club,competition] of [['Ajax','UECL'],['PSV','UCL'],['AZ','UEL'],['FC Twente','UECL'],['N.E.C.','UEL']]) {
  const european={...before,europeMatchId:`${club}-europe`,club,competition}
  const league={...domestic,id:`${club}-league`,home:club,away:'FC Utrecht'}
  const clubContext=findEuropeanFixtureContext(league,club,[european])
  assert.equal(clubContext.before.length,1)
  assert.match(renderEuropeanContextBadges(clubContext),new RegExp(competition))
  const previousLeague={...league,id:`${club}-previous`,date:'2026-09-16'}
  const nextLeague={...league,id:`${club}-next`,date:'2026-09-21'}
  const placements=buildEuropeanOverlayPlacements([previousLeague,nextLeague],[previousLeague,nextLeague],[european,european],club)
  assert.equal(placements.length,1,`${club}: één europeMatchId mag maar één overlay opleveren`)
  assert.equal(placements[0].previousLeagueFixture.fixtureId,previousLeague.id)
  assert.equal(placements[0].nextLeagueFixture.fixtureId,nextLeague.id)
}
assert.equal(findEuropeanFixtureContext({...domestic,home:'FC Utrecht'},'FC Utrecht',[before]).before.length,0)
assert.equal(renderEuropeanContextBadges(findEuropeanFixtureContext(domestic,'N.E.C.',[])), '')
const renderedCardOverlay=renderEuropeanContextOverlay(domestic,'N.E.C.',[before,after],true)
assert.match(renderedCardOverlay,/class="european-context is-overlay"/)
assert.match(renderedCardOverlay,/data-europe-context-id="before"/)
assert.equal(renderEuropeanContextOverlay(domestic,'N.E.C.',[before,after],false),'')
const twenteEurope={...before,europeMatchId:'twente-thun',club:'FC Twente',date:'2026-10-15',time:'21:00',competition:'UECL',opponent:'FC Thun',homeAway:'T'}
const twenteLeague=[
  {id:'twente-fortuna',date:'2026-10-10',time:'21:00',home:'Fortuna Sittard',away:'FC Twente',round:8},
  {id:'twente-utrecht',date:'2026-10-18',time:'14:30',home:'FC Twente',away:'FC Utrecht',round:9},
]
const twenteContext=findLeagueFixturesAroundEuropeanFixture(twenteEurope,twenteLeague,'FC Twente')
assert.equal(twenteContext.previousLeagueFixture.fixtureId,'twente-fortuna')
assert.equal(twenteContext.previousLeagueFixture.daysAfterPreviousLeagueFixture,5)
assert.equal(twenteContext.nextLeagueFixture.fixtureId,'twente-utrecht')
assert.equal(twenteContext.nextLeagueFixture.daysBeforeNextLeagueFixture,3)
const incompleteAjaxFixture={id:'ajax-incomplete',date:'2026-10-14',time:'',home:'Ajax',away:'PEC Zwolle'}
const ajaxEurope={...twenteEurope,europeMatchId:'ajax-hajduk',club:'Ajax',date:'2026-10-15',time:'18:45',competition:'UECL',opponent:'Hajduk Split'}
const ajaxLeague=[
  {id:'ajax-nec',date:'2026-10-10',time:'20:00',home:'Ajax',away:'N.E.C.'},
  incompleteAjaxFixture,
  {id:'groningen-ajax',date:'2026-10-18',time:'16:45',home:'FC Groningen',away:'Ajax'},
]
const ajaxContext=findLeagueFixturesAroundEuropeanFixture(ajaxEurope,ajaxLeague,'Ajax')
assert.equal(ajaxContext.previousLeagueFixture.fixtureId,'ajax-nec','Een rij zonder aftraptijd mag geen chronologische buur worden')
assert.equal(ajaxContext.nextLeagueFixture.fixtureId,'groningen-ajax')

const currentTimelineCases=[
  ['Ajax','Hajduk Split','2026-10-15','18:45','Ajax - N.E.C.','2026-10-10','21:00','FC Groningen - Ajax','2026-10-18','16:45'],
  ['Ajax','Atalanta','2026-10-22','21:00','FC Groningen - Ajax','2026-10-18','16:45','Sparta Rotterdam - Ajax','2026-10-25','14:30'],
  ['Ajax','FC Midtjylland','2026-11-05','18:45','Ajax - AZ','2026-10-31','21:00','FC Twente - Ajax','2026-11-08','14:30'],
  ['Ajax','FC Thun','2026-11-26','18:45','FC Twente - Ajax','2026-11-08','14:30','Ajax - Sparta Rotterdam','2027-05-16','14:30'],
  ['Ajax','Sint-Truidense','2026-12-10','21:00','FC Twente - Ajax','2026-11-08','14:30','Ajax - Sparta Rotterdam','2027-05-16','14:30'],
  ['Ajax','Getafe','2026-12-17','21:00','FC Twente - Ajax','2026-11-08','14:30','Ajax - Sparta Rotterdam','2027-05-16','14:30'],
  ['PSV','Shakhtar Donetsk','2026-09-10','18:45','Ajax - PSV','2026-09-05','20:00','PSV - Sparta Rotterdam','2026-09-13','14:30'],
  ['PSV','RB Leipzig','2026-10-13','21:00','PSV - sc Heerenveen','2026-10-10','16:30','ADO den Haag - PSV','2026-10-17','16:30'],
  ['PSV','FC Porto','2026-10-20','21:00','ADO den Haag - PSV','2026-10-17','16:30','PSV - Feyenoord','2026-10-25','14:30'],
  ['PSV','Club Brugge','2026-11-04','21:00','PSV - Willem II','2026-10-31','18:45','Cambuur Leeuwarden - PSV','2026-11-07','20:00'],
  ['PSV','Real Madrid','2026-11-24','21:00','Cambuur Leeuwarden - PSV','2026-11-07','20:00','PSV - N.E.C.','2027-05-16','14:30'],
  ['PSV','Atlético de Madrid','2026-12-09','21:00','Cambuur Leeuwarden - PSV','2026-11-07','20:00','PSV - N.E.C.','2027-05-16','14:30'],
  ['PSV','Viking FK','2027-01-20','21:00','Cambuur Leeuwarden - PSV','2026-11-07','20:00','PSV - N.E.C.','2027-05-16','14:30'],
  ['PSV','VfB Stuttgart','2027-01-27','21:00','Cambuur Leeuwarden - PSV','2026-11-07','20:00','PSV - N.E.C.','2027-05-16','14:30'],
  ['AZ','Sunderland','2026-09-16','21:00','AZ - Willem II','2026-09-11','20:00','AZ - Telstar','2026-09-20','14:30'],
  ['N.E.C.','Juventus','2026-09-17','21:00','Cambuur Leeuwarden - N.E.C.','2026-09-13','14:30','N.E.C. - Go Ahead Eagles','2026-09-20','14:30'],
  ['FC Twente','FC Thun','2026-10-15','21:00','Fortuna Sittard - FC Twente','2026-10-10','21:00','FC Twente - FC Utrecht','2026-10-18','14:30'],
]
for(const [club,opponent,europeDate,europeTime,previousLabel,previousDate,previousTime,nextLabel,nextDate,nextTime] of currentTimelineCases){
  const [previousHome,previousAway]=previousLabel.split(' - '),[nextHome,nextAway]=nextLabel.split(' - ')
  const previous={id:`${club}-${opponent}-previous`,date:previousDate,time:previousTime,home:previousHome,away:previousAway}
  const next={id:`${club}-${opponent}-next`,date:nextDate,time:nextTime,home:nextHome,away:nextAway}
  const european={europeMatchId:`${club}-${opponent}`,club,date:europeDate,time:europeTime,competition:club==='PSV'?'UCL':club==='AZ'||club==='N.E.C.'?'UEL':'UECL',opponent,homeAway:'T'}
  const resolved=findLeagueFixturesAroundEuropeanFixture(european,[previous,next],club)
  assert.equal(resolved.previousLeagueFixture.fixtureId,previous.id,`${club} - ${opponent}: verkeerde previous`)
  assert.equal(resolved.nextLeagueFixture.fixtureId,next.id,`${club} - ${opponent}: verkeerde next`)
  const eligible=applyEuropeanContextGate(resolved)
  const expectedPlacements=eligible.previousContextEligible||eligible.nextContextEligible?1:0
  assert.equal(buildEuropeanOverlayPlacements([previous,next],[previous,next],[european,{...european}],club).length,expectedPlacements,`${club} - ${opponent}: onverwachte 7-dagen-placement`)
}
const twenteDetail=renderEuropeanFixtureDetailPanel(twenteEurope,{club:'FC Twente',eredivisieFixtures:twenteLeague})
assert.match(twenteDetail,/5 DAGEN NA/)
assert.match(twenteDetail,/Fortuna Sittard – FC Twente/)
assert.match(twenteDetail,/10 okt.*21:00/)
assert.match(twenteDetail,/3 DAGEN VOOR/)
assert.match(twenteDetail,/FC Twente – FC Utrecht/)
assert.match(twenteDetail,/18 okt.*14:30/)
assert.match(twenteDetail,/Korte rust/)
assert.match(twenteDetail,/tussen twee Eredivisiewedstrijden/)
assert.match(twenteDetail,/Deze wedstrijd telt niet mee voor Fantasy-punten\./)
const twentePlacements=buildEuropeanOverlayPlacements(twenteLeague,twenteLeague,[twenteEurope,{...twenteEurope}], 'FC Twente')
assert.equal(twentePlacements.length,1)
assert.equal(twentePlacements[0].anchorFixtureId,'twente-fortuna')
assert.equal(twentePlacements[0].previousLeagueFixture.fixtureId,'twente-fortuna')
assert.equal(twentePlacements[0].nextLeagueFixture.fixtureId,'twente-utrecht')
const placementHtml=renderEuropeanPlacementOverlay(twentePlacements[0])
assert.equal((placementHtml.match(/data-europe-context-id=/g)??[]).length,1)
assert.match(placementHtml,/data-europe-previous-id="twente-fortuna"/)
assert.match(placementHtml,/data-europe-next-id="twente-utrecht"/)
assert.match(placementHtml,/competition-logo--uecl competition-logo--floating/)
assert.match(placementHtml,/uecl-emblem\.png/)
assert.match(placementHtml,/UECL · CONFERENCE LEAGUE/)
assert.doesNotMatch(placementHtml,/competition-logo--overlay/)
const compareBadgeHtml=renderEuropeanCompareBadge(twentePlacements[0],'FC Twente')
assert.match(compareBadgeHtml,/class="compare-europe-context"/)
assert.match(compareBadgeHtml,/data-europe-context-id="twente-thun"/)
assert.match(compareBadgeHtml,/data-europe-club="FC Twente"/)
assert.match(compareBadgeHtml,/competition-logo--uecl competition-logo--compare.*uecl\.png/)
assert.match(compareBadgeHtml,/FC Thun/)
assert.match(compareBadgeHtml,/>T</)
assert.doesNotMatch(compareBadgeHtml,/DAGEN|Korte rust/)
assert.match(renderEuropeanCompetitionLogo('UCL',{variant:'overlay'}),/competition-logo--ucl competition-logo--overlay.*ucl\.png/)
assert.match(renderEuropeanCompetitionLogo('UCL',{variant:'floating'}),/ucl-emblem\.png/)
assert.match(renderEuropeanCompetitionLogo('UEL',{variant:'floating'}),/uel-emblem\.png/)
assert.match(renderEuropeanCompetitionLogo('UECL',{variant:'floating'}),/uecl-emblem\.png/)
assert.match(renderEuropeanCompetitionLogo('UEL',{variant:'detail'}),/competition-logo--uel competition-logo--detail.*uel\.png/)
assert.match(renderEuropeanCompetitionLogo('UECL',{variant:'legend'}),/competition-logo--uecl competition-logo--legend.*uecl\.png/)
const nextOnly=buildEuropeanOverlayPlacements([twenteLeague[1]],twenteLeague,[twenteEurope],'FC Twente')[0]
assert.equal(nextOnly.anchorFixtureId,'twente-utrecht')
assert.equal(nextOnly.placement,'before')
const previousOnly=buildEuropeanOverlayPlacements([twenteLeague[0]],twenteLeague,[twenteEurope],'FC Twente')[0]
assert.equal(previousOnly.anchorFixtureId,'twente-fortuna')
assert.equal(previousOnly.placement,'after')
assert.equal(buildEuropeanOverlayPlacements([],twenteLeague,[twenteEurope],'FC Twente').length,0)
const kairat={...twenteEurope,europeMatchId:'twente-kairat',date:'2026-12-17',opponent:'Kairat Almaty'}
const distantAjax={id:'twente-ajax',date:'2026-11-08',time:'14:30',home:'FC Twente',away:'Ajax'}
assert.equal(buildEuropeanOverlayPlacements([distantAjax],[distantAjax],[kairat],'FC Twente').length,0,'Kairat mag niet 39 dagen na Ajax als context verschijnen')
assert.equal(applyEuropeanContextGate(findLeagueFixturesAroundEuropeanFixture(kairat,[distantAjax],'FC Twente')).previousContextEligible,false)
const distantDetail=renderEuropeanFixtureDetailPanel(kairat,{club:'FC Twente',eredivisieFixtures:[distantAjax]})
assert.doesNotMatch(distantDetail,/39 DAGEN NA|FC Twente – Ajax/,'Een verre buur hoort ook niet in PROGRAMMACONTEXT')
const sevenDaysPrevious={...distantAjax,id:'seven-before',date:'2026-12-10'}
assert.equal(buildEuropeanOverlayPlacements([sevenDaysPrevious],[sevenDaysPrevious],[kairat],'FC Twente').length,1,'Exact zeven kalenderdagen blijft eligible')
assert.equal(resolveEuropeanOverlayLayout({top:100,height:278},{top:102,height:278}),'horizontal')
assert.equal(resolveEuropeanOverlayLayout({top:400,height:278},{top:100,height:278}),'vertical')
assert.equal(resolveEuropeanOverlayLayout({top:100,height:278},null),'outside')
const horizontalPosition=calculateEuropeanOverlayPosition({top:100,left:220,right:420,width:200,height:278},{top:100,left:0,right:200,width:200,height:278},'before',60)
assert.deepEqual(horizontalPosition,{layout:'horizontal',left:-10,top:292})
assert.equal(horizontalPosition.top-30,262,'Het logo mag 16px over de onderste kaartzone zweven terwijl de chip eronder blijft.')
const verticalPosition=calculateEuropeanOverlayPosition({top:500,left:0,right:200,bottom:778,width:200,height:278},{top:100,left:0,right:200,bottom:378,width:200,height:278},'before',60)
assert.equal(verticalPosition.layout,'vertical')
assert.equal(verticalPosition.top,-61)
const fixturesScreenHtml=createFixturesScreen()
assert.match(fixturesScreenHtml,/fixture-sticky-legend/)
assert.match(fixturesScreenHtml,/sticky-schema-legend/)
assert.match(fixturesScreenHtml,/>UCL</)
assert.match(fixturesScreenHtml,/>UEL</)
assert.match(fixturesScreenHtml,/>UECL</)

const schedule=combineEuropeanSchedule([domestic],[before,after],'NEC')
assert.deepEqual(schedule.map(item=>item.kind),['europe','eredivisie','europe'])
assert.equal(combineEuropeanSchedule([domestic],[before],'NEC',{showEurope:false}).length,1)
assert.equal(combineEuropeanSchedule([domestic],[before],'NEC',{showEurope:false})[0].fixture,domestic)
assert.match(renderEuropeanFixtureCard(before),/EUROPA LEAGUE/)
assert.match(renderEuropeanFixtureCard({...before,competition:'UCL'}),/CHAMPIONS LEAGUE/)
assert.match(renderEuropeanFixtureCard({...before,competition:'UECL'}),/CONFERENCE LEAGUE/)
assert.match(formatEuropeanDate({date:'2026-10-15',time:'18:45'}),/15 okt.*18:45/)

const density=calculateProgrammeDensity([domestic,{...domestic,id:'ered-2',date:'2026-09-27'}],[before,after],'NEC','2026-09-16')
assert.deepEqual(density,{count:4,label:'Zeer druk'})
const domesticSnapshot=JSON.stringify([domestic])
combineEuropeanSchedule([domestic],[before,after],'NEC')
assert.equal(JSON.stringify([domestic]),domesticSnapshot)

const fixturesModule=readFileSync(new URL('../modules/fixtures.js',import.meta.url),'utf8')
const fixturesCss=readFileSync(new URL('../fixtures.css',import.meta.url),'utf8')
const playersModule=readFileSync(new URL('../modules/players.js',import.meta.url),'utf8')
const compareModule=readFileSync(new URL('../modules/compareOutlook.js',import.meta.url),'utf8')
const databaseModule=readFileSync(new URL('./database.js',import.meta.url),'utf8')
for(const source of [fixturesModule,playersModule,compareModule])assert.match(source,/getEuropeanFixtures/)
assert.match(fixturesModule,/fixture-europe-toggle/)
assert.match(fixturesModule,/showEurope\?getEuropeanFixtures\(\):\[\]/)
assert.doesNotMatch(fixturesModule,/combineEuropeanSchedule\(list/)
assert.doesNotMatch(fixturesModule,/renderEuropeanFixtureCard\(scheduleItem/)
assert.match(fixturesModule,/renderEuropeanFixtureDetailPanel/)
assert.match(fixturesModule,/data-europe-context-id/)
assert.match(fixturesModule,/count: 5/)
assert.match(fixturesModule,/sticky-schema-legend/)
assert.match(fixturesModule,/IntersectionObserver/)
assert.match(fixturesModule,/buildEuropeanOverlayPlacements/)
assert.match(fixturesModule,/fixture-sticky-legend/)
assert.match(fixturesModule,/european-switch-track/)
assert.match(fixturesModule,/renderCompareEuropeanContext/)
assert.match(fixturesModule,/dataset\.europeClub/)
assert.match(fixturesModule,/selectedEuropeClub/)
assert.match(fixturesModule,/if \(isCompareMode\) europeControl\.remove\(\)/)
assert.match(fixturesModule,/id="compare-club-group-control"/)
assert.match(fixturesModule,/id="compare-club-group"/)
assert.match(fixturesModule,/manual: 'Handmatig'/)
assert.match(fixturesModule,/compareGroupSelect\.addEventListener\('change'/)
assert.match(fixturesModule,/state\.compareClubGroup = 'manual'/)
for(const group of ['top3','europe','challengers','midfield','relegation','promoted'])assert.match(fixturesModule,new RegExp(`${group}:`))
assert.doesNotMatch(fixturesModule,/state\.showEurope\s*\?\s*buildEuropeanOverlayPlacements\(visibleFixturesByClub/)
assert.match(fixturesCss,/\.fixture-sticky-legend\s*\{[^}]*position:\s*sticky/s)
assert.match(fixturesCss,/\.fixture-card-shell,[\s\S]*height:\s*278px/)
assert.match(fixturesCss,/grid-template-areas:\s*'club round europe count'/)
assert.match(fixturesCss,/--fixture-difficulty-gradient:/)
assert.match(fixturesCss,/\.sticky-europe-legend i img/)
assert.match(fixturesCss,/\.competition-logo--floating\s*\{[^}]*background:\s*transparent/s)
assert.match(fixturesCss,/\.competition-logo--floating\s*\{[^}]*opacity:\s*\.8/s)
assert.match(fixturesCss,/\.fixture-card-shell > \.european-context\.is-overlay\s*\{[^}]*gap:\s*12px/s)
assert.doesNotMatch(fixturesCss,/\.competition-logo img\s*\{[^}]*filter:/s)
assert.match(fixturesCss,/\.fixture-card \.difficulty-label-text\s*\{[^}]*white-space:\s*normal/s)
assert.match(fixturesCss,/\.fixture-card \.difficulty-label\s*\{[^}]*min-height:\s*48px/s)
assert.match(fixturesCss,/z-index:\s*40/)
assert.match(fixturesCss,/\.fixtures-module\s*\{[^}]*overflow:\s*visible/s)
assert.match(fixturesCss,/is-between-horizontal\[data-europe-placement="before"\]/)
assert.match(fixturesCss,/is-between-vertical\[data-europe-placement="before"\]/)
assert.match(fixturesCss,/z-index:\s*60/)
assert.match(fixturesCss,/\.fixture-strip\.has-european-overlays/)
assert.match(fixturesCss,/\.compare-europe-badge\s*\{[^}]*grid-template-columns:\s*28px minmax\(0, 1fr\) 22px/s)
assert.match(fixturesCss,/\.european-fixture-toggle > span:first-child\s*\{[^}]*position:\s*static/s)
for(const name of ['ucl','uel','uecl']){
  assert.equal(existsSync(new URL(`../assets/competitions/${name}.png`,import.meta.url)),true)
  assert.equal(existsSync(new URL(`../assets/competitions/${name}-emblem.png`,import.meta.url)),true)
}
assert.match(databaseModule,/if \(!getEuropeanFixtures\(\)\.length && hasPublishedSheet\('EUROPE_2026_27'\)\)/)

console.log('Europese fixture-contexttests geslaagd.')
