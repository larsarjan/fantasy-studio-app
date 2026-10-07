import { buildDashboardIntelligence } from '../services/dashboardIntelligence.js'

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
const number = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('nl-NL', { maximumFractionDigits: digits }) : '—'
const playerName = row => row?.player?.name || row?.name || row?.playerId || 'Onbekende speler'

function emptyCard(title, message, screen = 'analysis') {
  return `<button class="dashboard-insight-card empty" data-dashboard-screen="${screen}"><span class="dashboard-card-label">${esc(title)}</span><strong>Geen sterk signaal</strong><p>${esc(message)}</p></button>`
}

function playerInsightCard({ label, data, accent = '', screen = 'players', metric = '', empty }) {
  if (!data) return emptyCard(label, empty, screen)
  return `<button class="dashboard-insight-card ${accent}" data-dashboard-screen="${screen}">
    <span class="dashboard-card-label">${esc(label)}</span>
    <strong>${esc(data.name)}</strong>
    <small>${esc(data.club)}${data.price !== null ? ` · € ${number(data.price)} mln` : ''}</small>
    ${metric ? `<b>${metric}</b>` : ''}
    <p>${esc(data.reason || '')}</p>
    ${data.alternative ? `<footer>Alternatief: ${esc(data.alternative.name)}</footer>` : ''}
  </button>`
}

function eliteCard(elite) {
  if (!elite?.available || !elite.signal) return emptyCard('Elite-signaal', 'Nog geen betrouwbare gepubliceerde Top 100-data.', 'analysis')
  const signal = elite.signal
  const row = signal.row
  const value = signal.type === 'gap'
    ? `${row.eliteGapPercentagePoints > 0 ? '+' : ''}${number(row.eliteGapPercentagePoints)} pp`
    : `${row.netTransfers > 0 ? '+' : ''}${number(row.netTransfers, 0)} netto`
  return `<button class="dashboard-insight-card elite" data-dashboard-screen="analysis">
    <span class="dashboard-card-label">Elite-signaal · Top ${elite.cohort}</span>
    <strong>${esc(playerName(row))}</strong>
    <small>Elite: ${esc(elite.deadlineLabel)}</small>
    <b>${value}</b><p>${esc(signal.title)}.</p>
  </button>`
}

function actionsBlock(actions) {
  return `<section class="panel dashboard-actions"><div><span class="eyebrow">Beslissingen</span><h2>Algemene kansen in de competitie</h2></div><ol>${actions.length ? actions.map(action => `<li><button data-dashboard-screen="${action.screen}">${esc(action.label)}<span>Open →</span></button></li>`).join('') : '<li class="dashboard-neutral">Nog onvoldoende betrouwbare signalen voor concrete acties.</li>'}</ol></section>`
}

export function renderDashboardMarketBlock(data) {
  const mover = (title, item, direction) => {
    if (!item) return `<article><small>${title}</small><strong>Geen betrouwbaar signaal</strong><span>Historische veranderingen ontbreken.</span></article>`
    const player = item.player ?? item
    const explanation = item.signals?.map(signal => signal.label).slice(0, 2).join(' · ') || item.label || 'Bestaande markt- en profielverandering'
    return `<article><small>${title}</small><strong>${esc(player.name)}</strong><b class="${direction}">${item.score > 0 ? '+' : ''}${number(item.score ?? item.delta)}</b><span>${esc(explanation)}</span></article>`
  }
  const elite = data.elite
  const eliteItem = (title, row, formatter) => `<article><small>${title}</small><strong>${row ? esc(playerName(row)) : 'Geen betrouwbare data'}</strong>${row ? `<b>${formatter(row)}</b>` : ''}<span>${row ? `Top ${elite.cohort} · deadline SR${elite.round}` : 'Elite-data ontbreekt.'}</span></article>`
  const marketContent = !data.market.rise && !data.market.fall
    ? '<div class="dashboard-market-empty">Nog onvoldoende historische marktbewegingen voor een betrouwbaar signaal.</div>'
    : `<div class="dashboard-signal-list">${mover('Sterkste stijger', data.market.rise, 'up')}${mover('Sterkste daler', data.market.fall, 'down')}</div>`
  return `<section class="dashboard-market-grid">
    <section class="panel"><span class="eyebrow">Markt</span><h2>Bewegingen</h2>${marketContent}</section>
    <section class="panel"><span class="eyebrow">Topmanagers ${elite.available ? `· ${elite.deadlineLabel}` : ''}</span><h2>Top 100</h2><div class="dashboard-signal-list">${eliteItem('Meest gekozen', elite.mostSelected, row => `${number(row.selected.percentage)}%`)}${eliteItem('Netto aankoop', elite.biggestBuy, row => `${row.netTransfers > 0 ? '+' : ''}${number(row.netTransfers, 0)}`)}${eliteItem('Netto verkoop', elite.biggestSale, row => number(row.netTransfers, 0))}${eliteItem('Verschil met markt', elite.biggestGap, row => `${row.eliteGapPercentagePoints > 0 ? '+' : ''}${number(row.eliteGapPercentagePoints)} pp`)}</div></section>
  </section>`
}

const textValue = value => String(value ?? '').trim()

export function formatDashboardFixtureMoment(fixture) {
  if (!fixture) return ''
  const date = textValue(fixture.date)
  const time = textValue(fixture.time)
  if (!date && !time) return ''
  const parsed = date ? new Date(`${date}T${time || '00:00'}`) : null
  const dateLabel = parsed && !Number.isNaN(parsed.getTime())
    ? new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(parsed)
    : date
  return [dateLabel, time ? `${time} uur` : ''].filter(Boolean).join(' · ')
}

