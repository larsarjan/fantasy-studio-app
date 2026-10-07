import { safeHtml } from '../platform/html.js'
import { getPlayers, getDatabaseSummary } from '../services/database.js'
import { getManagerTeamState, getManagerSettings } from './optimizer.js'
import { getCaptainRadarDefaultRound } from '../services/captainRadarEngine.js'
import { changeSelection } from '../platform/selectionStorage.js'
import { canAddPlayer, playerId, playerPrice, selectionPlayers, selectionLineup, updateSelection, validateSelection } from '../services/personalSelection.js'
import { normalizeFantasyPosition } from '../services/fantasyGameRulesEngine.js'
import { getPlayerDetailProfile, renderPlayerDetailProfile } from './players.js'

export const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
const money = value => value == null ? 'Onbekend' : `€ ${Number(value).toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1})}`
const positions = { goalkeeper:'Doelmannen', defender:'Verdedigers', midfielder:'Middenvelders', forward:'Spitsen' }
let query = '', position = '', message = '', detailId = ''
const database = () => getPlayers()
export function createSelectionScreen() {
  const state = getManagerTeamState(), players = selectionPlayers(state, database()), lineup = selectionLineup(state, players), validation = validateSelection(state, database())
  const pool = database().filter(p => !players.some(s => playerId(p) === playerId(s)) && (!position || normalizeFantasyPosition(p.fantasyPosition ?? p.position) === position) && `${p.name} ${p.club}`.toLocaleLowerCase('nl').includes(query.toLocaleLowerCase('nl'))).slice(0,30)
  const renderPlayer = p => `<article class="selection-player" data-selection-player="${esc(playerId(p))}"><div><button class="selection-name" data-selection-profile="${esc(playerId(p))}">${esc(p.name)}</button><small>${esc(p.club)} · ${esc(p.position)} · ${money(playerPrice(p))}</small></div><div class="selection-actions"><label><input type="checkbox" data-selection-start="${esc(playerId(p))}" ${lineup.starters.includes(playerId(p))?'checked':''}> Basis</label><button data-selection-band="captainId" data-id="${esc(playerId(p))}" aria-pressed="${lineup.captainId===playerId(p)}" ${!lineup.starters.includes(playerId(p))?'disabled':''}>C</button><button data-selection-band="viceCaptainId" data-id="${esc(playerId(p))}" aria-pressed="${lineup.viceCaptainId===playerId(p)}" ${!lineup.starters.includes(playerId(p))?'disabled':''}>VC</button><button data-selection-remove="${esc(playerId(p))}" aria-label="${esc(p.name)} verwijderen">×</button></div><details class="selection-prices"><summary>Aankoop- en verkoopwaarde</summary><label>Aankoopprijs <input type="number" min="0" step="0.1" data-selection-price="purchasePrices" data-id="${esc(playerId(p))}" value="${esc(state.purchasePrices?.[playerId(p)] ?? state.importResult?.players?.find(r=>playerId(r.player)===playerId(p))?.purchasePrice ?? '')}" placeholder="Onbekend"></label><label>Verkoopwaarde <input type="number" min="0" step="0.1" data-selection-price="manualSellingPrices" data-id="${esc(playerId(p))}" value="${esc(state.manualSellingPrices?.[playerId(p)] ?? state.importResult?.players?.find(r=>playerId(r.player)===playerId(p))?.sellingPrice ?? '')}" placeholder="Onbekend"></label></details></article>`
  const starterPlayers = players.filter(p=>lineup.starters.includes(playerId(p))), bench = players.filter(p=>!lineup.starters.includes(playerId(p)))
  const profile = detailId ? getPlayerDetailProfile({ playerId:detailId }) : null
  return `<section class="personal-studio"><div class="panel selection-heading"><span class="eyebrow">Jouw Fantasy Voetbal</span><h2>Mijn selectie</h2><p>Beheer je spelers, basis en aanvoerders. Wijzigingen worden automatisch in je account opgeslagen, ook als je selectie nog niet compleet is.</p><div class="selection-summary"><strong>${players.length}/15 spelers</strong><span>Basis ${starterPlayers.length}/11</span><span>Bank ${bench.length}/4</span><span>Marktwaarde ${players.every(p=>playerPrice(p)!==null)?money(players.reduce((s,p)=>s+playerPrice(p),0)):'onbekend'}</span></div><div class="selection-controls"><label>Beschikbaar budget<input id="selection-bank" type="number" min="0" step="0.1" value="${state.bankKnown?esc(state.bank):''}" placeholder="Onbekend"></label><label>Vrije transfers<input id="selection-transfers" type="number" min="0" max="5" step="1" value="${esc(state.freeTransfers)}"></label><a class="personal-link" href="/studio/optimizer">Naar FVT Manager / importeren</a></div><p id="selection-message" role="status">${esc(message)}</p><details class="selection-validation" ${validation.valid?'':'open'}><summary>${validation.valid?'Selectie en opstelling zijn geldig':'Selectie verder aanvullen'}</summary>${validation.errors.map(e=>`<p>${esc(e)}</p>`).join('')}</details></div><div class="selection-layout"><div><section class="panel"><span class="eyebrow">De aftrap</span><h3>Basis ${starterPlayers.length}/11</h3>${Object.entries(positions).map(([key,label])=>`<div class="selection-position"><h4>${label}</h4>${starterPlayers.filter(p=>normalizeFantasyPosition(p.fantasyPosition??p.position)===key).map(renderPlayer).join('')||'<p class="muted">Nog geen speler opgesteld</p>'}</div>`).join('')}</section><section class="panel"><h3>Bank ${bench.length}/4</h3>${bench.map(renderPlayer).join('')||'<p>Je toegevoegde spelers verschijnen hier.</p>'}</section></div><section class="panel selection-search"><span class="eyebrow">Spelersdatabase</span><h3>Speler toevoegen</h3><label>Zoek op naam of club<input id="selection-search" type="search" value="${esc(query)}" placeholder="Zoek een speler"></label><label>Positie<select id="selection-position"><option value="">Alle posities</option>${Object.entries(positions).map(([k,v])=>`<option value="${k}" ${position===k?'selected':''}>${v}</option>`).join('')}</select></label><p>Maximaal 30 zoekresultaten. Kies 2 keepers, 5 verdedigers, 5 middenvelders en 3 spitsen.</p><div id="selection-search-results">${pool.map(p=>`<div class="selection-search-row"><div><strong>${esc(p.name)}</strong><small>${esc(p.club)} · ${esc(p.position)} · ${money(playerPrice(p))}</small></div><button data-selection-add="${esc(playerId(p))}" aria-label="${esc(p.name)} toevoegen">+</button></div>`).join('')||'<p>Geen spelers gevonden.</p>'}</div></section></div>${profile?`<div class="personal-detail panel"><button id="selection-close-detail">Profiel sluiten</button>${renderPlayerDetailProfile(profile,'overview')}</div>`:''}</section>`
}
function render(focus) {
  const cursor = document.querySelector('#selection-search')?.selectionStart
  document.querySelector('#page-content').innerHTML = safeHtml(createSelectionScreen())
  mountSelectionScreen()
  if (focus) { const input=document.querySelector(focus); input?.focus(); if(input?.type==='search') input.setSelectionRange(cursor,cursor) }
}
function commit(players, lineup, state = getManagerTeamState()) {
  const next=updateSelection(state,players,lineup),settings=getManagerSettings()
  if(state.importResult?.sourceType!=='manual'){
    const round=getCaptainRadarDefaultRound(getDatabaseSummary().activeSeason)
    next.seasonPhase=round>1?'in-season':'preseason'
    next.seasonStatus={phase:next.seasonPhase,firstPlayableRound:1}
    settings.planning.startRound=round
  }
  changeSelection(next,settings); render()
}
export function mountSelectionScreen() {
  const on = (selector,event,fn) => document.querySelectorAll(selector).forEach(el=>el.addEventListener(event,fn))
  on('#selection-search','input',e=>{query=e.target.value;render('#selection-search')})
  on('#selection-position','change',e=>{position=e.target.value;render()})
  on('[data-selection-add]','click',e=>{
    const state=getManagerTeamState(), players=selectionPlayers(state,database()), p=database().find(p=>playerId(p)===e.currentTarget.dataset.selectionAdd)
    message=canAddPlayer(players,p); if(message) return render()
    commit([...players,p],selectionLineup(state,players),state)
  })
  on('[data-selection-remove]','click',e=>{const state=getManagerTeamState(),players=selectionPlayers(state,database()).filter(p=>playerId(p)!==e.currentTarget.dataset.selectionRemove);message='';commit(players,selectionLineup(state,players),state)})
  on('[data-selection-start]','change',e=>{
    const state=getManagerTeamState(),players=selectionPlayers(state,database()),lineup=selectionLineup(state,players),id=e.target.dataset.selectionStart
    if(e.target.checked && lineup.starters.length>=11){message='Zet eerst een basisspeler op de bank.';return render()}
    lineup.starters=e.target.checked?[...lineup.starters,id]:lineup.starters.filter(v=>v!==id)
    if(!e.target.checked){if(lineup.captainId===id)lineup.captainId='';if(lineup.viceCaptainId===id)lineup.viceCaptainId=''}
    message='';commit(players,lineup,state)
  })
  on('[data-selection-band]','click',e=>{const state=getManagerTeamState(),players=selectionPlayers(state,database()),lineup=selectionLineup(state,players),{selectionBand:key,id}=e.currentTarget.dataset;const other=key==='captainId'?'viceCaptainId':'captainId';lineup[key]=id;if(lineup[other]===id)lineup[other]='';commit(players,lineup,state)})
  on('#selection-bank','input',e=>{if(!e.target.checkValidity())return;const state=getManagerTeamState();state.bankKnown=e.target.value!=='';state.bank=state.bankKnown?Number(e.target.value):0;changeSelection(state)})
  on('#selection-transfers','input',e=>{if(!e.target.checkValidity())return;const state=getManagerTeamState();state.freeTransfers=Number(e.target.value);changeSelection(state)})
  on('[data-selection-price]','change',e=>{if(!e.target.checkValidity())return;const state=getManagerTeamState(),{selectionPrice:key,id}=e.target.dataset;state[key][id]=e.target.value===''?null:Number(e.target.value);const record=state.importResult.players.find(r=>playerId(r.player)===id);if(record)record[key==='purchasePrices'?'purchasePrice':'sellingPrice']=state[key][id];changeSelection(state)})
  on('[data-selection-profile]','click',e=>{detailId=e.currentTarget.dataset.selectionProfile;render();document.querySelector('.personal-detail')?.scrollIntoView()})
  on('#selection-close-detail','click',()=>{detailId='';render()})
}
