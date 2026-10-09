import {
  buildFantasyOutlookComparison,
} from '../services/fantasyOutlookComparisonEngine.js'

import { renderPlayerAvatar } from '../services/playerPhotos.js'

import {
  getFixtureScoreColor,
} from '../services/fixtureIntelligenceEngine.js'
import { getEuropeanFixtures, getFixtures } from '../services/database.js'
import { getEuropeanFixturesForClub, europeanFixtureTimestamp } from '../services/europeanFixtureContext.js'

/*
|--------------------------------------------------------------------------
| Fantasy Outlook — vergelijkingsscherm
|--------------------------------------------------------------------------
|
| Dit bestand bevat uitsluitend de presentatie.
|
| Alle berekeningen worden uitgevoerd door:
|
| fantasyOutlookComparisonEngine.js
|
*/

/*
|--------------------------------------------------------------------------
| Algemene helpers
|--------------------------------------------------------------------------
*/

function formatNumber(
  value,
  digits = 0,
) {
  const number =
    Number(value)

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return '—'
  }

  return new Intl.NumberFormat(
    'nl-NL',
    {
      minimumFractionDigits:
        digits,

      maximumFractionDigits:
        digits,
    },
  ).format(number)
}

function getScoreColor(
  score,
) {
  const value =
    Number(score) || 0

  if (
    value >= 80
  ) {
    return '#08a84e'
  }

  if (
    value >= 60
  ) {
    return '#a9e65c'
  }

  if (
    value >= 40
  ) {
    return '#ffdb0a'
  }

  if (
    value >= 20
  ) {
    return '#f47a13'
  }

  return '#d7192d'
}

/*
|--------------------------------------------------------------------------
| Spelerkaart
|--------------------------------------------------------------------------
*/

function renderPlayerImage(player) { return renderPlayerAvatar(player, { size: 64 }) }

function renderPlayerHeader(
  report,
  rankingItem,
) {
  const player =
    report.player

  return `
    <article
      class="
        outlook-player-card
        ${
          rankingItem?.rank === 1
            ? 'is-leading'
            : ''
        }
      "
    >
      <div class="outlook-player-rank">
        #${rankingItem?.rank ?? '—'}
      </div>

      <div class="outlook-player-photo">
        ${renderPlayerImage(
          player,
        )}
      </div>

      <div class="outlook-player-copy">
        <span>
          ${
            player.fantasyPosition ??
            player.position ??
            'Speler'
          }
        </span>

        <h3>
          ${player.name}
        </h3>

        <p>
          ${player.club}
        </p>
      </div>

      <div class="outlook-player-score">
        <strong>
          ${formatNumber(
            report.fvtScore.score,
          )}
        </strong>

        <span>
          / 100
        </span>
      </div>

      <div class="outlook-player-meta">
        <span>
          ${report.fvtScore.tier.label}
        </span>

        <span>
          ${formatNumber(
            report
              .fvtScore
              .confidence
              .score,
          )}%
          betrouwbaar
        </span>
      </div>
    </article>
  `
}

/*
|--------------------------------------------------------------------------
| Periodekeuze
|--------------------------------------------------------------------------
*/

