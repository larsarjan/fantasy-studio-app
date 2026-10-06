import { safeHtml } from '../platform/html.js'
import {
  getEnrichedPlayers,
  getElitePlayerStats,
  getEliteTransfers,
} from '../services/database.js'

import { formatEliteMetric, selectEliteView } from '../services/eliteManagerIntelligence.js'

import {
  getPlayerRoleLabel,
  PLAYER_STATUS_META,
} from '../constants/playerMetadata.js'

import {
  getFantasyLabelMeta,
} from '../constants/fantasyLabels.js'

import {
  getPlayerImage,
} from '../services/playerImages.js'

import {
  renderFantasyOutlookComparison,
  bindFantasyOutlookComparison,
} from './compareOutlook.js'

import {
  getAutomaticOutlookStartRound,
} from '../services/fantasyOutlookComparisonEngine.js'

const CATEGORY_DEFINITIONS = {
  overview: {
    title: 'Algemeen',
    compact: true,
    stats: [
      {
        key: 'points',
        label: 'Totaal punten',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'optaBonus',
        label: 'OPTA Bonus',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
    ],
  },

  playingTime: {
    title: 'Speeltijd',
    compact: true,
    stats: [
      {
        key: 'minutes',
        label: 'Gespeelde minuten',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'minutePoints',
        label: 'Punten uit speeltijd',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'selectedPct',
        label: 'Gespeeld door',
        type: 'percent',
        better: 'high',
        countsForWinner: false,
        defaultEnabled: true,
      },
    ],
  },

availability: {
  title: 'Beschikbaarheid',
  compact: true,
  stats: [
    {
      key: 'chanceOfPlaying',
      label: 'Speelkans',
      type: 'percent',
      better: 'high',
      countsForWinner: true,
      defaultEnabled: true,
    },
    {
      key: 'expectedMinutes',
      label: 'Verwachte minuten',
      type: 'number',
      better: 'high',
      countsForWinner: true,
      defaultEnabled: true,
    },
  ],
},

  attacking: {
    title: 'Aanvallend',
    compact: true,
    stats: [
      {
        key: 'goals',
        label: 'Doelpunten',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'assists',
        label: 'Assists',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
    ],
  },

setPieces: {
  title: 'Standaardsituaties',
  compact: false,
  stats: [
    {
      key: 'penalties',
      label: 'Penaltynemer',
      type: 'boolean',
      better: 'high',
      countsForWinner: false,
      defaultEnabled: true,
    },
    {
      key: 'corners',
      label: 'Corners',
      type: 'boolean',
      better: 'high',
      countsForWinner: false,
      defaultEnabled: true,
    },
    {
      key: 'freeKicks',
      label: 'Vrije trappen',
      type: 'boolean',
      better: 'high',
      countsForWinner: false,
      defaultEnabled: true,
    },
  ],
},

  financial: {
    title: 'Financieel',
    compact: false,
    stats: [
      {
        key: 'startPrice',
        label: 'Beginprijs',
        type: 'price',
        better: 'none',
        countsForWinner: false,
        defaultEnabled: true,
      },
      {
        key: 'endPrice',
        label: 'Huidige prijs',
        type: 'price',
        better: 'none',
        countsForWinner: false,
        defaultEnabled: true,
      },
      {
        key: 'valueDevelopment',
        label: 'Waardeontwikkeling',
        type: 'percent',
        better: 'high',
        countsForWinner: false,
        defaultEnabled: true,
      },
    ],
  },

  negativePoints: {
    title: 'Minpunten',
    compact: false,
    stats: [
      {
        key: 'yellowCards',
        label: 'Gele kaarten',
        type: 'number',
        better: 'low',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'redCards',
        label: 'Rode kaarten',
        type: 'number',
        better: 'low',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'penaltiesMissed',
        label: 'Gemiste strafschoppen',
        type: 'number',
        better: 'low',
        countsForWinner: true,
        defaultEnabled: true,
      },
    ],
  },

  keeper: {
    title: 'Keepers',
    compact: true,
    keeperOnly: true,
    stats: [
      {
        key: 'saves',
        label: 'Reddingen',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'savePoints',
        label: 'Punten voor reddingen',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'cleanSheets',
        label: 'Clean sheets',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'cleanSheetPoints',
        label: 'Punten voor clean sheets',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'penaltiesSaved',
        label: 'Gestopte penalties',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'goalsAgainst',
        label: 'Tegendoelpunten',
        type: 'number',
        better: 'low',
        countsForWinner: true,
        defaultEnabled: true,
      },
      {
        key: 'goalsAgainstMinus',
        label: 'Minpunten tegendoelpunten',
        type: 'number',
        better: 'high',
        countsForWinner: true,
        defaultEnabled: true,
      },
    ],
  },
}

const PRESETS = {
  all: {
    label: 'Alles',
    description: 'Alle beschikbare statistieken',
    enabledKeys: null,
  },

  safety: {
  label: 'Veiligheid',
  description: 'Speelkans, minuten en zekerheid',
  enabledKeys: [
    'chanceOfPlaying',
    'expectedMinutes',
    'selectedPct',
    'minutes',
    'minutePoints',
  ],
},

setPieces: {
  label: 'Standaardsituaties',
  description: 'Penalty’s, corners en vrije trappen',
  enabledKeys: [
    'penalties',
    'corners',
    'freeKicks',
  ],
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
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—'
  }

  if (type === 'price') {
    return formatPrice(value)
  }

  if (type === 'percent') {
    return formatPercent(value)
  }

  if (type === 'boolean') {
    return value ? 'Ja' : 'Nee'
  }

  return formatNumber(value)
}

function numericValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function playerOption(player) {
  return `${player.name} — ${player.club}`
}

function playerComparisonKey(player) {
  return `${player.season}::${player.id}`
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
    .map((player) => ({
  id: playerComparisonKey(player),
  value: numericValue(player[stat.key]),
}))
    .filter((item) => item.value !== null)

  if (!usable.length) return []

  const values = usable.map((item) => item.value)
  const bestValue =
    stat.better === 'low' ? Math.min(...values) : Math.max(...values)

  return usable
    .filter((item) => item.value === bestValue)
    .map((item) => item.id)
}

function getDrawIds(players, stat) {
  if (stat.better === 'none') return []

  const usable = players
    .filter(Boolean)
    .map((player) => ({
      id: playerComparisonKey(player),
      value: numericValue(player[stat.key]),
    }))
    .filter((item) => item.value !== null)

  if (usable.length < 2) return []

  const values = usable.map((item) => item.value)

  const bestValue =
    stat.better === 'low'
      ? Math.min(...values)
      : Math.max(...values)

  const winners =
    usable.filter(
      (item) => item.value === bestValue,
    )

  return winners.length > 1
    ? winners.map((item) => item.id)
    : []
}

function getWorstIds(players, stat) {
  if (stat.better === 'none') return []

  const usable = players
    .filter(Boolean)
    .map((player) => ({
      id: playerComparisonKey(player),
      value: numericValue(player[stat.key]),
    }))
    .filter((item) => item.value !== null)

  if (usable.length < 3) {
    return []
  }

  const values =
    usable.map((item) => item.value)

  const worstValue =
    stat.better === 'low'
      ? Math.max(...values)
      : Math.min(...values)

  const losers =
    usable.filter(
      (item) => item.value === worstValue,
    )

  return losers.length === 1
    ? losers.map((item) => item.id)
    : []
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
    players
  .filter(Boolean)
  .map((player) => [
    playerComparisonKey(player),
    0,
  ]),
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
  (player) =>
    scoreMap.get(
      playerComparisonKey(player),
    ) === highestScore,
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
const winnerId =
  playerComparisonKey(winner)

const strongStats = countedStats
  .filter((stat) => {
    const bestIds =
      getBestIds(selected, stat)

    return (
      bestIds.length === 1 &&
      bestIds[0] === winnerId
    )
  })
  .slice(0, 5)
  .map((stat) => stat.label)

  return {
    winner,
    title: `${winner.name} komt als beste uit de vergelijking`,
    subtitle: `Won ${highestScore} van de ${countedStats.length} geselecteerde categorieën.`,
    wins: highestScore,
    total: countedStats.length,
    strongStats,
  }
}

function createPlayerSelector(
  slotIndex,
  seasons,
  selectedSeason,
  players,
  selectedKey,
) {
  const selected = players.find(
    (player) =>
      playerComparisonKey(player) ===
      selectedKey,
  )

  const value = selected
    ? playerOption(selected)
    : ''

  return `
    <div
      class="analysis-selector"
      data-slot="${slotIndex}"
    >
      <label class="analysis-slot-season">
        <span>
          Seizoen speler ${slotIndex + 1}
        </span>

        <select
          class="analysis-season-select"
          data-season-slot="${slotIndex}"
        >
          ${seasons
            .map(
              (season) => `
                <option
                  value="${season}"
                  ${
                    season === selectedSeason
                      ? 'selected'
                      : ''
                  }
                >
                  ${season}
                </option>
              `,
            )
            .join('')}
        </select>
      </label>

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
            class="analysis-clear ${
              selected ? '' : 'hidden'
            }"
            data-clear-slot="${slotIndex}"
            type="button"
            title="Speler verwijderen"
          >
            ×
          </button>

          <div
            class="analysis-suggestions hidden"
            data-suggestions="${slotIndex}"
          ></div>
        </div>
      </label>
    </div>
  `
}

function getStatusMeta(status) {
  return (
    PLAYER_STATUS_META[status] || {
      label: status || 'Onbekend',
      className: 'status-unknown',
    }
  )
}

function getPlayingChanceLabel(value) {
  const chance = Number(value)

  if (!Number.isFinite(chance)) {
    return ''
  }

  if (chance >= 90) {
    return 'Zeer waarschijnlijk'
  }

  if (chance >= 75) {
    return 'Waarschijnlijk'
  }

  if (chance >= 40) {
    return 'Twijfelachtig'
  }

  if (chance > 0) {
    return 'Onwaarschijnlijk'
  }

  return 'Niet beschikbaar'
}

function renderSetPieces(player) {
  const setPieces = []

  if (player.penalties) {
    setPieces.push('Penalty’s')
  }

  if (player.corners) {
    setPieces.push('Corners')
  }

  if (player.freeKicks) {
    setPieces.push('Vrije trappen')
  }

  if (!setPieces.length) {
    return ''
  }

  return `
    <div class="analysis-profile-setpieces">
      <span>Standaardsituaties</span>

      <div>
        ${setPieces
          .map(
            (item) => `
              <strong>${item}</strong>
            `,
          )
          .join('')}
      </div>
    </div>
  `
}

function renderFantasyLabels(player) {
  const labels =
    Array.isArray(player.fantasyLabels)
      ? player.fantasyLabels
          .map((labelKey) => ({
            key: labelKey,
            ...getFantasyLabelMeta(
              labelKey,
            ),
          }))
          .filter((label) => label.label)
          .slice(0, 4)
      : []

  if (!labels.length) {
    return ''
  }

  return `
    <div class="analysis-fantasy-profile">
      <span class="analysis-fantasy-profile-title">
        Fantasy-profiel
      </span>

      <div class="analysis-fantasy-labels">
        ${labels
          .map(
            (label) => `
              <span
                class="
                  analysis-fantasy-label
                  analysis-fantasy-label-${label.className}
                "
                title="${label.label}"
              >
                ${
                  label.icon
                    ? `<b aria-hidden="true">${label.icon}</b>`
                    : ''
                }

                <strong>
                  ${label.label}
                </strong>
              </span>
            `,
          )
          .join('')}
      </div>
    </div>
  `
}

function renderPlayerCard(player) {
  if (!player) {
    return `
      <article class="analysis-player-card empty">
        <div class="analysis-avatar">+</div>

        <strong>Speler kiezen</strong>

        <span>
          Gebruik het zoekveld hierboven
        </span>
      </article>
    `
  }

  const playerImage =
  getPlayerImage(
    `${player.id}.webp`,
  )

  const statusMeta =
    getStatusMeta(player.status)

  const roleLabels =
    Array.isArray(player.roles)
      ? player.roles
          .map(getPlayerRoleLabel)
          .filter(Boolean)
      : []

  const rawPlayingChance =
  player.chanceOfPlaying

const playingChance =
  rawPlayingChance !== null &&
  rawPlayingChance !== undefined &&
  rawPlayingChance !== '' &&
  Number.isFinite(
    Number(rawPlayingChance),
  )
    ? Number(rawPlayingChance)
    : null

  const expectedMinutes =
    Number.isFinite(
      Number(player.expectedMinutes),
    )
      ? Number(player.expectedMinutes)
      : null

  return `
    <article class="analysis-player-card">
      <div class="analysis-player-card-top">
        <div
  class="
    analysis-avatar
    ${playerImage ? 'has-image' : 'has-studio-placeholder'}
  "
>
  ${
    playerImage
      ? `
        <img
          src="${playerImage}"
          alt="${player.name}"
        />
      `
      : `
        <div
          class="analysis-photo-studio"
          role="img"
          aria-label="Geen spelersfoto beschikbaar"
        >
          <span
            class="analysis-photo-studio-light"
            aria-hidden="true"
          ></span>

          <span
            class="analysis-photo-studio-floor"
            aria-hidden="true"
          ></span>

          <span
            class="analysis-photo-studio-logo"
            aria-hidden="true"
          >
            <strong>FVT</strong>
            <small>STUDIO</small>
          </span>
        </div>
      `
  }
</div>

        <div class="analysis-card-main">
          <span class="analysis-position">
            ${
              player.fantasyPosition ||
              player.position
            }
          </span>

          <h3>${player.name}</h3>

          <p>${player.club}</p>
        </div>
      </div>

      ${renderFantasyLabels(player)}

      ${
        player.metadataAvailable
          ? `
            <div class="analysis-player-profile">
              ${
                roleLabels.length
                  ? `
                    <div class="analysis-profile-item analysis-profile-roles">
                      <span>Werkelijke rol</span>

                      <div>
                        ${roleLabels
                          .map(
                            (role) => `
                              <strong>
                                ${role}
                              </strong>
                            `,
                          )
                          .join('')}
                      </div>
                    </div>
                  `
                  : ''
              }

              ${
                player.status
                  ? `
                    <div class="analysis-profile-item">
                      <span>Status</span>

                      <strong
                        class="analysis-status-badge ${statusMeta.className}"
                      >
                        ${statusMeta.label}
                      </strong>
                    </div>
                  `
                  : ''
              }

              ${
                playingChance !== null
                  ? `
                    <div class="analysis-profile-item">
                      <span>Speelkans</span>

                      <strong>
                        ${playingChance}%
                      </strong>

                      <small>
                        ${getPlayingChanceLabel(
                          playingChance,
                        )}
                      </small>
                    </div>
                  `
                  : ''
              }

              ${
                expectedMinutes !== null
                  ? `
                    <div class="analysis-profile-item">
                      <span>
                        Verwachte minuten
                      </span>

                      <strong>
                        ${expectedMinutes}
                      </strong>
                    </div>
                  `
                  : ''
              }

              ${renderSetPieces(player)}
            </div>
          `
          : ''
      }

      <div class="analysis-card-metrics">
        <div>
          <span>Punten</span>

          <strong>
            ${formatNumber(player.points)}
          </strong>
        </div>

        <div>
          <span>Prijs</span>

          <strong>
            ${formatPrice(player.endPrice)}
          </strong>
        </div>

        <div>
          <span>Gespeeld door</span>

          <strong>
            ${formatPercent(
              player.selectedPct,
            )}
          </strong>
        </div>
      </div>
    </article>
  `
}

function renderStickyPlayers(players, slotCount) {
  return `
    <div
      class="analysis-sticky-players"
      style="--analysis-count:${slotCount}"
      aria-label="Geselecteerde spelers"
    >
      <div class="analysis-sticky-label">
        <span>Vergelijking</span>
        <strong>Spelers</strong>
      </div>

      ${Array.from(
        { length: slotCount },
        (_, index) => {
          const player = players[index]

          if (!player) {
            return `
              <div class="analysis-sticky-player empty">
                <span>Speler ${index + 1}</span>
                <strong>Niet gekozen</strong>
              </div>
            `
          }

          return `
            <div class="analysis-sticky-player">
              <span>
                ${
                  player.fantasyPosition ||
                  player.position ||
                  'Speler'
                }
              </span>

              <strong>${player.name}</strong>

              <small>${player.club}</small>
            </div>
          `
        },
      ).join('')}
    </div>
  `
}

function renderWinner(summary, activePresetLabel) {
  return `
    <section class="analysis-conclusion ${summary.winner ? 'winner' : ''}">
      <div class="analysis-conclusion-icon">
        ${summary.winner ? '🏆' : '🆚'}
      </div>

      <div class="analysis-conclusion-text">
        <span class="eyebrow">Objectieve vergelijkingsconclusie</span>
        <h2>${summary.title}</h2>
        <p>${summary.subtitle}</p>

        <div class="analysis-profile-tag">
          Analyseprofiel: <strong>${activePresetLabel}</strong>
        </div>

        ${
          summary.strongStats.length
            ? `
              <div class="analysis-strengths-wrap">
  <small>Beslist de vergelijking met:</small>

  <div class="analysis-strengths">
    ${summary.strongStats
      .map((label) => `<span>✓ ${label}</span>`)
      .join('')}
  </div>
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

function hasComparableStatValue(player, stat) {
  if (!player) return false

  const rawValue = player[stat.key]

  if (
    rawValue === null ||
    rawValue === undefined ||
    rawValue === ''
  ) {
    return false
  }

  return numericValue(rawValue) !== null
}

function renderStatRow(stat, players, slotCount) {
  const selected =
    players.filter((player) =>
      hasComparableStatValue(
        player,
        stat,
      ),
    )

  const bestIds =
    getBestIds(selected, stat)

  const drawIds =
    getDrawIds(selected, stat)

  const worstIds =
    getWorstIds(selected, stat)

  return `
    <div
      class="analysis-stat-row"
      style="--analysis-count:${slotCount}"
    >
      <div class="analysis-stat-name">
        <strong>${stat.label}</strong>
      </div>

      ${Array.from(
        { length: slotCount },
        (_, index) => {
          const player =
            players[index]

          const hasValue =
            hasComparableStatValue(
              player,
              stat,
            )

          const comparisonId =
            player && hasValue
              ? playerComparisonKey(player)
              : null

          const isDraw =
            Boolean(
              comparisonId &&
              drawIds.includes(
                comparisonId,
              ),
            )

          const isBest =
            Boolean(
              comparisonId &&
              bestIds.includes(
                comparisonId,
              ) &&
              !isDraw,
            )

          const isWorst =
            Boolean(
              comparisonId &&
              worstIds.includes(
                comparisonId,
              ),
            )

          const isMissing =
            !player || !hasValue

          const width =
            isMissing
              ? 0
              : getBarWidth(
                  selected,
                  stat,
                  player,
                )

          const stateClass =
            isMissing
              ? 'missing'
              : isDraw
                ? 'draw'
                : isBest
                  ? 'best'
                  : isWorst
                    ? 'worst'
                    : 'neutral'

          const resultLabel =
            isMissing
              ? ''
              : isDraw
                ? '<span>GELIJK</span>'
                : isBest
                  ? '<span>BESTE</span>'
                  : isWorst
                    ? '<span>LAAGSTE</span>'
                    : ''

          return `
            <div
              class="
                analysis-stat-cell
                ${stateClass}
              "
            >
              <div class="analysis-stat-value">
                <strong>
                  ${
                    isMissing
                      ? '—'
                      : formatValue(
                          player[stat.key],
                          stat.type,
                        )
                  }
                </strong>

                ${resultLabel}
              </div>

              <div class="analysis-bar-track">
                <div
                  class="analysis-bar-fill"
                  style="width:${width}%"
                ></div>
              </div>
            </div>
          `
        },
      ).join('')}
    </div>
  `
}

function renderCategory(
  category,
  players,
  slotCount,
  collapsedCategories,
) {
  const isCollapsed =
    collapsedCategories.has(category.key)

  return `
    <section
      class="analysis-category ${
        isCollapsed ? 'is-collapsed' : ''
      }"
    >
      <button
        class="analysis-category-heading"
        type="button"
        data-category-toggle="${category.key}"
        aria-expanded="${!isCollapsed}"
      >
        <span>${category.title}</span>

        <strong
          class="analysis-category-chevron"
          aria-hidden="true"
        >
          ⌄
        </strong>
      </button>

      <div class="analysis-category-content">
        ${category.stats
          .map((stat) =>
            renderStatRow(
              stat,
              players,
              slotCount,
            ),
          )
          .join('')}
      </div>
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

function renderComparison(
  players,
  slotCount,
  viewMode,
  enabledKeys,
  presetLabel,
  collapsedCategories,
) {
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

${renderStickyPlayers(players, slotCount)}

<div class="analysis-statistics">
        ${
          categories.length
            ? categories
                .map((category) =>
  renderCategory(
    category,
    players,
    slotCount,
    collapsedCategories,
  ),
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
      </div>

      <div class="analysis-mode-tabs">
  <button
    class="analysis-mode active"
    data-analysis-mode="season"
    type="button"
  >
    Seizoensstatistieken
  </button>

  <button
    class="analysis-mode"
    data-analysis-mode="outlook"
    type="button"
  >
    Fantasy Outlook
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
  const allPlayers = getEnrichedPlayers()
  const seasons = uniqueValues(allPlayers, 'season')

  const allStatKeys = new Set(
    Object.values(CATEGORY_DEFINITIONS)
      .flatMap((category) => category.stats)
      .filter((stat) => stat.defaultEnabled)
      .map((stat) => stat.key),
  )

const defaultSeason =
  seasons.at(-1) || ''

const state = {
  slotCount: 2,
  viewMode: 'compact',

    mode:
    'season',

  outlookStartRound:
    getAutomaticOutlookStartRound(),

  outlookRoundCount:
    5,

  slotSeasons:
    Array(4).fill(defaultSeason),

  selectedPlayerKeys:
    Array(4).fill(null),

  enabledKeys: new Set(allStatKeys),
  presetKey: 'all',
  filtersOpen: false,
  collapsedCategories: new Set(),
}

  const selectors = document.querySelector('#analysis-selectors')
  const output = document.querySelector('#analysis-output')
  const filterHost = document.querySelector('#analysis-filter-host')
  const filterBackdrop = document.querySelector('#analysis-filter-backdrop')
  const filterButton = document.querySelector('#analysis-open-filters')
  const filterCount = document.querySelector('#analysis-active-filter-count')
  const modeButtons = [
  ...document.querySelectorAll(
    '[data-analysis-mode]',
  ),
]
  const countButtons = [
    ...document.querySelectorAll('.analysis-count-button'),
  ]
  const viewButtons = [
    ...document.querySelectorAll('.analysis-view-button'),
  ]
  const resetButton = document.querySelector('#analysis-reset')

function playersForSlot(slotIndex) {
  const selectedSeason =
    state.slotSeasons[slotIndex]

  return allPlayers
    .filter(
      (player) =>
        !selectedSeason ||
        player.season === selectedSeason,
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, 'nl'),
    )
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))

function renderEliteComparison(players) {
  const active = players.filter(Boolean)
  if (!active.length) return ''
  const cohorts = [1000, 100, 10]
  const data = new Map(cohorts.map(cohort => [cohort, selectEliteView(getElitePlayerStats(), { season: active[0]?.season, cohort })]))
  if (![...data.values()].some(rows => rows.length)) return ''
  const cell = (player, cohort, key = 'selected') => {
    const row = data.get(cohort).find(item => String(item.playerId) === String(player.id))
    return row ? formatEliteMetric(row[key], row.validTeams) : '—'
  }
  const top100 = data.get(100), round = top100[0]?.gameweek
  const top100Row = player => top100.find(item => String(item.playerId) === String(player.id))
  const transferRows = getEliteTransfers().filter(row => row.season === active[0]?.season && row.gameweek === round && row.cohort === 100)
  const transfer = player => transferRows.find(row => String(row.playerId) === String(player.id))
  const metricRow = (label, values) => `<div class="elite-compare-row"><strong>${label}</strong>${values.map(value => `<span>${value}</span>`).join('')}</div>`
  return `<section class="analysis-category elite-comparison"><div class="analysis-category-heading"><div><span class="eyebrow">Topmanagers</span><h3>Marktvergelijking en terugblik SR${round ?? '—'}</h3></div></div><div class="elite-compare-grid" style="--elite-count:${active.length}"><div class="elite-compare-head"><span>Metric</span>${active.map(player => `<strong>${escapeHtml(player.name)}</strong>`).join('')}</div>${metricRow('Algemene markt',active.map(player=>Number.isFinite(Number(player.ownership))?`${Number(player.ownership).toLocaleString('nl-NL',{maximumFractionDigits:1})}%`:'—'))}${cohorts.map(cohort=>metricRow(`Top ${cohort} gekozen`,active.map(player=>cell(player,cohort)))).join('')}${metricRow('Top 100 vs markt',active.map(player=>{const gap=top100Row(player)?.eliteGapPercentagePoints;return gap===null||gap===undefined?'—':`${gap>0?'+':''}${Number(gap).toLocaleString('nl-NL',{maximumFractionDigits:1})} pp`}))}<div class="elite-compare-divider">Locked terugblik SR${round ?? '—'}</div>${metricRow('Basis',active.map(player=>cell(player,100,'starter')))}${metricRow('Captain',active.map(player=>cell(player,100,'captain')))}${metricRow('Netto transfers',active.map(player=>{const row=transfer(player);return row?(row.netTransfers>0?'+':'')+row.netTransfers:'—'}))}</div><p class="analysis-footnote">Basis en captain zijn historische keuzes bij de weergegeven deadline, niet een voorspelling voor de volgende ronde.</p></section>`
}

function selectedPlayers() {
  return Array.from(
    { length: state.slotCount },
    (_, index) => {
      const selectedKey =
        state.selectedPlayerKeys[index]

      return (
        playersForSlot(index).find(
          (player) =>
            playerComparisonKey(player) ===
            selectedKey,
        ) || null
      )
    },
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
  selectors.style.setProperty(
    '--analysis-count',
    state.slotCount,
  )

  selectors.innerHTML = safeHtml(Array.from(
    { length: state.slotCount },
    (_, index) => {
      const players =
        playersForSlot(index)

      return createPlayerSelector(
        index,
        seasons,
        state.slotSeasons[index],
        players,
        state.selectedPlayerKeys[index],
      )
    },
  ).join(''))

  document
    .querySelectorAll(
      '.analysis-season-select',
    )
    .forEach((select) => {
      select.addEventListener(
        'change',
        () => {
          const slotIndex = Number(
            select.dataset.seasonSlot,
          )

          state.slotSeasons[slotIndex] =
            select.value

          state.selectedPlayerKeys[
            slotIndex
          ] = null

          render()
        },
      )
    })

  document
    .querySelectorAll(
      '.analysis-player-search',
    )
    .forEach((input) => {
      const slotIndex = Number(
        input.dataset.slot,
      )

      const suggestions =
        document.querySelector(
          `[data-suggestions="${slotIndex}"]`,
        )

      function showSuggestions() {
        const query = input.value
          .trim()
          .toLowerCase()

        const currentPlayers =
          playersForSlot(slotIndex)

        const selectedElsewhere =
          new Set(
            state.selectedPlayerKeys.filter(
              (key, index) =>
                index !== slotIndex && key,
            ),
          )

        const matches = currentPlayers
          .filter(
            (player) =>
              !selectedElsewhere.has(
                playerComparisonKey(player),
              ),
          )
          .filter((player) => {
            if (!query) return true

            return (
              player.name
                .toLowerCase()
                .includes(query) ||
              player.club
                .toLowerCase()
                .includes(query)
            )
          })
          .slice(0, 12)

        suggestions.innerHTML =
          safeHtml(matches.length
            ? matches
                .map(
                  (player) => `
                    <button
                      type="button"
                      data-select-player="${playerComparisonKey(
                        player,
                      )}"
                      data-slot="${slotIndex}"
                    >
                      <strong>
                        ${player.name}
                      </strong>

                      <span>
                        ${player.club}
                        · ${player.position}
                        · ${player.season}
                      </span>
                    </button>
                  `,
                )
                .join('')
            : `
                <div class="analysis-no-results">
                  Geen speler gevonden
                </div>
              `)

        suggestions.classList.remove(
          'hidden',
        )

        suggestions
          .querySelectorAll(
            '[data-select-player]',
          )
          .forEach((button) => {
            button.addEventListener(
              'mousedown',
              (event) => {
                event.preventDefault()

                state.selectedPlayerKeys[
                  slotIndex
                ] =
                  button.dataset.selectPlayer

                render()
              },
            )
          })
      }

      input.addEventListener(
        'focus',
        showSuggestions,
      )

      input.addEventListener(
        'input',
        showSuggestions,
      )

      input.addEventListener(
        'blur',
        () => {
          window.setTimeout(
            () =>
              suggestions.classList.add(
                'hidden',
              ),
            120,
          )
        },
      )
    })

  document
    .querySelectorAll(
      '[data-clear-slot]',
    )
    .forEach((button) => {
      button.addEventListener(
        'click',
        () => {
          const slotIndex = Number(
            button.dataset.clearSlot,
          )

          state.selectedPlayerKeys[
            slotIndex
          ] = null

          render()
        },
      )
    })
}

  function renderOutput() {
  /*
   * Fantasy Outlook gebruikt zijn
   * eigen renderer en berekeningen.
   */
  if (
    state.mode ===
    'outlook'
  ) {
    output.innerHTML =
      safeHtml(renderFantasyOutlookComparison({
        players:
          selectedPlayers(),

        slotCount:
          state.slotCount,

        viewMode:
          state.viewMode,

        startRound:
          state.outlookStartRound,

        roundCount:
          state.outlookRoundCount,

        referencePlayers:
          allPlayers,
      }))

    bindFantasyOutlookComparison({
      root:
        output,

      onRoundCountChange:
        (
          roundCount,
        ) => {
          state.outlookRoundCount =
            Math.max(
              1,
              Math.min(
                10,
                Number(
                  roundCount,
                ) || 5,
              ),
            )

          renderOutput()
        },
    })

    return
  }

  /*
   * De bestaande vergelijking van
   * seizoensstatistieken blijft intact.
   */
  output.innerHTML =
    safeHtml(renderComparison(
      selectedPlayers(),
      state.slotCount,
      state.viewMode,
      state.enabledKeys,
      activePresetLabel(),
      state.collapsedCategories,
    ))

  output.insertAdjacentHTML('beforeend', safeHtml(renderEliteComparison(selectedPlayers())))

  output
    .querySelectorAll(
      '[data-category-toggle]',
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          () => {
            const categoryKey =
              button.dataset
                .categoryToggle

            if (
              state
                .collapsedCategories
                .has(
                  categoryKey,
                )
            ) {
              state
                .collapsedCategories
                .delete(
                  categoryKey,
                )
            } else {
              state
                .collapsedCategories
                .add(
                  categoryKey,
                )
            }

            renderOutput()
          },
        )
      },
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
  /*
   * Analysefilters horen uitsluitend
   * bij Seizoensstatistieken.
   */
  if (
    state.mode ===
    'outlook'
  ) {
    state.filtersOpen =
      false

    filterBackdrop.classList.add(
      'hidden',
    )

    filterHost.innerHTML =
      safeHtml('')

    return
  }

  filterBackdrop.classList.toggle(
    'hidden',
    !state.filtersOpen,
  )

  filterHost.innerHTML =
    safeHtml(state.filtersOpen
      ? renderFilterPanel(
          selectedPlayers(),
          state.viewMode,
          state.enabledKeys,
          state.presetKey,
        )
      : '')

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

  const seasonMode =
    state.mode ===
    'season'

  /*
   * De knop Analysefilters heeft binnen
   * Fantasy Outlook geen functie.
   */
  filterButton.classList.toggle(
    'hidden',
    !seasonMode,
  )

  if (
    seasonMode
  ) {
    updateFilterCount()
  }

  renderFilters()
}

modeButtons.forEach(
  (button) => {
    button.addEventListener(
      'click',
      () => {
        state.mode =
          button.dataset
            .analysisMode

        state.filtersOpen =
          false

        modeButtons.forEach(
          (item) => {
            item.classList.toggle(
              'active',
              item === button,
            )
          },
        )

        render()
      },
    )
  },
)

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

resetButton.addEventListener(
  'click',
  () => {
    state.slotSeasons =
      Array(4).fill(defaultSeason)

    state.selectedPlayerKeys =
      Array(4).fill(null)

    state.presetKey = 'all'

    state.mode =
  'season'

state.outlookStartRound =
  getAutomaticOutlookStartRound()

state.outlookRoundCount =
  5

state.filtersOpen =
  false

modeButtons.forEach(
  (button) => {
    button.classList.toggle(
      'active',
      button.dataset
        .analysisMode ===
        'season',
    )
  },
)

    state.enabledKeys =
      new Set(allStatKeys)

    render()
  },
)

  render()
}
