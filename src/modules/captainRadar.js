import { safeHtml } from '../platform/html.js'
import { getChipUsage, getDatabaseSummary, getElitePlayerStats, getEnrichedPlayers, getFixtures } from '../services/database.js'
import { eliteNumericSort, formatEliteMetric, selectEliteView } from '../services/eliteManagerIntelligence.js'
import { buildCaptainRadar, CAPTAIN_RADAR_CONFIG, getCaptainRadarAvailableRounds, getCaptainRadarDefaultRound } from '../services/captainRadarEngine.js'
import { getPlayerImage } from '../services/playerImages.js'
import { getPlayerDetailProfile, renderPlayerDetailProfile } from './players.js'

const state = { season: '', round: 0, position: 'all', club: 'all', type: 'all', sort: 'radarScore', direction: 'desc', showAll: false, selectedId: '', selectedTab: 'overview' }
const labels = { expectedPoints: 'xP', availability: 'Speelzekerheid', fixture: 'Fixture', form: 'Vorm', captainProfile: 'Captainprofiel', upside: 'Upside', reliability: 'Betrouwbaarheid' }
const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const number = (v, digits = 1) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—'
const positionLabel = (v) => ({ keeper: 'Doelman', verdediger: 'Verdediger', middenvelder: 'Middenvelder', aanvaller: 'Spits' }[String(v ?? '').toLowerCase()] ?? v ?? 'Speler')
const logoSlug = (club) => ({ 'ado den haag': 'ado-den-haag', cambuur: 'cambuur-leeuwarden', 'cambuur leeuwarden': 'cambuur-leeuwarden', 'fc groningen': 'fc-groningen', 'fc twente': 'fc-twente', 'fc utrecht': 'fc-utrecht', 'fortuna sittard': 'fortuna-sittard', 'go ahead eagles': 'go-ahead-eagles', 'n.e.c.': 'nec', nec: 'nec', 'pec zwolle': 'pec-zwolle', 'sc heerenveen': 'sc-heerenveen', heerenveen: 'sc-heerenveen', 'sparta rotterdam': 'sparta-rotterdam', 'willem ii': 'willem-ii' }[String(club ?? '').toLowerCase()] ?? String(club ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))
const photo = (p, className) => { const src = getPlayerImage(`${p.id}.webp`); return src ? `<img class="${className}" src="${src}" alt="${esc(p.name)}" loading="lazy">` : `<span class="${className} radar-photo-fallback">${esc(p.name?.[0] ?? '?')}</span>` }
const logo = (club) => `<img class="radar-club-logo" src="./club-logos/${logoSlug(club)}.png" alt="${esc(club)}" onerror="this.hidden=true">`

function ensureState() {
  const summary = getDatabaseSummary()
  state.season ||= summary.activeSeason || getEnrichedPlayers()[0]?.season || ''
  const rounds = getCaptainRadarAvailableRounds(state.season)
  if (!rounds.includes(Number(state.round))) state.round = getCaptainRadarDefaultRound(state.season)
  return rounds
}

function fixtureText(player) {
  if (!player.fixtureCount) return '<span class="radar-round-badge blank">BLANK</span><span>Geen wedstrijd</span>'
  const games = player.fixtures.map((fixture) => `${esc(fixture.opponent)} (${fixture.isHome ? 'T' : 'U'})`).join('<br>')
  return `${player.roundType === 'double' ? '<span class="radar-round-badge dgw">DGW</span>' : ''}<span>${games}</span>`
}

function breakdown(player) {
  return `<div class="radar-breakdown">${Object.entries(player.breakdown).map(([key, item]) => `<div class="radar-breakdown-row" title="${labels[key]}: ${number(item.score)} van 100"><span>${labels[key]}</span><div><i style="--score:${item.score}%"></i></div><b>${number(item.score, 0)}</b><small>× ${Math.round(item.weight * 100)}% = ${number(item.contribution)}</small></div>`).join('')}<div class="radar-breakdown-total"><span>Totaal</span><strong>${number(player.radarScore)} / 100</strong></div></div>`
}