function renderRoundControls(
  comparison,
) {
  return `
    <section class="outlook-controls">
      <div>
        <span class="eyebrow">
          Analyseperiode
        </span>

        <h3>
          Hoeveel aankomende speelrondes?
        </h3>

        <p>
          Vanaf speelronde
          ${comparison.startRound}.
        </p>
      </div>

      <div class="outlook-round-buttons">
        ${Array.from(
          {
            length: 10,
          },
          (
            _,
            index,
          ) => {
            const value =
              index + 1

            return `
              <button
                type="button"
                class="
                  outlook-round-button
                  ${
                    value ===
                    comparison.roundCount
                      ? 'active'
                      : ''
                  }
                "
                data-outlook-round-count="${value}"
              >
                ${value}
              </button>
            `
          },
        ).join('')}
      </div>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Eindconclusie
|--------------------------------------------------------------------------
*/

function renderDecision(
  comparison,
) {
  const decision =
    comparison.decision

  let icon =
    '⚖️'

  if (
    decision.type ===
    'winner'
  ) {
    icon =
      '🏆'
  } else if (
    decision.type ===
    'edge'
  ) {
    icon =
      '✅'
  }

  return `
    <section
      class="
        outlook-decision
        is-${decision.type}
      "
    >
      <div class="outlook-decision-icon">
        ${icon}
      </div>

      <div>
        <span class="eyebrow">
          Fantasy Outlook-conclusie
        </span>

        <h2>
          ${decision.title}
        </h2>

        <p>
          ${decision.text}
        </p>

        <small>
          Periode:
          speelronde
          ${comparison.startRound}
          t/m
          ${comparison.endRound}
          · Gemiddelde databetrouwbaarheid:
          ${comparison.confidence.score}%
          (${comparison.confidence.label})
        </small>
      </div>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Spelers bovenaan
|--------------------------------------------------------------------------
*/

function renderPlayerGrid(
  comparison,
  slotCount,
) {
  return `
    <div
      class="outlook-player-grid"
      style="
        --outlook-count:
          ${slotCount};
      "
    >
      ${Array.from(
        {
          length:
            slotCount,
        },
        (
          _,
          index,
        ) => {
          const report =
            comparison
              .reports[
                index
              ]

          if (!report) {
            return `
              <article
                class="
                  outlook-player-card
                  is-empty
                "
              >
                <strong>
                  Speler
                  ${index + 1}
                </strong>

                <span>
                  Nog niet geselecteerd
                </span>
              </article>
            `
          }

          const rankingItem =
            comparison
              .ranking
              .find(
                (item) =>
                  item.playerKey ===
                  report.playerKey,
              )

          return renderPlayerHeader(
            report,
            rankingItem,
          )
        },
      ).join('')}
    </div>
  `
}

function renderStickyOutlookPlayers(
  comparison,
  slotCount,
) {
  return `
    <div
      class="outlook-sticky-players"
      style="
        --outlook-count:
          ${slotCount};
      "
    >
      <div class="outlook-sticky-label">
        <span>
          Fantasy Outlook
        </span>

        <strong>
          Spelers
        </strong>
      </div>

      ${Array.from(
        {
          length:
            slotCount,
        },
        (
          _,
          index,
        ) => {
          const report =
            comparison
              .reports[
                index
              ]

          if (!report) {
            return `
              <div
                class="
                  outlook-sticky-player
                  is-empty
                "
              >
                <span>
                  Speler ${index + 1}
                </span>

                <strong>
                  Niet gekozen
                </strong>
              </div>
            `
          }

          return `
            <div class="outlook-sticky-player">
              <span>
                ${
                  report.player
                    .fantasyPosition ??
                  report.player
                    .position ??
                  'Speler'
                }
              </span>

              <strong>
                ${report.player.name}
              </strong>

              <small>
                ${report.player.club}
              </small>
            </div>
          `
        },
      ).join('')}
    </div>
  `
}

/*
|--------------------------------------------------------------------------
| Algemene scorecel
|--------------------------------------------------------------------------
*/

function renderScoreCell({
  score,
  winner = false,
  unavailable = false,
}) {
  const safeScore =
    Number(score) || 0

  return `
    <div
      class="
        outlook-score-cell
        ${
          winner
            ? 'is-winner'
            : ''
        }
        ${
          unavailable
            ? 'is-unavailable'
            : ''
        }
      "
      style="
        --outlook-score-color:
          ${getScoreColor(
            safeScore,
          )};
      "
    >
      <div>
        <strong>
          ${
            unavailable
              ? '—'
              : formatNumber(
                  safeScore,
                )
          }
        </strong>

        ${
          winner
            ? `
              <span>
                BESTE
              </span>
            `
            : ''
        }
      </div>

      <div class="outlook-score-track">
        <span
          style="
            width:
              ${
                unavailable
                  ? 0
                  : safeScore
              }%;
          "
        ></span>
      </div>
    </div>
  `
}

/*
|--------------------------------------------------------------------------
| Generieke vergelijkingstabel
|--------------------------------------------------------------------------
*/

function renderScoreSection({
  title,
  subtitle,
  rows,
  comparison,
  slotCount,
}) {
  return `
    <section class="outlook-comparison-section">
      <div class="outlook-section-heading">
        <div>
          <span class="eyebrow">
            ${subtitle}
          </span>

          <h3>
            ${title}
          </h3>
        </div>
      </div>

      <div class="outlook-score-table">
        ${rows
          .map(
            (row) => `
              <div
                class="outlook-score-row"
                style="
                  --outlook-count:
                    ${slotCount};
                "
              >
                <div class="outlook-score-label">
                  <span aria-hidden="true">
                    ${row.icon}
                  </span>

                  <strong>
                    ${row.label}
                  </strong>
                </div>

                ${Array.from(
                  {
                    length:
                      slotCount,
                  },
                  (
                    _,
                    index,
                  ) => {
                    const report =
                      comparison
                        .reports[
                          index
                        ]

                    if (!report) {
                      return renderScoreCell({
                        score: 0,

                        unavailable:
                          true,
                      })
                    }

                    const result =
                      row.getResult(
                        report,
                      )

                    return renderScoreCell({
                      score:
                        result.score,

                      unavailable:
                        result.available ===
                        false,

                      winner:
                        row.winners.includes(
                          report.playerKey,
                        ) &&
                        row.winners.length ===
                        1,
                    })
                  },
                ).join('')}
              </div>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| FVT Score
|--------------------------------------------------------------------------
*/

function renderMainScore(
  comparison,
  slotCount,
) {
  const category =
    comparison
      .categoryResults
      .find(
        (item) =>
          item.key ===
          'fvtScore',
      )

  return renderScoreSection({
    title:
      'FVT Fantasy Score',

    subtitle:
      'Totale toekomstverwachting',

    comparison,

    slotCount,

    rows: [
      {
        label:
          'FVT Fantasy Score',

        icon:
          '⭐',

        winners:
          category?.winners ??
          [],

        getResult:
          (report) => ({
            score:
              report
                .fvtScore
                .score,

            available:
              true,
          }),
      },
    ],
  })
}

/*
|--------------------------------------------------------------------------
| Zes pijlers
|--------------------------------------------------------------------------
*/

function renderPillars(
  comparison,
  slotCount,
) {
  const firstReport =
    comparison
      .reports[0]

  const rows =
    firstReport
      ?.pillars
      ?.map(
        (pillar) => {
          const category =
            comparison
              .categoryResults
              .find(
                (item) =>
                  item.key ===
                  `pillar-${pillar.key}`,
              )

          return {
            key:
              pillar.key,

            label:
              pillar.label,

            icon:
              pillar.icon,

            winners:
              category?.winners ??
              [],

            getResult:
              (report) => {
                const result =
                  report
                    .pillars
                    .find(
                      (item) =>
                        item.key ===
                        pillar.key,
                    )

                return {
                  score:
                    result
                      ?.scoreOutOfHundred ??
                    0,

                  available:
                    result
                      ?.hasData !==
                    false,
                }
              },
          }
        },
      ) ??
      []

  return renderScoreSection({
    title:
      'Zes pijlers',

    subtitle:
      'Waar komt het verschil vandaan?',

    rows,

    comparison,

    slotCount,
  })
}

/*
|--------------------------------------------------------------------------
| Fantasy-profielen
|--------------------------------------------------------------------------
*/

function renderProfiles(
  comparison,
  slotCount,
) {
  const firstReport =
    comparison
      .reports[0]

  const rows =
    firstReport
      ?.profiles
      ?.map(
        (profile) => {
          const category =
            comparison
              .categoryResults
              .find(
                (item) =>
                  item.key ===
                  `profile-${profile.key}`,
              )

          return {
            key:
              profile.key,

            label:
              profile.label,

            icon:
              profile.icon,

            winners:
              category?.winners ??
              [],

            getResult:
              (report) => {
                const result =
                  report
                    .profiles
                    .find(
                      (item) =>
                        item.key ===
                        profile.key,
                    )

                return {
                  score:
                    result?.score ??
                    0,

                  available:
                    result?.hasData ===
                    true,
                }
              },
          }
        },
      ) ??
      []

  return renderScoreSection({
    title:
      'Fantasy-profielen',

    subtitle:
      'Welke speler past bij jouw strategie?',

    rows,

    comparison,

    slotCount,
  })
}

/*
|--------------------------------------------------------------------------
| Scout
|--------------------------------------------------------------------------
*/

function renderScoutStars(
  stars,
) {
  const activeStars =
    Math.max(
      0,
      Math.min(
        5,
        Number(stars) || 0,
      ),
    )

  return `
    ${'★'.repeat(
      activeStars,
    )}
    ${'☆'.repeat(
      5 -
      activeStars,
    )}
  `
}

function renderScout(
  comparison,
  slotCount,
) {
  return `
    <section class="outlook-comparison-section">
      <div class="outlook-section-heading">
        <div>
          <span class="eyebrow">
            Fantasy Scout
          </span>

          <h3>
            Scoutoordeel per speler
          </h3>
        </div>
      </div>

      <div
        class="outlook-scout-grid"
        style="
          --outlook-count:
            ${slotCount};
        "
      >
        ${Array.from(
          {
            length:
              slotCount,
          },
          (
            _,
            index,
          ) => {
            const report =
              comparison
                .reports[
                  index
                ]

            if (!report) {
              return `
                <article
                  class="
                    outlook-scout-card
                    is-empty
                  "
                >
                  Geen speler
                </article>
              `
            }

            return `
              <article class="outlook-scout-card">
                <div class="outlook-scout-heading">
                  <div>
                    <span>
                      ${renderScoutStars(
                        report.scout.stars,
                      )}
                    </span>

                    <strong>
                      ${report.scout.label}
                    </strong>
                  </div>

                  <b>
                    ${formatNumber(
                      report.scout.score /
                        10,
                      1,
                    )}
                    / 10
                  </b>
                </div>

                <div class="outlook-scout-meta">
                  <span>
                    Risico:
                    ${formatNumber(
                      report.scout.risk /
                        10,
                      1,
                    )}
                    / 10
                  </span>

                  <span>
                    Betrouwbaarheid:
                    ${formatNumber(
                      report
                        .scout
                        .confidence,
                    )}%
                  </span>
                </div>

                <p>
                  ${report.scout.verdict}
                </p>

                ${
                  report
                    .scout
                    .strengths
                    .length
                    ? `
                      <ul class="outlook-strength-list">
                        ${report
                          .scout
                          .strengths
                          .slice(
                            0,
                            3,
                          )
                          .map(
                            (strength) => `
                              <li>
                                ✓
                                ${strength}
                              </li>
                            `,
                          )
                          .join('')}
                      </ul>
                    `
                    : ''
                }

                ${
                  report
                    .scout
                    .concerns
                    .length
                    ? `
                      <ul class="outlook-concern-list">
                        ${report
                          .scout
                          .concerns
                          .slice(
                            0,
                            3,
                          )
                          .map(
                            (concern) => `
                              <li>
                                !
                                ${concern}
                              </li>
                            `,
                          )
                          .join('')}
                      </ul>
                    `
                    : ''
                }
              </article>
            `
          },
        ).join('')}
      </div>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Programma
|--------------------------------------------------------------------------
*/

function renderFixtureRound(
  fixtureRound,
) {
  if (
    fixtureRound.type ===
    'blank'
  ) {
    return `
      <div
        class="
          outlook-fixture-card
          is-blank
        "
      >
        <strong>
          SR
          ${fixtureRound.round}
        </strong>

        <span>
          Geen wedstrijd
        </span>
      </div>
    `
  }

  return fixtureRound
    .fixtures
    .map(
      (fixture) => `
        <div
          class="
            outlook-fixture-card
            ${
              fixtureRound.type ===
              'double'
                ? 'is-double'
                : ''
            }
          "
          style="
            --fixture-color:
              ${getFixtureScoreColor(
                fixture.score,
              )};
          "
        >
          <div>
            <strong>
              SR
              ${fixtureRound.round}
            </strong>

            <span>
              ${fixture.venue}
            </span>
          </div>

          <h4>
            ${fixture.opponent}
          </h4>

          <b>
            ${formatNumber(
              fixture.score,
              1,
            )}
            / 10
          </b>

          ${
            fixtureRound.type ===
            'double'
              ? `
                <small>
                  Dubbele speelronde
                </small>
              `
              : ''
          }
        </div>
      `,
    )
    .join('')
}

function renderFixtures(
  comparison,
  slotCount,
) {
  return `
    <section class="outlook-comparison-section">
      <div class="outlook-section-heading">
        <div>
          <span class="eyebrow">
            Persoonlijke programma’s
          </span>

          <h3>
            De geselecteerde periode
          </h3>
        </div>
      </div>

      <div
        class="outlook-fixture-columns"
        style="
          --outlook-count:
            ${slotCount};
        "
      >
        ${Array.from(
          {
            length:
              slotCount,
          },
          (
            _,
            index,
          ) => {
            const report =
              comparison
                .reports[
                  index
                ]

            if (!report) {
              return `
                <div
                  class="
                    outlook-fixture-column
                    is-empty
                  "
                >
                  Geen speler
                </div>
              `
            }

            const domesticIds=new Set(report.fixtureRounds.flatMap(round=>round.fixtures.map(fixture=>String(fixture.fixtureId))))
            const domestic=getFixtures().filter(fixture=>domesticIds.has(String(fixture.id)))
            const times=domestic.map(europeanFixtureTimestamp).filter(Number.isFinite)
            const europeanCount=times.length?getEuropeanFixturesForClub(getEuropeanFixtures(),report.player.club).filter(fixture=>{const time=europeanFixtureTimestamp(fixture);return time!==null&&time>=Math.min(...times)-4*86400000&&time<=Math.max(...times)+4*86400000}).length:0

            return `
              <div class="outlook-fixture-column">
                <header>
                  <strong>
                    ${report.player.name}
                  </strong>

                  <span>
                    Programma:
                    ${formatNumber(
                      report
                        .outlook
                        .scores
                        .fixtures,
                      1,
                    )}
                    / 10
                  </span>
                  <small>${report.fixtureRounds.reduce((sum,round)=>sum+round.fixtures.length,0)} Eredivisiewedstrijden · ${europeanCount?`+ ${europeanCount} Europese wedstrijden`:'Geen Europees programma'}</small>
                </header>

                <div class="outlook-fixture-list">
                  ${
                    report
                      .fixtureRounds
                      .length
                      ? report
                          .fixtureRounds
                          .map(
                            renderFixtureRound,
                          )
                          .join('')
                      : `
                        <div
                          class="
                            outlook-fixture-card
                            is-blank
                          "
                        >
                          Geen wedstrijden gevonden
                        </div>
                      `
                  }
                </div>
              </div>
            `
          },
        ).join('')}
      </div>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Eindrangschikking
|--------------------------------------------------------------------------
*/

function renderRanking(
  comparison,
) {
  return `
    <section class="outlook-ranking">
      <div class="outlook-section-heading">
        <div>
          <span class="eyebrow">
            Eindrangschikking
          </span>

          <h3>
            Beste keuze voor deze periode
          </h3>
        </div>
      </div>

      <div class="outlook-ranking-list">
        ${comparison
          .ranking
          .map(
            (item) => `
              <div
                class="
                  outlook-ranking-row
                  ${
                    item.rank === 1
                      ? 'is-first'
                      : ''
                  }
                "
              >
                <strong>
                  #${item.rank}
                </strong>

                <div>
                  <b>
                    ${item.player.name}
                  </b>

                  <span>
                    ${item.player.club}
                  </span>
                </div>

                <span>
                  ${item.categoryWins}
                  gewonnen
                  ${
                    item.categoryWins ===
                    1
                      ? 'onderdeel'
                      : 'onderdelen'
                  }
                </span>

                <b>
                  ${formatNumber(
                    item.score,
                  )}
                </b>
              </div>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Lege staat
|--------------------------------------------------------------------------
*/

function renderEmptyState() {
  return `
    <section class="outlook-empty-state">
      <div>
        🔮
      </div>

      <span class="eyebrow">
        Fantasy Outlook
      </span>

      <h2>
        Kies minimaal twee spelers
      </h2>

      <p>
        Selecteer hierboven minimaal twee spelers
        om te zien wie voor de komende periode de
        aantrekkelijkste Fantasy-keuze is.
      </p>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Publieke renderer
|--------------------------------------------------------------------------
*/

export function renderFantasyOutlookComparison({
  players = [],

  slotCount = 2,

  viewMode =
    'compact',

  startRound,

  roundCount = 5,

  referencePlayers = [],
}) {
  const comparison =
    buildFantasyOutlookComparison({
      players,

      startRound,

      roundCount,

      referencePlayers,
    })

  if (
    comparison
      .reports
      .length < 2
  ) {
    return renderEmptyState()
  }

  return `
    <section class="fantasy-outlook-comparison">
      ${renderRoundControls(
        comparison,
      )}

      ${renderDecision(
        comparison,
      )}

      ${renderPlayerGrid(
  comparison,
  slotCount,
)}

${renderStickyOutlookPlayers(
  comparison,
  slotCount,
)}

${renderMainScore(
  comparison,
  slotCount,
)}

      ${renderPillars(
        comparison,
        slotCount,
      )}

      ${
        viewMode ===
        'extended'
          ? renderProfiles(
              comparison,
              slotCount,
            )
          : ''
      }

      ${renderScout(
        comparison,
        slotCount,
      )}

      ${renderFixtures(
        comparison,
        slotCount,
      )}

      ${renderRanking(
        comparison,
      )}

      <div class="outlook-footnote">
        De vergelijking gebruikt dezelfde
        FVT Fantasy Score-, programma-,
        Fantasy Scout- en Fantasy Profiel-engines
        als de spelerspagina. Kleine verschillen
        worden bewust niet als een harde winnaar
        gepresenteerd.
      </div>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Event listeners
|--------------------------------------------------------------------------
*/

export function bindFantasyOutlookComparison({
  root,
  onRoundCountChange,
}) {
  if (!root) {
    return
  }

  root
    .querySelectorAll(
      '[data-outlook-round-count]',
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          () => {
            const roundCount =
              Number(
                button
                  .dataset
                  .outlookRoundCount,
              )

            if (
              typeof
              onRoundCountChange ===
              'function'
            ) {
              onRoundCountChange(
                roundCount,
              )
            }
          },
        )
      },
    )
}
