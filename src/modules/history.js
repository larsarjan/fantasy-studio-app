import {renderHistoricalMatchContent} from './historicalScoreView.js'
import { safeHtml } from '../platform/html.js'
import {
  getFixtures,
  getPlayers,
  getHistoricalPlayers,
  getPlayerMatchStats,
  getResults,
} from '../services/database.js'
import { resolveHistoricalMatch } from '../services/historicalMatchDetails.js'

import {
  calculateStandings,
  formatHistoryDate,
  getClubMatches,
  getHeadToHead,
  getHistoryClubs,
  getHistorySeasons,
  summarizeHeadToHead,
  summarizeMatches,
} from '../services/historyAnalytics.js'

import {
  compareResultsChronologically,
  getHistoryPlayerProfileId,
  getLatestProcessedRound,
} from '../services/historyPresentation.js'

import {
  getPlayerDetailProfile,
  renderPlayerDetailProfile,
} from './players.js'

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0)
}

function getResultKey(result) {
  return String(
    result.id ||
    [
      result.season,
      result.round,
      result.date,
      result.home,
      result.away,
    ].join('|'),
  )
}

function renderMatchDetails(result,fixtures,players) {
 return renderHistoricalMatchContent(resolveHistoricalMatch(result,fixtures,players,getPlayerMatchStats()),result)
}

function renderForm(matches) {
  if (!matches.length) {
    return `
      <span class="history-empty-text">
        Geen wedstrijden beschikbaar
      </span>
    `
  }

  return `
    <div class="history-form">
      ${matches
        .map(
          (match) => `
            <span
              class="history-form-result history-form-${match.outcome.toLowerCase()}"
              title="${match.opponent}: ${match.goalsFor}-${match.goalsAgainst}"
            >
              ${match.outcome}
            </span>
          `,
        )
        .join('')}
    </div>
  `
}

function renderStandings(results, season) {
  const standings = calculateStandings(
    results,
    season,
  )

  return `
    <section class="history-card">
      <div class="history-card-heading">
        <div>
          <span class="eyebrow">
            Automatisch berekend
          </span>

          <h3>
  ${
    season === getHistorySeasons(results)[0]
      ? 'Stand'
      : 'Eindstand'
  } ${season}
</h3>
        </div>

        <strong>
          ${standings.length} clubs
        </strong>
      </div>

      <div class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Club</th>
              <th>GS</th>
              <th>W</th>
              <th>G</th>
              <th>V</th>
              <th>DV</th>
              <th>DT</th>
              <th>DS</th>
              <th>PT</th>
            </tr>
          </thead>

          <tbody>
            ${standings
              .map(
                (team, index) => `
                  <tr>
                    <td>
                      <strong>${index + 1}</strong>
                    </td>

                    <td>
                      <strong>${team.club}</strong>
                    </td>

                    <td>${team.played}</td>
                    <td>${team.wins}</td>
                    <td>${team.draws}</td>
                    <td>${team.losses}</td>
                    <td>${team.goalsFor}</td>
                    <td>${team.goalsAgainst}</td>

                    <td>
                      ${team.goalDifference > 0 ? '+' : ''}
                      ${team.goalDifference}
                    </td>

                    <td>
                      <strong>${team.points}</strong>
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

function renderResults(
  results,
  state,
  fixtures,
  players,
) {
  const filteredResults =
    results
      .filter(
        (result) =>
          result.season ===
          state.season,
      )
      .filter(
        (result) =>
          !state.club ||
          result.home === state.club ||
          result.away === state.club,
      )
      .filter(
        (result) =>
          !state.round ||
          Number(result.round) ===
            Number(state.round),
      )
      .sort((left, right) =>
        compareResultsChronologically(left, right, fixtures),
      )

  return `
    <section class="history-card">
      <div class="history-card-heading">
        <div>
          <span class="eyebrow">
            Wedstrijdarchief
          </span>

          <h3>
            Uitslagen ${state.season}
            ${
              state.round
                ? ` · Speelronde ${state.round}`
                : ''
            }
            ${
              state.club
                ? ` · ${state.club}`
                : ''
            }
          </h3>
        </div>

        <strong>
          ${filteredResults.length}
          wedstrijden
        </strong>
      </div>

      <div class="history-results-list">
        ${
          filteredResults.length
            ? filteredResults
                .map(
                  (result) => {
                    const key =
                      getResultKey(
                        result,
                      )

                    const expanded =
                      state.expandedMatch ===
                      key

                    const fixture = resolveHistoricalMatch(result, fixtures, [], []).fixture
                    const time = fixture?.time

                    return `
                      <article
                        class="history-result-item ${
                          expanded
                            ? 'expanded'
                            : ''
                        }"
                      >
                        <button
                          class="history-result-toggle"
                          type="button"
                          data-history-result="${key}"
                          aria-expanded="${
                            expanded
                              ? 'true'
                              : 'false'
                          }"
                        >
                          <span class="history-result-row">
                            <span class="history-result-date">
                              ${formatHistoryDate(
                                result.date,
                              )}
                              ${time ? ` · ${time}` : ''}
                            </span>

                            <strong class="history-home-team">
                              ${result.home}
                            </strong>

                            <b class="history-score">
                              ${result.homeScore}
                              –
                              ${result.awayScore}
                            </b>

                            <strong class="history-away-team">
                              ${result.away}
                            </strong>

                            <span class="history-result-chevron">
                              ${
                                expanded
                                  ? '⌃'
                                  : '⌄'
                              }
                            </span>
                          </span>
                        </button>

                        ${
                          expanded
                            ? renderMatchDetails(
                                result,
                                fixtures,
                                players,
                              )
                            : ''
                        }
                      </article>
                    `
                  },
                )
                .join('')
            : `
                <div class="history-empty">
                  Geen uitslagen gevonden.
                </div>
              `
        }
      </div>
    </section>
  `
}

