import { normalizeClubName } from './historyAnalytics.js'

export const TRANSFER_WINDOW_CONFIG = Object.freeze({ seasonId: '2026_27', season: '2026/2027', window: 'summer' })

const CLUB_LABELS = Object.freeze({
  'ado den haag':'ADO Den Haag', ajax:'Ajax', az:'AZ', excelsior:'Excelsior',
  'fc groningen':'FC Groningen', 'fc twente':'FC Twente', 'fc utrecht':'FC Utrecht',
  feyenoord:'Feyenoord', 'fortuna sittard':'Fortuna Sittard', 'go ahead eagles':'Go Ahead Eagles',
  nec:'NEC', 'pec zwolle':'PEC Zwolle', psv:'PSV', cambuur:'SC Cambuur',
  heerenveen:'SC Heerenveen', 'sparta rotterdam':'Sparta Rotterdam', telstar:'Telstar', 'willem ii':'Willem II',
})

export const TRANSFER_CLUBS = Object.freeze(Object.values(CLUB_LABELS))
const text = value => String(value ?? '').trim()
const number = value => { const normalized=text(value).replace('%','').replace(',','.'); if(!normalized)return null; const result=Number(normalized); return Number.isFinite(result)?result:null }
const firstNumber = (...values) => { for (const value of values) { const parsed=number(value); if(parsed!==null)return parsed } return null }
export const normalizeTransferOwnership = value => { const parsed=number(value); if(parsed===null)return null; return parsed>0&&parsed<=1?parsed*100:parsed }
export function validateWindowScore(value){if(value===null||value===undefined||text(value)==='')return {valid:true,value:null};const parsed=number(value);return Number.isInteger(parsed)&&parsed>=0&&parsed<=100?{valid:true,value:parsed}:{valid:false,value:null}}
export const normalizeTransferName = value => text(value).toLocaleLowerCase('nl-NL').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’'`]/g,'').replace(/[^a-z0-9]+/g,' ').trim()
export function canonicalTransferClub(value){const key=normalizeClubName(value);const aliases={utrecht:'fc utrecht',twente:'fc twente',groningen:'fc groningen','n e c nijmegen':'nec','nec nijmegen':'nec','n.e.c. nijmegen':'nec','sc cambuur':'cambuur','cambuur leeuwarden':'cambuur','sc heerenveen':'heerenveen'};return CLUB_LABELS[aliases[key]??key]??text(value)}
export const createTransferKey = ({club,playerName,direction,seasonId=TRANSFER_WINDOW_CONFIG.seasonId,window=TRANSFER_WINDOW_CONFIG.window}) => [seasonId,window,normalizeTransferName(canonicalTransferClub(club)),String(direction).toUpperCase(),normalizeTransferName(playerName)].join('|')
export const createTransferDuplicateKey = ({playerName,from,to,seasonId=TRANSFER_WINDOW_CONFIG.seasonId,window=TRANSFER_WINDOW_CONFIG.window}) => [seasonId,window,normalizeTransferName(playerName),normalizeTransferName(canonicalTransferClub(from)),normalizeTransferName(canonicalTransferClub(to))].join('|')
export const isTransferLeagueClub = value => TRANSFER_CLUBS.includes(canonicalTransferClub(value))
export function getTransferCategory(transfer={}){
  const from=text(transfer.from),to=text(transfer.to),type=normalizeTransferName(transfer.type)
  if(/gestopt|retired|pensioen/.test(type)||/gestopt|retired|pensioen/.test(normalizeTransferName(to)))return 'GESTOPT'
  if(!to||/nog niet bekend|onbekend|unknown|nvt|n a/.test(normalizeTransferName(to)))return 'BESTEMMING ONBEKEND'
  const fromLeague=isTransferLeagueClub(from),toLeague=isTransferLeagueClub(to)
  if(fromLeague&&toLeague)return 'BINNEN EREDIVISIE'
  if(toLeague&&!fromLeague)return 'NIEUW'
  if(fromLeague&&!toLeague)return 'VERTROKKEN UIT EREDIVISIE'
  return transfer.direction==='IN'?'NIEUW':'VERTROKKEN UIT EREDIVISIE'
}
export function getTransferLoanBadge(transfer={}){const type=normalizeTransferName(transfer.type);if(/terug.*huur|huur.*terug/.test(type))return 'TERUG VAN HUUR';if(!/huur/.test(type))return '';return transfer.direction==='IN'?'HUUR IN':'HUUR UIT'}

