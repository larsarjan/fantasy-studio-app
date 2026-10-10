import { initializePlayerPhotos } from './services/playerPhotoRuntime.js'
import { createAvailabilityScreen, mountAvailabilityScreen } from './modules/availabilityPage.js'
import { ensureAvailability } from './platform/availabilityRepository.js'
import { availabilityReady } from './services/availability.js'
import { bindAvailabilityDetails } from './modules/availabilityUI.js'
import './playerPhotos.css'
import { supabase as photoClient } from './platform/client.js'
import { safeHtml } from './platform/html.js'
import './style.css'
import './fixtures.css'
import './players.css'
import './sync.css'
import './compare.css'
import './history.css'
import './optimizer.css'
import './dreamteam.css'
import './captainRadar.css'
import './intelligence.css'
import './intelligenceQuality.css'
import './dashboard.css'
import './personal.css'
import { createSelectionScreen, mountSelectionScreen } from './modules/selection.js'
import { createProfileScreen, mountProfileScreen } from './modules/profile.js'
import { getManagerTeamState } from './modules/optimizer.js'
import { changeSelection } from './platform/selectionStorage.js'
import { renderPersonalContext } from './modules/personalContext.js'
import { createSettingsScreen, mountSettingsScreen } from './platform/settings.js'
import { basePath } from './platform/client.js'
import { studioPath, studioScreen } from './platform/routes.js'
import { TRANSFER_DEADLINE_ENABLED } from './constants/featureFlags.js'
import { access, hasPermission, featureAllowed, FEATURE_ROUTES } from './platform/access.js'

import {
  initializeDatabase,
  getDatabaseSummary,
  getSyncStatus,
  synchronizeDatabase,
} from './services/database.js'

import {
  createFixturesScreen,
  mountFixturesScreen,
} from './modules/fixtures.js'

import {
  createPlayersScreen,
  mountPlayersScreen,
  setPlayersScreenSelection,
} from './modules/players.js'

import {
  createCompareScreen,
  mountCompareScreen,
} from './modules/compare.js'

import {
  createHistoryScreen,
  mountHistoryScreen,
} from './modules/history.js'

import {
  createInputScreen,
  mountInputScreen,
} from './modules/input.js'

import {
  createOptimizerScreen,
  mountOptimizerScreen,
} from './modules/optimizer.js'

import {
createDreamTeamScreen,
mountDreamTeamScreen,
} from './modules/dreamteam.js'

import {
  createCaptainRadarScreen,
  mountCaptainRadarScreen,
} from './modules/captainRadar.js'

import { createAnalysisScreen, mountAnalysisScreen } from './modules/analysis.js'
import { createDifferentialsScreen, mountDifferentialsScreen } from './modules/differentials.js'
import { createDashboardScreen, mountDashboardScreen } from './modules/dashboard.js'

initializePlayerPhotos(photoClient)
await initializeDatabase()
try { await ensureAvailability() } catch { /* Explicit warning and advice gate below. */ }
bindAvailabilityDetails()

let activeScreenName = 'dashboard'
let previousStandardScreenName = 'dashboard'
let transferDeadlineModule = null
let pricePredictionModule = null

async function loadTransferDeadlineModule() {
  if (!TRANSFER_DEADLINE_ENABLED) return null
  if (!transferDeadlineModule) {
    await import('./transferDeadlineLive.css')
    transferDeadlineModule = await import('./modules/transferDeadlineLive.js')
  }
  return transferDeadlineModule
}

function createComingSoon(title, description) {
  return `
    <section class="panel">
      <span class="eyebrow">Binnenkort</span>
      <h2>${title}</h2>
      <p>${description}</p>
    </section>
  `
}

