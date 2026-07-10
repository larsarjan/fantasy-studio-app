import './style.css'
import './fixtures.css'
import './players.css'
import './sync.css'
import './compare.css'

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
} from './modules/players.js'

import {
  createCompareScreen,
  mountCompareScreen,
} from './modules/compare.js'

initializeDatabase()

let activeScreenName = 'dashboard'

function createDashboardScreen() {
  const summary = getDatabaseSummary()
  const status = getSyncStatus()

  return `
    <section class="cards">
      <div class="card">
        <h3>Spelers</h3>
        <span>${summary.players}</span>
      </div>

      <div class="card">
        <h3>Clubs ${summary.activeSeason ? `(${summary.activeSeason})` : ''}</h3>
        <span>${summary.clubs}</span>
      </div>

      <div class="card">
        <h3>Wedstrijden ${summary.activeSeason ? `(${summary.activeSeason})` : ''}</h3>
        <span>${summary.fixtures}</span>
      </div>

      <div class="card">
        <h3>Database</h3>
        <span class="database-card-status">${status.source}</span>
      </div>
    </section>

    <section class="panel">
      <span class="eyebrow">Fantasy Studio v0.5</span>
      <h2>Google Sheets is de centrale database</h2>
      <p>
        Werk de tabbladen SPELERS, WEDSTRIJDEN en TEAM_RATINGS bij.
        Klik daarna rechtsboven op Synchroniseren.
      </p>
    </section>
  `
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
    dashboard: {
      title: 'Dashboard',
      content: createDashboardScreen(),
    },

    players: {
      title: 'Spelers',
      content: createPlayersScreen(),
      mount: mountPlayersScreen,
    },

    compare: {
      title: 'Vergelijken',
      content: createCompareScreen(),
      mount: mountCompareScreen,
    },

    fixtures: {
      title: 'Speelschema',
      content: createFixturesScreen(),
      mount: mountFixturesScreen,
    },

    analysis: {
      title: 'Analyse',
      content: createComingSoon(
        'Analyse',
        'Beste schema’s, prijs-kwaliteit, vorm en statistische ranglijsten.',
      ),
    },

    captain: {
      title: 'Captain Radar',
      content: createComingSoon(
        'Captain Radar',
        'Hier komen later de beste captainkeuzes per speelronde.',
      ),
    },

    differentials: {
      title: 'Differentials',
      content: createComingSoon(
        'Differentials',
        'Vind interessante spelers met een laag gekozen percentage.',
      ),
    },

    dreamteam: {
      title: 'Dream Team',
      content: createComingSoon(
        'Dream Team',
        'Stel later automatisch een optimaal team samen binnen een budget.',
      ),
    },

    settings: {
      title: 'Instellingen',
      content: createComingSoon(
        'Instellingen',
        'Beheer thema, database, synchronisatie en OBS-instellingen.',
      ),
    },
  }
}

document.querySelector('#app').innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <div class="logo">
        <div class="logo-icon">FVT</div>

        <div>
          <h1>Fantasy Studio</h1>
          <p>Versie 0.5 Alpha</p>
        </div>
      </div>

      <nav class="navigation">
        <button class="menu active" data-screen="dashboard">🏠 Dashboard</button>
        <button class="menu" data-screen="players">👥 Spelers</button>
        <button class="menu" data-screen="compare">🆚 Vergelijken</button>
        <button class="menu" data-screen="fixtures">📅 Speelschema</button>
        <button class="menu" data-screen="analysis">📈 Analyse</button>
        <button class="menu" data-screen="captain">👑 Captain Radar</button>
        <button class="menu" data-screen="differentials">💎 Differentials</button>
        <button class="menu" data-screen="dreamteam">🏆 Dream Team</button>
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
`

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

function showScreen(screenName) {
  activeScreenName = screenName
  const screen = getScreens()[screenName]

  if (!screen) {
    return
  }

  pageTitle.textContent = screen.title
  pageContent.innerHTML = screen.content

  menuButtons.forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.screen === screenName,
    )
  })

  if (typeof screen.mount === 'function') {
    screen.mount()
  }
}

menuButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showScreen(button.dataset.screen)
  })
})

syncButton.addEventListener('click', async () => {
  syncButton.disabled = true
  syncButton.textContent = '⏳ Bezig…'

  try {
    const result = await synchronizeDatabase()

    refreshSyncStatus()
    showScreen(activeScreenName)

    showNotice(
      `Klaar: ${result.players} spelers, ${result.fixtures} wedstrijden en ${result.ratings} teamratings.`,
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
showScreen('dashboard')
