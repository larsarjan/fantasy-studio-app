import { safeHtml } from '../platform/html.js'
import {
  getDatabaseSummary,
} from '../services/database.js'

import {
  calculateFreeDreamTeam,
  calculateFantasyRulesDreamTeam,
  calculateBottomHalfDreamTeam,
  calculateDifferentialDreamTeam,
  getDreamTeamAvailableRounds,
} from '../services/dreamTeamEngine.js'

import {
  getPlayerImage,
} from '../services/playerImages.js'

import {
  getPlayerDetailProfile,
  renderPlayerDetailProfile,
} from './players.js'


/* =========================================================
   FANTASY STUDIO — DREAM TEAM
========================================================= */

let selectedSeason = ''
let selectedRound = null
let selectedDreamTeamType = 'free'

let selectedDreamTeamPlayerId = ''
let selectedDreamTeamPlayerSeason = ''
let selectedDreamTeamPlayerTab =
  'overview'

let selectedDreamTeamPlayerSchedule = {
  startRound: 1,
  count: 5,
  selectedFixtureId: null,
}


function cleanText(value) {
  return String(
    value ?? '',
  ).trim()
}


function escapeHtml(value) {
  return cleanText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}


function formatPoints(value) {
  const number =
    Number(value) || 0

  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(1).replace('.', ',')
}

function getDreamTeamPlayerPrice(player) {
  const endPrice =
    Number(player?.endPrice)

  if (
    Number.isFinite(endPrice) &&
    endPrice > 0
  ) {
    return endPrice
  }

  const startPrice =
    Number(player?.startPrice)

  return Number.isFinite(startPrice)
    ? startPrice
    : 0
}

function formatTeamPrice(team) {
  if (!team?.valid) {
    return '—'
  }

  const totalPrice =
    Array.isArray(team.players)
      ? team.players.reduce(
          (total, player) =>
            total +
            getDreamTeamPlayerPrice(
              player,
            ),
          0,
        )
      : 0

  return `€ ${new Intl.NumberFormat(
    'nl-NL',
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ).format(totalPrice)} mln`
}

function getPositionLabel(position) {
  const normalized =
    cleanText(position)
      .toLowerCase()

  if (normalized === 'keeper') {
    return 'Doelman'
  }

  if (normalized === 'verdediger') {
    return 'Verdediger'
  }

  if (normalized === 'middenvelder') {
    return 'Middenvelder'
  }

  if (normalized === 'aanvaller') {
    return 'Spits'
  }

  return position || 'Speler'
}


/* =========================================================
   INITIËLE FILTERS
========================================================= */

function ensureSelection() {
  const summary =
    getDatabaseSummary()

  if (!selectedSeason) {
    selectedSeason =
      summary.activeSeason ||
      '2026/2027'
  }

  const rounds =
    getDreamTeamAvailableRounds(
      selectedSeason,
    )

  if (
    !selectedRound ||
    !rounds.includes(
      Number(selectedRound),
    )
  ) {
    selectedRound =
      rounds.at(-1) ??
      1
  }

  return {
    summary,
    rounds,
  }
}


/* =========================================================
   SPELER OP HET VELD
========================================================= */

function renderPitchPlayer(player) {
  if (!player) {
    return ''
  }

  const playerImage =
    getPlayerImage(
      `${player.id}.webp`,
    )

  const initial =
    cleanText(
      player.name,
    )
      .charAt(0)
      .toUpperCase()

  return `
    <article
      class="dreamteam-player dreamteam-player-clickable"
      title="Open profiel van ${escapeHtml(
        player.name,
      )}"
      data-dreamteam-player-id="${escapeHtml(
        player.id,
      )}"
      data-dreamteam-player-season="${escapeHtml(
        player.season,
      )}"
      role="button"
      tabindex="0"
    >
      <div class="dreamteam-player-avatar">
        ${
          playerImage
            ? `
              <img
                class="dreamteam-player-photo"
                src="${playerImage}"
                alt="${escapeHtml(
                  player.name,
                )}"
                loading="lazy"
              />
            `
            : `
              <span aria-hidden="true">
                ${escapeHtml(initial)}
              </span>
            `
        }
      </div>

      <strong>
        ${escapeHtml(player.name)}
      </strong>

      <span class="dreamteam-player-club">
        ${escapeHtml(player.club)}
      </span>

      <span class="dreamteam-player-points">
        ${formatPoints(
          player.fantasyPoints,
        )} pt
      </span>
    </article>
  `
}