function renderHeadToHead(results, state) {
  const matches =
    state.clubA &&
    state.clubB &&
    state.clubA !== state.clubB
      ? getHeadToHead(
          results,
          state.clubA,
          state.clubB,
          20,
        )
      : []

  const summaryA = summarizeHeadToHead(
    matches,
    state.clubA,
  )

  const summaryB = summarizeHeadToHead(
    matches,
    state.clubB,
  )

  return `
    <section class="history-card">
      <div class="history-card-heading">
        <div>
          <span class="eyebrow">
            Onderlinge resultaten
          </span>

          <h3>
            ${state.clubA || 'Club 1'}
            –
            ${state.clubB || 'Club 2'}
          </h3>
        </div>

        <strong>
          ${matches.length} duels
        </strong>
      </div>

      ${
        matches.length
          ? `
            <div class="history-h2h-summary">
              <article>
                <span>${state.clubA}</span>
                <strong>
                  ${summaryA.wins} zeges
                </strong>
              </article>

              <article>
                <span>Gelijk</span>
                <strong>
                  ${summaryA.draws}
                </strong>
              </article>

              <article>
                <span>${state.clubB}</span>
                <strong>
                  ${summaryB.wins} zeges
                </strong>
              </article>

              <article>
                <span>Gemiddeld goals</span>

                <strong>
                  ${formatNumber(
                    (
                      summaryA.goalsFor +
                      summaryA.goalsAgainst
                    ) / matches.length,
                  )}
                </strong>
              </article>
            </div>

            <div class="history-results-list">
              ${matches
                .map(
                  (result) => `
                    <article class="history-result-row">
                      <span class="history-result-date">
                        ${formatHistoryDate(result.date)}
                      </span>

                      <strong class="history-home-team">
                        ${result.home}
                      </strong>

                      <b class="history-score">
                        ${result.homeScore}
                        –
                        ${result.awayScore}
                      </b>

                      <strong class="history-away-team">
                        ${result.away}
                      </strong>
                    </article>
                  `,
                )
                .join('')}
            </div>
          `
          : `
            <div class="history-empty">
              Kies twee verschillende clubs.
            </div>
          `
      }
    </section>
  `
}

