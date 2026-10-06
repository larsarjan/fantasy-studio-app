import { normalizeClubName } from './historyAnalytics.js'

const COMPETITION_LOGOS=Object.freeze({
  UCL:new URL('../assets/competitions/ucl.png',import.meta.url).href,
  UEL:new URL('../assets/competitions/uel.png',import.meta.url).href,
  UECL:new URL('../assets/competitions/uecl.png',import.meta.url).href,
})
const COMPETITION_EMBLEMS=Object.freeze({
  UCL:new URL('../assets/competitions/ucl-emblem.png',import.meta.url).href,
  UEL:new URL('../assets/competitions/uel-emblem.png',import.meta.url).href,
  UECL:new URL('../assets/competitions/uecl-emblem.png',import.meta.url).href,
})

export const EUROPEAN_COMPETITIONS = Object.freeze({
  UCL: Object.freeze({ code:'UCL', name:'UEFA Champions League', label:'CHAMPIONS LEAGUE', primary:'#102B72', accent:'#2F6BFF', light:'#EAF1FF', icon:'starball' }),
  UEL: Object.freeze({ code:'UEL', name:'UEFA Europa League', label:'EUROPA LEAGUE', primary:'#171717', accent:'#F57C00', light:'#FFF2E3', icon:'trophy' }),
  UECL: Object.freeze({ code:'UECL', name:'UEFA Conference League', label:'CONFERENCE LEAGUE', primary:'#063D32', accent:'#2BBE68', light:'#EAF8EF', icon:'ring' }),
})

const text=value=>String(value??'').trim()
const field=(row,names)=>{for(const name of names)if(row?.[name]!==undefined&&text(row[name]))return row[name];return''}
const canonicalClub=value=>normalizeClubName(value)
const CLUB_DISPLAY_NAMES=Object.freeze({nec:'N.E.C.',feyenoord:'Feyenoord',psv:'PSV',az:'AZ',ajax:'Ajax','fc twente':'FC Twente'})
const displayClub=value=>CLUB_DISPLAY_NAMES[canonicalClub(value)]??text(value)
const escapeHtml=value=>text(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))

export function resolveEuropeanCompetition(value){
  const normalized=text(value).toLowerCase()
  if(normalized==='ucl'||normalized.includes('champions'))return EUROPEAN_COMPETITIONS.UCL
  if(normalized==='uecl'||normalized.includes('conference'))return EUROPEAN_COMPETITIONS.UECL
  if(normalized==='uel'||normalized.includes('europa'))return EUROPEAN_COMPETITIONS.UEL
  return null
}

export function normalizeEuropeanFixture(row,index=0){
  const competition=resolveEuropeanCompetition(field(row,['competitie','competition']))
  const homeAway=text(field(row,['thuisUit','homeAway'])).toUpperCase()
  const date=text(field(row,['datum','date']))
  const rawClub=field(row,['club']),club=displayClub(rawClub)
  if(!competition||!canonicalClub(club)||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
  return {
    europeMatchId:text(field(row,['europeMatchId','id']))||`europe-${index+1}`,
    club,date,time:text(field(row,['tijd','time'])),competition:competition.code,
    phase:text(field(row,['fase','phase'])),europeanRound:text(field(row,['speelrondeEuropa','europeanRound'])),
    opponent:text(field(row,['tegenstander','opponent'])),homeAway:homeAway==='T'?'T':homeAway==='U'?'U':'',
    status:text(field(row,['status'])),source:text(field(row,['bron','source'])),sourceUrl:text(field(row,['bronUrl','sourceUrl'])),
  }
}

export function europeanFixtureTimestamp(fixture,{requireTime=false}={}){
  const rawDate=text(fixture?.date),rawTime=text(fixture?.time)
  const match=rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)??rawDate.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if(!match)return null
  const isoFirst=match[1].length===4
  const year=Number(isoFirst?match[1]:match[3]),month=Number(match[2]),day=Number(isoFirst?match[3]:match[1])
  const timeMatch=rawTime.match(/^(\d{1,2}):(\d{2})$/)
  if(requireTime&&!timeMatch)return null
  const hours=Number(timeMatch?.[1]??12),minutes=Number(timeMatch?.[2]??0)
  if(month<1||month>12||day<1||day>31||hours>23||minutes>59)return null
  const value=new Date(year,month-1,day,hours,minutes,0,0)
  if(value.getFullYear()!==year||value.getMonth()!==month-1||value.getDate()!==day)return null
  return value.getTime()
}

