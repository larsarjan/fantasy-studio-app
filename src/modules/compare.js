import { getPlayers } from '../services/database.js'

const CATEGORY_DEFINITIONS = {
  overview: {
    title: 'Algemeen',
    compact: true,
    stats: [
      { key: 'points', label: 'Totaal punten', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
      { key: 'selectedPct', label: 'Gespeeld door', type: 'percent', better: 'high', countsForWinner: false, defaultEnabled: true },
      { key: 'startPrice', label: 'Beginprijs', type: 'price', better: 'none', countsForWinner: false, defaultEnabled: true },
      { key: 'endPrice', label: 'Eindprijs', type: 'price', better: 'none', countsForWinner: false, defaultEnabled: true },
      { key: 'valueDevelopment', label: 'Waardeontwikkeling', type: 'percent', better: 'high', countsForWinner: false, defaultEnabled: true },
      { key: 'minutes', label: 'Gespeelde minuten', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
      { key: 'optaBonus', label: 'OPTA Bonus', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
    ],
  },

  attacking: {
    title: 'Aanvallend',
    compact: true,
    stats: [
      { key: 'goals', label: 'Doelpunten', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
      { key: 'assists', label: 'Assists', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
      { key: 'penaltiesMissed', label: 'Gemiste strafschoppen', type: 'number', better: 'low', countsForWinner: true, defaultEnabled: true },
    ],
  },

  discipline: {
    title: 'Discipline',
    compact: false,
    stats: [
      { key: 'yellowCards', label: 'Gele kaarten', type: 'number', better: 'low', countsForWinner: true, defaultEnabled: true },
      { key: 'redCards', label: 'Rode kaarten', type: 'number', better: 'low', countsForWinner: true, defaultEnabled: true },
    ],
  },

  keeper: {
    title: 'Keepers',
    compact: true,
    keeperOnly: true,
    stats: [
      { key: 'saves', label: 'Reddingen', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
      { key: 'savePoints', label: 'Punten voor reddingen', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
      { key: 'cleanSheets', label: 'Clean sheets', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
      { key: 'cleanSheetPoints', label: 'Punten voor clean sheets', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
      { key: 'penaltiesSaved', label: 'Gestopte penalties', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
      { key: 'goalsAgainst', label: 'Tegendoelpunten', type: 'number', better: 'low', countsForWinner: true, defaultEnabled: true },
      { key: 'goalsAgainstMinus', label: 'Minpunten tegendoelpunten', type: 'number', better: 'high', countsForWinner: true, defaultEnabled: true },
    ],
  },
}

const PRESETS = {
  all: {
    label: 'Alles',
    description: 'Alle beschikbare statistieken',
    enabledKeys: null,
  },
  livestream: {
    label: 'Livestream',
    description: 'Kort, duidelijk en discussiegericht',
    enabledKeys: [
      'points',
      'minutes',
      'optaBonus',
      'goals',
      'assists',
      'saves',
      'cleanSheets',
      'penaltiesSaved',
    ],
  },
  performance: {
    label: 'Prestatie',
    description: 'Alleen sportieve output',
    enabledKeys: [
      'points',
      'minutes',
      'optaBonus',
      'goals',
      'assists',
      'saves',
      'savePoints',
      'cleanSheets',
      'cleanSheetPoints',
      'penaltiesSaved',
      'goalsAgainst',
      'goalsAgainstMinus',
    ],
  },
  value: {
    label: 'Waarde',
    description: 'Prijs, ownership en rendement',
    enabledKeys: [
      'points',
      'selectedPct',
      'startPrice',
      'endPrice',
      'valueDevelopment',
      'minutes',
      'optaBonus',
    ],
  },
  attacking: {
    label: 'Aanvallend',
    description: 'Focus op aanvallende bijdrage',
    enabledKeys: [
      'points',
      'minutes',
      'optaBonus',
      'goals',
      'assists',
      'penaltiesMissed',
    ],
  },
  keeper: {
    label: 'Keepers',
    description: 'Keeperprestaties en rendement',
    enabledKeys: [
      'points',
      'minutes',
      'optaBonus',
      'saves',
      'savePoints',
      'cleanSheets',
      'cleanSheetPoints',
      'penaltiesSaved',
      'goalsAgainst',
      'goalsAgainstMinus',
    ],
  },
}

function uniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'nl'))
}

function isKeeper(position) {
  return ['keeper', 'doelman', 'goalkeeper', 'k'].includes(
    String(position || '').toLowerCase(),
  )
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(value)
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '—'
  return `€ ${new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}`
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '—'
  return `${new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`
}

function formatValue(value, type) {
  if (type === 'price') return formatPrice(value)
  if (type === 'percent') return formatPercent(value)
  return formatNumber(value)
}

function numericValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function playerOption(player) {
  return `${player.name} — ${player.club}`
}

function getAvailableCategories(players, viewMode) {
  const selected = players.filter(Boolean)
  const allKeepers =
    selected.length > 0 && selected.every((player) => isKeeper(player.position))

  return Object.entries(CATEGORY_DEFINITIONS)
    .filter(([, category]) => !category.keeperOnly || allKeepers)
    .filter(([, category]) => viewMode === 'extended' || category.compact)
}

function getVisibleCategories(players, viewMode, enabledKeys) {
  return getAvailableCategories(players, viewMode)
    .map(([categoryKey, category]) => ({
      key: categoryKey,
      ...category,
      stats: category.stats.filter((stat) => enabledKeys.has(stat.key)),
    }))
    .filter((category) => category.stats.length > 0)
}

function getAllAvailableStats(players, viewMode) {
  return getAvailableCategories(players, viewMode)
    .flatMap(([, category]) => category.stats)
}

function getBestIds(players, stat) {
  if (stat.better === 'none') return []

  const usable = players
    .filter(Boolean)
    .map((player) => ({ id: player.id, value: numericValue(player[stat.key]) }))
    .filter((item) => item.value !== null)

  if (!usable.length) return []

  const values = usable.map((item) => item.value)
  const bestValue =
    stat.better === 'low' ? Math.min(...values) : Math.max(...values)

  return usable
    .filter((item) => item.value === bestValue)
    .map((item) => item.id)
}

function getBarWidth(players, stat, player) {
  if (!player) return 0

  const values = players
    .filter(Boolean)
    .map((item) => numericValue(item[stat.key]))
    .filter((value) => value !== null)

  const value = numericValue(player[stat.key])

  if (value === null || !values.length) return 0

  const max = Math.max(...values)
  const min = Math.min(...values)

  if (max === min) return 100

  if (stat.better === 'low') {
    return 35 + ((max - value) / (max - min)) * 65
  }

  if (stat.better === 'none') {
    return 55 + ((value - min) / (max - min)) * 45
  }

  return 35 + ((value - min) / (max - min)) * 65
}

function calculateScore(players, stats) {
  const scoreMap = new Map(
    players.filter(Boolean).map((player) => [player.id, 0]),
  )

  stats
    .filter((stat) => stat.countsForWinner)
    .forEach((stat) => {
      const bestIds = getBestIds(players, stat)

      if (bestIds.length === 1) {
        const id = bestIds[0]
        scoreMap.set(id, (scoreMap.get(id) || 0) + 1)
      }
    })

  return scoreMap
}

function getSummary(players, stats) {
  const selected = players.filter(Boolean)
  const countedStats = stats.filter((stat) => stat.countsForWinner)

  if (selected.length < 2) {
    return {
      winner: null,
      title: 'Kies minimaal twee spelers',
      subtitle: 'Selecteer spelers om de seizoensanalyse te starten.',
      wins: 0,
      total: countedStats.length,
      strongStats: [],
    }
  }

  if (!countedStats.length) {
    return {
      winner: null,
      title: 'Geen statistieken geselecteerd',
      subtitle: 'Zet minimaal één relevante statistiek aan.',
      wins: 0,
      total: 0,
      strongStats: [],
    }
  }

  const scoreMap = calculateScore(selected, countedStats)
  const highestScore = Math.max(...scoreMap.values())
  const winners = selected.filter(
    (player) => scoreMap.get(player.id) === highestScore,
  )

  if (winners.length !== 1 || highestScore === 0) {
    return {
      winner: null,
      title: 'De seizoensvergelijking is in evenwicht',
      subtitle: 'Meerdere spelers winnen evenveel geselecteerde categorieën.',
      wins: highestScore,
      total: countedStats.length,
      strongStats: [],
    }
  }

  const winner = winners[0]
  const strongStats = countedStats
    .filter((stat) => getBestIds(selected, stat).includes(winner.id))
    .slice(0, 5)
    .map((stat) => stat.label)

  return {
    winner,
    title: `${winner.name} had het beste seizoen`,
    subtitle: `Won ${highestScore} van de ${countedStats.length} geselecteerde categorieën.`,
    wins: highestScore,
    total: countedStats.length,
    strongStats,
  }
}

function createPlayerSelector(slotIndex, players, selectedId) {
  const selected = players.find((player) => player.id === selectedId)
  const value = selected ? playerOption(selected) : ''

  return `
    <div class="analysis-selector" data-slot="${slotIndex}">
      <label>
        <span>Speler ${slotIndex + 1}</span>

        <div class="analysis-search-wrap">
          <input
            class="analysis-player-search"
            data-slot="${slotIndex}"
            type="search"
            value="${value}"
            placeholder="Typ een speler of club..."
            autocomplete="off"
          />

          <button
            class="analysis-clear ${selected ? '' : 'hidden'}"
            data-clear-slot="${slotIndex}"
            type="button"
            title="Speler verwijderen"
          >×</button>

          <div
            class="analysis-suggestions hidden"
            data-suggestions="${slotIndex}"
          ></div>
        </div>
      </label>
    </div>
  `
}

function renderPlayerCard(player) {
  if (!player) {
    return `
      <article class="analysis-player-card empty">
        <div class="analysis-avatar">+</div>
        <strong>Speler kiezen</strong>
        <span>Gebruik het zoekveld hierboven</span>
      </article>
    `
  }

  return `
    <article class="analysis-player-card">
      <div class="analysis-avatar">${player.name.charAt(0)}</div>

      <div class="analysis-card-main">
        <span class="analysis-position">${player.position}</span>
        <h3>${player.name}</h3>
        <p>${player.club}</p>
      </div>

      <div class="analysis-card-metrics">
        <div>
          <span>Punten</span>
          <strong>${formatNumber(player.points)}</strong>
        </div>

        <div>
          <span>Eindprijs</span>
          <strong>${formatPrice(player.endPrice)}</strong>
        </div>

        <div>
          <span>Gespeeld door</span>
          <strong>${formatPercent(player.selectedPct)}</strong>
        </div>
      </div>
    </article>
  `
}

function renderWinner(summary, activePresetLabel) {
  return `
    <section class="analysis-conclusion ${summary.winner ? 'winner' : ''}">
      <div class="analysis-conclusion-icon">
        ${summary.winner ? '🏆' : '🆚'}
      </div>

      <div class="analysis-conclusion-text">
        <span class="eyebrow">Objectieve seizoensconclusie</span>
        <h2>${summary.title}</h2>
        <p>${summary.subtitle}</p>

        <div class="analysis-profile-tag">
          Analyseprofiel: <strong>${activePresetLabel}</strong>
        </div>

        ${
          summary.strongStats.length
            ? `
              <div class="analysis-strengths">
                ${summary.strongStats
                  .map((label) => `<span>✓ ${label}</span>`)
                  .join('')}
              </div>
            `
            : ''
        }
      </div>

      ${
        summary.winner
          ? `
            <div class="analysis-score-ring">
              <strong>${summary.wins}</strong>
              <span>van ${summary.total}</span>
            </div>
          `
          : ''
      }
    </section>
  `
}

function renderStatRow(stat, players, slotCount) {
  const selected = players.filter(Boolean)
  const bestIds = getBestIds(selected, stat)

  return `
    <div
      class="analysis-stat-row"
      style="--analysis-count:${slotCount}"
    >
      <div class="analysis-stat-name">
        <strong>${stat.label}</strong>
      </div>

      ${Array.from({ length: slotCount }, (_, index) => {
        const player = players[index]
        const isBest =
          player &&
          selected.length >= 2 &&
          bestIds.includes(player.id)

        const width = getBarWidth(selected, stat, player)

        return `
          <div class="analysis-stat-cell ${isBest ? 'best' : ''}">
            <div class="analysis-stat-value">
              <strong>
                ${player ? formatValue(player[stat.key], stat.type) : '—'}
              </strong>

              ${isBest ? '<span>BESTE</span>' : ''}
            </div>

            <div class="analysis-bar-track">
              <div
                class="analysis-bar-fill"
                style="width:${player ? width : 0}%"
              ></div>
            </div>
          </div>
        `
      }).join('')}
    </div>
  `
}

function renderCategory(category, players, slotCount) {
  return `
    <section class="analysis-category">
      <div class="analysis-category-heading">
        <span>${category.title}</span>
      </div>

      ${category.stats
        .map((stat) => renderStatRow(stat, players, slotCount))
        .join('')}
    </section>
  `
}

function renderFilterPanel(players, viewMode, enabledKeys, presetKey) {
  const categories = getAvailableCategories(players, viewMode)

  return `
    <aside class="analysis-filter-panel">
      <div class="analysis-filter-panel-header">
        <div>
          <span class="eyebrow">Analysefilters</span>
          <h3>Kies wat belangrijk is</h3>
        </div>

        <button id="analysis-close-filters" type="button">×</button>
      </div>

      <div class="analysis-presets">
        ${Object.entries(PRESETS).map(([key, preset]) => `
          <button
            type="button"
            class="analysis-preset ${presetKey === key ? 'active' : ''}"
            data-analysis-preset="${key}"
          >
            <strong>${preset.label}</strong>
            <span>${preset.description}</span>
          </button>
        `).join('')}
      </div>

      <div class="analysis-filter-actions">
        <button id="analysis-select-all" type="button">Alles aan</button>
        <button id="analysis-select-none" type="button">Alles uit</button>
      </div>

      <div class="analysis-filter-groups">
        ${categories.map(([categoryKey, category]) => `
          <section class="analysis-filter-group">
            <div class="analysis-filter-group-title">
              <strong>${category.title}</strong>
              <button
                type="button"
                data-toggle-category="${categoryKey}"
              >Wissel</button>
            </div>

            <div class="analysis-filter-list">
              ${category.stats.map((stat) => `
                <label class="analysis-filter-item">
                  <input
                    type="checkbox"
                    data-stat-key="${stat.key}"
                    ${enabledKeys.has(stat.key) ? 'checked' : ''}
                  />

                  <span class="analysis-custom-checkbox"></span>

                  <span>
                    <strong>${stat.label}</strong>
                    <small>
                      ${
                        stat.countsForWinner
                          ? 'Telt mee voor conclusie'
                          : 'Alleen zichtbaar als context'
                      }
                    </small>
                  </span>
                </label>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    </aside>
  `
}

function renderComparison(players, slotCount, viewMode, enabledKeys, presetLabel) {
  const categories = getVisibleCategories(players, viewMode, enabledKeys)
  const stats = categories.flatMap((category) => category.stats)
  const summary = getSummary(players, stats)

  return `
    <section class="analysis-results">
      ${renderWinner(summary, presetLabel)}

      <div
        class="analysis-player-grid"
        style="--analysis-count:${slotCount}"
      >
        <div class="analysis-player-grid-label">
          <span class="eyebrow">Selectie</span>
          <strong>Spelers</strong>
        </div>

        ${Array.from(
          { length: slotCount },
          (_, index) => renderPlayerCard(players[index]),
        ).join('')}
      </div>

      <div class="analysis-statistics">
        ${
          categories.length
            ? categories
                .map((category) =>
                  renderCategory(category, players, slotCount),
                )
                .join('')
            : `
              <div class="analysis-empty-filter-state">
                <strong>Geen statistieken geselecteerd</strong>
                <p>Open Analysefilters en zet minimaal één onderdeel aan.</p>
              </div>
            `
        }
      </div>

      <div class="analysis-footnote">
        Alleen aangevinkte statistieken worden getoond. Alleen onderdelen
        met “Telt mee voor conclusie” bepalen de automatische winnaar.
      </div>
    </section>
  `
}

export function createCompareScreen() {
  const players = getPlayers()
  const seasons = uniqueValues(players, 'season')

  return `
    <section class="panel analysis-module">
      <div class="panel-heading analysis-heading">
        <div>
          <span class="eyebrow">Analysecentrum</span>
          <h2>Spelers vergelijken</h2>
          <p>
            Vergelijk objectief de prestaties uit een afgerond seizoen.
          </p>
        </div>

        <div class="analysis-season-control">
          <label>
            <span>Seizoen</span>
            <select id="analysis-season">
              ${seasons
                .map(
                  (season) =>
                    `<option value="${season}">${season}</option>`,
                )
                .join('')}
            </select>
          </label>
        </div>
      </div>

      <div class="analysis-mode-tabs">
        <button class="analysis-mode active" type="button">
          Seizoensstatistieken
        </button>

        <button
          class="analysis-mode disabled"
          type="button"
          disabled
          title="Beschikbaar zodra de gegevens van 2026/27 compleet zijn"
        >
          Fantasy Outlook
          <span>Binnenkort</span>
        </button>
      </div>

      <div class="analysis-toolbar">
        <div class="analysis-toolbar-group">
          <span>Aantal spelers</span>

          <div class="analysis-count-switch">
            ${[2, 3, 4]
              .map(
                (count) => `
                  <button
                    type="button"
                    class="analysis-count-button ${
                      count === 2 ? 'active' : ''
                    }"
                    data-analysis-count="${count}"
                  >${count}</button>
                `,
              )
              .join('')}
          </div>
        </div>

        <div class="analysis-toolbar-group">
          <span>Weergave</span>

          <div class="analysis-view-switch">
            <button
              class="analysis-view-button active"
              data-analysis-view="compact"
              type="button"
            >
              Compact
            </button>

            <button
              class="analysis-view-button"
              data-analysis-view="extended"
              type="button"
            >
              Uitgebreid
            </button>
          </div>
        </div>

        <button
          id="analysis-open-filters"
          class="analysis-filter-button"
          type="button"
        >
          ⚙ Analysefilters
          <span id="analysis-active-filter-count"></span>
        </button>

        <button id="analysis-reset" class="analysis-reset" type="button">
          Leegmaken
        </button>
      </div>

      <div id="analysis-selectors" class="analysis-selectors"></div>
      <div id="analysis-output"></div>

      <div id="analysis-filter-backdrop" class="analysis-filter-backdrop hidden"></div>
      <div id="analysis-filter-host"></div>
    </section>
  `
}

export function mountCompareScreen() {
  const allPlayers = getPlayers()
  const seasons = uniqueValues(allPlayers, 'season')

  const allStatKeys = new Set(
    Object.values(CATEGORY_DEFINITIONS)
      .flatMap((category) => category.stats)
      .filter((stat) => stat.defaultEnabled)
      .map((stat) => stat.key),
  )

  const state = {
    season: seasons.at(-1) || '',
    slotCount: 2,
    viewMode: 'compact',
    selectedIds: Array(4).fill(null),
    enabledKeys: new Set(allStatKeys),
    presetKey: 'all',
    filtersOpen: false,
  }

  const seasonSelect = document.querySelector('#analysis-season')
  const selectors = document.querySelector('#analysis-selectors')
  const output = document.querySelector('#analysis-output')
  const filterHost = document.querySelector('#analysis-filter-host')
  const filterBackdrop = document.querySelector('#analysis-filter-backdrop')
  const filterButton = document.querySelector('#analysis-open-filters')
  const filterCount = document.querySelector('#analysis-active-filter-count')
  const countButtons = [
    ...document.querySelectorAll('.analysis-count-button'),
  ]
  const viewButtons = [
    ...document.querySelectorAll('.analysis-view-button'),
  ]
  const resetButton = document.querySelector('#analysis-reset')

  seasonSelect.value = state.season

  function seasonPlayers() {
    return allPlayers
      .filter(
        (player) =>
          !state.season || player.season === state.season,
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  }

  function selectedPlayers() {
    const players = seasonPlayers()

    return Array.from(
      { length: state.slotCount },
      (_, index) =>
        players.find(
          (player) => player.id === state.selectedIds[index],
        ) || null,
    )
  }

  function activePresetLabel() {
    return PRESETS[state.presetKey]?.label || 'Aangepast'
  }

  function updateFilterCount() {
    const availableKeys = new Set(
      getAllAvailableStats(selectedPlayers(), state.viewMode)
        .map((stat) => stat.key),
    )

    const count = [...state.enabledKeys]
      .filter((key) => availableKeys.has(key))
      .length

    filterCount.textContent = `${count} actief`
  }

  function applyPreset(presetKey) {
    const preset = PRESETS[presetKey]
    if (!preset) return

    const availableStats = getAllAvailableStats(
      selectedPlayers(),
      state.viewMode,
    )

    if (preset.enabledKeys === null) {
      state.enabledKeys = new Set(
        availableStats.map((stat) => stat.key),
      )
    } else {
      state.enabledKeys = new Set(
        preset.enabledKeys.filter((key) =>
          availableStats.some((stat) => stat.key === key),
        ),
      )
    }

    state.presetKey = presetKey
    render()
  }

  function renderSelectors() {
    const players = seasonPlayers()

    selectors.style.setProperty(
      '--analysis-count',
      state.slotCount,
    )

    selectors.innerHTML = Array.from(
      { length: state.slotCount },
      (_, index) =>
        createPlayerSelector(
          index,
          players,
          state.selectedIds[index],
        ),
    ).join('')

    document
      .querySelectorAll('.analysis-player-search')
      .forEach((input) => {
        const slotIndex = Number(input.dataset.slot)
        const suggestions = document.querySelector(
          `[data-suggestions="${slotIndex}"]`,
        )

        function showSuggestions() {
          const query = input.value.trim().toLowerCase()
          const currentPlayers = seasonPlayers()
          const selectedElsewhere = new Set(
            state.selectedIds.filter(
              (id, index) => index !== slotIndex && id,
            ),
          )

          const matches = currentPlayers
            .filter(
              (player) => !selectedElsewhere.has(player.id),
            )
            .filter((player) => {
              if (!query) return true

              return (
                player.name.toLowerCase().includes(query) ||
                player.club.toLowerCase().includes(query)
              )
            })
            .slice(0, 12)

          suggestions.innerHTML = matches.length
            ? matches
                .map(
                  (player) => `
                    <button
                      type="button"
                      data-select-player="${player.id}"
                      data-slot="${slotIndex}"
                    >
                      <strong>${player.name}</strong>
                      <span>
                        ${player.club} · ${player.position}
                      </span>
                    </button>
                  `,
                )
                .join('')
            : `
              <div class="analysis-no-results">
                Geen speler gevonden
              </div>
            `

          suggestions.classList.remove('hidden')

          suggestions
            .querySelectorAll('[data-select-player]')
            .forEach((button) => {
              button.addEventListener(
                'mousedown',
                (event) => {
                  event.preventDefault()
                  state.selectedIds[slotIndex] =
                    button.dataset.selectPlayer
                  render()
                },
              )
            })
        }

        input.addEventListener('focus', showSuggestions)
        input.addEventListener('input', showSuggestions)
        input.addEventListener('blur', () => {
          window.setTimeout(
            () => suggestions.classList.add('hidden'),
            120,
          )
        })
      })

    document
      .querySelectorAll('[data-clear-slot]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          state.selectedIds[
            Number(button.dataset.clearSlot)
          ] = null
          render()
        })
      })
  }

  function renderOutput() {
    output.innerHTML = renderComparison(
      selectedPlayers(),
      state.slotCount,
      state.viewMode,
      state.enabledKeys,
      activePresetLabel(),
    )
  }

  function bindFilterPanel() {
    if (!state.filtersOpen) return

    document
      .querySelector('#analysis-close-filters')
      .addEventListener('click', closeFilters)

    document
      .querySelector('#analysis-select-all')
      .addEventListener('click', () => {
        state.enabledKeys = new Set(
          getAllAvailableStats(
            selectedPlayers(),
            state.viewMode,
          ).map((stat) => stat.key),
        )
        state.presetKey = 'all'
        render()
      })

    document
      .querySelector('#analysis-select-none')
      .addEventListener('click', () => {
        state.enabledKeys = new Set()
        state.presetKey = 'custom'
        render()
      })

    document
      .querySelectorAll('[data-analysis-preset]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          applyPreset(button.dataset.analysisPreset)
        })
      })

    document
      .querySelectorAll('[data-stat-key]')
      .forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          const key = checkbox.dataset.statKey

          if (checkbox.checked) {
            state.enabledKeys.add(key)
          } else {
            state.enabledKeys.delete(key)
          }

          state.presetKey = 'custom'
          render()
        })
      })

    document
      .querySelectorAll('[data-toggle-category]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const categoryKey = button.dataset.toggleCategory
          const category = CATEGORY_DEFINITIONS[categoryKey]
          if (!category) return

          const keys = category.stats.map((stat) => stat.key)
          const allEnabled = keys.every((key) =>
            state.enabledKeys.has(key),
          )

          keys.forEach((key) => {
            if (allEnabled) {
              state.enabledKeys.delete(key)
            } else {
              state.enabledKeys.add(key)
            }
          })

          state.presetKey = 'custom'
          render()
        })
      })
  }

  function renderFilters() {
    filterBackdrop.classList.toggle(
      'hidden',
      !state.filtersOpen,
    )

    filterHost.innerHTML = state.filtersOpen
      ? renderFilterPanel(
          selectedPlayers(),
          state.viewMode,
          state.enabledKeys,
          state.presetKey,
        )
      : ''

    bindFilterPanel()
  }

  function openFilters() {
    state.filtersOpen = true
    renderFilters()
  }

  function closeFilters() {
    state.filtersOpen = false
    renderFilters()
  }

  function render() {
    renderSelectors()
    renderOutput()
    updateFilterCount()
    renderFilters()
  }

  filterButton.addEventListener('click', openFilters)
  filterBackdrop.addEventListener('click', closeFilters)

  countButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.slotCount = Number(button.dataset.analysisCount)

      countButtons.forEach((item) => {
        item.classList.toggle('active', item === button)
      })

      render()
    })
  })

  viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.viewMode = button.dataset.analysisView

      viewButtons.forEach((item) => {
        item.classList.toggle('active', item === button)
      })

      applyPreset(state.presetKey === 'custom' ? 'all' : state.presetKey)
    })
  })

  seasonSelect.addEventListener('change', () => {
    state.season = seasonSelect.value
    state.selectedIds = Array(4).fill(null)
    state.presetKey = 'all'
    state.enabledKeys = new Set(allStatKeys)
    render()
  })

  resetButton.addEventListener('click', () => {
    state.selectedIds = Array(4).fill(null)
    state.presetKey = 'all'
    state.enabledKeys = new Set(allStatKeys)
    render()
  })

  render()
}
