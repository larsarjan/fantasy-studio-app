import { userStorage } from '../services/userStorage.js'
import { availabilityClubSummary } from './availabilityUI.js'
import { safeHtml } from '../platform/html.js'
import { getPlayerProfiles, getTransferClubOverview, getTransferDeadlineRows, getSyncStatus } from '../services/database.js'
import { fetchSheet } from '../services/googleSheets.js'
import { buildTransferClubRows, canonicalTransferClub, createTransferDuplicateKey, enrichTransfers, getTransferFantasyData, mergeTransferRows, normalizeManualTransfer, normalizeTransferClubOverview, normalizeTransferRow, sortTransferClubRanking, stepTransferClubIndex, TRANSFER_CLUBS, TRANSFER_WINDOW_CONFIG, validateWindowScore } from '../services/transferDeadlineData.js'
import { deleteLocalTransfer, isTransferLiveNew, patchTransferClubEditorial, patchTransferEditorial, readTransferEditorial, readTransferLiveSession, readTransferSharedConfig, readTransferSharedQueue, readTransferSharedStatus, synchronizeTransferDeadlineSharedData, upsertLocalTransfer, writeTransferEditorial, writeTransferLiveSession, writeTransferSharedConfig } from '../services/transferDeadlineEditorial.js'
import { getPlayerDetailProfile, renderPlayerDetailProfile as renderCentralPlayerDetailProfile } from './players.js'
import { clubLogo, esc, fmt, positionLabel } from './intelligenceUi.js'
import transferSnapshot from '../data/transfers2026_27Snapshot.json'

const ROLE_OPTIONS=['onbekend','vaste basisspeler','vermoedelijke basisspeler','rotatie','reserve']
const IMPACT_OPTIONS=['onbekend','zeer hoog','hoog','middel','laag','negatief']
const LABEL_OPTIONS=['Must watch','Differential','Budgetoptie','Rotatierisico','Nog beoordelen']
const VERDICTS=['sterker','gelijk','zwakker']
const state={view:'overview',club:'',transferId:'',transferContext:null,editorialEditId:'',profileId:'',profileTab:'overview',manager:'',editingLocalId:'',notice:'',sharedBusy:false,sharedFeedback:null,sharedTokenVisible:false,presentation:false,presentationIndex:0,highlightId:'',sort:'score',direction:'desc',filters:{search:'',club:'',direction:'',position:'',type:'',match:'',impact:'',label:''}}
let directTransferData=null
let directTransferFetchAttempted=false
let transferLiveSource='database'
const snapshotTransfers=(Array.isArray(transferSnapshot.records)?transferSnapshot.records:[]).map(normalizeTransferRow).filter(Boolean)
const readEditorial=()=>readTransferEditorial()
const saveEditorial=data=>writeTransferEditorial(data)
const session=()=>readTransferLiveSession()
const saveSession=data=>writeTransferLiveSession(data)
const renderPlayerDetailProfile=(profile,_activeTab,settings)=>renderCentralPlayerDetailProfile(profile,state.profileTab,settings)
const option=(value,current,label=value)=>`<option value="${esc(value)}" ${current===value?'selected':''}>${esc(label)}</option>`
const metric=value=>value===null||value===undefined||value===''?'—':fmt(value,Number(value)%1?1:0)
const transferEditorial=(id)=>readEditorial().transfers[id]??{}
const clubEditorial=(club)=>readEditorial().clubs[club]??{}
const isLiveNew=row=>isTransferLiveNew(row,transferEditorial(row.id),session().startedAt)
const updateTransfer=(id,patch)=>{const row=data().transfers.find(item=>item.id===id);return patchTransferEditorial(id,patch,userStorage,{club:row?.club,playerName:row?.playerName,direction:row?.direction})}
const updateClub=(club,patch)=>patchTransferClubEditorial(club,patch)
function data(){const players=getPlayerProfiles().map(player=>{const fantasy=getTransferFantasyData(player);return {...player,...fantasy,currentPrice:fantasy.fantasyPrice,totalPoints:fantasy.points}}),editorial=readEditorial(),sourceTransfers=directTransferData?.transfers??getTransferDeadlineRows(),sourceOverview=directTransferData?.overview??getTransferClubOverview(),merged=mergeTransferRows(sourceTransfers,editorial.localTransfers);let transfers=enrichTransfers(merged.rows,players);if(state.transferContext)transfers=transfers.map(row=>row.id===state.transferContext.id?state.transferContext:row);let clubs=buildTransferClubRows(transfers,sourceOverview);if(state.view==='ranking'&&state.sort==='score'&&state.direction==='desc')clubs=sortTransferClubRanking(clubs,clubEditorial);return {players,transfers,clubs,duplicates:merged.duplicates}}
const logTransferLiveSource=d=>{if(import.meta.env.DEV)console.info(`Transfer Live source: ${transferLiveSource}`,{finalTransferCount:d.transfers.length,finalClubCount:d.clubs.length})}
const updatedAt=transfers=>[...transfers].filter(row=>!row.localTransfer).map(row=>row.sourceUpdated).filter(Boolean).sort().at(-1)??getSyncStatus().lastSync??''
const matchBadge=row=>`<span class="tdl-badge category ${row.category==='BINNEN EREDIVISIE'?'linked':row.category==='VERTROKKEN UIT EREDIVISIE'?'missing':'uncertain'}">${esc(row.category||'TRANSFER')}</span>${row.loanBadge?`<span class="tdl-badge loan">${esc(row.loanBadge)}</span>`:''}${isLiveNew(row)?'<span class="tdl-badge live">NIEUW</span>':''}`
const verdictBadge=club=>{const verdict=clubEditorial(club).verdict??'gelijk';return `<span class="tdl-verdict ${esc(verdict)}">${esc(verdict[0].toUpperCase()+verdict.slice(1))}</span>`}
const navigate=(view,club='')=>{state.view=view;if(club)state.club=club;rerender()}

function shell(content,d){const shared=readTransferSharedStatus(),pending=readTransferSharedQueue().length;return `<section class="tdl-module"><header class="tdl-hero"><div><span class="eyebrow">Deadline studio · ${TRANSFER_WINDOW_CONFIG.season}</span><h2>Transfer Deadline Live</h2><p>Zomerwindow · bron bijgewerkt ${esc(updatedAt(d.transfers)||'onbekend')} · ${esc(shared.message)}${pending?` · ${pending} wachtend`:''}</p></div><div class="tdl-hero-actions"><button data-tdl-present>Presentatiemodus</button><button data-tdl-session>${session().startedAt?'Livesessie herstarten':'Start livesessie'}</button><button data-tdl-shared-config>Gedeelde sync</button><button data-tdl-new-transfer>+ Nieuwe transfer</button><button data-tdl-manage-scores>Window-scores beheren</button><button type="button" class="tdl-workspace-close" data-tdl-workspace-close aria-label="Transfers Live sluiten">Sluiten ×</button></div></header><nav class="tdl-tabs">${[['overview','Totaaloverzicht'],['club','Clubdetail'],['updates','Live updates'],['ranking','Window ranking']].map(([key,label])=>`<button data-tdl-view="${key}" class="${state.view===key?'active':''}">${label}</button>`).join('')}</nav>${content}${drawer(d)}</section>`}

