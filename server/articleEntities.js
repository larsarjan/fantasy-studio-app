import {createClient} from '@supabase/supabase-js'
import {buildPlayerMatch,calculatePlayerMatchTotals,calculatePlayerMatchAverages} from '../src/services/playerMatchStatsEngine.js'
import {resolveHistoricalMatch} from '../src/services/historicalMatchDetails.js'
import {logoSlug,normalizeLogoClub} from '../src/services/clubIdentity.js'
import {entityId,entitySeason} from '../src/services/articleEntities.js'

const clubKey = name => logoSlug(name)||normalizeLogoClub(name)
export function fixtureResult(fixture,results) {
 const matches=results.filter(r=>String(r.season).replace('-','/')===String(fixture.season).replace('-','/')&&clubKey(r.home)===clubKey(fixture.home)&&clubKey(r.away)===clubKey(fixture.away)&&(Number(r.round)===Number(fixture.round)||r.date===fixture.date))
 return matches.length===1?matches[0]:null
}
export function presentArticleEntity(kind,data,now=new Date()) {
 if(kind==='fixtures')return {fixtures:data.fixtures.flatMap(f=>{const r=fixtureResult(f,data.results);return r?[{id:f.id,season:f.season,round:f.round,home:f.home,away:f.away,homeScore:r.homeScore,awayScore:r.awayScore}]:[]})}
 if(kind==='catalog')return {snapshotId:data.snapshotId,players:data.players,fixtures:data.fixtures.map(f=>{
  const result=fixtureResult(f,data.results),count=data.coverage.find(c=>c.id===f.id&&c.season===f.season)?.records||0
  return {...f,...(result?{homeScore:result.homeScore,awayScore:result.awayScore}:{}),hasResult:!!result,statCount:Number(count)}
 }).filter(f=>f.hasResult||f.statCount>0)}
 if(kind==='player') {
  const p=data.player,fixtures=new Map(data.fixtures.map(f=>[f.id,f]))
  const matches=data.stats.filter(s=>s.matchStatus===true).map(matchStat=>buildPlayerMatch({player:p,matchStat,fixture:fixtures.get(matchStat.fixtureId)})).sort((a,b)=>a.round-b.round)
  const totals=calculatePlayerMatchTotals(matches),averages=calculatePlayerMatchAverages(totals)
  const played=new Set(matches.map(m=>m.fixtureId))
  return {snapshotId:data.snapshotId,player:p,photos:data.photos,totalPoints:totals.punten.totaal,averagePoints:averages.puntenPerWedstrijd,
   recent:matches.filter(m=>m.played).slice(-5).map(m=>({fixtureId:m.fixtureId,round:m.round,minutes:m.minutes,points:m.punten.totaal})),
   upcoming:data.fixtures.filter(f=>!played.has(f.id)&&f.date>=now.toISOString().slice(0,10)&&(clubKey(f.home)===clubKey(p.club)||clubKey(f.away)===clubKey(p.club))).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5)}
 }
 const fixture=data.fixture,result=fixtureResult(fixture,data.results)
 const summary={snapshotId:data.snapshotId,fixture,result}
 if(kind==='summary')return summary
 // Reuse exactly the historical resolver and central score engine, on the server.
 return {...summary,groups:resolveHistoricalMatch({...fixture,...result,fixtureId:fixture.id,home:fixture.home,away:fixture.away},[fixture],data.players,data.stats)}
}
export function createArticleEntityHandler({env=process.env,clientFactory=createClient}={}) {
 return async request=>{
  const reply=(body,status=200,cache=false)=>Response.json(body,{status,headers:{'Cache-Control':cache?'public, max-age=30, s-maxage=30':'no-store','X-Content-Type-Options':'nosniff'}})
  if(request.method!=='GET')return reply({error:'Methode niet toegestaan.'},405)
  const url=new URL(request.url),kind=url.searchParams.get('kind'),id=url.searchParams.get('id'),season=url.searchParams.get('season')
  if(!['player','match','summary','catalog','fixtures'].includes(kind)||(!['catalog','fixtures'].includes(kind)&&(!entityId(id)||!entitySeason(season))))return reply({error:'Ongeldige speler of wedstrijd.'},400)
  if(!env.VITE_SUPABASE_URL||!env.VITE_SUPABASE_PUBLISHABLE_KEY)return reply({error:'Voetbaldata is tijdelijk niet beschikbaar.'},503)
  try {
   const authorization=kind==='catalog'?request.headers.get('authorization'):null
   if(kind==='catalog'&&!authorization?.startsWith('Bearer '))return reply({error:'Log in als redacteur.'},401)
   const client=clientFactory(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:authorization?{Authorization:authorization}:{},fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})}})
   if(kind==='catalog'){const user=await client.auth.getUser(authorization.slice(7));if(user.error||!user.data.user)return reply({error:'Log opnieuw in.'},401)}
   const {data,error}=kind==='fixtures'?await client.rpc('article_fixture_headers'):await client.rpc('article_entity_data',{kind,target_id:id,target_season:season})
   if(error)return reply({error:error.code==='42501'?'Redactierechten vereist.':'Voetbaldata kon niet worden geladen. Probeer opnieuw.'},error.code==='42501'?403:503)
   if(!data)return reply({error:'Deze speler of wedstrijd is niet beschikbaar.'},404)
   return reply(presentArticleEntity(kind,data),200,kind!=='catalog')
  }catch{return reply({error:'Voetbaldata kon niet worden geladen. Probeer opnieuw.'},503)}
 }
}
