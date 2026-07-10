import { getPlayers } from '../services/database.js'

const sortOptions = [
  ['points', 'Totaal punten'],
  ['selectedPct', 'Gespeeld door %'],
  ['endPrice', 'Eindprijs'],
  ['startPrice', 'Beginprijs'],
  ['saves', 'Reddingen'],
  ['cleanSheets', 'Clean sheets'],
  ['optaBonus', 'OPTA Bonus'],
  ['penaltiesSaved', 'Gestopte penalties'],
  ['goals', 'Doelpunten'],
  ['assists', 'Assists'],
]

function uniqueValues(players, field) {
  return [...new Set(
    players.map((player) => player[field]).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, 'nl'))
}

function formatNumber(value, fallback = '—') {
  return value === null || value === undefined || value === ''
    ? fallback
    : new Intl.NumberFormat('nl-NL', {
        maximumFractionDigits: 1,
      }).format(value)
}

function formatPrice(value) {
  return value === null || value === undefined
    ? '—'
    : `€ ${new Intl.NumberFormat('nl-NL', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value)}`
}

function formatPct(value) {
  return value === null || value === undefined
    ? '—'
    : `${new Intl.NumberFormat('nl-NL', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value)}%`
}

function renderDetail(player) {
  if (!player) {
    return `
      <aside class="player-detail empty">
        <span class="eyebrow">Spelerinformatie</span>
        <h3>Kies een speler</h3>
        <p>Klik op een rij om rechts alle statistieken te bekijken.</p>
      </aside>
    `
  }

  return `
    <aside class="player-detail">
      <div class="player-detail-header">
        <div class="player-avatar">${player.name.charAt(0)}</div>
        <div>
          <span class="eyebrow">${player.position}</span>
          <h3>${player.name}</h3>
          <p>${player.club} · ${player.season}</p>
        </div>
      </div>

      <div class="player-highlight-grid">
        <div>
          <span>Punten</span>
          <strong>${formatNumber(player.points)}</strong>
        </div>
        <div>
          <span>Gespeeld door</span>
          <strong>${formatPct(player.selectedPct)}</strong>
        </div>
      </div>

      <div class="player-stat-list">
        <div><span>Beginprijs</span><strong>${formatPrice(player.startPrice)}</strong></div>
        <div><span>Eindprijs</span><strong>${formatPrice(player.endPrice)}</strong></div>
        <div><span>Reddingen</span><strong>${formatNumber(player.saves)}</strong></div>
        <div><span>Clean sheets</span><strong>${formatNumber(player.cleanSheets)}</strong></div>
        <div><span>OPTA Bonus</span><strong>${formatNumber(player.optaBonus)}</strong></div>
        <div><span>Gestopte penalties</span><strong>${formatNumber(player.penaltiesSaved)}</strong></div>
        <div><span>Doelpunten</span><strong>${formatNumber(player.goals)}</strong></div>
        <div><span>Assists</span><strong>${formatNumber(player.assists)}</strong></div>
        <div><span>Gele kaarten</span><strong>${formatNumber(player.yellowCards)}</strong></div>
        <div><span>Rode kaarten</span><strong>${formatNumber(player.redCards)}</strong></div>
      </div>
    </aside>
  `
}

export function createPlayersScreen() {
  const players = getPlayers()
  const seasons = uniqueValues(players, 'season')
  const positions = uniqueValues(players, 'position')
  const clubs = uniqueValues(players, 'club')

  return `
    <section class="panel players-module">
      <div class="panel-heading players-heading">
        <div>
          <span class="eyebrow">Spelersdatabase</span>
          <h2>Eredivisiespelers</h2>
        </div>

        <div class="player-total">
          <span>Resultaten</span>
          <strong id="player-result-count">0</strong>
        </div>
      </div>

      <div class="players-filters">
        <label class="search-field">
          <span>Zoeken</span>
          <input id="player-search" type="search" placeholder="Zoek op speler of club..." />
        </label>

        <label>
          <span>Seizoen</span>
          <select id="player-season">
            ${seasons.map((season) => `
              <option value="${season}">${season}</option>
            `).join('')}
          </select>
        </label>

        <label>
          <span>Positie</span>
          <select id="player-position">
            <option value="">Alle posities</option>
            ${positions.map((position) => `
              <option value="${position}">${position}</option>
            `).join('')}
          </select>
        </label>

        <label>
          <span>Club</span>
          <select id="player-club">
            <option value="">Alle clubs</option>
            ${clubs.map((club) => `
              <option value="${club}">${club}</option>
            `).join('')}
          </select>
        </label>

        <label>
          <span>Sorteer op</span>
          <select id="player-sort">
            ${sortOptions.map(([value, label]) => `
              <option value="${value}">${label}</option>
            `).join('')}
          </select>
        </label>

        <button
          class="sort-direction"
          id="player-direction"
          type="button"
          data-direction="desc"
        >
          Hoog → laag
        </button>
      </div>

      <div class="players-workspace">
        <div class="players-table-wrap">
          <table class="players-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Naam</th>
                <th>Club</th>
                <th>Positie</th>
                <th>Punten</th>
                <th>Gespeeld %</th>
                <th>Reddingen</th>
                <th>Eindprijs</th>
              </tr>
            </thead>
            <tbody id="players-body"></tbody>
          </table>
        </div>

        <div id="player-detail"></div>
      </div>
    </section>
  `
}

