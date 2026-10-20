import {logoSlug,normalizeLogoClub,CLUB_LOGO_CLUBS} from './clubIdentity.js'
import {kickoffTime} from './fixtureWindows.js'
const text=x=>String(x??'').trim()
const canonical=new Map(CLUB_LOGO_CLUBS.map(name=>[logoSlug(name),name]))
// Manual Sheet -> existing context dataset only. Never writes back to Sheets.
export function normalizeKnvbFixtures(rows,{warn=message=>console.warn(message)}={}){
 const seen=new Set(),out=[]
 for(const [index,row] of rows.entries()){
  if(Object.values(row).every(v=>!text(v)))continue
  const round=text(row.Ronde),home=text(row.Thuisclub),away=text(row.Uitclub),raw=text(row.Datum),time=text(row.Tijd)
  const parts=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)||raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  const iso=parts?.[1].length===4,year=Number(parts?.[iso?1:3]),month=Number(parts?.[2]),day=Number(parts?.[iso?3:1])
  const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  const instant=kickoffTime({date,time})
  if(!round||!home||!away||normalizeLogoClub(home)===normalizeLogoClub(away)||!parts||year<2000||year>2100||instant===null){warn(`KNVB_FIXTURES rij ${index+2}: ongeldige ronde, clubs of datum/tijd; overgeslagen.`);continue}
  const start=month>=7?year:year-1,season=`${start}/${start+1}`
  // Stable through date/time corrections and row reordering. No fuzzy matching.
  const id=[season,normalizeLogoClub(round),normalizeLogoClub(home),normalizeLogoClub(away)].map(encodeURIComponent).join(':')
  if(seen.has(id)){warn(`KNVB_FIXTURES rij ${index+2}: dubbele wedstrijd; overgeslagen.`);continue}seen.add(id)
  for(const [club,opponent,homeAway] of [[home,away,'T'],[away,home,'U']]){
   const slug=logoSlug(club);if(!slug)continue
   out.push({europeMatchId:`knvb:${id}:${homeAway}`,fixtureId:id,season,competition:'KNVB',club:canonical.get(slug),opponent:canonical.get(logoSlug(opponent))||opponent,homeAway,date,time,kickoffAt:new Date(instant).toISOString(),phase:round,europeanRound:'',status:'',source:'KNVB_FIXTURES (handmatig)',sourceUrl:''})
  }
 }
 return out
}