export function normalizeTransferRow(row={}){
  const club=canonicalTransferClub(row.Club), direction=text(row.Richting).toUpperCase()==='UIT'?'UIT':'IN', playerName=text(row.Speler)
  if(!club||!playerName)return null
  const transfer={club,direction,playerName,from:text(row.Van),to:text(row.Naar),type:text(row.Type),contract:text(row['Contract / toelichting']),status:text(row.Status),sourceUpdated:text(row['Bron bijgewerkt']),sourceUrl:text(row['Bron URL']),position:text(row.Positie),fee:text(row.Transfersom),marketValue:text(row.Marktwaarde),fantasyPlayerId:text(row['Fantasy playerId']),fantasyPrice:number(row['Fantasy prijs']),ownership:number(row['Ownership %']),points:number(row.Punten),minutes:number(row.Minuten),sheetImpact:text(row['FVT impact / concurrentie']),seasonId:TRANSFER_WINDOW_CONFIG.seasonId,window:TRANSFER_WINDOW_CONFIG.window}
  return {...transfer,id:createTransferKey(transfer),category:getTransferCategory(transfer),loanBadge:getTransferLoanBadge(transfer),localTransfer:false}
}

export function normalizeManualTransfer(input={}){
  const playerName=text(input.playerName),from=canonicalTransferClub(input.from),to=canonicalTransferClub(input.to),club=canonicalTransferClub(input.club||(isTransferLeagueClub(to)?to:from))
  if(!playerName||!club)return null
  const direction=isTransferLeagueClub(to)&&club===to?'IN':'UIT',createdAt=text(input.createdAt)||new Date().toISOString()
  const transferDate=text(input.transferDate)||createdAt
  const transfer={club,direction,playerName,from,to,type:text(input.type)||'onbekend',contract:text(input.contract),status:text(input.status)||'Bevestigd',sourceUpdated:text(input.sourceUpdated)||`LIVE · ${transferDate}`,transferDate,sourceUrl:text(input.sourceUrl),source:text(input.source),position:text(input.position),fee:text(input.fee),marketValue:'',fantasyPlayerId:text(input.fantasyPlayerId),fantasyPrice:null,ownership:null,points:null,minutes:null,sheetImpact:'',seasonId:TRANSFER_WINDOW_CONFIG.seasonId,window:TRANSFER_WINDOW_CONFIG.window,localTransfer:true,createdAt,updatedAt:text(input.updatedAt)||createdAt,updatedBy:text(input.updatedBy),pending:Boolean(input.pending)}
  return {...transfer,id:text(input.id)||`local|${createTransferDuplicateKey(transfer)}`,duplicateKey:createTransferDuplicateKey(transfer),category:getTransferCategory(transfer),loanBadge:getTransferLoanBadge(transfer)}
}

export function mergeTransferRows(sheetTransfers=[],localTransfers=[]){
  const sheetKeys=new Set(sheetTransfers.map(createTransferDuplicateKey)),seen=new Set(sheetKeys)
  const accepted=[];const duplicates=[]
  for(const input of localTransfers){const row=normalizeManualTransfer(input);if(!row)continue;const key=createTransferDuplicateKey(row);if(seen.has(key)){duplicates.push(row);continue}seen.add(key);accepted.push(row)}
  return {rows:[...accepted,...sheetTransfers],duplicates}
}

export function normalizeTransferClubOverview(row={}){const club=canonicalTransferClub(row.Club);if(!club)return null;return {club,inCount:number(row.IN)??0,outCount:number(row.UIT)??0,total:number(row.Totaal)??0,net:number(row['Netto spelers'])??0,loanIn:number(row['Huur IN'])??0,loanOut:number(row['Huur UIT / terug'])??0,sourceUrl:text(row.Bron)}}