export function mountPlayersScreen() {
  const players = getPlayers()
  const seasons = uniqueValues(players, 'season')

  const state = {
    search: '',
    season: seasons.at(-1) || '',
    position: '',
    club: '',
    sortBy: 'points',
    direction: 'desc',
    selectedPlayerId: null,
  }

  const body = document.querySelector('#players-body')
  const detail = document.querySelector('#player-detail')
  const count = document.querySelector('#player-result-count')
  const search = document.querySelector('#player-search')
  const season = document.querySelector('#player-season')
  const position = document.querySelector('#player-position')
  const club = document.querySelector('#player-club')
  const sort = document.querySelector('#player-sort')
  const direction = document.querySelector('#player-direction')

  season.value = state.season

  function filteredPlayers() {
    const query = state.search.trim().toLowerCase()

    return players
      .filter((player) => !state.season || player.season === state.season)
      .filter((player) => !state.position || player.position === state.position)
      .filter((player) => !state.club || player.club === state.club)
      .filter((player) => {
        if (!query) return true

        return (
          player.name.toLowerCase().includes(query) ||
          player.club.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => {
        const left = a[state.sortBy] ?? -Infinity
        const right = b[state.sortBy] ?? -Infinity

        if (typeof left === 'string') {
          return state.direction === 'asc'
            ? left.localeCompare(right, 'nl')
            : right.localeCompare(left, 'nl')
        }

        return state.direction === 'asc'
          ? left - right
          : right - left
      })
  }

  function render() {
    const list = filteredPlayers()
    count.textContent = list.length

    if (
      !state.selectedPlayerId ||
      !list.some((player) => player.id === state.selectedPlayerId)
    ) {
      state.selectedPlayerId = list[0]?.id || null
    }

    body.innerHTML = list.length
      ? list.map((player, index) => `
          <tr
            data-player-id="${player.id}"
            class="${player.id === state.selectedPlayerId ? 'selected' : ''}"
          >
            <td>${index + 1}</td>
            <td><strong>${player.name}</strong></td>
            <td>${player.club}</td>
            <td><span class="position-badge">${player.position}</span></td>
            <td><b>${formatNumber(player.points)}</b></td>
            <td>${formatPct(player.selectedPct)}</td>
            <td>${formatNumber(player.saves)}</td>
            <td>${formatPrice(player.endPrice)}</td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="8">
              <div class="table-empty">
                Geen spelers gevonden met deze filters.
              </div>
            </td>
          </tr>
        `

    const selected = players.find(
      (player) => player.id === state.selectedPlayerId,
    )
    detail.innerHTML = renderDetail(selected)

    document.querySelectorAll('[data-player-id]').forEach((row) => {
      row.addEventListener('click', () => {
        state.selectedPlayerId = row.dataset.playerId
        render()
      })
    })
  }

  search.addEventListener('input', () => {
    state.search = search.value
    render()
  })

  season.addEventListener('change', () => {
    state.season = season.value
    state.selectedPlayerId = null
    render()
  })

  position.addEventListener('change', () => {
    state.position = position.value
    state.selectedPlayerId = null
    render()
  })

  club.addEventListener('change', () => {
    state.club = club.value
    state.selectedPlayerId = null
    render()
  })

  sort.addEventListener('change', () => {
    state.sortBy = sort.value
    render()
  })

  direction.addEventListener('click', () => {
    state.direction =
      state.direction === 'desc' ? 'asc' : 'desc'

    direction.dataset.direction = state.direction
    direction.textContent =
      state.direction === 'desc'
        ? 'Hoog → laag'
        : 'Laag → hoog'

    render()
  })

  render()
}