function fixtureBlock(fixture) {
  if (!fixture) return `<section class="panel dashboard-fixture"><span class="eyebrow">Wedstrijd van de ronde</span><h2>Geen wedstrijdgegevens</h2><p>Er is voor deze speelronde geen betrouwbare fixture beschikbaar.</p></section>`
  const moment = formatDashboardFixtureMoment(fixture)
  return `<section class="panel dashboard-fixture"><div><span class="eyebrow">Wedstrijd van de ronde</span><h2>${esc(fixture.home)} – ${esc(fixture.away)}</h2>${moment ? `<small class="dashboard-fixture-moment">${esc(moment)}</small>` : ''}<p>${esc(fixture.reason)}</p></div><div class="dashboard-fixture-assets">${fixture.players.map(player => `<button data-dashboard-screen="players"><strong>${esc(player.name)}</strong><span>${esc(player.club)} · ${number(player.expectedPoints)} xP</span></button>`).join('') || '<span class="dashboard-neutral">Geen betrouwbare spelersprojecties.</span>'}</div><button class="dashboard-link" data-dashboard-screen="fixtures">Bekijk speelschema →</button></section>`
}

function chipBlock(signal) {
  return `<section class="panel dashboard-chip"><span class="eyebrow">Chipsignaal</span>${signal.relevant ? `<h3>${esc(signal.chip)}</h3><strong>${number(signal.topPercentage)}% Top 100 <span>vs</span> ${number(signal.globalPercentage)}% hele spel</strong><p>Chip: ${esc(signal.deadlineLabel)}.</p>` : `<h3>Geen sterk chipsignaal</h3><p>${esc(signal.message)}</p>`}</section>`
}

function liveBlock(live, roundStatus) {
  if (!live) return ''
  return `<section class="panel dashboard-live"><div><span class="dashboard-live-badge">${live.provisional ? 'LIVE · VOORLOPIG' : 'DEFINITIEF'}</span><h2>Speelronde ${roundStatus.round} tot nu toe</h2><p>${roundStatus.playedMatches} van ${roundStatus.totalMatches} wedstrijden verwerkt.</p></div><div>${live.performers.map(item => `<article><strong>${esc(playerName(item))}</strong><b>${number(item.fantasyPoints, 0)} pt</b><span>${number(item.minutes, 0)} minuten</span></article>`).join('')}</div></section>`
}

export function createDashboardScreen() {
  const data = buildDashboardIntelligence()
  const status = data.roundStatus
  const next = status.nextFixture
  return `<section class="dashboard-screen">
    <section class="dashboard-hero"><div><span class="eyebrow">Fantasy Studio</span><h1>Speelronde ${data.round}</h1><span class="dashboard-status ${status.status.toLowerCase()}">Speelronde: ${esc(status.status)}</span></div><div class="dashboard-round-metrics"><span><small>Gespeeld</small><b>${status.playedMatches}</b></span><span><small>Resterend</small><b>${status.remainingMatches}</b></span><span class="wide"><small>Eerstvolgende wedstrijd</small><b>${next ? `${esc(next.home)} – ${esc(next.away)}` : status.status === 'Definitief' ? 'Ronde afgerond' : 'Nog niet bekend'}</b></span></div></section>
    <section><div class="dashboard-section-heading"><span class="eyebrow">Dit moet je nu weten</span><h2>Algemene marktsignalen</h2></div><div class="dashboard-insight-grid">
      ${playerInsightCard({ label: 'Captain van de ronde', data: data.cards.captain, accent: 'captain', screen: 'captain', metric: data.cards.captain ? `${number(data.cards.captain.score, 0)} / 100` : '', empty: 'Captain Radar levert nog geen geldige kandidaat.' })}
      ${playerInsightCard({ label: 'Beste aankoop', data: data.cards.buy, accent: 'buy', screen: 'analysis', metric: data.cards.buy ? `${number(data.cards.buy.expectedPoints)} xP` : '', empty: 'Geen speler passeert de bestaande koopgrenzen.' })}
      ${playerInsightCard({ label: 'Beste verkoop / avoid', data: data.cards.sell, accent: 'sell', screen: 'analysis', metric: data.cards.sell ? `${number(data.cards.sell.score, 0)} risico` : '', empty: 'Geen sterk verkoopsignaal; houden blijft verdedigbaar.' })}
      ${playerInsightCard({ label: 'Differential', data: data.cards.differential, accent: 'differential', screen: 'differentials', metric: data.cards.differential ? `${number(data.cards.differential.ownership)}% gekozen` : '', empty: 'Geen overtuigende differential beschikbaar.' })}
      ${eliteCard(data.elite)}
      ${playerInsightCard({ label: 'Waarschuwing', data: data.cards.warning, accent: 'warning', screen: 'players', metric: data.cards.warning ? `${number(data.cards.warning.expectedMinutes, 0)} xMin` : '', empty: 'Geen sterk betrouwbaar risicosignaal.' })}
    </div></section>
    ${actionsBlock(data.actions)}
    ${renderDashboardMarketBlock(data)}
    <section class="dashboard-bottom-grid">${fixtureBlock(data.fixtureSpotlight)}${chipBlock(data.chipSignal)}</section>
    ${liveBlock(data.live, status)}
  </section>`
}

export function mountDashboardScreen() {
  document.querySelectorAll('[data-dashboard-screen]').forEach(element => {
    element.addEventListener('click', () => document.querySelector(`.menu[data-screen="${element.dataset.dashboardScreen}"]`)?.click())
  })
}