function playerId(player){return text(player?.id??player?.playerId)}
function playerClub(player){return canonicalTransferClub(player?.club??player?.team)}
export function getTransferFantasyData(player={}){return {fantasyPlayerId:playerId(player),position:player?.fantasyPosition||player?.position||'',fantasyPrice:firstNumber(player?.currentPrice,player?.price,player?.endPrice,player?.startPrice),ownership:normalizeTransferOwnership(firstNumber(player?.ownership,player?.selectedPct,player?.selectedPercentage)),points:firstNumber(player?.totalPoints,player?.points),minutes:firstNumber(player?.minutes),form:player?.form??player?.formScore??player?.outlook?.form??null,fantasyStatus:player?.status??player?.availabilityStatus??''}}
function chooseUnique(items){return items.length===1?items[0]:null}
export function matchTransferPlayer(transfer,players=[]){
  const explicit=transfer.fantasyPlayerId&&players.find(player=>playerId(player)===transfer.fantasyPlayerId)
  if(explicit)return {status:'linked',method:'playerId',player:explicit}
  const wanted=normalizeTransferName(transfer.playerName), exact=players.filter(player=>normalizeTransferName(player?.name)===wanted)
  const destination=transfer.direction==='IN'?transfer.club:canonicalTransferClub(transfer.from||transfer.club)
  const clubMatch=chooseUnique(exact.filter(player=>playerClub(player)===destination))
  if(clubMatch)return {status:'linked',method:'name-club',player:clubMatch}
  const unique=chooseUnique(exact)
  if(unique)return {status:'linked',method:'unique-name',player:unique}
  if(exact.length>1)return {status:'uncertain',method:'duplicate-name',player:null,candidates:exact}
  const safeSuffix=players.filter(player=>{const candidate=normalizeTransferName(player?.name);return candidate.length>=4&&(wanted.endsWith(` ${candidate}`)||candidate.endsWith(` ${wanted}`))})
  const currentClub=transfer.direction==='IN'?transfer.club:canonicalTransferClub(transfer.to)
  const suffixClubMatch=chooseUnique(safeSuffix.filter(player=>playerClub(player)===currentClub))
  if(suffixClubMatch)return {status:'linked',method:'unique-name-suffix-club',player:suffixClubMatch}
  const suffixUnique=chooseUnique(safeSuffix)
  if(suffixUnique)return {status:'linked',method:'unique-name-suffix',player:suffixUnique}
  if(safeSuffix.length>1)return {status:'uncertain',method:'duplicate-name-suffix',player:null,candidates:safeSuffix}
  return {status:'unlinked',method:'none',player:null,candidates:[]}
}

export function enrichTransfers(transfers,players=[]){return transfers.map(transfer=>{const match=matchTransferPlayer(transfer,players),player=match.player,central=getTransferFantasyData(player);return {...transfer,category:transfer.category||getTransferCategory(transfer),loanBadge:transfer.loanBadge||getTransferLoanBadge(transfer),matchStatus:match.status,matchMethod:match.method,matchedPlayer:player??null,fantasyPlayerId:central.fantasyPlayerId||transfer.fantasyPlayerId||'',position:central.position||transfer.position||'',fantasyPrice:central.fantasyPrice??transfer.fantasyPrice,ownership:central.ownership??transfer.ownership,points:central.points??transfer.points,minutes:central.minutes??transfer.minutes,form:central.form,fantasyStatus:central.fantasyStatus}})}

export function buildTransferClubRows(transfers,overviews=[]){const overviewMap=new Map(overviews.map(row=>[canonicalTransferClub(row.club),row]));return TRANSFER_CLUBS.map(club=>{const rows=transfers.flatMap(row=>{if(row.localTransfer&&row.category==='BINNEN EREDIVISIE'){if(canonicalTransferClub(row.from)===club)return [{...row,club,direction:'UIT',contextClub:club}];if(canonicalTransferClub(row.to)===club)return [{...row,club,direction:'IN',contextClub:club}];return []}return canonicalTransferClub(row.club)===club?[row]:[]}),incoming=rows.filter(row=>row.direction==='IN'),outgoing=rows.filter(row=>row.direction==='UIT'),localIn=incoming.filter(row=>row.localTransfer).length,localOut=outgoing.filter(row=>row.localTransfer).length,source=overviewMap.get(club),inCount=(source?.inCount??incoming.length-localIn)+localIn,outCount=(source?.outCount??outgoing.length-localOut)+localOut;return {club,incoming,outgoing,inCount,outCount,total:(source?.total??rows.length-localIn-localOut)+localIn+localOut,net:inCount-outCount,loanIn:(source?.loanIn??incoming.filter(row=>/huur/i.test(row.type)&&!row.localTransfer).length)+incoming.filter(row=>row.localTransfer&&/huur/i.test(row.type)).length,loanOut:(source?.loanOut??outgoing.filter(row=>/huur/i.test(row.type)&&!row.localTransfer).length)+outgoing.filter(row=>row.localTransfer&&/huur/i.test(row.type)).length,sourceUrl:source?.sourceUrl??rows[0]?.sourceUrl??''}})}
export function sortTransferClubRanking(clubs=[],clubEditorial=()=>({})){const verdictRank={sterker:2,gelijk:1,zwakker:0};return [...clubs].sort((a,b)=>{const left=clubEditorial(a.club)??{},right=clubEditorial(b.club)??{},leftScore=number(left.score)??-1,rightScore=number(right.score)??-1;return rightScore-leftScore||((verdictRank[right.verdict]??1)-(verdictRank[left.verdict]??1))||a.club.localeCompare(b.club,'nl')})}
export const stepTransferClubIndex=(index,direction,total=TRANSFER_CLUBS.length)=>(Number(index)+(direction==='previous'?-1:1)+total)%total