function renderFormAnalysis(
  results,
  state,
) {
  if (!state.club) {
    const clubs = getHistoryClubs(results, state.season)
    const rows = clubs.map((club) => {
      const matches = getClubMatches(results, club, {
        season: state.season,
        limit: state.formCount,
      })
      return { club, matches, summary: summarizeMatches(matches) }
    }).sort((left, right) =>
      right.summary.points - left.summary.points ||
      (right.summary.goalsFor - right.summary.goalsAgainst) -
        (left.summary.goalsFor - left.summary.goalsAgainst) ||
      left.club.localeCompare(right.club, 'nl'),
    )

    return `
      <section class="history-card history-form-overview">
        <div class="history-card-heading">
          <div>
            <span class="eyebrow">Alle clubs</span>
            <h3>Vormoverzicht · laatste ${state.formCount}</h3>
          </div>
          <strong>${clubs.length} clubs</strong>
        </div>
        <div class="history-form-club-list">
          ${rows.map(({ club, matches, summary }) => `
            <button type="button" data-history-form-club="${String(club).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">
              <strong>${club}</strong>
              ${renderForm(matches)}
              <span>${summary.points}/${matches.length * 3} pt</span>
              <small>${summary.goalsFor} voor · ${summary.goalsAgainst} tegen</small>
            </button>
          `).join('')}
        </div>
      </section>
    `
  }

  const recentMatches = getClubMatches(
    results,
    state.club,
    {
      season: state.season,
      limit: state.formCount,
    },
  )

  const homeMatches = getClubMatches(
    results,
    state.club,
    {
      season: state.season,
      venue: 'home',
    },
  )

  const awayMatches = getClubMatches(
    results,
    state.club,
    {
      season: state.season,
      venue: 'away',
    },
  )

  const recentSummary =
    summarizeMatches(recentMatches)

  const homeSummary =
    summarizeMatches(homeMatches)

  const awaySummary =
    summarizeMatches(awayMatches)

  return `
    <section class="history-card">
      <div class="history-card-heading">
        <div>
          <span class="eyebrow">
            Vormanalyse
          </span>

          <h3>
            ${state.club} · ${state.season}
          </h3>
        </div>

        ${renderForm(recentMatches)}
      </div>

      <div class="history-kpi-grid">
        <article>
          <span>Punten per duel</span>

          <strong>
            ${formatNumber(
              recentSummary.pointsPerGame,
            )}
          </strong>
        </article>

        <article>
          <span>Goals per duel</span>

          <strong>
            ${formatNumber(
              recentSummary.averageGoalsFor,
            )}
          </strong>
        </article>

        <article>
          <span>Tegengoals per duel</span>

          <strong>
            ${formatNumber(
              recentSummary.averageGoalsAgainst,
            )}
          </strong>
        </article>

        <article>
          <span>Clean sheets</span>

          <strong>
            ${recentSummary.cleanSheetPercentage.toFixed(0)}%
          </strong>
        </article>

        <article>
          <span>Beide teams scoren</span>

          <strong>
            ${recentSummary.bothTeamsScoredPercentage.toFixed(0)}%
          </strong>
        </article>

        <article>
          <span>Over 2,5 goals</span>

          <strong>
            ${recentSummary.over25Percentage.toFixed(0)}%
          </strong>
        </article>
      </div>

      <div class="history-split-grid">
        <article>
          <span class="eyebrow">
            Thuisbalans
          </span>

          <h4>
            ${homeSummary.wins}W ·
            ${homeSummary.draws}G ·
            ${homeSummary.losses}V
          </h4>

          <p>
            ${formatNumber(
              homeSummary.averageGoalsFor,
            )} voor ·

            ${formatNumber(
              homeSummary.averageGoalsAgainst,
            )} tegen
          </p>
        </article>

        <article>
          <span class="eyebrow">
            Uitbalans
          </span>

          <h4>
            ${awaySummary.wins}W ·
            ${awaySummary.draws}G ·
            ${awaySummary.losses}V
          </h4>

          <p>
            ${formatNumber(
              awaySummary.averageGoalsFor,
            )} voor ·

            ${formatNumber(
              awaySummary.averageGoalsAgainst,
            )} tegen
          </p>
        </article>
      </div>

      <div class="history-results-list">
        ${recentMatches
          .map(
            (match) => `
              <article class="history-result-row">
                <span class="history-result-date">
                  ${formatHistoryDate(match.date)}
                </span>

                <strong class="history-home-team">
                  ${match.home}
                </strong>

                <b class="history-score">
                  ${match.homeScore}
                  –
                  ${match.awayScore}
                </b>

                <strong class="history-away-team">
                  ${match.away}
                </strong>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

export function createHistoryScreen() {
  const results = getResults()

  const seasons =
    getHistorySeasons(results)

  return `
    <section class="panel history-module">
      <div class="panel-heading history-heading">
        <div>
          <span class="eyebrow">
            Historische database
          </span>

          <h2>
            Standen, uitslagen en vorm
          </h2>

          <p>
            ${results.length}
            historische uitslagen geladen.
          </p>
        </div>

        <label class="history-season-control">
          <span>Seizoen</span>

          <select id="history-season">
            ${seasons
              .map(
                (season) => `
                  <option value="${season}">
                    ${season}
                  </option>
                `,
              )
              .join('')}
          </select>
        </label>
      </div>

      <div class="history-tabs">
        <button
          class="history-tab active"
          data-history-tab="standings"
          type="button"
        >
          Stand
        </button>

        <button
          class="history-tab"
          data-history-tab="results"
          type="button"
        >
          Uitslagen
        </button>

        <button
          class="history-tab"
          data-history-tab="h2h"
          type="button"
        >
          Onderling
        </button>

        <button
          class="history-tab"
          data-history-tab="form"
          type="button"
        >
          Vorm
        </button>
      </div>

      <div id="history-controls"></div>
      <div id="history-content"></div>
    </section>
  `
}

export function mountHistoryScreen() {
  const results = getResults()
  const fixtures = getFixtures()
  const players = [...getPlayers(), ...getHistoricalPlayers()]

  const seasons =
    getHistorySeasons(results)

  const state = {
    tab: 'standings',
    season: seasons[0] || '',
    club: '',
    clubA: '',
    clubB: '',
    formCount: 5,

    round: getLatestProcessedRound(results, seasons[0] || ''),
    expandedMatch: '',
    playerId: '',
    playerTab: 'overview',
  }

  const seasonSelect =
    document.querySelector(
      '#history-season',
    )

  const controls =
    document.querySelector(
      '#history-controls',
    )

  const content =
    document.querySelector(
      '#history-content',
    )

  const tabs = [
    ...document.querySelectorAll(
      '.history-tab',
    ),
  ]

  function closePlayerDrawer() {
    state.playerId = ''
    state.playerTab = 'overview'
    document.querySelector('#history-player-drawer-root')?.remove()
  }

  function renderPlayerDrawer() {
    document.querySelector('#history-player-drawer-root')?.remove()
    if (!state.playerId) return

    const profile = getPlayerDetailProfile({
      playerId: state.playerId,
      season: state.season,
    })
    if (!profile) return

    const root = document.createElement('div')
    root.id = 'history-player-drawer-root'
    root.innerHTML = safeHtml(`<div class="intel-backdrop history-player-backdrop"></div><aside class="intel-drawer" aria-label="Spelerprofiel"><header><span>Spelerprofiel</span><button type="button" data-history-player-close aria-label="Sluit spelerprofiel">×</button></header><div>${renderPlayerDetailProfile(profile, state.playerTab, { startRound: Number(state.round) || 1, count: 5, selectedFixtureId: null })}</div></aside>`)
    document.querySelector('#page-content')?.append(root)

    root.querySelectorAll('[data-history-player-close]').forEach((element) => {
      element.addEventListener('click', closePlayerDrawer)
    })
    root.querySelectorAll('[data-player-detail-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.playerTab = tab.dataset.playerDetailTab
        renderPlayerDrawer()
      })
    })
  }

  function mountMatchPlayerLinks() {
    document.querySelectorAll('[data-history-player]').forEach((element) => {
      element.addEventListener('click', () => {
        state.playerId = element.dataset.historyPlayer
        state.playerTab = 'overview'
        renderPlayerDrawer()
      })
    })
  }

  function currentClubs() {
    return getHistoryClubs(
      results,
      state.season,
    )
  }

  function currentRounds() {
  return [
    ...new Set(
      results
        .filter(
          (result) =>
            result.season ===
            state.season,
        )
        .map(
          (result) =>
            Number(result.round),
        )
        .filter(
          (round) =>
            Number.isFinite(round) &&
            round >= 1 &&
            round <= 34,
        ),
    ),
  ].sort(
    (left, right) =>
      left - right,
  )
}

  function renderClubOptions(
    selectedClub = '',
  ) {
    return currentClubs()
      .map(
        (club) => `
          <option
            value="${club}"
            ${
              club === selectedClub
                ? 'selected'
                : ''
            }
          >
            ${club}
          </option>
        `,
      )
      .join('')
  }

  function renderControls() {
    if (state.tab === 'standings') {
      controls.innerHTML = safeHtml('')
      return
    }

    if (state.tab === 'results') {
  controls.innerHTML = safeHtml(`
    <div class="history-controls history-controls-double">
      <label>
        <span>Speelronde</span>

        <select id="history-round">
          <option value="">
            Alle speelrondes
          </option>

          ${currentRounds()
            .map(
              (round) => `
                <option
                  value="${round}"
                  ${
                    Number(
                      state.round,
                    ) === round
                      ? 'selected'
                      : ''
                  }
                >
                  Speelronde ${round}
                </option>
              `,
            )
            .join('')}
        </select>
      </label>

      <label>
        <span>Club</span>

        <select id="history-club">
          <option value="">
            Alle clubs
          </option>

          ${renderClubOptions(
            state.club,
          )}
        </select>
      </label>
    </div>
  `)

  document
    .querySelector(
      '#history-round',
    )
    .addEventListener(
      'change',
      (event) => {
        state.round =
          event.target.value

        state.expandedMatch = ''

        renderContent()
      },
    )

  document
    .querySelector(
      '#history-club',
    )
    .addEventListener(
      'change',
      (event) => {
        state.club =
          event.target.value

        state.expandedMatch = ''

        renderContent()
      },
    )

  return
}

    if (state.tab === 'h2h') {
      controls.innerHTML = safeHtml(`
        <div class="history-controls history-controls-double">
          <label>
            <span>Club 1</span>

            <select id="history-club-a">
              <option value="">
                Kies een club
              </option>

              ${renderClubOptions(
                state.clubA,
              )}
            </select>
          </label>

          <label>
            <span>Club 2</span>

            <select id="history-club-b">
              <option value="">
                Kies een club
              </option>

              ${renderClubOptions(
                state.clubB,
              )}
            </select>
          </label>
        </div>
      `)

      document
        .querySelector(
          '#history-club-a',
        )
        .addEventListener(
          'change',
          (event) => {
            state.clubA =
              event.target.value

            renderContent()
          },
        )

      document
        .querySelector(
          '#history-club-b',
        )
        .addEventListener(
          'change',
          (event) => {
            state.clubB =
              event.target.value

            renderContent()
          },
        )

      return
    }

    controls.innerHTML = safeHtml(`
      <div class="history-controls history-controls-double">
        <label>
          <span>Club</span>

          <select id="history-form-club">
            <option value="">
              Alle clubs
            </option>

            ${renderClubOptions(
              state.club,
            )}
          </select>
        </label>

        <label>
          <span>Aantal wedstrijden</span>

          <select id="history-form-count">
            <option
              value="5"
              ${
                state.formCount === 5
                  ? 'selected'
                  : ''
              }
            >
              Laatste 5
            </option>

            <option
              value="10"
              ${
                state.formCount === 10
                  ? 'selected'
                  : ''
              }
            >
              Laatste 10
            </option>
          </select>
        </label>
      </div>
    `)

    document
      .querySelector(
        '#history-form-club',
      )
      .addEventListener(
        'change',
        (event) => {
          state.club =
            event.target.value

          renderContent()
        },
      )

    document
      .querySelector(
        '#history-form-count',
      )
      .addEventListener(
        'change',
        (event) => {
          state.formCount =
            Number(event.target.value)

          renderContent()
        },
      )
  }

  function renderContent() {
    if (state.tab === 'standings') {
      content.innerHTML =
        safeHtml(renderStandings(
          results,
          state.season,
        ))

      return
    }

    if (state.tab === 'results') {
      content.innerHTML =
        safeHtml(renderResults(
          results,
          state,
          fixtures,
          players,
        ))

document
  .querySelectorAll(
    '.history-result-toggle',
  )
  .forEach(
    (button) => {
      button.addEventListener(
        'click',
        () => {
          const key =
            button.dataset
              .historyResult

          state.expandedMatch =
            state.expandedMatch ===
            key
              ? ''
              : key

          renderContent()
        },
      )
    },
  )

      mountMatchPlayerLinks()

      return
    }

    if (state.tab === 'h2h') {
      content.innerHTML =
        safeHtml(renderHeadToHead(
          results,
          state,
        ))

      return
    }

    content.innerHTML =
      safeHtml(renderFormAnalysis(
        results,
        state,
      ))

    document.querySelectorAll('[data-history-form-club]').forEach((button) => {
      button.addEventListener('click', () => {
        state.club = button.dataset.historyFormClub
        render()
      })
    })
  }

  function render() {
    renderControls()
    renderContent()
  }

  tabs.forEach((tab) => {
    tab.addEventListener(
      'click',
      () => {
        state.tab =
          tab.dataset.historyTab

        tabs.forEach((item) => {
          item.classList.toggle(
            'active',
            item === tab,
          )
        })

        render()
      },
    )
  })

  seasonSelect.value = state.season

  seasonSelect.addEventListener(
    'change',
    () => {
      state.season =
        seasonSelect.value

      state.club = ''
      state.clubA = ''
      state.clubB = ''
      state.round = getLatestProcessedRound(results, state.season)

      render()
    },
  )

  render()
}