export function calendarDayDifference(laterTimestamp,earlierTimestamp){
  if(!Number.isFinite(laterTimestamp)||!Number.isFinite(earlierTimestamp)||laterTimestamp<=earlierTimestamp)return null
  const later=new Date(laterTimestamp),earlier=new Date(earlierTimestamp)
  return Math.max(1,Math.round((Date.UTC(later.getFullYear(),later.getMonth(),later.getDate())-Date.UTC(earlier.getFullYear(),earlier.getMonth(),earlier.getDate()))/86400000))
}

export function getEuropeanFixturesForClub(fixtures,club){
  const key=canonicalClub(club)
  return (fixtures??[]).filter(fixture=>canonicalClub(fixture.club)===key).sort((a,b)=>(europeanFixtureTimestamp(a)??Infinity)-(europeanFixtureTimestamp(b)??Infinity)||a.europeMatchId.localeCompare(b.europeMatchId,'nl'))
}

function leagueFixtureForContext(fixture,daysField,days){
  if(!fixture)return null
  return {fixtureId:fixture.id,homeTeam:fixture.home,awayTeam:fixture.away,date:fixture.date,time:fixture.time,[daysField]:days}
}

export function findLeagueFixturesAroundEuropeanFixture(europeanFixture,eredivisieFixtures,club){
  const europeanTime=europeanFixtureTimestamp(europeanFixture,{requireTime:true}),clubKey=canonicalClub(club||europeanFixture?.club)
  if(europeanTime===null||!clubKey)return {previousLeagueFixture:null,nextLeagueFixture:null}
  const fixtures=(eredivisieFixtures??[])
    .filter(fixture=>canonicalClub(fixture.home)===clubKey||canonicalClub(fixture.away)===clubKey)
    .map(fixture=>({fixture,timestamp:europeanFixtureTimestamp(fixture,{requireTime:true})}))
    .filter(item=>item.timestamp!==null)
    .sort((a,b)=>a.timestamp-b.timestamp)
  const previous=[...fixtures].reverse().find(item=>item.timestamp<europeanTime)
  const next=fixtures.find(item=>item.timestamp>europeanTime)
  return {
    previousLeagueFixture:leagueFixtureForContext(previous?.fixture,'daysAfterPreviousLeagueFixture',previous?calendarDayDifference(europeanTime,previous.timestamp):null),
    nextLeagueFixture:leagueFixtureForContext(next?.fixture,'daysBeforeNextLeagueFixture',next?calendarDayDifference(next.timestamp,europeanTime):null),
  }
}

export function applyEuropeanContextGate(context,maximumDays=7){
  const previous=context?.previousLeagueFixture??null,next=context?.nextLeagueFixture??null
  const previousContextEligible=Boolean(previous&&previous.daysAfterPreviousLeagueFixture<=maximumDays)
  const nextContextEligible=Boolean(next&&next.daysBeforeNextLeagueFixture<=maximumDays)
  return {
    previousLeagueFixture:previousContextEligible?previous:null,
    nextLeagueFixture:nextContextEligible?next:null,
    previousContextEligible,
    nextContextEligible,
  }
}

export function buildEuropeanOverlayPlacements(visibleLeagueFixtures,allLeagueFixtures,europeanFixtures,club){
  const visibleIds=new Set((visibleLeagueFixtures??[]).map(fixture=>String(fixture.id)))
  const unique=new Map()
  getEuropeanFixturesForClub(europeanFixtures,club).forEach(fixture=>{
    if(unique.has(fixture.europeMatchId))return
    const context=applyEuropeanContextGate(findLeagueFixturesAroundEuropeanFixture(fixture,allLeagueFixtures,club))
    const previousId=context.previousLeagueFixture?.fixtureId
    const nextId=context.nextLeagueFixture?.fixtureId
    const previousVisible=previousId!==undefined&&visibleIds.has(String(previousId))
    const nextVisible=nextId!==undefined&&visibleIds.has(String(nextId))
    if(!previousVisible&&!nextVisible)return
    unique.set(fixture.europeMatchId,{
      fixture,
      previousLeagueFixture:context.previousLeagueFixture,
      nextLeagueFixture:context.nextLeagueFixture,
      anchorFixtureId:previousVisible?previousId:nextId,
      placement:previousVisible?'after':'before',
      previousVisible,
      nextVisible,
    })
  })
  return [...unique.values()].sort((a,b)=>(europeanFixtureTimestamp(a.fixture)??Infinity)-(europeanFixtureTimestamp(b.fixture)??Infinity))
}