function renderPitchLine(
  players,
  className,
) {
  return `
    <div class="dreamteam-line ${className}">
      ${players
        .map(
          renderPitchPlayer,
        )
        .join('')}
    </div>
  `
}


/* =========================================================
   VELD
========================================================= */

function renderPitch(team) {
  if (!team?.valid) {
    return `
      <div class="dreamteam-empty">
        <strong>
          Nog geen volledig Dream Team beschikbaar
        </strong>

        <p>
          ${escapeHtml(
            team?.message ||
            'Er is nog onvoldoende afgeronde wedstrijddata.',
          )}
        </p>
      </div>
    `
  }

  return `
    <div class="dreamteam-pitch">
      <div class="dreamteam-pitch-markings">
        <div class="dreamteam-box dreamteam-box-top"></div>
        <div class="dreamteam-center-line"></div>
        <div class="dreamteam-center-circle"></div>
        <div class="dreamteam-box dreamteam-box-bottom"></div>
      </div>

      <div class="dreamteam-pitch-content">
        ${renderPitchLine(
          team.positions.attackers,
          'dreamteam-line-attack',
        )}

        ${renderPitchLine(
          team.positions.midfielders,
          'dreamteam-line-midfield',
        )}

        ${renderPitchLine(
          team.positions.defenders,
          'dreamteam-line-defense',
        )}

        ${renderPitchLine(
          team.positions.keeper,
          'dreamteam-line-keeper',
        )}
      </div>
    </div>
  `
}


/* =========================================================
   SAMENVATTING
========================================================= */

function renderSummary(team) {
  return `
    <div class="dreamteam-summary">
      <article>
        <span>Totale punten</span>
        <strong>
          ${formatPoints(
            team?.totalPoints,
          )}
        </strong>
      </article>

      <article>
        <span>Formatie</span>
        <strong>
          ${escapeHtml(
            team?.formation ||
            '—',
          )}
        </strong>
      </article>

      <article>
  <span>Teamwaarde</span>
  <strong>
    ${formatTeamPrice(team)}
  </strong>
</article>

      <article>
        <span>Variant</span>
        <strong>
         ${selectedDreamTeamType === 'fantasy-rules'
  ? 'Fantasy-regels'
  : selectedDreamTeamType === 'bottom-half'
    ? 'Rechterrijtje'
    : selectedDreamTeamType === 'differential'
      ? '≤5% gekozen'
      : 'Vrij'}
        </strong>
      </article>
    </div>
  `
}


/* =========================================================
   LIJST ONDER HET VELD
========================================================= */

function renderPlayerTable(team) {
  if (!team?.valid) {
    return ''
  }

  const players =
    [
      ...team.positions.keeper,
      ...team.positions.defenders,
      ...team.positions.midfielders,
      ...team.positions.attackers,
    ]

  return `
    <section class="dreamteam-list-card">
      <div class="dreamteam-card-heading">
        <div>
          <span class="eyebrow">
            Selectie
          </span>

          <h3>
            Beste 11 van speelronde ${team.round}
          </h3>
        </div>

        <strong>
          ${escapeHtml(team.formation)}
        </strong>
      </div>

      <div class="dreamteam-table-wrap">
        <table class="dreamteam-table">
          <thead>
            <tr>
              <th>Positie</th>
              <th>Speler</th>
              <th>Club</th>
              <th>Minuten</th>
              <th>Punten</th>
            </tr>
          </thead>

          <tbody>
            ${players
              .map(
                (player) => `
                  <tr
  class="dreamteam-table-player"
  data-dreamteam-player-id="${escapeHtml(
    player.id,
  )}"
  data-dreamteam-player-season="${escapeHtml(
    player.season,
  )}"
  tabindex="0"
>
                    <td>
                      ${escapeHtml(
                        getPositionLabel(
                          player.position,
                        ),
                      )}
                    </td>

                    <td>
                      <strong>
                        ${escapeHtml(
                          player.name,
                        )}
                      </strong>
                    </td>

                    <td>
                      ${escapeHtml(
                        player.club,
                      )}
                    </td>

                    <td>
                      ${player.minutes}'
                    </td>

                    <td>
                      <strong>
                        ${formatPoints(
                          player.fantasyPoints,
                        )}
                      </strong>
                    </td>
                  </tr>
                `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `
}

