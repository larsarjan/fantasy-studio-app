import {VALID_FORMATIONS,proposeEditorialDreamTeam} from './dreamTeamEngine.js'
const positions={keeper:'keeper',verdediger:'defenders',middenvelder:'midfielders',aanvaller:'attackers'}
export const DREAM_LINES={keeper:'Keeper',verdediger:'Verdediging',middenvelder:'Middenveld',aanvaller:'Aanval'}
export function dreamDefaults(){return {season:'2026/2027',round:8,formation:'',ownershipLimit:null,snapshot:null,xi:[],differential:[],star:null,notable:[],analyses:{},playerAnalyses:{}}}
export function dreamTeamView(xi){return {valid:xi.length===11,positions:Object.fromEntries(Object.entries(positions).map(([p,k])=>[k,xi.filter(x=>x.position===p)]))}}
export function validateDream(b,{publish=false}={}){
 if(!/^20\d{2}\/20\d{2}$/.test(b.season)||!Number.isInteger(b.round)||b.round<1||b.round>38||b.formation&&!VALID_FORMATIONS.some(f=>f.label===b.formation)||b.ownershipLimit!==null&&(!Number.isFinite(b.ownershipLimit)||b.ownershipLimit<0||b.ownershipLimit>100))throw Error('Ongeldige Dreamteam-instellingen.')
 if(!Array.isArray(b.xi)||b.xi.length>11||!Array.isArray(b.notable)||b.notable.length>10)throw Error('Ongeldige selectie.')
 if(b.differential!==undefined){if(!Array.isArray(b.differential))throw Error("Ongeldig Differential Dreamteam.");if(b.differential.length){if(b.ownershipLimit===null||b.differential.some(p=>!Number.isFinite(p.selectedPct)||p.selectedPct>b.ownershipLimit))throw Error("Ongeldige ownershipvariant.");validateDream({...b,xi:b.differential,differential:[],notable:[],star:null,snapshot:null},{publish:false});if(b.differential.length!==11)throw Error("Onvolledig Differential Dreamteam.")}}
 const players=[...b.xi,...b.notable,...(b.star?[b.star]:[])]
 for(const p of players)if(!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||typeof p.club!=='string'||!positions[p.position]||!Number.isFinite(p.fantasyPoints)||p.season!==b.season)throw Error('Ongeldige Dreamteam-speler.')
 if(new Set(b.xi.map(p=>p.id)).size!==b.xi.length)throw Error('Dubbele speler in XI.')
 if(new Set(b.notable.map(p=>p.id)).size!==b.notable.length)throw Error('Dubbele opvallende speler.')
 for(const key of ['analyses','playerAnalyses'])if(!b[key]||typeof b[key]!=='object'||Array.isArray(b[key])||Object.values(b[key]).some(t=>typeof t!=='string'||t.length>10000))throw Error('Ongeldige analyse.')
 if(b.snapshot&&(b.snapshot.season!==b.season||b.snapshot.round!==b.round||b.snapshot.ownershipLimit!==b.ownershipLimit||b.snapshot.formation!==b.formation||!Number.isFinite(Date.parse(b.snapshot.preparedAt))))throw Error('Instellingen gewijzigd: bereid opnieuw voor.')
 if(b.xi.length===11){const f=VALID_FORMATIONS.find(f=>(!b.formation||f.label===b.formation)&&Object.keys(positions).every(p=>b.xi.filter(x=>x.position===p).length===f[p]));if(!f)throw Error('Ongeldige formatie.');const clubs={};for(const p of b.xi){clubs[p.club]=(clubs[p.club]||0)+1;if(clubs[p.club]>3)throw Error('Maximaal drie spelers per club.')}}
 if(publish&&(!b.snapshot||b.xi.length!==11||!b.star))throw Error('Bereid een geldig XI en speler van de week voor.')
}
export function prepareDream(b,candidates){
 const pool=candidates.map(p=>({id:String(p.id),name:p.name,club:p.club,season:b.season,position:p.position,fantasyPoints:p.fantasyPoints,minutes:p.minutes,selectedPct:p.selectedPct,startPrice:p.startPrice,endPrice:p.endPrice}))
 const team=proposeEditorialDreamTeam(pool,{formation:b.formation,ownershipLimit:null});if(!team)throw Error('Onvoldoende spelers voor een geldig XI.')
 const differential=b.ownershipLimit===null?null:proposeEditorialDreamTeam(pool,{formation:b.formation,ownershipLimit:b.ownershipLimit});if(b.ownershipLimit!==null&&!differential)throw Error('Onvoldoende spelers voor een geldig Differential XI.');
 const ranked=[...pool].sort((a,b)=>b.fantasyPoints-a.fantasyPoints||b.minutes-a.minutes||a.name.localeCompare(b.name,'nl'))
 const result={...b,snapshot:{season:b.season,round:b.round,formation:b.formation,ownershipLimit:b.ownershipLimit,preparedAt:new Date().toISOString()},xi:team.players,differential:differential?.players||[],star:ranked[0]};validateDream(result);return {block:result,catalog:pool}
}
export function overrideDream(b,slot,player){const next=structuredClone(b);next.xi[slot]=structuredClone(player);validateDream(next);return next}