export function findEuropeanFixtureContext(eredivisieFixture,club,europeanFixtures,{maximumDays=4}={}){
  const base=europeanFixtureTimestamp(eredivisieFixture)
  if(base===null)return {before:[],after:[],between:false,shortRest:false}
  const day=86400000,rows=getEuropeanFixturesForClub(europeanFixtures,club).map(fixture=>({fixture,differenceDays:(europeanFixtureTimestamp(fixture)-base)/day})).filter(item=>Number.isFinite(item.differenceDays)&&Math.abs(item.differenceDays)<=maximumDays&&Math.abs(item.differenceDays)>.01)
  const convert=item=>({...item,days:Math.max(1,Math.round(Math.abs(item.differenceDays)))})
  const before=rows.filter(item=>item.differenceDays<0).map(convert).sort((a,b)=>a.days-b.days)
  const after=rows.filter(item=>item.differenceDays>0).map(convert).sort((a,b)=>a.days-b.days)
  const minimum=[...before,...after].reduce((value,item)=>Math.min(value,item.days),Infinity)
  return {before,after,between:Boolean(before.length&&after.length),shortRest:minimum<=3,minimumRestDays:Number.isFinite(minimum)?minimum:null}
}

export function combineEuropeanSchedule(eredivisieFixtures,europeanFixtures,club,{showEurope=true,paddingDays=4}={}){
  const domestic=(eredivisieFixtures??[]).map(fixture=>({kind:'eredivisie',fixture,timestamp:europeanFixtureTimestamp(fixture)}))
  if(!showEurope||!domestic.length)return domestic
  const timestamps=domestic.map(item=>item.timestamp).filter(Number.isFinite),padding=paddingDays*86400000
  const minimum=Math.min(...timestamps)-padding,maximum=Math.max(...timestamps)+padding
  const europe=getEuropeanFixturesForClub(europeanFixtures,club).filter(fixture=>{const time=europeanFixtureTimestamp(fixture);return time!==null&&time>=minimum&&time<=maximum}).map(fixture=>({kind:'europe',fixture,timestamp:europeanFixtureTimestamp(fixture)}))
  return [...domestic,...europe].sort((a,b)=>(a.timestamp??Infinity)-(b.timestamp??Infinity)||a.kind.localeCompare(b.kind))
}

export function calculateProgrammeDensity(domesticFixtures,europeanFixtures,club,anchorDate){
  const anchor=typeof anchorDate==='number'?anchorDate:europeanFixtureTimestamp({date:anchorDate,time:'12:00'}),window=14*86400000
  if(anchor===null)return {count:0,label:'Normaal'}
  const domestic=(domesticFixtures??[]).filter(f=>canonicalClub(f.home)===canonicalClub(club)||canonicalClub(f.away)===canonicalClub(club))
  const all=[...domestic,...getEuropeanFixturesForClub(europeanFixtures,club)]
  const count=all.filter(f=>{const time=europeanFixtureTimestamp(f);return time!==null&&time>=anchor&&time<anchor+window}).length
  return {count,label:count>=5?'Extreem druk':count===4?'Zeer druk':count===3?'Druk':'Normaal'}
}

export function renderEuropeanCompetitionLogo(code,{variant='overlay'}={}){
  const identity=EUROPEAN_COMPETITIONS[code]??EUROPEAN_COMPETITIONS.UECL
  const source=variant==='floating'?COMPETITION_EMBLEMS[identity.code]:COMPETITION_LOGOS[identity.code]
  return `<span class="competition-logo competition-logo--${identity.code.toLowerCase()} competition-logo--${variant}"><img src="${source}" alt="" aria-hidden="true"></span>`
}

export function renderEuropeanCompetitionIcon(code){return renderEuropeanCompetitionLogo(code)}

export function renderEuropeanPlacementOverlay(placement){
  const fixture=placement?.fixture,identity=EUROPEAN_COMPETITIONS[fixture?.competition]
  if(!fixture||!identity)return''
  return `<span class="european-context is-overlay" data-europe-placement="${placement.placement}" data-europe-previous-id="${escapeHtml(placement.previousLeagueFixture?.fixtureId)}" data-europe-next-id="${escapeHtml(placement.nextLeagueFixture?.fixtureId)}" style="--europe-accent:${identity.accent};--europe-primary:${identity.primary}">${renderEuropeanCompetitionLogo(identity.code,{variant:'floating'})}<span class="european-context-badge is-${identity.code.toLowerCase()}" role="button" tabindex="0" aria-label="Open details van ${escapeHtml(identity.name)} tegen ${escapeHtml(fixture.opponent)}" data-europe-context-id="${escapeHtml(fixture.europeMatchId)}"><span class="european-context-identity"><span><small>${identity.code} · ${identity.label}</small></span></span><span class="european-context-match">${escapeHtml(fixture.opponent)} (${fixture.homeAway})</span></span></span>`
}

