import './style.css'
import './fixtures.css'
import { createFixturesScreen, mountFixturesScreen } from './modules/fixtures.js'

const screens = {
  dashboard: {
    title: 'Dashboard',
    content: `
      <section class="cards">
        <div class="card">
          <h3>Spelers</h3>
          <span>0</span>
        </div>

        <div class="card">
          <h3>Clubs</h3>
          <span>18</span>
        </div>

        <div class="card">
          <h3>Speelrondes</h3>
          <span>34</span>
        </div>

        <div class="card">
          <h3>Status</h3>
          <span class="online">ONLINE</span>
        </div>
      </section>

      <section class="panel">
        <h2>Welkom bij Fantasy Studio</h2>
        <p>
          De basis van de applicatie werkt. Vanuit hier bouwen we de spelersdatabase,
          vergelijkingen en het volledige Eredivisieschema.
        </p>
      </section>
    `,
  },

  players: {
    title: 'Spelers',
    content: `
      <section class="panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Spelersdatabase</span>
            <h2>Alle Eredivisiespelers</h2>
          </div>
        </div>

        <div class="filters">
          <input id="player-search" type="search" placeholder="Zoek een speler..." />

          <select>
            <option>Alle posities</option>
            <option>Keepers</option>
            <option>Verdedigers</option>
            <option>Middenvelders</option>
            <option>Aanvallers</option>
          </select>

          <select>
            <option>Alle clubs</option>
            <option>FC Utrecht</option>
            <option>Ajax</option>
            <option>PSV</option>
            <option>Feyenoord</option>
          </select>

          <select>
            <option>Sorteer op punten</option>
            <option>Gespeeld %</option>
            <option>Beginprijs</option>
            <option>Eindprijs</option>
          </select>
        </div>

        <div class="empty-state">
          <strong>De spelersmodule staat klaar.</strong>
          <p>In de volgende stap koppelen we hier jouw echte database aan.</p>
        </div>
      </section>
    `,
  },

  compare: {
    title: 'Vergelijken',
    content: `
      <section class="panel">
        <span class="eyebrow">Vergelijkingsmodule</span>
        <h2>Vergelijk maximaal vier spelers</h2>

        <div class="compare-grid">
          ${createCompareSlot(1)}
          ${createCompareSlot(2)}
          ${createCompareSlot(3)}
          ${createCompareSlot(4)}
        </div>
      </section>
    `,
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

function createCompareSlot(number) {
  return `
    <button class="compare-slot" type="button">
      <span class="compare-number">${number}</span>
      <span class="compare-plus">+</span>
      <strong>Speler kiezen</strong>
    </button>
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

document.querySelector('#app').innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <div class="logo">
        <div class="logo-icon">FVT</div>

        <div>
          <h1>Fantasy Studio</h1>
          <p>Versie 0.2 Alpha</p>
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

        <div class="status">Fantasy Studio actief</div>
      </header>

      <div id="page-content"></div>
    </main>
  </div>
`

const pageTitle = document.querySelector('#page-title')
const pageContent = document.querySelector('#page-content')
const menuButtons = document.querySelectorAll('.menu')

function showScreen(screenName) {
  const screen = screens[screenName]

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

showScreen('dashboard')