function heroCard(kind, player) {
  const meta = { best: ['🥇', 'Beste captain'], safe: ['🛡', 'Veiligste alternatief'], differential: ['💎', 'Differential captain'] }[kind]
  if (!player) return `<article class="radar-hero-card ${kind} empty"><span class="eyebrow">${meta[0]} ${meta[1]}</span><h3>${kind === 'safe' ? 'Geen overtuigend veilig alternatief' : 'Geen overtuigende keuze'}</h3><p>${kind === 'differential' ? 'Geen overtuigende differential captain beschikbaar.' : kind === 'safe' ? 'Naast de beste captain voldoet geen andere kandidaat aan het vereiste veilige profiel.' : 'Voor deze selectie en speelronde is geen geldige captainkandidaat beschikbaar.'}</p></article>`
  return `<article class="radar-hero-card ${kind}" data-radar-player="${esc(player.id)}">
    <div class="radar-hero-eyebrow"><span>${meta[0]} ${meta[1]}</span><span>SR${state.round}${player.roundType === 'double' ? ' · DGW' : ''}</span></div>
    <div class="radar-hero-main">${photo(player, 'radar-hero-photo')}<div><h3>${esc(player.name)}</h3><p>${logo(player.club)} ${esc(player.club)} · ${esc(positionLabel(player.fantasyPosition || player.position))}</p><div class="radar-fixtures">${fixtureText(player)}</div></div><div class="radar-score" title="Captain Radar combineert xP 35%, speelzekerheid 20%, wedstrijd 15%, vorm 10%, captainprofiel 10%, upside 5% en betrouwbaarheid 5%."><small>Captain Radar ?</small><strong>${number(player.radarScore, 0)}</strong><span>/ 100</span></div></div>
    <div class="radar-metrics"><span><small>xP</small><b>${number(player.expectedPoints)}</b></span><span><small>xMin</small><b>${number(player.expectedMinutes, 0)}</b></span><span><small>CAP</small><b>${number(player.captainScore, 0)}</b></span><span><small>Fixture</small><b>${number(player.fixtureScore * 10, 0)}</b></span><span><small>Gekozen</small><b>${number(player.selectedPct)}%</b></span><span><small>Huidige prijs</small><b>€ ${number(player.currentPrice)}</b></span></div>
    <div class="radar-verdicts">${kind === 'safe' ? '<span>🛡 Risk-adjusted alternatief</span>' : ''}${player.badges.slice(0, kind === 'safe' ? 2 : 3).map((badge) => `<span>${badge.icon} ${badge.label}</span>`).join('')}</div><p class="radar-reason">${kind === 'safe' ? `Van de overige kandidaten biedt ${esc(player.name)} de sterkste combinatie van speelzekerheid, betrouwbaarheid en projectie.` : esc(player.reasons[0] || 'De rondeprojectie, speelzekerheid en wedstrijdcontext vormen samen dit advies.')}</p>${breakdown(player)}<button type="button" class="radar-profile-button">Bekijk profiel</button>
  </article>`
}

function filteredCandidates(data) {
  let list = data.candidates.filter((p) => (state.position === 'all' || String(p.fantasyPosition || p.position).toLowerCase() === state.position) && (state.club === 'all' || p.club === state.club))
  if (state.type === 'safe') list = list.filter((p) => p.reliabilityScore >= 75 && p.breakdown.availability.score >= 75)
  if (state.type === 'upside') list = list.filter((p) => p.upsideScore >= 70)
  if (state.type === 'differential') list = list.filter((p) => p.selectedPct <= CAPTAIN_RADAR_CONFIG.differentialMaxSelectedPct && p.radarScore >= CAPTAIN_RADAR_CONFIG.differentialMinimumScore)
  const factor = state.direction === 'asc' ? 1 : -1
  return list.sort((a, b) => ((Number(a[state.sort]) || 0) - (Number(b[state.sort]) || 0)) * factor || a.name.localeCompare(b.name, 'nl'))
}