export function renderEuropeanCompareBadge(placement,club){
  const fixture=placement?.fixture,identity=EUROPEAN_COMPETITIONS[fixture?.competition]
  if(!fixture||!identity)return''
  return `<span class="compare-europe-context" data-europe-placement="${placement.placement}" style="--europe-accent:${identity.accent};--europe-primary:${identity.primary}"><span class="compare-europe-badge" role="button" tabindex="0" aria-label="Open details van ${escapeHtml(identity.name)} tegen ${escapeHtml(fixture.opponent)}" data-europe-context-id="${escapeHtml(fixture.europeMatchId)}" data-europe-club="${escapeHtml(club||fixture.club)}">${renderEuropeanCompetitionLogo(identity.code,{variant:'compare'})}<span class="compare-europe-copy"><small>${identity.code}</small><strong>${escapeHtml(fixture.opponent)}</strong></span><b>${fixture.homeAway||'â€“'}</b></span></span>`
}

export function renderEuropeanFixtureCard(fixture,{compact=false}={}){
  const identity=EUROPEAN_COMPETITIONS[fixture.competition]??EUROPEAN_COMPETITIONS.UECL
  const home=fixture.homeAway==='T'?fixture.club:fixture.opponent,away=fixture.homeAway==='T'?fixture.opponent:fixture.club
  const round=[fixture.phase,fixture.europeanRound?`R${fixture.europeanRound}`:''].filter(Boolean).join(' · ')
  return `<article class="european-fixture-card is-${identity.code.toLowerCase()} ${compact?'is-compact':''}" style="--europe-primary:${identity.primary};--europe-accent:${identity.accent};--europe-light:${identity.light}" data-europe-fixture-id="${escapeHtml(fixture.europeMatchId)}"><header>${renderEuropeanCompetitionLogo(identity.code,{variant:'detail'})}<b>${identity.label}</b><time>${formatEuropeanDate(fixture)}</time></header><div class="european-teams"><strong>${escapeHtml(home)}</strong><span>vs</span><strong>${escapeHtml(away)}</strong></div><footer><b>${fixture.homeAway==='T'?'THUIS':'UIT'}</b>${round?`<span>${escapeHtml(round)}</span>`:''}</footer></article>`
}

export function renderEuropeanContextBadges(context,{interactive=false,placement='after'}={}){
  const rows=[...context.before.map(item=>({...item,relative:'ervoor'})),...context.after.map(item=>({...item,relative:'erna'}))]
  if(!rows.length)return''
  const attributes=item=>interactive?` role="button" tabindex="0" aria-label="Open details van ${escapeHtml(item.fixture.competition)} tegen ${escapeHtml(item.fixture.opponent)}" data-europe-context-id="${escapeHtml(item.fixture.europeMatchId)}"`:''
  const primaryIdentity=EUROPEAN_COMPETITIONS[rows[0].fixture.competition]??EUROPEAN_COMPETITIONS.UECL
  return `<span class="european-context${interactive?' is-overlay':''}" data-europe-placement="${placement}" style="--europe-accent:${primaryIdentity.accent};--europe-primary:${primaryIdentity.primary}">${rows.map(item=>{const identity=EUROPEAN_COMPETITIONS[item.fixture.competition];return `<span class="european-context-badge is-${identity.code.toLowerCase()}" style="--europe-accent:${identity.accent};--europe-primary:${identity.primary}"${attributes(item)}><span class="european-context-identity"><span class="european-context-icon">${renderEuropeanCompetitionIcon(identity.code)}</span><span><small>${identity.code}</small><b>${identity.label}</b></span></span><span class="european-context-match">${escapeHtml(item.fixture.opponent)} (${item.fixture.homeAway})</span></span>`}).join('')}</span>`
}

export function formatEuropeanDate(fixture){
  const [year,month,day]=text(fixture.date).split('-').map(Number),date=new Date(year,month-1,day),label=new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short'}).format(date).replace('.','')
  return `${label}${fixture.time?` · ${escapeHtml(fixture.time)}`:''}`
}