function overview(d){return `<section class="tdl-club-grid">${d.clubs.map(club=>{const edit=clubEditorial(club.club);return `<button class="tdl-club-card" data-tdl-club="${esc(club.club)}">${clubLogo(club.club)}<span><strong>${esc(club.club)}</strong>${verdictBadge(club.club)}</span><div><b><small>IN</small>${club.inCount}</b><b><small>UIT</small>${club.outCount}</b><b><small>NETTO</small>${club.net>0?'+':''}${club.net}</b><b class="score"><small>SCORE</small>${edit.score??'—'}</b></div></button>`}).join('')}</section>`}

function transferRow(row,compact=false){const edit=transferEditorial(row.id);return `<button class="tdl-transfer-row ${compact?'compact':''}" data-tdl-transfer="${esc(row.id)}"><span><strong>${esc(row.playerName)}</strong><small>${esc(row.direction==='IN'?row.from:row.to||'Onbekend')} · ${esc(row.type||'Type onbekend')}</small></span>${compact?'':`<em>${esc(positionLabel(row.position)||'—')}</em><b>€ ${metric(row.fantasyPrice)}</b><b>${metric(row.ownership)}%</b><b>${metric(row.points)} pt</b><b>${metric(row.minutes)} min</b>`}<span>${matchBadge(row)}${edit.label?`<i>${esc(edit.label)}</i>`:''}</span></button>`}
function clubDetail(d){const club=d.clubs.find(row=>row.club===state.club)??d.clubs[0];state.club=club?.club??'';if(!club)return empty();const edit=clubEditorial(club.club);return `<section class="tdl-club-detail"><header>${clubLogo(club.club)}<div><span class="eyebrow">Clubwindow</span><h2>${esc(club.club)}</h2><p>${club.inCount} in · ${club.outCount} uit · netto ${club.net>0?'+':''}${club.net}</p></div><div class="tdl-window-score"><strong>${edit.score??'—'}</strong><span>/100</span>${verdictBadge(club.club)}</div></header>${availabilityClubSummary(d.players,club.club)}<div class="tdl-editor-inline"><label>Window-score<input data-tdl-club-score type="number" min="0" max="100" value="${esc(edit.score??'')}"></label><label>Oordeel<select data-tdl-club-verdict>${VERDICTS.map(v=>option(v,edit.verdict??'gelijk')).join('')}</select></label><label>Window-notitie<input data-tdl-club-note value="${esc(edit.note??'')}" placeholder="Kernbeoordeling voor uitzending"></label></div><section><h3>Inkomende transfers <span>${club.incoming.length}</span></h3><div class="tdl-transfer-head"><span>Speler</span><span>Positie</span><span>Prijs</span><span>Ownership</span><span>Punten</span><span>Minuten</span><span>Status</span></div>${club.incoming.map(row=>transferRow(row)).join('')||'<div class="tdl-empty">Geen inkomende transfers.</div>'}</section><section class="tdl-outgoing"><h3>Uitgaande transfers <span>${club.outgoing.length}</span></h3>${club.outgoing.map(row=>transferRow(row,true)).join('')||'<div class="tdl-empty">Geen uitgaande transfers.</div>'}</section></section>`}

function filteredTransfers(d){return d.transfers.filter(row=>{const f=state.filters,e=transferEditorial(row.id);return(!f.search||row.playerName.toLowerCase().includes(f.search.toLowerCase()))&&(!f.club||row.club===f.club)&&(!f.direction||row.direction===f.direction)&&(!f.position||String(row.position).toLowerCase()===f.position)&&(!f.type||row.type===f.type)&&(!f.match||row.matchStatus===f.match)&&(!f.impact||e.impact===f.impact)&&(!f.label||e.label===f.label)})}
function filters(d){const positions=[...new Set(d.transfers.map(r=>String(r.position).toLowerCase()).filter(Boolean))],types=[...new Set(d.transfers.map(r=>r.type).filter(Boolean))].sort();return `<div class="tdl-filters"><input data-tdl-filter="search" value="${esc(state.filters.search)}" placeholder="Zoek speler"><select data-tdl-filter="club"><option value="">Alle clubs</option>${TRANSFER_CLUBS.map(v=>option(v,state.filters.club)).join('')}</select><select data-tdl-filter="direction"><option value="">IN + UIT</option>${['IN','UIT'].map(v=>option(v,state.filters.direction)).join('')}</select><select data-tdl-filter="position"><option value="">Alle posities</option>${positions.map(v=>option(v,state.filters.position,positionLabel(v))).join('')}</select><select data-tdl-filter="type"><option value="">Alle types</option>${types.map(v=>option(v,state.filters.type)).join('')}</select><select data-tdl-filter="match"><option value="">Alle koppelingen</option>${[['linked','Gekoppeld'],['uncertain','Onzeker'],['unlinked','Niet gekoppeld']].map(([v,l])=>option(v,state.filters.match,l)).join('')}</select><select data-tdl-filter="impact"><option value="">Alle impact</option>${IMPACT_OPTIONS.slice(1).map(v=>option(v,state.filters.impact)).join('')}</select><select data-tdl-filter="label"><option value="">Alle labels</option>${LABEL_OPTIONS.map(v=>option(v,state.filters.label)).join('')}</select></div>`}
function updates(d){const rows=filteredTransfers(d).sort((a,b)=>String(b.updatedAt??b.sourceUpdated).localeCompare(String(a.updatedAt??a.sourceUpdated))||a.playerName.localeCompare(b.playerName,'nl')),liveCount=rows.filter(isLiveNew).length;return `${filters(d)}<section class="tdl-updates"><header><div><span class="eyebrow">Live desk</span><h2>Meest recente transfers</h2></div><strong>Sinds start livestream: ${liveCount} nieuw</strong></header>${rows.map(row=>`<article class="${isLiveNew(row)?'is-live':''}"><button data-tdl-live="${esc(row.id)}" title="Markeer als nieuw">${isLiveNew(row)?'LIVE':'○'}</button><button data-tdl-transfer="${esc(row.id)}"><span>${clubLogo(row.club)}<b>${esc(row.club)}</b></span><strong>${esc(row.playerName)}</strong><em>${row.direction}</em><span>${esc(row.status||'Status onbekend')}</span><time>${esc(row.updatedAt??row.sourceUpdated??'Geen tijd beschikbaar')}</time></button></article>`).join('')||'<div class="tdl-empty">Geen transfers binnen deze filters.</div>'}</section>`}