function getScreens() {
  return {
    ...(pricePredictionModule ? {prices: {title: 'Prijsvoorspelling',get content(){return pricePredictionModule.createPricePredictionScreen()},mount:pricePredictionModule.mountPricePredictionScreen}} : {}),
    selection: { title: 'Mijn selectie', get content() { return createSelectionScreen() }, mount: mountSelectionScreen },
    beschikbaarheid: { title: 'Beschikbaarheid', get content() { return createAvailabilityScreen() }, mount: mountAvailabilityScreen },
    profile: { title: 'Mijn profiel', get content() { return createProfileScreen() }, mount: mountProfileScreen },
    dashboard: {
      title: 'Dashboard',
      get content() {
        return createDashboardScreen()
      },
      mount: mountDashboardScreen,
    },

    players: {
      title: 'Spelers',
      get content() { return createPlayersScreen() },
      mount: mountPlayersScreen,
    },

    compare: {
      title: 'Vergelijken',
      get content() { return createCompareScreen() },
      mount: mountCompareScreen,
    },

    fixtures: {
      title: 'Speelschema',
      get content() { return createFixturesScreen() },
      mount: mountFixturesScreen,
    },

    history: {
  title: 'Historische Data',
  get content() { return createHistoryScreen() },
  mount: mountHistoryScreen,
},

    analysis: {
      title: 'Analyse',
      get content() {
        return createAnalysisScreen()
      },
      mount: mountAnalysisScreen,
    },

    captain: {
      title: 'Captain Radar',
      get content() {
        return createCaptainRadarScreen()
      },
      mount: mountCaptainRadarScreen,
    },

    differentials: {
      title: 'Differentials',
      get content() {
        return createDifferentialsScreen()
      },
      mount: mountDifferentialsScreen,
    },

    optimizer: {
  title: 'FVT Manager',
  get content() { return createOptimizerScreen() },
  mount: mountOptimizerScreen,
},

    dreamteam: {
  title: 'Dream Team',
  get content() { return createDreamTeamScreen() },
  mount: mountDreamTeamScreen,
},

    ...(TRANSFER_DEADLINE_ENABLED && transferDeadlineModule ? {
      transfersLive: {
        title: 'Transfers Live',
        get content() { return transferDeadlineModule.createTransferDeadlineLiveScreen() },
        mount: transferDeadlineModule.mountTransferDeadlineLiveScreen,
      },
    } : {}),

    input: {
  title: 'Invoer',
  get content() { return createInputScreen() },
  mount: mountInputScreen,
},

    settings: {
      title: 'Instellingen',
      get content() { return createSettingsScreen() },
      mount: mountSettingsScreen,
    },
  }
}

document.querySelector('#app').innerHTML = safeHtml(`
  <div class="app">
    <aside class="sidebar">
<div class="logo">
  <img
    class="logo-image"
    src="${basePath}ui/logo.png"
    alt="Fantasy Voetbal Talk Eredivisie"
  />

  <div class="logo-copy">
    <h1>Fantasy Studio</h1>

    <p class="logo-powered">
      by Fantasy Voetbal Talk
    </p>

    <span class="logo-version">
      Studio Cloud · 0.12
    </span>
  </div>
</div>

      <nav class="navigation">
        <button class="menu active" data-screen="dashboard">🏠 Dashboard</button>
        <button class="menu" data-screen="selection">Mijn selectie</button>
        <button class="menu" data-screen="players">👥 Spelers</button>
        <button class="menu" data-screen="compare">🆚 Vergelijken</button>
        <button class="menu" data-screen="fixtures">📅 Speelschema</button>
        <button class="menu" data-screen="history">📚 Historische Data</button>
        <button class="menu" data-screen="analysis">📈 Analyse</button>
        <button class="menu" data-screen="captain">👑 Captain Radar</button>
        <button class="menu" data-screen="beschikbaarheid">✚ Beschikbaarheid</button>
        <button class="menu" data-screen="differentials">💎 Differentials</button>
        <button class="menu" data-screen="optimizer">🤖 FVT Manager</button>
        <button class="menu" data-screen="dreamteam">🏆 Dream Team</button>
        <button class="menu" data-screen="prices">📈 Prijsvoorspelling</button>
        ${TRANSFER_DEADLINE_ENABLED ? '<button class="menu" data-screen="transfersLive">🔴 Transfers Live</button>' : ''}
        <button class="menu" data-screen="input">📝 Invoer</button>
        <button class="menu" data-screen="settings">⚙ Instellingen</button>
      </nav>
    </aside>

    <main class="main-content">
      <header>
        <div>
          <span class="eyebrow">Fantasy Voetbal Talk Eredivisie</span>
          <h2 id="page-title">Dashboard</h2>
        </div>

        <div class="database-control">
          <div class="database-status-text">
            <span id="database-state">Database</span>
            <small id="database-message"></small>
          </div>

          <button id="sync-database" type="button">
            🔄 Synchroniseren
          </button>
        </div>
      </header>

      <div id="sync-notice" class="sync-notice hidden"></div>
      <div id="page-content"></div>
    </main>
  </div>
`)

