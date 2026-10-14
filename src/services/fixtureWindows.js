import {logoSlug,normalizeLogoClub} from './clubIdentity.js'
const clubKey=x=>logoSlug(x)||normalizeLogoClub(x)
const zone=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
export function kickoffTime(f){
 const explicit=f.kickoff_datetime||f.kickoffAt
 if(explicit&&/[zZ]|[+-]\d\d:\d\d$/.test(explicit)){const t=Date.parse(explicit);return Number.isFinite(t)?t:null}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date||'')||!/^\d{1,2}:\d{2}$/.test(f.time||''))return null
 const [y,m,d]=f.date.split('-').map(Number),[h,min]=f.time.split(':').map(Number)
 if(h>23||min>59)return null
 const target=Date.UTC(y,m-1,d,h,min);let instant=target
 for(let i=0;i<3;i++){const p=Object.fromEntries(zone.formatToParts(instant).map(x=>[x.type,x.value]));instant+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)}
 const p=Object.fromEntries(zone.formatToParts(instant).map(x=>[x.type,x.value]));return +p.year===y&&+p.month===m&&+p.day===d&&+p.hour===h&&+p.minute===min?instant:null
}
const fixtureId=f=>String(f.europeMatchId||f.id||'')
export function uniqueFixtures(fixtures){const byId=new Map();for(const f of fixtures){const key=fixtureId(f)||[f.season,f.competition,f.home||f.club,f.away||f.opponent,f.date,f.time].join('|');const old=byId.get(key);if(!old||String(f.updated_at||f.updatedAt||'')>String(old.updated_at||old.updatedAt||''))byId.set(key,f)}return [...byId.values()]}
export function roundWindows(fixtures){
 const rounds=new Map()
 for(const f of uniqueFixtures(fixtures)){const round=Number(f.round);if(!round)continue;const arr=rounds.get(round)||[];arr.push(f);rounds.set(round,arr)}
 let previous=-Infinity
 return [...rounds].sort((a,b)=>a[0]-b[0]).map(([round,rows])=>{
  const ends=rows.map(f=>{const explicit=Date.parse(f.completedAt||f.finishedAt||'');return Number.isFinite(explicit)?explicit:(kickoffTime(f)===null?null:kickoffTime(f)+120*60000)})
  const uncertain=ends.some(t=>t===null);const known=ends.filter(t=>t!==null);const rawEnd=known.length?Math.max(...known):previous
  const end=Math.max(previous,rawEnd),window={round,start:previous,end,uncertain,overlap:rawEnd<previous};previous=end;return window
 })
}
export function clubWindowFixtures({league,other=[],club,window,startMode='round',now=Date.now()}){
 const key=clubKey(club),all=[...uniqueFixtures(league).map(f=>({...f,competition:'ERE'})),...uniqueFixtures(other)]
 return all.filter(f=>[f.club,f.home,f.away].some(c=>c&&clubKey(c)===key)).map(f=>({fixture:f,kickoff:kickoffTime(f)})).filter(({fixture:f,kickoff:t})=>{
  if(/cancel|afgelast/i.test(f.status||''))return false
  if(t===null)return startMode==='round'&&f.competition==='ERE'&&Number(f.round)===window.round
  return t>window.start&&t<=window.end&&(startMode!=='now'||t>=now)
 }).sort((a,b)=>(a.kickoff??Infinity)-(b.kickoff??Infinity)||fixtureId(a.fixture).localeCompare(fixtureId(b.fixture)))
}