function ranking(d){const factor=state.direction==='asc'?1:-1,rows=[...d.clubs].sort((a,b)=>{const av=state.sort==='club'?a.club:(state.sort==='net'?a.net:Number(clubEditorial(a.club).score??-1)),bv=state.sort==='club'?b.club:(state.sort==='net'?b.net:Number(clubEditorial(b.club).score??-1));return(typeof av==='string'?av.localeCompare(bv,'nl'):av-bv)*factor});const interesting=d.transfers.filter(r=>['Must watch','Differential'].includes(transferEditorial(r.id).label)).slice(0,5),budget=d.transfers.filter(r=>transferEditorial(r.id).label==='Budgetoptie'&&r.fantasyPrice!==null).sort((a,b)=>a.fantasyPrice-b.fantasyPrice).slice(0,5);return `<section class="tdl-ranking-layout"><div class="tdl-ranking"><header><h2>Window ranking</h2><div>${[['score','Score'],['net','Netto'],['club','Club']].map(([v,l])=>`<button data-tdl-sort="${v}">${l}</button>`).join('')}</div></header>${rows.map((club,index)=>{const edit=clubEditorial(club.club);return `<article><b>${index+1}</b><button data-tdl-club="${esc(club.club)}">${clubLogo(club.club)}<strong>${esc(club.club)}</strong></button><span>${club.inCount} IN</span><span>${club.outCount} UIT</span><span>${club.net>0?'+':''}${club.net}</span><input data-tdl-ranking-score="${esc(club.club)}" type="number" min="0" max="100" value="${esc(edit.score??'')}" placeholder="—"><select data-tdl-ranking-verdict="${esc(club.club)}">${VERDICTS.map(v=>option(v,edit.verdict??'gelijk')).join('')}</select></article>`}).join('')}</div><aside><article><span class="eyebrow">Meest interessant</span>${interesting.map(row=>transferRow(row,true)).join('')||'<p>Nog geen transfers gelabeld.</p>'}</article><article><span class="eyebrow">Beste goedkope opties</span>${budget.map(row=>transferRow(row,true)).join('')||'<p>Label eerst Budgetopties met een Fantasy-prijs.</p>'}</article></aside></section>`}

function empty(){return '<div class="tdl-empty"><h3>Transferdata niet beschikbaar</h3><p>Synchroniseer opnieuw zodra de twee gepubliceerde transfertabbladen bereikbaar zijn.</p></div>'}
function diagnostics(d){const linked=d.transfers.filter(r=>r.matchStatus==='linked').length,uncertain=d.transfers.filter(r=>r.matchStatus==='uncertain').length,count=category=>d.transfers.filter(r=>r.category===category).length,editorial=readEditorial(),sharedEditorial=[...Object.values(editorial.transfers),...Object.values(editorial.clubs)].filter(row=>!row.pending).length,sharedLive=editorial.localTransfers.filter(row=>!row.pending).length,status=readTransferSharedStatus();return `<details class="tdl-diagnostics"><summary>Datakwaliteit</summary><span>Totaal ${d.transfers.length}</span><span>Betrouwbaar gekoppeld ${linked}</span><span>Onzeker ${uncertain}</span><span>Niet gekoppeld ${d.transfers.length-linked-uncertain}</span><span>Binnen Eredivisie ${count('BINNEN EREDIVISIE')}</span><span>Nieuw ${count('NIEUW')}</span><span>Vertrokken ${count('VERTROKKEN UIT EREDIVISIE')}</span><span>Bestemming onbekend ${count('BESTEMMING ONBEKEND')}</span><span>Editorial gedeeld ${sharedEditorial}</span><span>Live-transfers gedeeld ${sharedLive}</span><span>Wachtend op gedeelde sync ${readTransferSharedQueue().length}</span><span>Laatste gedeelde sync ${esc(status.lastSync||'nog niet')}</span>${status.state==='offline'?`<span>Laatste fout ${esc(status.message)}</span>`:''}${d.duplicates.length?`<span>Duplicaten overgeslagen ${d.duplicates.length}</span>`:''}</details>`}

function manualTransferModal(d){
  const existing=readEditorial().localTransfers.find(row=>row.id===state.editingLocalId)??{}
  return `<div class="tdl-backdrop" data-tdl-manager-close></div><aside class="tdl-manager-modal"><header><div><span class="eyebrow">Live beheer</span><h2>${existing.id?'Transfer wijzigen':'Nieuwe transfer toevoegen'}</h2></div><button type="button" data-tdl-manager-close aria-label="Sluiten">×</button></header>${state.notice?`<p class="tdl-save-notice error">${esc(state.notice)}</p>`:''}<form data-tdl-manual-transfer><input type="hidden" name="id" value="${esc(existing.id??'')}"><div class="tdl-manager-grid"><label>Eredivisieclub *<select required name="club">${TRANSFER_CLUBS.map(club=>option(club,existing.club??state.club??'')).join('')}</select></label><label>Spelernaam *<input required name="playerName" value="${esc(existing.playerName??'')}"></label><label>Van club *<input required name="from" value="${esc(existing.from??'')}" list="tdl-clubs"></label><label>Naar club *<input required name="to" value="${esc(existing.to??'')}" list="tdl-clubs"></label><label>Type<select name="type">${['definitief','huur','transfervrij','terug van huur','onbekend'].map(v=>option(v,existing.type??'onbekend')).join('')}</select></label><label>Status<input name="status" value="${esc(existing.status??'Bevestigd')}"></label><label>Datum/tijd<input type="datetime-local" name="transferDate" value="${esc(String(existing.transferDate??'').slice(0,16))}"></label><label>Positie<input name="position" value="${esc(existing.position??'')}"></label><label>Transfersom<input name="fee" value="${esc(existing.fee??'')}"></label><label>Bron<input name="source" value="${esc(existing.source??'')}"></label><label>Bron-URL<input type="url" name="sourceUrl" value="${esc(existing.sourceUrl??'')}"></label><label class="wide">Contract / toelichting<textarea name="contract" rows="3">${esc(existing.contract??'')}</textarea></label></div><datalist id="tdl-clubs">${TRANSFER_CLUBS.map(club=>`<option value="${esc(club)}">`).join('')}</datalist><footer><button type="button" data-tdl-manager-close>Annuleren</button><button type="submit">${existing.id?'Wijzigingen opslaan':'Transfer toevoegen'}</button></footer></form></aside>`
}