const pageTitle = document.querySelector('#page-title')
const pageContent = document.querySelector('#page-content')
const menuButtons = document.querySelectorAll('.menu')
const syncButton = document.querySelector('#sync-database')
const databaseState = document.querySelector('#database-state')
const databaseMessage = document.querySelector('#database-message')
const syncNotice = document.querySelector('#sync-notice')

function formatLastSync(isoDate) {
  if (!isoDate) {
    return 'Nog niet met Google Sheets gesynchroniseerd'
  }

  return `Laatst bijgewerkt: ${new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(isoDate))}`
}

function refreshSyncStatus() {
  const status = getSyncStatus()

  databaseState.textContent = status.source
  databaseMessage.textContent =
    status.lastSync
      ? formatLastSync(status.lastSync)
      : status.message

  document.body.dataset.syncState = status.state
}

function showNotice(message, type = 'success') {
  syncNotice.textContent = message
  syncNotice.className = `sync-notice ${type}`

  window.setTimeout(() => {
    syncNotice.classList.add('hidden')
  }, 6000)
}

async function showScreen(screenName) {
  try { await ensureAvailability() } catch { /* Keep Studio usable; advice remains gated. */ }
  if (screenName === 'input') { location.assign(basePath + 'admin/input'); return }
  if (!await featureAllowed(FEATURE_ROUTES[screenName])) {
    pageTitle.textContent = 'Geen toegang'
    pageContent.innerHTML = safeHtml('<section class="panel"><h2>403 · Dit onderdeel is niet beschikbaar</h2><p>Kies een toegankelijk onderdeel in het menu.</p></section>')
    return
  }
  if (screenName === 'prices' && !pricePredictionModule) {
    await import('./pricePrediction.css')
    pricePredictionModule = await import('./modules/pricePrediction.js')
  }
  if (screenName === 'transfersLive') await loadTransferDeadlineModule()
  const screen = getScreens()[screenName]

  if (!screen) {
    pageTitle.textContent = 'Pagina niet gevonden'
    pageContent.innerHTML = safeHtml('<section class="panel"><h2>Deze pagina bestaat niet</h2><p>Kies een scherm in het menu om verder te gaan.</p></section>')
    return
  }

  if (screenName === 'transfersLive' && activeScreenName !== 'transfersLive') {
    previousStandardScreenName = activeScreenName
  }

  activeScreenName = screenName
  const route = studioPath(screenName, basePath)
  if (location.pathname !== route) history.pushState({ screenName }, '', route)
  document.body.classList.toggle('tdl-workspace-active', screenName === 'transfersLive')

  pageTitle.textContent = screen.title
  pageContent.innerHTML = safeHtml(screen.content)
  if (['dashboard'].includes(screenName)) pageContent.insertAdjacentHTML('afterbegin', safeHtml(renderPersonalContext(screenName)))
  if (!availabilityReady()) pageContent.insertAdjacentHTML('afterbegin',safeHtml('<p class="panel" role="alert">Beschikbaarheid kon niet worden gecontroleerd. Captain- en koopadviezen zijn tijdelijk beperkt. Herlaad de pagina om opnieuw te proberen.</p>'))

  menuButtons.forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.screen === screenName,
    )
  })

  if (typeof screen.mount === 'function') {
    await screen.mount()
  }
}

menuButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showScreen(button.dataset.screen).catch(() => showNotice('Dit scherm kon niet worden geopend. Probeer het opnieuw.', 'error'))
  })
})

document.addEventListener('click', event => {
  const plan=event.target.closest('[data-plan-out]'),remove=event.target.closest('[data-remove-plan]')
  if(!plan && !remove)return
  const state=getManagerTeamState()
  if(plan){
    if((state.plannedTransfers??[]).some(t=>t.outId===plan.dataset.planOut || t.inId===plan.dataset.planIn))return
    state.plannedTransfers=[...(state.plannedTransfers??[]),{outId:plan.dataset.planOut,inId:plan.dataset.planIn}]
  } else state.plannedTransfers=state.plannedTransfers.filter((_,i)=>i!==Number(remove.dataset.removePlan))
  changeSelection(state)
  showScreen(activeScreenName).catch(()=>showNotice('Dit scherm kon niet worden geopend.','error'))
})

syncButton.addEventListener('click', async () => {
  if (!hasPermission(access, 'sync.run')) return
  syncButton.disabled = true
  syncButton.textContent = '⏳ Bezig…'

  try {
    const result = await synchronizeDatabase()
    const transferSharedStatus = TRANSFER_DEADLINE_ENABLED
      ? (await import('./services/transferDeadlineEditorial.js')).synchronizeTransferDeadlineSharedData()
      : Promise.resolve({ message: 'Transfer Deadline is uitgeschakeld.' })
    const sharedStatus = await transferSharedStatus

    refreshSyncStatus()
    showScreen(activeScreenName)

    showNotice(
  `Klaar: ` +
  `${result.players} spelers, ` +
  `${result.historicalPlayers} historische spelers, ` +
  `${result.fixtures} wedstrijden, ` +
  `${result.results} historische uitslagen, ` +
  `${result.metadata} metadatarecords, ` +
  `${result.matchStats} spelerswedstrijden en ` +
  `${result.ratings} teamratings. ${sharedStatus.message}.`,
  'success',
)
  } catch (error) {
    refreshSyncStatus()

    showNotice(
      `Synchronisatie mislukt: ${error.message}`,
      'error',
    )
  } finally {
    syncButton.disabled = false
    syncButton.textContent = '🔄 Synchroniseren'
  }
})

refreshSyncStatus()
document.querySelector('[data-screen="input"]')?.remove()
syncButton.hidden = true
if (hasPermission(access, 'admin.access')) {
  const adminLink = document.createElement('a'); adminLink.href = basePath + 'admin'; adminLink.textContent = 'Admin'; adminLink.className = 'menu'
  document.querySelector('.navigation').append(adminLink)
}
for (const button of menuButtons) if (FEATURE_ROUTES[button.dataset.screen] && !await featureAllowed(FEATURE_ROUTES[button.dataset.screen])) button.hidden = true
const linkedPlayer = new URLSearchParams(location.search).get('player')
if (linkedPlayer && studioScreen(location.pathname, basePath)==='players') setPlayersScreenSelection({playerId:linkedPlayer})
await showScreen(studioScreen(location.pathname, basePath))
window.addEventListener('popstate', () => {
  showScreen(studioScreen(location.pathname, basePath)).catch(() => showNotice('De pagina kon niet worden geopend.', 'error'))
})

window.addEventListener('keydown', (event) => {
  if (activeScreenName === 'transfersLive' && transferDeadlineModule?.handleTransferDeadlineKeydown(event)) event.preventDefault()
})

document.addEventListener('tdl:close-workspace', () => {
  const fallback = previousStandardScreenName && previousStandardScreenName !== 'transfersLive'
    ? previousStandardScreenName
    : 'dashboard'
  showScreen(fallback)
})