function renderDreamTeamPlayerDrawer() {
  if (!selectedDreamTeamPlayerId) {
    return ''
  }

  const player =
    getPlayerDetailProfile({
      playerId:
        selectedDreamTeamPlayerId,

      season:
        selectedDreamTeamPlayerSeason,
    })

  if (!player) {
    return ''
  }

  return `
    <div
      class="dreamteam-profile-backdrop"
      data-dreamteam-profile-close
    ></div>

    <aside
      class="dreamteam-profile-drawer"
      aria-label="Spelerprofiel"
    >
      <div
        class="dreamteam-profile-drawer-top"
      >
        <span>
          Spelerprofiel
        </span>

        <button
          type="button"
          class="dreamteam-profile-close"
          data-dreamteam-profile-close
          aria-label="Sluit spelerprofiel"
        >
          ×
        </button>
      </div>

      <div
        class="dreamteam-profile-drawer-content"
      >
        ${renderPlayerDetailProfile(
          player,
          selectedDreamTeamPlayerTab,
          selectedDreamTeamPlayerSchedule,
        )}
      </div>
    </aside>
  `
}

/* =========================================================
   HOOFDSCHERM
========================================================= */

export function createDreamTeamScreen() {
  const {
    rounds,
  } =
    ensureSelection()

  const team =
  selectedDreamTeamType === 'fantasy-rules'
    ? calculateFantasyRulesDreamTeam({
        season:
          selectedSeason,

        round:
          selectedRound,

        maximumBudget: 100,
        maximumPlayersPerClub: 3,
      })
    : selectedDreamTeamType === 'bottom-half'
      ? calculateBottomHalfDreamTeam({
          season:
            selectedSeason,

          round:
            selectedRound,
        })
      : selectedDreamTeamType === 'differential'
        ? calculateDifferentialDreamTeam({
            season:
              selectedSeason,

            round:
              selectedRound,

            maximumSelectedPct: 5,
          })
        : calculateFreeDreamTeam({
            season:
              selectedSeason,

            round:
              selectedRound,
          })

const dreamTeamTitle =
  selectedDreamTeamType === 'fantasy-rules'
    ? 'Fantasy-regels'
    : selectedDreamTeamType === 'bottom-half'
      ? 'Rechterrijtje Dream Team'
      : selectedDreamTeamType === 'differential'
        ? '≤5% gekozen'
        : 'Vrij Dream Team'

  return `
    <section class="dreamteam-module">
      <section class="panel dreamteam-heading">
        <div>
          <span class="eyebrow">
            Fantasy Studio
          </span>

          <h2>
            Dream Team
          </h2>

          <p>
            De beste geldige opstelling op basis van
            daadwerkelijk behaalde Fantasy-punten.
          </p>
        </div>

        <div class="dreamteam-controls">
          <label>
            <span>Seizoen</span>

            <select id="dreamteam-season">
              <option value="${escapeHtml(
                selectedSeason,
              )}">
                ${escapeHtml(
                  selectedSeason,
                )}
              </option>
            </select>
          </label>

          <label>
            <span>Speelronde</span>

            <select id="dreamteam-round">
              ${rounds.length
                ? rounds
                    .map(
                      (round) => `
                        <option
                          value="${round}"
                          ${
                            Number(round) ===
                            Number(selectedRound)
                              ? 'selected'
                              : ''
                          }
                        >
                          Speelronde ${round}
                        </option>
                      `,
                    )
                    .join('')
                : `
                    <option value="1">
                      Speelronde 1
                    </option>
                  `
              }
            </select>
          </label>

          <label>
            <span>Dream Team</span>

            <select id="dreamteam-type">
  <option
    value="free"
    ${
      selectedDreamTeamType === 'free'
        ? 'selected'
        : ''
    }
  >
    Vrij Dream Team
  </option>

  <option
    value="fantasy-rules"
    ${
      selectedDreamTeamType === 'fantasy-rules'
        ? 'selected'
        : ''
    }
  >
    Fantasy-regels
  </option>
  <option
  value="bottom-half"
  ${
    selectedDreamTeamType === 'bottom-half'
      ? 'selected'
      : ''
  }
>
  Rechterrijtje
</option>

<option
  value="differential"
  ${
    selectedDreamTeamType === 'differential'
      ? 'selected'
      : ''
  }
>
  ≤5% gekozen
</option>

</select>
          </label>
        </div>
      </section>

      ${renderSummary(team)}

      <section class="dreamteam-main-grid">
        <section class="dreamteam-pitch-card">
          <div class="dreamteam-card-heading">
            <div>
              <span class="eyebrow">
                Speelronde ${selectedRound}
              </span>

              <h3>
                ${dreamTeamTitle}
              </h3>
            </div>

            <strong>
              ${team.valid
                ? `${formatPoints(
                    team.totalPoints,
                  )} punten`
                : 'Nog niet beschikbaar'
              }
            </strong>
          </div>

          ${renderPitch(team)}
        </section>
      </section>

      ${renderPlayerTable(team)}

${renderDreamTeamPlayerDrawer()}
</section>
`
}