function scoresManagerModal(d){
  return `<div class="tdl-backdrop" data-tdl-manager-close></div><aside class="tdl-manager-modal scores"><header><div><span class="eyebrow">Voorbereiding livestream</span><h2>Window-scores beheren</h2></div><button type="button" data-tdl-manager-close aria-label="Sluiten">×</button></header>${state.notice?`<p class="tdl-save-notice">${esc(state.notice)}</p>`:''}<form data-tdl-scores-manager><div class="tdl-scores-head"><span>Club</span><span>Score</span><span>Oordeel</span><span>Korte notitie</span></div>${d.clubs.map(club=>{const edit=clubEditorial(club.club);return `<div class="tdl-score-row"><strong>${clubLogo(club.club)}${esc(club.club)}</strong><input name="score:${esc(club.club)}" type="number" min="0" max="100" step="1" value="${esc(edit.score??'')}"><select name="verdict:${esc(club.club)}">${VERDICTS.map(v=>option(v,edit.verdict??'gelijk')).join('')}</select><input name="note:${esc(club.club)}" value="${esc(edit.note??'')}"></div>`}).join('')}<footer><button type="button" data-tdl-manager-close>Annuleren</button><button type="submit">Alle window-scores opslaan</button></footer></form></aside>`
}

export function renderTransferSharedSyncModal(config=readTransferSharedConfig(),status=readTransferSharedStatus(),ui={}){
  const complete=Boolean(config.endpoint&&config.token),busy=Boolean(ui.busy),feedback=ui.feedback
  const statusState=busy?'loading':feedback?.state??(complete?'configured':'unconfigured')
  const statusMessage=busy?'Synchroniseren...':feedback?.message??(complete?'Gedeelde sync is geconfigureerd.':'Gedeelde sync is niet geconfigureerd.')
  return `<div class="tdl-backdrop" data-tdl-manager-close></div><aside class="tdl-manager-modal shared-sync" role="dialog" aria-modal="true" aria-labelledby="tdl-shared-title"><header><div><span class="eyebrow">Samenwerken</span><h2 id="tdl-shared-title">Gedeelde sync</h2></div><button type="button" data-tdl-manager-close aria-label="Sluiten">×</button></header><p class="tdl-shared-status ${esc(statusState)}" role="status">${esc(statusMessage)}</p><form data-tdl-shared-form><div class="tdl-shared-fields"><label>Web App URL<input name="endpoint" type="url" autocomplete="url" value="${esc(config.endpoint)}" placeholder="https://script.google.com/macros/s/.../exec"></label><label>Write token<span class="tdl-token-field"><input name="token" type="${ui.tokenVisible?'text':'password'}" autocomplete="current-password" value="${esc(config.token)}"><button type="button" data-tdl-token-toggle aria-label="${ui.tokenVisible?'Token verbergen':'Token tonen'}">${ui.tokenVisible?'Verberg':'Toon'}</button></span></label></div><footer><button type="button" data-tdl-manager-close>Annuleren</button><button type="submit">Opslaan</button><button type="button" data-tdl-shared-sync ${complete&&!busy?'':'disabled'}>${busy?'Synchroniseren...':'Synchroniseren'}</button></footer></form></aside>`
}

function managementModal(d){if(state.manager==='transfer')return manualTransferModal(d);if(state.manager==='scores')return scoresManagerModal(d);if(state.manager==='shared')return renderTransferSharedSyncModal(readTransferSharedConfig(),readTransferSharedStatus(),{busy:state.sharedBusy,feedback:state.sharedFeedback,tokenVisible:state.sharedTokenVisible});return ''}

const assessedValue=value=>value&&value!=='onbekend'?esc(value):'<span class="tdl-assessment-empty">Nog niet beoordeeld</span>'
function competitorCard(player,id){if(!player)return `<article class="tdl-competitor-card unknown"><div><strong>Onbekende speler</strong><span>ID: ${esc(id)}</span></div></article>`;return `<article class="tdl-competitor-card"><div><strong>${esc(player.name)}</strong><span>${esc(positionLabel(player.position)||'Positie onbekend')} · € ${metric(player.currentPrice??player.price)} · ${metric(player.ownership)}% · ${metric(player.totalPoints??player.points)} pt · ${metric(player.minutes)} min</span></div><button type="button" data-tdl-competition-profile="${esc(player.id)}">Profiel</button></article>`}
export function renderTransferAssessmentRead(row,edit,players,{presentation=false}={}){const selected=(edit.competition??[]).map(String),cards=selected.map(id=>competitorCard(players.find(player=>String(player.id)===id),id)).join('');return `<section class="tdl-assessment"><header><div><span class="eyebrow">FVT beoordeling</span><h3>Redactioneel profiel</h3></div>${presentation?'':`<button type="button" data-tdl-editor-open="${esc(row.id)}">Bewerken</button>`}</header><div class="tdl-assessment-grid"><article><span>Verwachte rol</span><strong>${assessedValue(edit.role)}</strong></article><article><span>Fantasy-impact</span><strong>${assessedValue(edit.impact)}</strong></article><article><span>Label</span><strong>${assessedValue(edit.label)}</strong></article></div><section class="tdl-assessment-competition"><h4>Concurrentie voor</h4>${cards||'<p class="tdl-assessment-empty">Nog geen concurrentie aangegeven.</p>'}</section><section class="tdl-assessment-note"><h4>FVT-notitie</h4>${edit.note||row.sheetImpact?`<p>${esc(edit.note||row.sheetImpact)}</p>`:'<p class="tdl-assessment-empty">Nog niet beoordeeld</p>'}</section></section>`}
export function renderTransferAssessmentEdit(row,edit,players){const clubPlayers=players.filter(player=>canonicalTransferClub(player.club)===row.club),competition=new Set((edit.competition??[]).map(String));return `<form class="tdl-editor" data-tdl-editor="${esc(row.id)}"><label>Verwachte rol<select name="role">${ROLE_OPTIONS.map(v=>option(v,edit.role??'onbekend')).join('')}</select></label><label>Fantasy-impact<select name="impact">${IMPACT_OPTIONS.map(v=>option(v,edit.impact??'onbekend')).join('')}</select></label><label>Label<select name="label"><option value="">Geen label</option>${LABEL_OPTIONS.map(v=>option(v,edit.label??'')).join('')}</select></label><fieldset><legend>Concurrentie voor</legend>${clubPlayers.map(player=>`<label><input type="checkbox" name="competition" value="${esc(player.id)}" ${competition.has(String(player.id))?'checked':''}><span>${esc(player.name)} · € ${metric(player.currentPrice??player.price)} · ${metric(player.ownership)}% · ${metric(player.totalPoints??player.points)} pt · ${metric(player.minutes)} min</span></label>`).join('')||'<p>Geen huidige clubspelers beschikbaar.</p>'}</fieldset><label>FVT impact / notitie<textarea name="note" rows="4">${esc(edit.note??row.sheetImpact??'')}</textarea></label><label class="tdl-live-check"><input type="checkbox" name="liveNew" ${edit.liveNew?'checked':''}> Nieuw tijdens livestream</label><footer><button type="button" data-tdl-editor-cancel>Annuleren</button><button type="submit">Opslaan</button></footer></form>`}
function drawer(d){if(state.profileId){const profile=getPlayerDetailProfile({playerId:state.profileId});return profile?`<div class="tdl-backdrop" data-tdl-close></div><aside class="tdl-drawer"><header><b>Spelerprofiel</b><button data-tdl-close>×</button></header>${renderPlayerDetailProfile(profile,'overview',{startRound:1,count:5,selectedFixtureId:null})}</aside>`:''}if(!state.transferId)return'';const row=d.transfers.find(r=>r.id===state.transferId);if(!row)return'';const edit=transferEditorial(row.id),editing=state.editorialEditId===row.id;return `<div class="tdl-backdrop" data-tdl-close></div><aside class="tdl-drawer transfer"><header><div><span>${row.direction} · ${esc(row.club)}</span><b>${esc(row.playerName)}</b></div><button data-tdl-close>×</button></header><div class="tdl-player-summary"><div>${row.matchedPlayer?`<button data-tdl-profile="${esc(row.fantasyPlayerId)}">Open volledig spelersprofiel →</button>`:''}${matchBadge(row)}</div><dl><div><dt>Van</dt><dd>${esc(row.from||'—')}</dd></div><div><dt>Naar</dt><dd>${esc(row.to||'—')}</dd></div><div><dt>Positie</dt><dd>${esc(positionLabel(row.position)||'—')}</dd></div><div><dt>Type</dt><dd>${esc(row.type||'—')}</dd></div><div><dt>Prijs</dt><dd>€ ${metric(row.fantasyPrice)}</dd></div><div><dt>Ownership</dt><dd>${metric(row.ownership)}%</dd></div><div><dt>Punten</dt><dd>${metric(row.points)}</dd></div><div><dt>Minuten</dt><dd>${metric(row.minutes)}</dd></div></dl></div>${editing?renderTransferAssessmentEdit(row,edit,d.players):renderTransferAssessmentRead(row,edit,d.players,{presentation:state.presentation})}</aside>`}