function table(data) {
  const all = filteredCandidates(data), shown = state.showAll ? all : all.slice(0, 10)
  const columns = [['radarScore', 'Radar'], ['expectedPoints', 'xP'], ['expectedMinutes', 'xMin'], ['captainScore', 'CAP'], ['fixtureScore', 'Fixture'], ['formScore', 'Vorm'], ['selectedPct', 'Gekozen %'], ['currentPrice', 'Prijs']]
  return `<section class="radar-ranking panel"><div class="radar-ranking-head"><div><span class="eyebrow">Volledige analyse</span><h3>Captain-ranking</h3></div><span>${all.length} kandidaten</span></div><div class="radar-table-wrap"><table><thead><tr><th>#</th><th>Speler</th><th>Club</th><th>Tegenstander</th><th>T/U</th>${columns.map(([key, label]) => `<th><button data-radar-sort="${key}" class="${state.sort === key ? 'active' : ''}">${label}${state.sort === key ? (state.direction === 'desc' ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead><tbody>${shown.map((p, index) => `<tr data-radar-player="${esc(p.id)}" class="${p.id === state.selectedId ? 'active' : ''}"><td>${index + 1}</td><td><div class="radar-player-cell">${photo(p, 'radar-row-photo')}<div><strong>${esc(p.name)}</strong><span>${esc(positionLabel(p.fantasyPosition || p.position))}</span></div></div></td><td>${logo(p.club)} ${esc(p.club)}</td><td>${p.fixtures.map((f) => esc(f.opponent)).join('<br>') || '<span class="muted">Geen wedstrijd</span>'}${p.roundType === 'double' ? '<span class="radar-round-badge dgw">DGW</span>' : ''}</td><td>${p.fixtures.map((f) => f.isHome ? 'T' : 'U').join('/').replaceAll('<','') || '—'}</td><td><b class="radar-table-score">${number(p.radarScore, 0)}</b></td><td>${number(p.expectedPoints)}</td><td>${number(p.expectedMinutes, 0)}</td><td>${number(p.captainScore, 0)}</td><td>${number(p.fixtureScore * 10, 0)}</td><td>${number(p.formScore * 10, 0)}</td><td>${number(p.selectedPct)}%</td><td>€ ${number(p.currentPrice)}</td></tr>`).join('')}</tbody></table></div>${all.length > 10 ? `<button class="radar-show-all" data-radar-show-all>${state.showAll ? 'Toon top 10' : 'Toon alle kandidaten'}</button>` : ''}</section>`
}

function drawer() {
  if (!state.selectedId) return ''
  const player = getPlayerDetailProfile({ playerId: state.selectedId, season: state.season })
  if (!player) return ''
  return `<div class="radar-profile-backdrop" data-radar-close></div><aside class="radar-profile-drawer"><div class="radar-profile-top"><span>Spelerprofiel</span><button data-radar-close aria-label="Sluiten">×</button></div><div class="radar-profile-content">${renderPlayerDetailProfile(player, state.selectedTab, { startRound: state.round, count: 5, selectedFixtureId: null })}</div></aside>`
}

export function createCaptainRadarScreen() {
  const rounds = ensureState(), data = buildCaptainRadar({ season: state.season, round: state.round }), clubs = [...new Set(data.candidates.map((p) => p.club).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'nl')), seasons = [...new Set(getFixtures().map((f) => f.season).filter(Boolean))]
  const r = data.recommendations
  return `<section class="captain-radar"><section class="panel radar-heading"><div><span class="eyebrow">Speelronde-beslissing</span><h2>Captain Radar · Speelronde ${state.round}</h2><p>Wie verdient deze speelronde de band — en waarom?</p><div class="radar-cvc"><span><b>C</b> ${esc(r.bestCaptain?.name || '—')}</span><span><b>VC</b> ${esc(r.viceCaptain?.name || '—')}</span></div></div><div class="radar-controls"><label><span>Seizoen</span><select data-radar-filter="season">${seasons.map((v)=>`<option ${v===state.season?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label><span>Speelronde</span><select data-radar-filter="round">${rounds.map((v)=>`<option value="${v}" ${v===state.round?'selected':''}>Speelronde ${v}</option>`).join('')}</select></label><label><span>Positie</span><select data-radar-filter="position"><option value="all">Alle posities</option>${['keeper','verdediger','middenvelder','aanvaller'].map((v)=>`<option value="${v}" ${state.position===v?'selected':''}>${positionLabel(v)}</option>`).join('')}</select></label><label><span>Club</span><select data-radar-filter="club"><option value="all">Alle clubs</option>${clubs.map((v)=>`<option ${state.club===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label><span>Type</span><select data-radar-filter="type">${[['all','Alle kandidaten'],['safe','Veilig'],['upside','Hoge upside'],['differential','Differentials']].map(([v,l])=>`<option value="${v}" ${state.type===v?'selected':''}>${l}</option>`).join('')}</select></label><div class="radar-round-nav"><button data-radar-nav="-1" ${rounds.indexOf(state.round)<=0?'disabled':''}>← Vorige</button><button data-radar-nav="1" ${rounds.indexOf(state.round)>=rounds.length-1?'disabled':''}>Volgende →</button></div></div></section><section class="radar-heroes">${heroCard('best', r.bestCaptain)}${heroCard('safe', r.safestCaptain)}${heroCard('differential', r.differentialCaptain)}</section>${table(data)}${drawer()}</section>`
}

function rerender() { const root = document.querySelector('#page-content'); if (root) { root.innerHTML = safeHtml(createCaptainRadarScreen()); mountCaptainRadarScreen() } }
function eliteCaptainHistory(){const rows=selectEliteView(getElitePlayerStats(),{season:state.season,cohort:100}),round=rows[0]?.gameweek,profiles=new Map(getEnrichedPlayers().map(player=>[String(player.id),player])),statuses=getChipUsage().filter(row=>row.season===state.season&&row.round===round).map(row=>row.status),status=statuses.includes('Lopend')?'Lopend':statuses.includes('Definitief')?'Definitief':'Locked';if(!rows.length)return'';return `<section class="panel radar-elite-history"><div><span class="eyebrow">Historische context · ${status}</span><h3>Wat deed de Top 100 bij deadline SR${round}?</h3><p>Deze captainkeuzes voorspellen niet automatisch de volgende ronde.</p></div><div>${eliteNumericSort(rows,row=>row.captain.percentage).filter(row=>row.captain.count>0).slice(0,5).map(row=>`<button data-radar-player="${esc(row.playerId)}"><strong>${esc(profiles.get(String(row.playerId))?.name||row.playerId)}</strong><span>${formatEliteMetric(row.captain,row.validTeams)}</span></button>`).join('')}</div></section>`}
export function mountCaptainRadarScreen() {
  document.querySelector('.radar-ranking')?.insertAdjacentHTML('beforebegin', safeHtml(eliteCaptainHistory()))
  document.querySelectorAll('[data-radar-filter]').forEach((el) => el.addEventListener('change', () => { const key = el.dataset.radarFilter; state[key] = key === 'round' ? Number(el.value) : el.value; if (key === 'season') state.round = 0; state.showAll = false; rerender() }))
  document.querySelectorAll('[data-radar-nav]').forEach((el) => el.addEventListener('click', () => { const rounds = getCaptainRadarAvailableRounds(state.season), index = rounds.indexOf(state.round); state.round = rounds[index + Number(el.dataset.radarNav)] ?? state.round; rerender() }))
  document.querySelectorAll('[data-radar-sort]').forEach((el) => el.addEventListener('click', (event) => { event.stopPropagation(); const key = el.dataset.radarSort; state.direction = state.sort === key && state.direction === 'desc' ? 'asc' : 'desc'; state.sort = key; rerender() }))
  document.querySelector('[data-radar-show-all]')?.addEventListener('click', () => { state.showAll = !state.showAll; rerender() })
  document.querySelectorAll('[data-radar-player]').forEach((el) => el.addEventListener('click', () => { state.selectedId = el.dataset.radarPlayer; state.selectedTab = 'overview'; rerender() }))
  document.querySelectorAll('[data-radar-close]').forEach((el) => el.addEventListener('click', () => { state.selectedId = ''; rerender() }))
  document.querySelectorAll('.radar-profile-drawer [data-player-detail-tab]').forEach((el) => el.addEventListener('click', () => { state.selectedTab = el.dataset.playerDetailTab; rerender() }))
  document.removeEventListener('keydown', escapeDrawer)
  if (state.selectedId) document.addEventListener('keydown', escapeDrawer)
}
function escapeDrawer(event) { if (event.key === 'Escape' && state.selectedId) { document.removeEventListener('keydown', escapeDrawer); state.selectedId = ''; rerender() } }