/* =========================================================
   MOUNT
========================================================= */

export function mountDreamTeamScreen() {

      const typeSelect =
    document.querySelector(
      '#dreamteam-type',
    )

  const roundSelect =
    document.querySelector(
      '#dreamteam-round',
    )

  if (typeSelect) {
    typeSelect.addEventListener(
      'change',
      () => {
        selectedDreamTeamType =
          typeSelect.value

        const pageContent =
          document.querySelector(
            '#page-content',
          )

        if (!pageContent) {
          return
        }

        pageContent.innerHTML =
          safeHtml(createDreamTeamScreen())

        mountDreamTeamScreen()
      },
    )
      document
    .querySelectorAll(
      '[data-dreamteam-player-id]',
    )
    .forEach(
      (element) => {
        
function openPlayer() {
  selectedDreamTeamPlayerId =
    element.dataset
      .dreamteamPlayerId

  selectedDreamTeamPlayerSeason =
    element.dataset
      .dreamteamPlayerSeason

  selectedDreamTeamPlayerTab =
    'overview'

  selectedDreamTeamPlayerSchedule = {
    startRound:
      Number(selectedRound) + 1,

    count: 5,

    selectedFixtureId:
      null,
  }

  const pageContent =
    document.querySelector(
      '#page-content',
    )

  if (!pageContent) {
    return
  }

  pageContent.innerHTML =
    safeHtml(createDreamTeamScreen())

  mountDreamTeamScreen()
}

        element.addEventListener(
          'click',
          openPlayer,
        )

        element.addEventListener(
          'keydown',
          (event) => {
            if (
              event.key === 'Enter' ||
              event.key === ' '
            ) {
              event.preventDefault()
              openPlayer()
            }
          },
        )
      },
    )
  }

  if (roundSelect) {
    roundSelect.addEventListener(
      'change',
      () => {
        selectedRound =
          Number(
            roundSelect.value,
          )

        const pageContent =
          document.querySelector(
            '#page-content',
          )

        if (!pageContent) {
          return
        }

        pageContent.innerHTML =
          safeHtml(createDreamTeamScreen())

        mountDreamTeamScreen()
      },
    )
  }
    document
    .querySelectorAll(
      '[data-dreamteam-profile-close]',
    )
    .forEach(
      (element) => {
        element.addEventListener(
          'click',
          () => {
            selectedDreamTeamPlayerId =
              ''

            selectedDreamTeamPlayerSeason =
              ''

            selectedDreamTeamPlayerTab =
              'overview'

            selectedDreamTeamPlayerSchedule = {
              startRound: 1,
              count: 5,
              selectedFixtureId: null,
            }

            const pageContent =
              document.querySelector(
                '#page-content',
              )

            if (!pageContent) {
              return
            }

            pageContent.innerHTML =
              safeHtml(createDreamTeamScreen())

            mountDreamTeamScreen()
          },
        )
      },
    )

  document
    .querySelectorAll(
      '.dreamteam-profile-drawer [data-player-detail-tab]',
    )
    .forEach(
      (tab) => {
        tab.addEventListener(
          'click',
          () => {
            selectedDreamTeamPlayerTab =
              tab.dataset
                .playerDetailTab

            selectedDreamTeamPlayerSchedule
              .selectedFixtureId =
                null

            const pageContent =
              document.querySelector(
                '#page-content',
              )

            if (!pageContent) {
              return
            }

            pageContent.innerHTML =
              safeHtml(createDreamTeamScreen())

            mountDreamTeamScreen()
          },
        )
      },
    )
}