function presentation(d){const clubs=d.clubs,index=Math.max(0,Math.min(clubs.length-1,state.presentationIndex)),club=clubs[index],edit=clubEditorial(club.club),highlight=club.incoming.find(r=>r.id===state.highlightId)||club.incoming.find(r=>['Must watch','Differential'].includes(transferEditorial(r.id).label))||club.incoming[0];return `<div class="tdl-presentation" data-tdl-presentation><header>${clubLogo(club.club)}<div><span>TRANSFER DEADLINE LIVE · ${index+1}/18</span><h1>${esc(club.club)}</h1><p>${esc(edit.note||'Zomerwindow 2026/2027')} · bijgewerkt ${esc(updatedAt(d.transfers)||'—')}</p></div><div><strong>${edit.score??'—'}</strong><span>/100</span>${verdictBadge(club.club)}</div></header><main><section><h2>Inkomende transfers</h2>${club.incoming.slice(0,10).map(row=>`<button data-tdl-highlight="${esc(row.id)}" class="${highlight?.id===row.id?'active':''}"><strong>${esc(row.playerName)}</strong><span>${esc(row.from||'—')}</span><em>${esc(positionLabel(row.position)||'—')}</em><b>€ ${metric(row.fantasyPrice)} · ${metric(row.ownership)}%</b></button>`).join('')}</section><aside><h2>Fantasy impact</h2>${highlight?`<article><span class="eyebrow">Uitgelichte aanwinst</span><h3>${esc(highlight.playerName)}</h3><p>${esc(transferEditorial(highlight.id).label||'Nog beoordelen')} · ${esc(transferEditorial(highlight.id).role||'rol onbekend')}</p><strong>${esc(transferEditorial(highlight.id).impact||'impact onbekend')}</strong><p>${esc(transferEditorial(highlight.id).note||highlight.sheetImpact||'Nog geen redactionele notitie.')}</p><small>Concurrentie voor: ${(transferEditorial(highlight.id).competition??[]).map(id=>d.players.find(p=>String(p.id)===String(id))?.name).filter(Boolean).map(esc).join(', ')||'nog niet ingesteld'}</small></article>`:'<p>Geen inkomende transfers.</p>'}</aside></main><footer><b>Vertrokken</b>${club.outgoing.slice(0,9).map(row=>`<span>${esc(row.playerName)} → ${esc(row.to||'onbekend')}</span>`).join('')}</footer><div class="tdl-presentation-help">← vorige club · → volgende club · Esc sluiten</div></div>`}

const emptyData=()=>({players:[],transfers:[],clubs:buildTransferClubRows([],[]),duplicates:[]})
export function createTransferDeadlineLiveScreen(){let d;try{d=data()}catch(error){console.error('Transfer Deadline Live-data kon niet worden opgebouwd.',error);d=emptyData()}let content;try{content=state.presentation?presentation(d):!d.transfers.length?empty():state.view==='overview'?overview(d):state.view==='club'?clubDetail(d):state.view==='updates'?updates(d):ranking(d)}catch(error){console.error('Transfer Deadline Live-content kon niet worden gerenderd.',error);content='<div class="tdl-empty"><h3>Transferdata tijdelijk niet beschikbaar</h3><p>De content kon niet worden geladen. Synchroniseer opnieuw zodra de transferbron weer bereikbaar is.</p></div>'}return shell(content+diagnostics(d),d)}
function rerender(){const root=document.querySelector('#page-content');if(!root)return;root.innerHTML=safeHtml(createTransferDeadlineLiveScreen());mountTransferDeadlineLiveScreen()}
function setPresentation(enabled){state.presentation=enabled;document.body.classList.toggle('tdl-presentation-active',enabled);if(!enabled&&document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});rerender()}

export async function mountTransferDeadlineLiveScreen(){
  let currentData
  try {
    currentData=data()
  } catch (error) {
    console.error('Transfer Deadline Live-data kon niet worden gemonteerd.',error)
    currentData=emptyData()
  }
  if(!currentData.transfers.length&&!directTransferFetchAttempted){
    directTransferFetchAttempted=true
    console.info('[Transfers Live] fallbackdiagnose', {localTransferCount:0,fallbackFetchAttempted:true})
    try {
      const fallbackRows=await fetchSheet('TRANSFERS_2026_27')
      const fallbackTransfers=fallbackRows.map(normalizeTransferRow).filter(Boolean)
      if(!fallbackTransfers.length)throw new Error('De directe transferfetch bevat geen bruikbare records.')
      let fallbackOverview=[]
      try { fallbackOverview=(await fetchSheet('TRANSFER_CLUB_OVERVIEW')).map(normalizeTransferClubOverview).filter(Boolean) } catch(error) { console.warn('[Transfers Live] overview fallback niet beschikbaar; totalen worden berekend.',error) }
      directTransferData={transfers:fallbackTransfers,overview:fallbackOverview}
      transferLiveSource='remote'
      const finalData=data()
      console.info('[Transfers Live] fallbackresultaat', {localTransferCount:0,fallbackFetchAttempted:true,fallbackRawCount:fallbackRows.length,fallbackNormalizedCount:fallbackTransfers.length,finalTransferCount:finalData.transfers.length,finalClubCount:finalData.clubs.length,overviewSource:fallbackOverview.length?'remote':'calculated'})
      logTransferLiveSource(finalData)
      if(finalData.transfers.length)rerender()
    } catch(error) {
      console.warn('[Transfers Live] directe transferfallback mislukt.',error)
      directTransferData={transfers:snapshotTransfers,overview:[]}
      transferLiveSource='snapshot'
      const finalData=data()
      console.info('[Transfers Live] fallbackresultaat', {localTransferCount:0,fallbackFetchAttempted:true,fallbackRawCount:0,fallbackNormalizedCount:snapshotTransfers.length,finalTransferCount:finalData.transfers.length,finalClubCount:finalData.clubs.length,overviewSource:'calculated'})
      logTransferLiveSource(finalData)
      if(finalData.transfers.length)rerender()
    }
  } else {
    console.info('[Transfers Live] lokale data', {localTransferCount:currentData.transfers.length,fallbackFetchAttempted:directTransferFetchAttempted,finalTransferCount:currentData.transfers.length,finalClubCount:currentData.clubs.length,overviewSource:directTransferData?(directTransferData.overview.length?'remote':'calculated'):'local'})
    logTransferLiveSource(currentData)
  }
  const pageRoot=document.querySelector('#page-content')
  const modalHtml=managementModal(currentData)
  if(modalHtml)pageRoot?.insertAdjacentHTML('beforeend',safeHtml(modalHtml))
  else if(state.notice)pageRoot?.insertAdjacentHTML('beforeend',safeHtml(`<div class="tdl-save-toast">${esc(state.notice)}</div>`))
  const manualClubSelect=document.querySelector('[data-tdl-manual-transfer] select[name="club"]')
  if(manualClubSelect&&!state.editingLocalId&&!state.club){const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Kies een Eredivisieclub';placeholder.selected=true;placeholder.disabled=true;manualClubSelect.prepend(placeholder)}
  document.querySelector('[data-tdl-new-transfer]')?.addEventListener('click',()=>{state.manager='transfer';state.editingLocalId='';state.notice='';rerender()})
  document.querySelector('[data-tdl-manage-scores]')?.addEventListener('click',()=>{state.manager='scores';state.notice='';rerender()})
  document.querySelector('[data-tdl-workspace-close]')?.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('tdl:close-workspace')))
  if(state.view==='club'&&!state.presentation){
    const club=currentData.clubs.find(item=>item.club===state.club)
    const detail=document.querySelector('.tdl-club-detail')
    const sections=detail?.querySelectorAll(':scope > section')??[]
    if(club&&sections.length>=2){
      sections[0].classList.add('tdl-incoming-panel')
      sections[1].classList.add('tdl-outgoing-panel')
      const featured=club.incoming.find(row=>['Must watch','Differential'].includes(transferEditorial(row.id).label)||['zeer hoog','hoog'].includes(transferEditorial(row.id).impact))??club.incoming[0]
      const edit=featured?transferEditorial(featured.id):{}
      sections[0].insertAdjacentHTML('afterend',safeHtml(`<aside class="tdl-club-broadcast"><span class="eyebrow">Fantasy impact</span><h3>Window-oordeel</h3><strong class="tdl-broadcast-verdict">${esc((clubEditorial(club.club).verdict??'gelijk').toUpperCase())}</strong><p>${esc(clubEditorial(club.club).note??'Nog geen window-notitie.')}</p><h3>Uitgelichte aanwinst</h3>${featured?`<button data-tdl-transfer="${esc(featured.id)}"><b>${esc(featured.playerName)}</b><span>${esc(edit.label||edit.impact||'Nog beoordelen')}</span></button><h3>Concurrentie-effect</h3><p>${esc(edit.note||featured.sheetImpact||'Nog niet beoordeeld.')}</p>`:'<p>Geen inkomende transfer beschikbaar.</p>'}</aside>`))
    }
  }
  if(state.transferId){
    const row=currentData.transfers.find(item=>item.id===state.transferId)
    const transferHeading=document.querySelector('.tdl-drawer.transfer>header span')
    if(row&&transferHeading)transferHeading.textContent=`${row.category} · ${row.club}${row.loanBadge?` · ${row.loanBadge}`:''}`
  }
  if(state.view==='updates'){
    const updates=document.querySelector('.tdl-updates')
    const heading=updates?.querySelector('header h2')
    if(heading)heading.textContent='Nieuwe transfers sinds start livestream'
    const liveArticles=[],existingArticles=[]
    updates?.querySelectorAll(':scope > article').forEach(article=>{
      const id=article.querySelector('[data-tdl-transfer]')?.dataset.tdlTransfer,row=currentData.transfers.find(item=>item.id===id)
      if(!row)return
      ;(isLiveNew(row)?liveArticles:existingArticles).push(article)
      const time=article.querySelector('time')
      if(time)time.textContent=row.localTransfer?(row.transferDate||'Geen transfertijd beschikbaar'):(row.sourceUpdated?`Bronupdate · ${row.sourceUpdated}`:'Geen transfertijd beschikbaar')
    })
    if(liveArticles.length){updates?.insertAdjacentHTML('beforeend',safeHtml('<h3 class="tdl-update-group live">LIVE NIEUW</h3>'));liveArticles.forEach(article=>updates?.append(article))}
    if(existingArticles.length){updates?.insertAdjacentHTML('beforeend',safeHtml('<h3 class="tdl-update-group">BESTAANDE TRANSFERS</h3>'));existingArticles.forEach(article=>updates?.append(article))}
  }
  if(state.view==='ranking'){
    const panel=document.querySelector('.tdl-ranking-layout aside article:first-child')
    const shown=new Set([...panel?.querySelectorAll('[data-tdl-transfer]')??[]].map(el=>el.dataset.tdlTransfer))
    const additions=currentData.transfers.filter(row=>!shown.has(row.id)&&['zeer hoog','hoog'].includes(transferEditorial(row.id).impact)).slice(0,Math.max(0,5-shown.size))
    if(additions.length){panel?.querySelector('p')?.remove();panel?.insertAdjacentHTML('beforeend',safeHtml(additions.map(row=>transferRow(row,true)).join('')))}
  }
  if(state.presentation){
    document.querySelectorAll('[data-tdl-highlight]').forEach(button=>{const row=currentData.transfers.find(item=>item.id===button.dataset.tdlHighlight),meta=button.querySelector('em');if(row&&meta)meta.textContent=`${positionLabel(row.position)||'—'} · ${row.category}`})
  }
  document.querySelectorAll('.tdl-editor fieldset label').forEach(label=>{
    const playerId=label.querySelector('input[name="competition"]')?.value
    if(!playerId)return
    const profileButton=document.createElement('button')
    profileButton.type='button'
    profileButton.className='tdl-competition-profile'
    profileButton.textContent='Profiel'
    profileButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();state.profileId=playerId;state.transferId='';state.editorialEditId='';rerender()})
    label.append(profileButton)
  })
  document.querySelectorAll('[data-tdl-view]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.tdlView)))
  document.querySelectorAll('[data-tdl-club]').forEach(el=>el.addEventListener('click',()=>navigate('club',el.dataset.tdlClub)))
  document.querySelectorAll('[data-tdl-transfer]').forEach(el=>el.addEventListener('click',()=>{const club=state.view==='club'?currentData.clubs.find(item=>item.club===state.club):null,context=[...(club?.incoming??[]),...(club?.outgoing??[])].find(row=>row.id===el.dataset.tdlTransfer);state.transferContext=context??null;state.transferId=el.dataset.tdlTransfer;state.editorialEditId='';state.profileId='';rerender()}))
  document.querySelectorAll('[data-tdl-close]').forEach(el=>el.addEventListener('click',()=>{state.transferId='';state.transferContext=null;state.editorialEditId='';state.profileId='';rerender()}))
  document.querySelectorAll('[data-tdl-profile]').forEach(el=>el.addEventListener('click',()=>{state.profileId=el.dataset.tdlProfile;state.transferId='';rerender()}))
  document.querySelectorAll('[data-tdl-competition-profile]').forEach(el=>el.addEventListener('click',()=>{state.profileId=el.dataset.tdlCompetitionProfile;state.transferId='';state.editorialEditId='';rerender()}))
  document.querySelector('[data-tdl-editor-open]')?.addEventListener('click',el=>{state.editorialEditId=el.currentTarget.dataset.tdlEditorOpen;rerender()})
  document.querySelector('[data-tdl-editor-cancel]')?.addEventListener('click',()=>{state.editorialEditId='';state.notice='';rerender()})
  document.querySelectorAll('.tdl-drawer [data-player-detail-tab]').forEach(el=>el.addEventListener('click',()=>{state.profileTab=el.dataset.playerDetailTab;rerender()}))
  document.querySelector('[data-tdl-present]')?.addEventListener('click',async()=>{state.presentationIndex=Math.max(0,TRANSFER_CLUBS.indexOf(state.club));try{await document.documentElement.requestFullscreen?.()}catch{}setPresentation(true)})
  document.querySelector('[data-tdl-session]')?.addEventListener('click',()=>{if(session().startedAt&&!window.confirm('Livesessie herstarten en de teller voor nieuwe transfers op nul zetten?'))return;saveSession({startedAt:new Date().toISOString()});const data=readEditorial();Object.values(data.transfers).forEach(item=>{item.liveNew=false});saveEditorial(data);state.notice='Livesessie gestart. De teller staat op nul.';rerender()})
  document.querySelector('[data-tdl-shared-config]')?.addEventListener('click',()=>{state.manager='shared';state.sharedFeedback=null;state.sharedTokenVisible=false;state.notice='';rerender()})
  document.querySelectorAll('[data-tdl-filter]').forEach(el=>el.addEventListener(el.tagName==='INPUT'?'input':'change',()=>{state.filters[el.dataset.tdlFilter]=el.value;rerender()}))
  document.querySelectorAll('[data-tdl-live]').forEach(el=>el.addEventListener('click',()=>{const current=transferEditorial(el.dataset.tdlLive);updateTransfer(el.dataset.tdlLive,{liveNew:!current.liveNew});rerender()}))
  document.querySelectorAll('[data-tdl-sort]').forEach(el=>el.addEventListener('click',()=>{state.direction=state.sort===el.dataset.tdlSort&&state.direction==='desc'?'asc':'desc';state.sort=el.dataset.tdlSort;rerender()}))
  document.querySelector('[data-tdl-club-score]')?.addEventListener('change',event=>{const score=validateWindowScore(event.target.value);if(!score.valid){state.notice='Gebruik een gehele window-score van 0 t/m 100.';rerender();return}updateClub(state.club,{score:score.value});state.notice='Window-score opgeslagen.';rerender()})
  document.querySelector('[data-tdl-club-verdict]')?.addEventListener('change',event=>{updateClub(state.club,{verdict:event.target.value});state.notice='Window-oordeel opgeslagen.';rerender()})
  document.querySelector('[data-tdl-club-note]')?.addEventListener('change',event=>{updateClub(state.club,{note:event.target.value});state.notice='Window-notitie opgeslagen.';rerender()})
  document.querySelectorAll('[data-tdl-ranking-score]').forEach(el=>el.addEventListener('change',()=>{const score=validateWindowScore(el.value);if(!score.valid){state.notice='Gebruik een gehele window-score van 0 t/m 100.';rerender();return}updateClub(el.dataset.tdlRankingScore,{score:score.value});state.notice='Window-score opgeslagen.';rerender()}))
  document.querySelectorAll('[data-tdl-ranking-verdict]').forEach(el=>el.addEventListener('change',()=>{updateClub(el.dataset.tdlRankingVerdict,{verdict:el.value});state.notice='Window-oordeel opgeslagen.';rerender()}))
  document.querySelector('[data-tdl-editor]')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.currentTarget),id=event.currentTarget.dataset.tdlEditor,current=transferEditorial(id),next={role:form.get('role'),impact:form.get('impact'),label:form.get('label'),note:form.get('note'),liveNew:form.get('liveNew')==='on',competition:form.getAll('competition').map(String)},patch={};for(const [key,value] of Object.entries(next)){if(JSON.stringify(value)!==JSON.stringify(current[key]??(Array.isArray(value)?[]:key==='liveNew'?false:'')))patch[key]=value}if(Object.keys(patch).length)updateTransfer(id,patch);state.editorialEditId='';state.notice=Object.keys(patch).length?'Lokaal opgeslagen — synchroniseer om te delen.':'Geen wijzigingen om op te slaan.';rerender()})
  document.querySelectorAll('[data-tdl-highlight]').forEach(el=>el.addEventListener('click',()=>{state.highlightId=el.dataset.tdlHighlight;rerender()}))
  document.querySelectorAll('[data-tdl-manager-close]').forEach(el=>el.addEventListener('click',()=>{if(state.sharedBusy)return;state.manager='';state.editingLocalId='';state.notice='';state.sharedFeedback=null;state.sharedTokenVisible=false;rerender()}))
  document.querySelector('[data-tdl-token-toggle]')?.addEventListener('click',event=>{const input=document.querySelector('[data-tdl-shared-form] input[name="token"]');if(!input)return;state.sharedTokenVisible=!state.sharedTokenVisible;input.type=state.sharedTokenVisible?'text':'password';event.currentTarget.textContent=state.sharedTokenVisible?'Verberg':'Toon';event.currentTarget.setAttribute('aria-label',state.sharedTokenVisible?'Token verbergen':'Token tonen')})
  document.querySelector('[data-tdl-shared-form]')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.currentTarget),config=writeTransferSharedConfig({endpoint:form.get('endpoint'),token:form.get('token')});state.sharedFeedback={state:config.endpoint&&config.token?'configured':'unconfigured',message:config.endpoint&&config.token?'Configuratie opgeslagen.':'Configuratie opgeslagen, maar URL en token zijn nog niet compleet.'};rerender()})
  document.querySelector('[data-tdl-shared-sync]')?.addEventListener('click',async()=>{
    if(state.sharedBusy)return
    const config=readTransferSharedConfig()
    if(!config.endpoint||!config.token){state.sharedFeedback={state:'error',message:'Vul eerst zowel de Web App URL als het write token in en sla deze op.'};rerender();return}
    state.sharedBusy=true;state.sharedFeedback=null;rerender()
    const status=await synchronizeTransferDeadlineSharedData()
    state.sharedBusy=false
    state.sharedFeedback={state:status.state==='synced'?'success':'error',message:status.message}
    rerender()
  })
  document.querySelector('[data-tdl-manual-transfer]')?.addEventListener('submit',event=>{
    event.preventDefault()
    const form=new FormData(event.currentTarget),existing=readEditorial().localTransfers.find(row=>row.id===form.get('id'))
    const candidate=normalizeManualTransfer({id:existing?.id,createdAt:existing?.createdAt,club:form.get('club'),playerName:form.get('playerName'),from:form.get('from'),to:form.get('to'),type:form.get('type'),status:form.get('status'),transferDate:form.get('transferDate'),position:form.get('position'),fee:form.get('fee'),source:form.get('source'),sourceUrl:form.get('sourceUrl'),contract:form.get('contract')})
    if(!candidate){state.notice='Vul minimaal spelernaam en een geldige Eredivisie-bestemming of -herkomst in.';rerender();return}
    const duplicate=currentData.transfers.find(row=>row.id!==existing?.id&&createTransferDuplicateKey(row)===createTransferDuplicateKey(candidate))
    if(duplicate){state.notice=`Mogelijk duplicaat: ${duplicate.playerName} (${duplicate.from||'—'} → ${duplicate.to||'—'}).`;rerender();return}
    upsertLocalTransfer(candidate)
    if(!existing&&session().startedAt)updateTransfer(candidate.id,{liveNew:true})
    state.manager='';state.editingLocalId='';state.notice=existing?'Lokale transfer bijgewerkt.':'Nieuwe transfer lokaal opgeslagen.';rerender()
  })
  document.querySelector('[data-tdl-scores-manager]')?.addEventListener('submit',event=>{
    event.preventDefault();const form=new FormData(event.currentTarget)
    for(const club of TRANSFER_CLUBS){const score=validateWindowScore(form.get(`score:${club}`));if(!score.valid){state.notice=`Ongeldige score voor ${club}. Gebruik een integer van 0 t/m 100.`;rerender();return}}
    let changed=0
    for(const club of TRANSFER_CLUBS){const current=clubEditorial(club),score=validateWindowScore(form.get(`score:${club}`)),next={score:score.value,verdict:form.get(`verdict:${club}`),note:form.get(`note:${club}`)},patch={};for(const [key,value] of Object.entries(next))if(value!==(current[key]??(key==='score'?null:key==='verdict'?'gelijk':'')))patch[key]=value;if(Object.keys(patch).length){updateClub(club,patch);changed+=1}}
    state.notice=changed?`${changed} clubrecord${changed===1?'':'s'} lokaal opgeslagen — synchroniseer om te delen.`:'Geen wijzigingen om op te slaan.';rerender()
  })
  if(state.transferId){
    const row=currentData.transfers.find(item=>item.id===state.transferId)
    if(row?.localTransfer){
      const header=document.querySelector('.tdl-drawer.transfer>header')
      const actions=document.createElement('div');actions.className='tdl-local-actions';actions.innerHTML=safeHtml('<button type="button" data-tdl-local-edit>Wijzigen</button><button type="button" data-tdl-local-delete>Verwijderen</button>');header?.insertBefore(actions,header.lastElementChild)
      actions.querySelector('[data-tdl-local-edit]')?.addEventListener('click',()=>{state.manager='transfer';state.editingLocalId=row.id;state.transferId='';state.notice='';rerender()})
      actions.querySelector('[data-tdl-local-delete]')?.addEventListener('click',()=>{if(window.confirm(`Lokale transfer van ${row.playerName} verwijderen?`)){deleteLocalTransfer(row.id);state.transferId='';state.notice='Lokale transfer verwijderd.';rerender()}})
    }
  }
}

if(typeof document!=='undefined')document.addEventListener('fullscreenchange',()=>{if(state.presentation&&!document.fullscreenElement)setPresentation(false)})

export function handleTransferDeadlineKeydown(event){if(event.key==='Escape'&&(state.transferId||state.profileId)){state.transferId='';state.transferContext=null;state.profileId='';rerender();return true}if(!state.presentation)return false;if(event.key==='Escape'){setPresentation(false);return true}if(event.key==='ArrowRight'||event.key==='ArrowLeft'){state.presentationIndex=stepTransferClubIndex(state.presentationIndex,event.key==='ArrowRight'?'next':'previous');state.highlightId='';rerender();return true}return false}
