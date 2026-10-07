import { safeHtml } from '../platform/html.js'
import { compactManagerImport } from '../services/managerPersistence.js'
import { createManagerOptimizerRequest } from '../services/optimizer/managerOptimizerRequest.js'

import {
  parseFantasyTeamText,
} from '../services/optimizer/teamImportParser.js'

import {
  recognizeFantasyTeamScreenshot,
} from '../services/optimizer/screenshotTeamRecognizer.js'

import {
  createScreenshotImportResult,
  validateScreenshotDraft,
} from '../services/optimizer/screenshotTeamImport.js'

import {
  getDatabaseSummary,
  getFixtures,
  getPlayerProfiles,
} from '../services/database.js'

import {
  calculatePlayerFixtureOutlook,
  getFixtureScoreColor,
} from '../services/fixtureIntelligenceEngine.js'

import {
  MANAGER_STRATEGIES,
} from '../constants/managerStrategies.js'

/*
|--------------------------------------------------------------------------
| Fantasy Studio — FVT Manager-scherm
|--------------------------------------------------------------------------
|
| Dit scherm wordt de visuele ingang voor:
|
| - de beste opstelling;
| - de beste selectie;
| - optimalisatie over een variabele horizon tot het seizoenseinde;
| - teambeoordelingen;
| - transfers en alternatieven;
| - uitleg bij iedere aanbeveling.
|
*/

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function escapeHtml(
  value,
) {
  return String(
    value ?? '',
  )
    .replaceAll(
      '&',
      '&amp;',
    )
    .replaceAll(
      '<',
      '&lt;',
    )
    .replaceAll(
      '>',
      '&gt;',
    )
    .replaceAll(
      '"',
      '&quot;',
    )
    .replaceAll(
      "'",
      '&#039;',
    )
}

function toNumber(
  value,
  fallback = 0,
) {
  const number =
    Number(value)

  return Number.isFinite(number)
    ? number
    : fallback
}

function formatExpectedPoints(
  value,
) {
  return toNumber(
    value,
  ).toFixed(2)
}

function getCandidatePlayer(
  candidate,
) {
  return (
    candidate?.player ??
    candidate ??
    {}
  )
}

/*
|--------------------------------------------------------------------------
| FVT Manager — instellingen
|--------------------------------------------------------------------------
*/

const MANAGER_PHILOSOPHY_TOTAL =
  100

/*
|--------------------------------------------------------------------------
| Mijn Team — tijdelijke sessiestatus
|--------------------------------------------------------------------------
|
| De platformlaag herstelt deze gegevens bij inloggen en bewaart ze via
| de versiebeveiligde cloudopslag. Schermwissels mogen ze niet resetten.
|
*/

const managerTeamState = {
  mode: '',

  seasonPhase: 'preseason',

  seasonStatus: {
    phase: 'preseason',
    firstPlayableRound: 1,
  },

  importResult: null,

  bank: 0,
  bankKnown: false,
  plannedTransfers: [],

  freeTransfers: 1,

  purchasePrices: {},

  manualSellingPrices: {},

  chipStrategy: {
  mode: 'disabled',

  allowedChips: [
    'wildcard',
    'sugar-daddy',
    'attacking',
    'dynamic-duo',
  ],

  schedule: [],

  wildcardPlanning: {
    /*
    |--------------------------------------------------------------------------
    | Wildcardplanning
    |--------------------------------------------------------------------------
    |
    | hold:
    | De Wildcard wordt niet ingepland of geanalyseerd.
    |
    | advisory:
    | De Manager toont maximaal drie kansrijke momenten, maar neemt de
    | Wildcard niet automatisch mee in de volledige Beam Search.
    |
    | forced:
    | De gebruiker kiest zelf een ronde. Die ronde wordt vervolgens
    | volledig met Wildcard en alle vervolgrondes doorgerekend.
    |
    */

    mode: 'advisory',

    round: null,
  },

  state: {
    usedRounds: {},
  },
},
}

export function getManagerTeamState() {
  return {
    ...managerTeamState,

    seasonStatus: {
      ...managerTeamState.seasonStatus,
    },

    chipStrategy: structuredClone(managerTeamState.chipStrategy),

    importResult: compactManagerImport(managerTeamState.importResult),

    purchasePrices: {
      ...managerTeamState.purchasePrices,
    },

    manualSellingPrices: {
      ...managerTeamState.manualSellingPrices,
    },
  }
}

const managerSettings = {
  philosophy: {
    expectedPoints: 35,
    fixtures: 20,
    form: 15,
    flexibility: 10,
    teamValue: 10,
    risk: 5,
    benchStrength: 5,
  },

  rules: {
    maxPlayersPerClub: {
      enabled: true,
      value: 3,
    },

    minPlayingChance: {
      enabled: true,
      value: 75,
    },

    maxTransferHit: {
      enabled: true,
      value: -8,
    },

    minMoneyInBank: {
      enabled: true,
      value: 0.5,
    },
  },

  planning: {
    startRound: 1,
    roundCount: 5,
  },
}

export function getManagerSettings() {
  return JSON.parse(
    JSON.stringify(
      managerSettings,
    ),
  )
}

export function restoreManagerState(state, settings) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Ongeldige teamgegevens')
  // Only restore known fields; never accept prototype keys or arbitrary executable configuration.
  for (const key of Object.keys(managerTeamState)) {
    if (Object.hasOwn(state, key)) managerTeamState[key] = structuredClone(state[key])
  }
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    for (const key of Object.keys(managerSettings)) {
      if (Object.hasOwn(settings, key)) managerSettings[key] = structuredClone(settings[key])
    }
  }
}

function getCandidateName(
  candidate,
) {
  const player =
    getCandidatePlayer(
      candidate,
    )

  return (
    player?.name ??
    candidate?.name ??
    'Onbekende speler'
  )
}

function getCandidateClub(
  candidate,
) {
  const player =
    getCandidatePlayer(
      candidate,
    )

  return (
    player?.club ??
    candidate?.club ??
    'Onbekende club'
  )
}

function getCandidatePosition(
  candidate,
) {
  const player =
    getCandidatePlayer(
      candidate,
    )

  return (
    candidate?.position ??
    player?.fantasyPosition ??
    player?.position ??
    'unknown'
  )
}

function getCandidateExpectedPoints(
  candidate,
) {
  return toNumber(
    candidate?.expectedPoints ??
    candidate
      ?.projection
      ?.expectedPoints,
  )
}

function getCandidateKey(
  candidate,
) {
  const player =
    getCandidatePlayer(
      candidate,
    )

  return String(
    player?.id ??
    player?.playerId ??
    player?.slug ??
    `${getCandidateName(candidate)}-${getCandidateClub(candidate)}`,
  )
}

function isSameCandidate(
  left,
  right,
) {
  if (
    !left ||
    !right
  ) {
    return false
  }

  return (
    getCandidateKey(left) ===
    getCandidateKey(right)
  )
}

/*
|--------------------------------------------------------------------------
| Spelerkaart
|--------------------------------------------------------------------------
*/

function createPlayerCard({
  candidate,
  captain,
  viceCaptain,
  compact = false,
  highlightedPlayerIds = new Set(),
  fixtureRound = null,
}) {
  const name =
    escapeHtml(
      getCandidateName(
        candidate,
      ),
    )

  const club =
    escapeHtml(
      getCandidateClub(
        candidate,
      ),
    )

  const expectedPoints =
    formatExpectedPoints(
      getCandidateExpectedPoints(
        candidate,
      ),
    )

  const isCaptain =
    isSameCandidate(
      candidate,
      captain,
    )

  const isViceCaptain =
    isSameCandidate(
      candidate,
      viceCaptain,
    )

  const candidateId = getCandidateKey(candidate)
  const isHighlighted = highlightedPlayerIds.has(candidateId)
  const price = candidate?.price ?? getCandidatePlayer(candidate)?.currentPrice
  const hasExpectedPoints = candidate?.expectedPoints !== null && candidate?.expectedPoints !== undefined
  const playerMetric = hasExpectedPoints
    ? `${expectedPoints} xP`
    : price !== null && price !== undefined && Number.isFinite(Number(price))
      ? `€${Number(price).toFixed(1)}m`
      : ''

  const captainLabel =
    isCaptain
      ? `
        <span
          class="optimizer-player-badge optimizer-player-badge-captain"
          title="Captain"
        >
          C
        </span>
      `
      : isViceCaptain
        ? `
          <span
            class="optimizer-player-badge optimizer-player-badge-vice"
            title="Vice-captain"
          >
            VC
          </span>
        `
        : ''

  return `
    <article
      class="
        optimizer-player-card
        ${
          isCaptain
            ? 'is-captain'
            : ''
        }
        ${
          isViceCaptain
            ? 'is-vice-captain'
            : ''
        }
        ${isHighlighted ? 'is-highlighted' : ''}
        ${compact ? 'is-compact' : ''}
      "
    >
      ${captainLabel}
      ${isHighlighted ? '<span class="optimizer-player-new">Nieuw</span>' : ''}

      <span class="optimizer-player-shirt">
        👕
      </span>

      <strong class="optimizer-player-name">
        ${name}
      </strong>

      <span class="optimizer-player-club">
        ${club}
      </span>

      <span class="optimizer-player-xp">
        ${escapeHtml(playerMetric)}
      </span>

      ${createManagerFixtureLabel(candidate, fixtureRound, { compact })}
    </article>
  `
}

/*
|--------------------------------------------------------------------------
| Positielijn
|--------------------------------------------------------------------------
*/

function createPitchLine({
  candidates,
  lineClass,
  captain,
  viceCaptain,
  compact = false,
  highlightedPlayerIds = new Set(),
  fixtureRound = null,
}) {
  if (
    !candidates?.length
  ) {
    return ''
  }

  return `
    <div
      class="optimizer-pitch-line ${lineClass}"
    >
      ${candidates
        .map(
          (candidate) =>
            createPlayerCard({
              candidate,
              captain,
              viceCaptain,
              compact,
              highlightedPlayerIds,
              fixtureRound,
            }),
        )
        .join('')}
    </div>
  `
}

/*
|--------------------------------------------------------------------------
| Voetbalveld
|--------------------------------------------------------------------------
*/

function createOptimizerPitch(
  result,
  fixtureRound,
  {
    eyebrow = 'Beste opstelling',
    title = `Formatie ${result?.formation ?? '—'}`,
    period = 'Basiself',
  } = {},
) {
  return `
    <section class="optimizer-pitch-panel">
      <header class="optimizer-panel-header">
        <div>
          <span class="optimizer-panel-eyebrow">
            ${escapeHtml(eyebrow)}
          </span>

          <h3>
            ${escapeHtml(title)}
          </h3>
        </div>

        <span class="optimizer-panel-period">
          ${escapeHtml(period)}
        </span>
      </header>

      ${renderManagerLineupPitch({ lineup: result, fixtureRound })}
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Bank
|--------------------------------------------------------------------------
*/

function createOptimizerBench(
  result,
  fixtureRound,
) {
  const bench =
    Array.isArray(
      result
        ?.bench
        ?.ordered,
    )
      ? result.bench.ordered
      : []

  return `
    <section class="optimizer-bench-panel">
      <header class="optimizer-panel-header">
        <div>
          <span class="optimizer-panel-eyebrow">
            Wisselspelers
          </span>

          <h3>
            Bank
          </h3>
        </div>

        <span class="optimizer-panel-period">
          ${bench.length} spelers
        </span>
      </header>

      <div class="optimizer-bench-list">
        ${bench
          .map(
            (
              candidate,
              index,
            ) => `
              <article class="optimizer-bench-player">
                <span class="optimizer-bench-order">
                  ${index + 1}
                </span>

                <div class="optimizer-bench-player-info">
                  <strong>
                    ${escapeHtml(
                      getCandidateName(
                        candidate,
                      ),
                    )}
                  </strong>
                  ${createManagerFixtureLabel(candidate, fixtureRound, { compact: true })}

                  <span>
                    ${escapeHtml(
                      getCandidateClub(
                        candidate,
                      ),
                    )}
                  </span>
                </div>

                <div class="optimizer-bench-player-meta">
                  <span>
                    ${escapeHtml(
                      getCandidatePosition(
                        candidate,
                      ),
                    )}
                  </span>

                  <strong>
                    ${formatExpectedPoints(
                      getCandidateExpectedPoints(
                        candidate,
                      ),
                    )} xP
                  </strong>
                </div>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Transferadvies
|--------------------------------------------------------------------------
*/

function createTransferAdvice(
  optimizerResult,
) {
  const transferPlannerResult =
    optimizerResult
      ?.transferPlannerResult

  if (
    !transferPlannerResult
  ) {
    return `
      <section class="optimizer-transfer-panel">
        <header class="optimizer-panel-header">
          <div>
            <span class="optimizer-panel-eyebrow">
              De FVT Manager
            </span>

            <h3>
              💡 Transferadvies
            </h3>
          </div>
        </header>

        <div class="optimizer-transfer-empty">
          <strong>
            Geen transferadvies beschikbaar
          </strong>

          <p>
            De FVT Manager heeft nog geen transferadvies beschikbaar.
          </p>
        </div>
      </section>
    `
  }

  const plannerResult =
    transferPlannerResult
      ?.result ??
    {}

  const recommendation =
    plannerResult
      ?.recommendation ??
    {}

  const bestOption =
    plannerResult
      ?.bestOption ??
    null

  const bestTransferOption =
    plannerResult
      ?.bestTransferOption ??
    null

  const report =
    bestOption
      ?.report ??
    {}

  const actionType =
    bestOption
      ?.actionType ??
    recommendation
      ?.recommendation ??
    'unknown'

  const isNoTransfer =
    actionType ===
      'no-transfer' ||
    actionType ===
      'hold-transfer' ||
    recommendation
      ?.recommendation ===
      'hold-transfer' ||
    !bestTransferOption

  const title =
    escapeHtml(
      recommendation
        ?.title ??
      (
        isNoTransfer
          ? 'Bewaar je transfer'
          : 'Voer deze transfer uit'
      ),
    )

  const message =
    escapeHtml(
      recommendation
        ?.message ??
      (
        isNoTransfer
          ? 'Je huidige selectie levert binnen de gekozen periode het beste resultaat op.'
          : 'Deze transfer verbetert volgens de FVT Manager jouw verwachte resultaat.'
      ),
    )

  const expectedPointsDifference =
    toNumber(
      recommendation
        ?.expectedPointsDifference ??
      bestOption
        ?.expectedPointsDifference ??
      bestTransferOption
        ?.expectedPointsDifference,
    )

  const playerOut =
    bestTransferOption
      ?.playerOut ??
    bestOption
      ?.playerOut ??
    null

  const playerIn =
    bestTransferOption
      ?.playerIn ??
    bestOption
      ?.playerIn ??
    null

  const reasons =
    Array.isArray(
      report?.reasons,
    )
      ? report.reasons
      : Array.isArray(
          bestOption
            ?.reasons,
        )
        ? bestOption.reasons
        : []

  return `
    <section class="optimizer-transfer-panel">
      <header class="optimizer-panel-header">
        <div>
          <span class="optimizer-panel-eyebrow">
            De FVT Manager
          </span>

          <h3>
            💡 Transferadvies
          </h3>
        </div>

        <span class="optimizer-panel-period">
          ${
            isNoTransfer
              ? 'Transfer bewaren'
              : 'Aanbevolen transfer'
          }
        </span>
      </header>

      <div
        class="
          optimizer-transfer-advice
          ${
            isNoTransfer
              ? 'is-hold'
              : 'is-transfer'
          }
        "
      >
        <div class="optimizer-transfer-advice-icon">
          ${
            isNoTransfer
              ? '🛡️'
              : '🔄'
          }
        </div>

        <div class="optimizer-transfer-advice-copy">
          <span>
            FVT Manager advies
          </span>

          <strong>
            ${title}
          </strong>

          <p>
            ${message}
          </p>
        </div>

        <div class="optimizer-transfer-gain">
          <span>
            Verwacht verschil
          </span>

          <strong>
            ${
              expectedPointsDifference >=
              0
                ? '+'
                : ''
            }${formatExpectedPoints(
              expectedPointsDifference,
            )} xP
          </strong>
        </div>
      </div>

      ${
        !isNoTransfer &&
        (
          playerOut ||
          playerIn
        )
          ? `
            <div class="optimizer-transfer-players">
              <article class="optimizer-transfer-player is-out">
                <span class="optimizer-transfer-label">
                  OUT
                </span>

                <div>
                  <strong>
                    ${escapeHtml(
                      getCandidateName(
                        playerOut,
                      ),
                    )}
                  </strong>

                  <small>
                    ${escapeHtml(
                      getCandidateClub(
                        playerOut,
                      ),
                    )}
                  </small>
                </div>
              </article>

              <span class="optimizer-transfer-arrow">
                →
              </span>

              <article class="optimizer-transfer-player is-in">
                <span class="optimizer-transfer-label">
                  IN
                </span>

                <div>
                  <strong>
                    ${escapeHtml(
                      getCandidateName(
                        playerIn,
                      ),
                    )}
                  </strong>

                  <small>
                    ${escapeHtml(
                      getCandidateClub(
                        playerIn,
                      ),
                    )}
                  </small>
                </div>
              </article>
            </div>
          `
          : ''
      }

      ${
        reasons.length
          ? `
            <div class="optimizer-transfer-reasons">
              <h4>
                Waarom dit advies?
              </h4>

              <ul>
                ${reasons
                  .slice(
                    0,
                    4,
                  )
                  .map(
                    (
                      reason,
                    ) => `
                      <li>
                        ${escapeHtml(
                          typeof reason ===
                            'string'
                            ? reason
                            : reason
                                ?.message ??
                              reason
                                ?.label ??
                              reason
                                ?.title ??
                              '',
                        )}
                      </li>
                    `,
                  )
                  .join('')}
              </ul>
            </div>
          `
          : ''
      }
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Samenvatting
|--------------------------------------------------------------------------
*/

function createLegacyOptimizerSummary({
  optimizerResult,
  startRound,
  roundCount,
}) {
  const result =
    optimizerResult.result

  const endRound =
    startRound +
    roundCount -
    1

  const captain =
    escapeHtml(
      getCandidateName(
        result?.captain,
      ),
    )

  const viceCaptain =
    escapeHtml(
      getCandidateName(
        result?.viceCaptain,
      ),
    )

  const alternatives =
    optimizerResult
      ?.alternatives ??
    []

  const periodLabel =
    roundCount === 1
      ? `Speelronde ${startRound}`
      : `Speelronde ${startRound} t/m ${endRound}`

  return `
    <aside class="optimizer-summary-panel">
      <header class="optimizer-panel-header">
        <div>
          <span class="optimizer-panel-eyebrow">
            FVT Manager Advies
          </span>

          <h3>
            Samenvatting
          </h3>
        </div>
      </header>

      <div class="optimizer-main-score">
        <strong>
          ${formatExpectedPoints(
            result?.expectedPoints,
          )}
        </strong>

        <span>
          Expected Points
        </span>

        ${
          roundCount > 1
            ? `
              <small>
                ${formatExpectedPoints(
                  result
                    ?.expectedPointsPerRound ??
                  toNumber(
                    result?.expectedPoints,
                  ) /
                    roundCount,
                )}
                xP per speelronde
              </small>
            `
            : ''
        }
      </div>

      <dl class="optimizer-summary-list">
        <div>
          <dt>
            Periode
          </dt>

          <dd>
            ${periodLabel}
          </dd>
        </div>

        <div>
          <dt>
            Formatie
          </dt>

          <dd>
            ${escapeHtml(
              result?.formation ??
              '—',
            )}
          </dd>
        </div>

        <div>
          <dt>
            Captain
          </dt>

          <dd>
            <span class="optimizer-summary-badge">
              C
            </span>

            ${captain}
          </dd>
        </div>

        <div>
          <dt>
            Vice-captain
          </dt>

          <dd>
            <span class="optimizer-summary-badge optimizer-summary-badge-vice">
              VC
            </span>

            ${viceCaptain}
          </dd>
        </div>

        <div>
          <dt>
            Basispunten
          </dt>

          <dd>
            ${formatExpectedPoints(
              result
                ?.baseExpectedPoints,
            )} xP
          </dd>
        </div>

        <div>
          <dt>
            Captainbonus
          </dt>

          <dd>
            +${formatExpectedPoints(
              result
                ?.captainBonus,
            )} xP
          </dd>
        </div>

        <div>
          <dt>
            Alternatieven
          </dt>

          <dd>
            ${alternatives.length}
            formaties
          </dd>
        </div>
      </dl>

      ${
        alternatives.length
          ? `
            <section class="optimizer-alternatives">
              <h4>
                Alternatieve formaties
              </h4>

              <div class="optimizer-alternative-list">
                ${alternatives
                  .slice(
                    0,
                    3,
                  )
                  .map(
                    (
                      alternative,
                    ) => `
                      <div class="optimizer-alternative">
                        <strong>
                          ${escapeHtml(
                            alternative
                              ?.formation ??
                            '—',
                          )}
                        </strong>

                        <span>
                          ${formatExpectedPoints(
                            alternative
                              ?.expectedPoints,
                          )} xP
                        </span>
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            </section>
          `
          : ''
      }
    </aside>
  `
}

/*
|--------------------------------------------------------------------------
| Season Plan Timeline
|--------------------------------------------------------------------------
*/

function createSeasonPlanPlayerList(players, { ordered = false, fixtureRound = null } = {}) {
  const source = Array.isArray(players) ? players : []
  return source.length
    ? `<div class="season-plan-player-list">${source.map((player, index) => `
        <article class="optimizer-bench-player season-plan-player">
          ${ordered ? `<span class="optimizer-bench-order">${index + 1}</span>` : ''}
          <div class="optimizer-bench-player-info">
            <strong>${escapeHtml(getCandidateName(player) || 'Onbekende speler')}</strong>
            <span>${escapeHtml(getCandidateClub(player) || '—')}</span>
          </div>
          <div class="optimizer-bench-player-meta">
            <span>${escapeHtml(getCandidatePosition(player) || '—')}</span>
            ${(getCandidatePlayer(player)?.currentPrice ?? getCandidatePlayer(player)?.endPrice ?? getCandidatePlayer(player)?.price ?? player?.price) !== null &&
              (getCandidatePlayer(player)?.currentPrice ?? getCandidatePlayer(player)?.endPrice ?? getCandidatePlayer(player)?.price ?? player?.price) !== undefined
              ? `<strong>€${toNumber(getCandidatePlayer(player)?.currentPrice ?? getCandidatePlayer(player)?.endPrice ?? getCandidatePlayer(player)?.price ?? player?.price).toFixed(1)}m</strong>` : ''}
          </div>
          ${fixtureRound ? createManagerFixtureLabel(player, fixtureRound, { compact: true }) : ''}
        </article>`).join('')}</div>`
    : '<p class="season-plan-empty-detail">Geen spelers beschikbaar.</p>'
}

const managerFixturePresentationCache = new Map()

function formatFixtureScore(value) {
  return Number(value).toFixed(1).replace('.', ',')
}

function getManagerFixturePresentation(candidate, round) {
  const player = getCandidatePlayer(candidate)
  const club = getCandidateClub(candidate)
  const roundNumber = Number(round)
  if (!club || club === 'Onbekende club' || !Number.isInteger(roundNumber)) {
    return { type: 'missing', label: 'Geen wedstrijdgegevens' }
  }

  const activeSeason = player?.season || getDatabaseSummary()?.activeSeason || ''
  const cacheKey = [activeSeason, roundNumber, club, getCandidatePosition(candidate)].join('|')
  if (managerFixturePresentationCache.has(cacheKey)) {
    return managerFixturePresentationCache.get(cacheKey)
  }

  const fixturesForRound = getFixtures().filter((fixture) => (
    Number(fixture?.round) === roundNumber &&
    (!activeSeason || fixture?.season === activeSeason)
  ))
  if (!fixturesForRound.length) {
    const missing = { type: 'missing', label: 'Geen wedstrijdgegevens' }
    managerFixturePresentationCache.set(cacheKey, missing)
    return missing
  }

  const outlook = calculatePlayerFixtureOutlook({
    player: { ...player, club, season: activeSeason },
    startRound: roundNumber,
    roundCount: 1,
  })
  const roundReport = outlook?.rounds?.[0]
  if (!roundReport || roundReport.type === 'blank') {
    const blank = { type: 'blank', label: 'Vrij' }
    managerFixturePresentationCache.set(cacheKey, blank)
    return blank
  }

  const fixtures = (roundReport.fixtures ?? []).map((fixture) => ({
    opponent: fixture.opponent,
    venueShort: fixture.isHome ? 'T' : 'U',
    venueLong: fixture.isHome ? 'thuis' : 'uit',
  }))
  const score = Number(roundReport.score)
  const presentation = fixtures.length && Number.isFinite(score)
    ? {
        type: roundReport.type,
        score,
        color: getFixtureScoreColor(score),
        compactLabel: fixtures
          .map((fixture) => `${fixture.opponent} (${fixture.venueShort})`)
          .join(' + '),
        fullLabel: fixtures
          .map((fixture) => `${fixture.opponent} (${fixture.venueLong})`)
          .join(' + '),
      }
    : { type: 'missing', label: 'Geen wedstrijdgegevens' }
  managerFixturePresentationCache.set(cacheKey, presentation)
  return presentation
}

function createManagerFixtureLabel(candidate, round, { compact = false } = {}) {
  const fixture = getManagerFixturePresentation(candidate, round)
  if (fixture.type === 'missing' || fixture.type === 'blank') {
    return `<span class="optimizer-player-fixture is-${fixture.type}">${escapeHtml(fixture.label)}</span>`
  }
  const score = formatFixtureScore(fixture.score)
  return compact
    ? `<span class="optimizer-player-fixture is-compact" style="--fixture-color:${fixture.color}" title="${escapeHtml(`${fixture.fullLabel} · Fixturescore ${score}`)}"><span>${escapeHtml(fixture.compactLabel)}</span><strong>${score}</strong></span>`
    : `<span class="optimizer-player-fixture" style="--fixture-color:${fixture.color}"><span>${escapeHtml(fixture.fullLabel)}</span><strong>Fixturescore ${score}</strong></span>`
}

function createSeasonPlanTransfers(action) {
  if (action?.actionType === 'wildcard' || action?.actionType === 'sugar-daddy') {
    const temporary = action.actionType === 'sugar-daddy'
    return `<div class="season-plan-no-transfer"><span>🎯</span><div><strong>${temporary ? 'Tijdelijk Suikeroomteam' : 'Nieuwe permanente Wildcardselectie'}</strong><small>${temporary ? 'Dit onbeperkte team geldt alleen in deze ronde; daarna keert de gewone selectie terug.' : `${action.playersOut?.length ?? 0} speler(s) uit en ${action.playersIn?.length ?? 0} speler(s) in, zonder transferpunten.`}</small></div></div>`
  }
  if (action?.actionType === 'no-transfer') {
    return `<div class="season-plan-no-transfer"><span>🛡️</span><div><strong>Geen transfer</strong><small>De selectie blijft deze speelronde ongewijzigd.</small></div></div>`
  }
  return `<div class="season-plan-transfer-list">${(action?.transferPairs ?? []).map((pair, index) => `
    <div class="season-plan-transfer-pair">
      <article class="optimizer-transfer-player is-out"><span class="optimizer-transfer-label">OUT${action.transfersMade > 1 ? ` ${index + 1}` : ''}</span><div><strong>${escapeHtml(pair?.playerOut?.name ?? 'Onbekend')}</strong><small>${escapeHtml(pair?.playerOut?.club ?? '—')}</small></div></article>
      <span class="optimizer-transfer-arrow">→</span>
      <article class="optimizer-transfer-player is-in"><span class="optimizer-transfer-label">IN${action.transfersMade > 1 ? ` ${index + 1}` : ''}</span><div><strong>${escapeHtml(pair?.playerIn?.name ?? 'Onbekend')}</strong><small>${escapeHtml(pair?.playerIn?.club ?? '—')}</small></div></article>
    </div>`).join('')}</div>`
}

function createSeasonPlanChangeBadges(changes) {
  const indicators = [
    [changes?.squadChanged, 'Selectie gewijzigd'],
    [changes?.lineupChanged, 'Opstelling gewijzigd'],
    [changes?.captainChanged, 'Captain gewijzigd'],
    [changes?.formationChanged, 'Formatie gewijzigd'],
    [changes?.benchChanged, 'Bank gewijzigd'],
  ].filter(([active]) => active)
  return indicators.length
    ? `<div class="season-plan-change-list">${indicators.map(([, label]) => `<span>${escapeHtml(label)}</span>`).join('')}</div>`
    : '<div class="season-plan-change-list"><span class="is-quiet">Geen teamwijzigingen</span></div>'
}

function createSeasonPlanRound(entry) {
  const transferType = entry.chip?.used
    ? entry.chip.id === 'sugar-daddy' ? 'Tijdelijk chipteam' : 'Chipactie'
    : entry.action.actionType === 'double-transfer'
      ? 'Dubbele transfer' : entry.action.actionType === 'transfer' ? 'Transfer' : 'Geen transfer'
  const starterIds = new Set((entry.lineup?.starters ?? []).map((player) => String(player?.id ?? '')))
  const highlightedPlayerIds = [
    ...(entry.changes?.startersAdded ?? []),
    ...(entry.changes?.playersAdded ?? []).filter((player) => starterIds.has(String(player?.id ?? ''))),
  ]
    .map((player) => String(player?.id ?? ''))
    .filter(Boolean)
  return `<details class="season-plan-round-card">
    <summary>
      <div class="season-plan-round-heading"><span class="optimizer-panel-eyebrow">Speelronde ${entry.round}</span><strong>${escapeHtml(entry.action.label)}</strong><small>${transferType}</small></div>
      <div class="season-plan-round-points"><strong>${formatExpectedPoints(entry.points.netExpectedPoints)} xP</strong><span>Netto · ${formatExpectedPoints(entry.points.cumulativeNetExpectedPoints)} cumulatief</span></div>
      <div class="season-plan-round-toggle" aria-hidden="true">⌄</div>
      <div class="season-plan-round-preview">
        <span>xP <b>${formatExpectedPoints(entry.points.expectedPoints)}</b></span>
        <span>Kosten <b>${entry.points.transferPointsCost}</b></span>
        <span>Bank <b>€${toNumber(entry.finance.bankAfter).toFixed(1)}m</b></span>
        <span>${entry.preseasonOpeningRound
          ? 'Na deze ronde <b>1 FT</b>'
          : `FT <b>${entry.transfers.nextFreeTransfers}</b>`}</span>
        <span>Captain <b>${escapeHtml(entry.lineup.captain?.name ?? '—')}</b></span>
        <span>Formatie <b>${escapeHtml(entry.lineup.formation ?? '—')}</b></span>
      </div>
    </summary>
    <div class="season-plan-round-body">
      <div class="season-plan-round-stats">
        ${entry.chip?.used ? `<div><span>Chip</span><strong>${escapeHtml(entry.chip.label ?? entry.chip.id)}</strong></div><div><span>Extra chipwaarde</span><strong>${formatExpectedPoints(entry.points.chipIncrementalPoints)} xP</strong></div>` : ''}
        <div><span>Expected Points</span><strong>${formatExpectedPoints(entry.points.expectedPoints)}</strong></div>
        <div><span>Transferkosten</span><strong>${entry.points.transferPointsCost}</strong></div>
        <div><span>Bank</span><strong>€${toNumber(entry.finance.bankBefore).toFixed(1)} → €${toNumber(entry.finance.bankAfter).toFixed(1)}m</strong></div>
        <div><span>Vrije transfers</span><strong>${entry.preseasonOpeningRound
          ? 'Voor deadline: onbeperkt · na ronde: 1 FT'
          : `${entry.transfers.freeTransfersBefore} → ${entry.transfers.nextFreeTransfers}`}</strong></div>
        <div><span>Formatie</span><strong>${escapeHtml(entry.lineup.formation ?? '—')}</strong></div>
        <div><span>Captain</span><strong>${escapeHtml(entry.lineup.captain?.name ?? '—')}</strong></div>
      </div>
      ${createSeasonPlanChangeBadges(entry.changes)}
      ${entry.chip?.used ? `<div class="season-plan-warning"><strong>${escapeHtml(entry.chip.label ?? entry.chip.id)} uitgevoerd</strong><p>${escapeHtml(entry.chip.reason ?? '')}</p>${entry.chip.id === 'sugar-daddy' ? '<small>Na deze ronde keert de persistente selectie automatisch terug.</small>' : ''}</div>` : ''}
      ${(entry.warnings ?? []).length ? `<div class="season-plan-round-warnings">${entry.warnings.map((warning) => `<p>⚠️ ${escapeHtml(warning)}</p>`).join('')}</div>` : ''}
      <section class="season-plan-round-section"><h4>Transfers</h4>${entry.preseasonOpeningRound
        ? '<div class="season-plan-no-transfer"><span>✓</span><div><strong>Geen reguliere transfer vóór deze ronde</strong><small>Het definitieve voorseizoensteam speelt speelronde 1. De normale transferfase begint daarna.</small></div></div>'
        : createSeasonPlanTransfers(entry.action)}</section>
      ${entry.preseasonOpeningRound ? '<p class="season-plan-ft-note">Na deze speelronde ontvang je 1 vrije transfer voor speelronde 2.</p>' : ''}
      <section class="season-plan-round-section season-plan-round-lineup">
        <div class="season-plan-lineup-heading"><h4>Opstelling</h4><span>${escapeHtml(entry.lineup.formation ?? '—')}</span></div>
        ${renderManagerLineupPitch({
          lineup: entry.lineup,
          compact: true,
          highlightedPlayerIds,
          fixtureRound: entry.round,
        })}
        <div class="season-plan-round-bench"><h4>Bank</h4>${createSeasonPlanPlayerList(entry.lineup.bench, { ordered: true, fixtureRound: entry.round })}</div>
      </section>
      <div class="season-plan-leadership"><span><b>C</b> ${escapeHtml(entry.lineup.captain?.name ?? '—')}</span><span><b>VC</b> ${escapeHtml(entry.lineup.viceCaptain?.name ?? '—')}</span><span>Formatie <strong>${escapeHtml(entry.lineup.formation ?? '—')}</strong></span></div>
    </div>
  </details>`
}

function createPreseasonSection(preseason, comparison = null) {
  if (!preseason?.valid) return ''
  const changes = preseason.changes ?? {}
  const lineup = preseason.lineup ?? {}
  const outgoing = changes.playersOut ?? []
  const incoming = changes.playersIn ?? []
  const modeLabel = preseason.mode === 'current-team' ? 'Huidige selectie' : 'Nieuw team'
  return `<section class="season-plan-preseason">
    <header class="optimizer-panel-header">
      <div><span class="optimizer-panel-eyebrow">Voor de start van het seizoen</span><h3>Onbeperkt optimaliseren vóór speelronde 1</h3></div>
      <span class="optimizer-panel-period">${escapeHtml(modeLabel)}</span>
    </header>
    <p class="season-plan-preseason-intro">De FVT Manager heeft je selectie vóór speelronde 1 geoptimaliseerd. Deze wijzigingen kosten geen transferpunten.</p>
    <div class="season-plan-summary-grid">
      <div><span>Wijzigingen</span><strong>${toNumber(changes.changesMade)}</strong></div>
      <div><span>Transferkosten</span><strong>Geen</strong></div>
      <div><span>Vrije transfers</span><strong>Onbeperkt</strong></div>
      <div><span>Eindbank</span><strong>€${toNumber(preseason.bankAfter).toFixed(1)}m</strong></div>
      <div><span>Formatie</span><strong>${escapeHtml(lineup.formation ?? '—')}</strong></div>
      <div><span>Captain</span><strong>${escapeHtml(getCandidateName(lineup.captain) || '—')}</strong></div>
      <div><span>Vice-captain</span><strong>${escapeHtml(getCandidateName(lineup.viceCaptain) || '—')}</strong></div>
    </div>
    ${comparison?.available ? `<section class="season-plan-preseason-comparison">
      <h4>Jouw huidige selectie → geoptimaliseerd team</h4>
      <div>
        <span><small>Teamscore</small><strong>${toNumber(comparison.initialTeamScore).toFixed(1).replace('.', ',')} → ${toNumber(comparison.optimizedTeamScore).toFixed(1).replace('.', ',')}</strong></span>
        <span><small>Rondeprojectie</small><strong>${formatExpectedPoints(comparison.initialExpectedPointsRound1)} → ${formatExpectedPoints(comparison.optimizedExpectedPointsRound1)} xP</strong></span>
        <span class="is-gain"><small>Verschil rondeprojectie</small><strong>${comparison.expectedPointsGain > 0 ? '+' : ''}${toNumber(comparison.expectedPointsGain).toFixed(1).replace('.', ',')} xP</strong></span>
        ${comparison.initialBenchExpectedPoints !== null && comparison.optimizedBenchExpectedPoints !== null
          ? `<span><small>Bankprojectie</small><strong>${formatExpectedPoints(comparison.initialBenchExpectedPoints)} → ${formatExpectedPoints(comparison.optimizedBenchExpectedPoints)} xP</strong></span>`
          : ''}
      </div>
    </section>` : ''}
    ${outgoing.length || incoming.length ? `<div class="season-plan-preseason-changes">
      <section><h4>OUT</h4>${createSeasonPlanPlayerList(outgoing)}</section>
      <section><h4>IN</h4>${createSeasonPlanPlayerList(incoming)}</section>
    </div>` : '<p class="season-plan-empty-detail">Het opgebouwde nieuwe team vormt direct je definitieve selectie.</p>'}
    <section class="season-plan-round-section season-plan-round-lineup">
      <div class="season-plan-lineup-heading"><h4>Geoptimaliseerd team voor speelronde 1</h4><span>${escapeHtml(lineup.formation ?? '—')}</span></div>
      ${renderManagerLineupPitch({
        lineup,
        compact: true,
        highlightedPlayerIds: incoming.map((player) => String(player?.id ?? player?.playerId ?? '')).filter(Boolean),
        fixtureRound: 1,
      })}
      <div class="season-plan-round-bench"><h4>Bank</h4>${createSeasonPlanPlayerList(lineup.bench, { ordered: true, fixtureRound: 1 })}</div>
    </section>
  </section>`
}

function createManagerAnalysisEvidence(items) {
  if (!Array.isArray(items) || !items.length) return ''
  return `<div class="manager-analysis-evidence">${items.map((item) => `
    <span><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong></span>
  `).join('')}</div>`
}

function createManagerAnalysisCard(item, extraClass = '') {
  if (!item?.title || !item?.text) return ''
  const severity = ['positive', 'warning', 'negative'].includes(item.severity)
    ? item.severity
    : 'neutral'
  return `<article class="manager-analysis-card is-${severity} ${extraClass}">
    <div class="manager-analysis-card-icon" aria-hidden="true">${escapeHtml(item.icon || '•')}</div>
    <div class="manager-analysis-card-copy">
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.text)}</p>
      ${createManagerAnalysisEvidence(item.evidence)}
    </div>
  </article>`
}

function createManagerAnalysisSection(analysis) {
  if (!analysis?.valid) return ''
  const score = analysis.teamScore ?? {}
  const priorities = Array.isArray(analysis.priority) ? analysis.priority.slice(0, 3) : []
  const strengths = uniqueManagerItems(analysis.strengths).slice(0, 3)
  const attentions = uniqueManagerItems([
    ...(analysis.weaknesses ?? []),
    ...(analysis.risk ?? []).filter((item) => item.severity === 'warning'),
  ]).slice(0, 3)
  const technicalCards = uniqueManagerItems([
    ...(analysis.sections ?? []),
    ...(analysis.risk ?? []).filter((item) => item.severity !== 'warning'),
  ])
  const transfers = Array.isArray(analysis.transferReason) ? analysis.transferReason : []
  const advice = transfers[0] ?? analysis.strategy?.[0] ?? priorities[0]
  const comparesTeams = analysis.comparison?.available
  return `<section class="manager-analysis-panel">
    <header class="optimizer-panel-header">
      <div><span class="optimizer-panel-eyebrow">De FVT Manager</span><h3>${comparesTeams ? 'Analyse van jouw huidige team' : 'Jouw persoonlijke analyse'}</h3></div>
      ${score.available ? `<div class="manager-analysis-score"><strong>${escapeHtml(score.label)}</strong><span>${escapeHtml(getManagerScoreLabel(score.value))}</span></div>` : ''}
    </header>
    <div class="manager-analysis-level-one">
      <div class="manager-analysis-human-grid">${createCoachList(strengths, 'strength')}${createCoachList(attentions, 'attention')}</div>
      ${priorities.length ? `<section class="manager-analysis-priorities"><h4>Wat nu belangrijk is</h4><div>${priorities.map((item, index) => `<article><b>${index + 1}</b><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small>${createManagerAnalysisEvidence(item.evidence)}</span></article>`).join('')}</div></section>` : ''}
      ${advice ? `<section class="manager-analysis-direct-advice"><span>Direct advies</span><p>${escapeHtml(advice.text)}</p></section>` : ''}
    </div>
    ${transfers.length ? `<section class="manager-analysis-transfers"><h4>Transferuitleg</h4><div>${transfers.map((item) => createManagerAnalysisCard(item, 'is-transfer')).join('')}</div></section>` : ''}
    <details class="manager-analysis-technical">
      <summary>Bekijk technische analyse</summary>
      ${score.available ? `<div class="manager-analysis-score-detail">
        <div class="manager-analysis-coverage is-${escapeHtml(score.coverage?.level || 'low')}"><strong>Datadekking ${toNumber(score.coverage?.usedDimensions)} van ${toNumber(score.coverage?.possibleDimensions)} onderdelen (${toNumber(score.coverage?.percentage).toFixed(0)}%)</strong>${score.coverage?.warning ? `<small>${escapeHtml(score.coverage.warning)}</small>` : ''}</div>
        <div>${(score.components ?? []).map((component) => `<span><small>${escapeHtml(component.label)}</small><strong>${toNumber(component.score).toFixed(1).replace('.', ',')}</strong><em>${escapeHtml(component.evidence)}</em></span>`).join('')}</div>
      </div>` : ''}
      <div class="manager-analysis-grid">${technicalCards.map((item) => createManagerAnalysisCard(item)).join('')}</div>
    </details>
  </section>`
}

function createCoachIntelligenceSection(coach) {
  if (!coach?.version) return ''
  const key = coach.keyDecision
  const confidenceLabel = ({ high: 'Hoog', medium: 'Redelijk', low: 'Laag', 'insufficient-data': 'Onvoldoende data' })[coach.headline?.confidence] ?? 'Onbekend'
  const choice = key?.localChoice && key?.globalChoice ? `<section class="manager-coach-key-decision" id="manager-coach-key-decision"><h4>Waarom kiest de FVT Manager hiervoor?</h4><div class="manager-coach-choice-grid"><div><span>Voor de hand liggend</span><strong>${escapeHtml(key.localChoice.label ?? 'Lokale keuze')}</strong>${key.localChoice.round ? `<small>Speelronde ${key.localChoice.round}${Number.isFinite(Number(key.localChoice.value)) ? ` Â· ${toNumber(key.localChoice.value).toFixed(1).replace('.', ',')} xP` : ''}</small>` : ''}</div><div><span>Manageradvies</span><strong>${escapeHtml(key.globalChoice.label ?? 'Complete strategie')}</strong>${key.globalChoice.round ? `<small>Speelronde ${key.globalChoice.round}${Number.isFinite(Number(key.globalChoice.value)) ? ` Â· ${toNumber(key.globalChoice.value).toFixed(1).replace('.', ',')} xP` : ''}</small>` : ''}</div></div><blockquote>${escapeHtml(key.conclusion?.short ?? '')}</blockquote><p>${escapeHtml(key.conclusion?.explanation ?? '')}</p><a href="#manager-coach-technical">Bekijk onderbouwing</a></section>` : ''
  return `<section class="season-plan-panel manager-coach-intelligence">
    <header class="optimizer-panel-header"><div><span class="optimizer-panel-eyebrow">Coach Intelligence</span><h3>${escapeHtml(coach.headline?.title ?? 'FVT Manager-analyse')}</h3></div><span class="optimizer-panel-period">SR${coach.scope?.startRound}â€“${coach.scope?.endRound}</span></header>
    <div class="manager-coach-intelligence-summary"><p>${escapeHtml(coach.headline?.summary ?? '')}</p><span>Betrouwbaarheid: ${confidenceLabel}</span></div>
    ${choice}
    ${coach.priorities?.length ? `<section class="manager-coach-priorities"><h4>Wat nu belangrijk is</h4><div>${coach.priorities.map((item) => `<article><span>${escapeHtml(item.urgency)}</span><strong>${escapeHtml(item.action)}</strong><p>${escapeHtml(item.reason)}</p>${item.round ? `<small>Speelronde ${item.round}</small>` : ''}</article>`).join('')}</div></section>` : ''}
    ${coach.roundNarrative?.length ? `<section class="manager-coach-rounds"><h4>Transfer- en rondenarratief</h4>${coach.roundNarrative.slice(0, 8).map((item) => `<article><span>SR${item.round}</span><div><strong>${escapeHtml(item.headline)}</strong><p>${escapeHtml(item.explanation)}</p><small>${escapeHtml(item.consequence)}</small></div></article>`).join('')}</section>` : ''}
    <details class="manager-analysis-technical" id="manager-coach-technical"><summary>Bekijk technische coachanalyse</summary><div class="manager-coach-technical-grid">${Object.entries(coach.technical ?? {}).filter(([, value]) => value !== null && value !== undefined).map(([keyName, value]) => `<div><span>${escapeHtml(keyName)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>${coach.caveats?.length ? `<ul>${coach.caveats.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</details>
  </section>`
}

function createSeasonPlanSection(seasonPlan, managerAnalysis = null) {
  if (!seasonPlan) {
    return `<section class="season-plan-panel"><div class="season-plan-error"><strong>Seizoensstrategie niet beschikbaar</strong><p>De FVT Manager heeft geen seizoensstrategie beschikbaar.</p></div></section>`
  }
  if (!seasonPlan.valid) {
    return `<section class="season-plan-panel"><header class="optimizer-panel-header"><div><span class="optimizer-panel-eyebrow">De FVT Manager</span><h3>Strategie voor de komende speelrondes</h3></div></header><div class="season-plan-error"><strong>De seizoensstrategie kon niet worden opgebouwd</strong><p>${(seasonPlan.errors ?? ['Onbekende fout']).map(escapeHtml).join('<br>')}</p></div></section>`
  }
  const summary = seasonPlan.summary
  const showTerminalScore = toNumber(summary?.terminalFreeTransferValue) !== 0
  return `<section class="season-plan-panel">
    <header class="optimizer-panel-header"><div><span class="optimizer-panel-eyebrow">De FVT Manager</span><h3>Strategie voor de komende speelrondes</h3></div><span class="optimizer-panel-period">${seasonPlan.period.roundCount} speelronde${seasonPlan.period.roundCount === 1 ? '' : 's'}</span></header>
    ${(seasonPlan.warnings ?? []).length ? `<div class="season-plan-warnings"><strong>Aandachtspunten</strong>${seasonPlan.warnings.map((warning) => `<p>⚠️ ${escapeHtml(warning)}</p>`).join('')}</div>` : ''}
    <div class="season-plan-summary-grid">
      <div><span>Totale xP</span><strong>${formatExpectedPoints(summary.totalExpectedPoints)}</strong></div><div><span>Netto xP</span><strong>${formatExpectedPoints(summary.totalNetExpectedPoints)}</strong></div><div><span>Transferkosten</span><strong>${summary.totalTransferPointsCost}</strong></div><div><span>Transferacties</span><strong>${summary.transferActions}</strong></div><div><span>Spelerswissels</span><strong>${summary.transfersMade}</strong></div><div><span>Eindbank</span><strong>€${toNumber(summary.finalBank).toFixed(1)}m</strong></div><div><span>Vrije transfers einde</span><strong>${summary.finalFreeTransfers}</strong></div>${showTerminalScore ? `<div><span>Terminalscore</span><strong>${formatExpectedPoints(summary.terminalScore)}</strong></div>` : ''}
    </div>
    ${createPreseasonSection(seasonPlan.preseason, managerAnalysis?.comparison)}
    <div class="season-plan-timeline">${seasonPlan.timeline.map(createSeasonPlanRound).join('')}</div>
  </section>`
}

function normalizeManagerPosition(candidate) {
  const value = String(getCandidatePosition(candidate)).trim().toLowerCase()
  if (['gk', 'keeper', 'doelman', 'goalkeeper'].includes(value)) return 'goalkeeper'
  if (['def', 'verdediger', 'defender'].includes(value)) return 'defender'
  if (['mid', 'middenvelder', 'midfielder'].includes(value)) return 'midfielder'
  if (['fwd', 'fw', 'aanvaller', 'attacker', 'forward', 'striker'].includes(value)) return 'forward'
  return value
}

function renderManagerLineupPitch({ lineup, compact = false, highlightedPlayerIds = [], fixtureRound = null } = {}) {
  const starters = Array.isArray(lineup?.starters) ? lineup.starters : []
  const highlighted = new Set((highlightedPlayerIds ?? []).map(String))
  const groups = {
    goalkeeper: [], defender: [], midfielder: [], forward: [],
  }
  const unknown = []
  starters.forEach((candidate) => {
    const position = normalizeManagerPosition(candidate)
    if (groups[position]) groups[position].push(candidate)
    else unknown.push(candidate)
  })
  const formation = String(lineup?.formation ?? '').split('-').map(Number)
  const targets = formation.length === 3 && formation.every(Number.isInteger)
    ? { goalkeeper: 1, defender: formation[0], midfielder: formation[1], forward: formation[2] }
    : null
  if (targets) {
    ;['goalkeeper', 'defender', 'midfielder', 'forward'].forEach((position) => {
      while (groups[position].length < targets[position] && unknown.length) {
        groups[position].push(unknown.shift())
      }
    })
  }
  if (unknown.length) groups.forward.push(...unknown)
  const createLine = (position, lineClass) => createPitchLine({
    candidates: groups[position],
    lineClass,
    captain: lineup?.captain,
    viceCaptain: lineup?.viceCaptain,
    compact,
    highlightedPlayerIds: highlighted,
    fixtureRound,
  })
  return `<div class="optimizer-pitch ${compact ? 'is-compact' : ''}">
    <div class="optimizer-pitch-circle"></div>
    <div class="optimizer-pitch-box optimizer-pitch-box-top"></div>
    <div class="optimizer-pitch-box optimizer-pitch-box-bottom"></div>
    <div class="optimizer-pitch-players">
      ${createLine('forward', 'optimizer-pitch-line-forwards')}
      ${createLine('midfielder', 'optimizer-pitch-line-midfielders')}
      ${createLine('defender', 'optimizer-pitch-line-defenders')}
      ${createLine('goalkeeper', 'optimizer-pitch-line-goalkeepers')}
    </div>
  </div>`
}

const MANAGER_SCORE_LABELS = Object.freeze([
  { minimum: 8.5, label: 'Uitstekend' },
  { minimum: 7, label: 'Sterk' },
  { minimum: 5.5, label: 'Redelijk' },
  { minimum: 4, label: 'Kwetsbaar' },
  { minimum: 0, label: 'Zwak' },
])

function getManagerScoreLabel(value) {
  const score = Math.max(0, Math.min(10, toNumber(value)))
  return MANAGER_SCORE_LABELS.find((item) => score >= item.minimum)?.label ?? 'Niet beoordeeld'
}

function uniqueManagerItems(items) {
  const seen = new Set()
  return (items ?? []).filter((item) => {
    const key = String(item?.key ?? item?.title ?? '')
    if (!key || !item?.text || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function createCoachList(items, type) {
  const selected = uniqueManagerItems(items).slice(0, 3)
  if (!selected.length) return ''
  return `<section class="manager-coach-list is-${type}">
    <h4>${type === 'strength' ? 'Sterke punten' : 'Aandachtspunten'}</h4>
    <ul>${selected.map((item) => `<li><span>${type === 'strength' ? '✓' : '!'}</span><p>${escapeHtml(item.text)}</p></li>`).join('')}</ul>
  </section>`
}

function createOptimizerSummary({ optimizerResult }) {
  const analysis = optimizerResult?.managerAnalysis
  if (!analysis?.valid) return ''
  const coach = optimizerResult?.coachIntelligence
  const score = analysis.teamScore ?? {}
  const strengths = uniqueManagerItems(analysis.strengths).slice(0, 3)
  const attentions = uniqueManagerItems([
    ...(analysis.weaknesses ?? []),
    ...(analysis.risk ?? []).filter((item) => item.severity === 'warning'),
  ]).slice(0, 3)
  const conclusionParts = [strengths[0]?.text, attentions[0]?.text].filter(Boolean)
  const advice = analysis.transferReason?.[0] ?? analysis.strategy?.[0] ?? analysis.priority?.[0]
  const coverage = score.coverage ?? {}
  const comparison = analysis.comparison
  const isCurrentTeamPreseason = optimizerResult?.request?.seasonPhase === 'preseason' &&
    optimizerResult?.request?.team?.mode === 'current-team'
  return `<aside class="optimizer-summary-panel manager-coach-panel">
    <header class="optimizer-panel-header"><div><span class="optimizer-panel-eyebrow">FVT Manager</span><h3>${isCurrentTeamPreseason ? 'Huidige selectie' : 'Mijn oordeel'}</h3></div></header>
    <div class="manager-coach-score"><strong>${escapeHtml(score.label ?? 'Niet beschikbaar')}</strong><span>${escapeHtml(getManagerScoreLabel(score.value))}</span><small>${coverage.level === 'low' ? 'Beperkte beoordeling: niet alle gegevens zijn beschikbaar.' : `Gebaseerd op ${toNumber(coverage.usedDimensions)} van ${toNumber(coverage.possibleDimensions)} onderdelen`}</small></div>
    ${comparison?.available ? `<section class="manager-coach-comparison"><span>Na optimalisatie</span><strong>${toNumber(comparison.optimizedTeamScore).toFixed(1).replace('.', ',')} / 10</strong><small>${comparison.teamScoreDelta > 0 ? '+' : ''}${toNumber(comparison.teamScoreDelta).toFixed(1).replace('.', ',')} teamscore · ${comparison.expectedPointsGain > 0 ? '+' : ''}${toNumber(comparison.expectedPointsGain).toFixed(1).replace('.', ',')} xP</small></section>` : ''}
    ${coach?.headline?.summary ? `<blockquote>${escapeHtml(coach.headline.summary)}</blockquote>` : conclusionParts.length ? `<blockquote>${escapeHtml(`Op basis van de huidige gegevens: ${conclusionParts.join(' ')}`)}</blockquote>` : ''}
    ${createCoachList(strengths, 'strength')}
    ${createCoachList(attentions, 'attention')}
    ${coach ? `<section class="manager-coach-advice"><span>Coachconclusie</span><p>${escapeHtml(coach.keyDecision?.conclusion?.short ?? coach.headline?.title ?? '')}</p><a href="#manager-coach-key-decision">Bekijk volledige uitleg</a></section>` : advice ? `<section class="manager-coach-advice"><span>Advies</span><p>${escapeHtml(advice.text)}</p>${createManagerAnalysisEvidence(advice.evidence)}</section>` : ''}
  </aside>`
}

function createChipStrategySection(chipStrategy) {
  if (!chipStrategy || chipStrategy.mode === 'disabled') return ''
  if (!chipStrategy.valid) {
    return `<section class="season-plan-panel"><header class="optimizer-panel-header"><div><span class="optimizer-panel-eyebrow">FVT Manager</span><h3>Chipstrategie</h3></div></header><div class="season-plan-error"><strong>De chipstrategie is ongeldig</strong><p>${(chipStrategy.errors ?? []).map(escapeHtml).join('<br>')}</p></div></section>`
  }
  const periods = chipStrategy.periods ?? []
  return `<section class="season-plan-panel manager-chip-strategy-result">
    <header class="optimizer-panel-header"><div><span class="optimizer-panel-eyebrow">FVT Manager</span><h3>Chipstrategie</h3></div><span class="optimizer-panel-period">${chipStrategy.mode === 'manual' ? 'Handmatig' : 'Automatisch'}</span></header>
    ${(chipStrategy.warnings ?? []).map((warning) => `<p class="season-plan-warning">⚠️ ${escapeHtml(warning)}</p>`).join('')}
    ${periods.map((period) => `<section class="manager-analysis-block"><h4>${period.id === 'period-1' ? 'Periode 1 · SR1–17' : 'Periode 2 · SR18–34'}</h4><div class="manager-analysis-grid">${period.recommendations.map((item) => {
      const best = item.recommended
      if (!best && chipStrategy.mode === 'manual') {
        const periodLabel = period.id === 'period-1' ? 'eerste seizoenshelft' : 'tweede seizoenshelft'
        const status = !item.available
          ? '<strong>Al gebruikt</strong><p>Deze chip is in deze periode al ingezet.</p>'
          : item.decision === 'skip'
            ? `<strong>Bewust niet gebruiken</strong><p>Je hebt gekozen om de ${escapeHtml(item.label)}-chip in deze periode niet te gebruiken.</p>`
            : `<strong>Nog niet bepaald</strong><p>Je hebt voor de ${periodLabel} nog geen ${escapeHtml(item.label)}ronde gekozen. De FVT Manager toont wel de beste opties.</p>${item.localRecommendation ? `<small>Kansrijke ronde: SR${item.localRecommendation.round} (${toNumber(item.localRecommendation.localValue).toFixed(1).replace('.', ',')} xP).</small>` : ''}`
        return `<article class="manager-analysis-card"><span>${escapeHtml(item.label)}</span>${status}</article>`
      }
      const netValue = toNumber(best?.netValue)
      const signedNetValue = `${netValue > 0 ? '+' : ''}${netValue.toFixed(1).replace('.', ',')}`
      const global = item.globalRecommendation
      const local = item.localRecommendation
      const comparison = item.strategyComparison
      const strategyDifference = comparison?.strategyDifference
      const choiceLabel = item.source === 'manual' ? 'Handmatig gekozen' : 'Opportunity-advies'
      return `<article class="manager-analysis-card"><span>${escapeHtml(item.label)}</span>${best ? `<strong>${choiceLabel}: speelronde ${best.round}</strong><p>${signedNetValue} verwachte netto punten · ${escapeHtml(best.confidence)} confidence</p><small>${escapeHtml(best.explanation)}</small>${item.source === 'manual' && local && local.round !== best.round ? `<p>De losse opportunity-scan prefereert SR${local.round} (${toNumber(local.localValue).toFixed(1).replace('.', ',')} xP).</p>` : ''}${global ? `<div class="manager-chip-global-choice"><strong>Complete strategie: speelronde ${global.round}</strong><p>${local && global.round === local.round ? `Deze ronde wint zowel de lokale vergelijking als het gesimuleerde plannerpad.` : `SR${local?.round ?? best.round} wint de losse ${escapeHtml(item.label)}-scan. SR${global.round} is gekozen in het complete plannerpad.`}</p>${strategyDifference !== null && strategyDifference !== undefined ? `<small>Werkelijk counterfactual verschil: ${strategyDifference > 0 ? '+' : ''}${toNumber(strategyDifference).toFixed(1).replace('.', ',')} punten.</small>` : '<small>Voor dit verschil is geen volledig counterfactual pad uitgevoerd.</small>'}</div>` : `<p>Deze chip is niet gebruikt in het beste gesimuleerde plannerpad binnen de gekozen horizon.</p>`}${item.alternatives.length ? `<details><summary>Alternatieven</summary>${item.alternatives.map((alternative) => `<p>SR${alternative.round}: ${toNumber(alternative.netValue).toFixed(1).replace('.', ',')} xP (${toNumber(alternative.valueDifferenceFromBest).toFixed(1).replace('.', ',')} minder)</p>`).join('')}</details>` : ''}` : '<strong>Geen geldig advies</strong>'}</article>`
    }).join('')}</div></section>`).join('')}
  </section>`
}

function chipConfidenceLabel(value) {
  return ({ high: 'Hoge betrouwbaarheid', medium: 'Gemiddelde betrouwbaarheid', low: 'Lage betrouwbaarheid' })[value] ?? 'Betrouwbaarheid niet vastgesteld'
}

function chipEvidenceLines(item) {
  const candidate = item.localOpportunity
  const evidence = candidate?.evidence ?? {}
  if (!candidate) return []
  if (item.chipId === 'dynamic-duo') {
    const captain = evidence.captain
    const vice = evidence.viceCaptain
    return [
      captain && vice ? `${captain.name ?? 'Captain'} en ${vice.name ?? 'vice-captain'} leveren samen ${toNumber(candidate.netValue).toFixed(1).replace('.', ',')} verwachte extra punten.` : null,
      captain ? `${captain.name ?? 'De captain'}: ${toNumber(captain.expectedPoints).toFixed(1).replace('.', ',')} xP, ${Math.round(toNumber(captain.expectedMinutes))} minuten en ${Math.round(toNumber(captain.appearanceProbability) * 100)}% speelkans.` : null,
      vice ? `${vice.name ?? 'De vice-captain'}: ${toNumber(vice.expectedPoints).toFixed(1).replace('.', ',')} xP en ${vice.fixtureCount ?? 0} wedstrijd(en).` : null,
    ].filter(Boolean)
  }
  if (item.chipId === 'attacking') {
    const forwards = Array.isArray(evidence.forwards) ? evidence.forwards : []
    return [
      forwards.length ? `De drie spitsen leveren samen ${forwards.reduce((sum, player) => sum + toNumber(player.expectedPoints), 0).toFixed(1).replace('.', ',')} xP.` : null,
      ...forwards.slice(0, 3).map((player) => `${player.name ?? 'Spits'}: ${toNumber(player.expectedPoints).toFixed(1).replace('.', ',')} xP, ${Math.round(toNumber(player.expectedMinutes))} minuten en ${Math.round(toNumber(player.appearanceProbability) * 100)}% speelkans${player.fixtureCount > 1 ? ` in ${player.fixtureCount} wedstrijden` : ''}.`),
    ].filter(Boolean)
  }
  if (item.chipId === 'wildcard') return [
    Number.isFinite(Number(evidence.changedPlayers)) ? `${evidence.changedPlayers} selectieplaatsen veranderen in de doorgerekende herbouw.` : null,
    Number.isFinite(Number(evidence.opportunityValue)) ? `De gemeten verbetering over ${evidence.horizonRounds ?? 1} ronde(s) is ${toNumber(evidence.opportunityValue).toFixed(1).replace('.', ',')} xP.` : null,
    Number.isFinite(Number(evidence.scenarioBudget)) ? `Het doorgerekende selectiebudget is ${toNumber(evidence.scenarioBudget).toFixed(1).replace('.', ',')} miljoen.` : null,
  ].filter(Boolean)
  return [
    Number.isFinite(Number(evidence.opportunityValue)) ? `Het tijdelijke Suikeroomteam levert ${toNumber(evidence.opportunityValue).toFixed(1).replace('.', ',')} xP meer dan de persistente selectie.` : null,
    Number.isFinite(Number(evidence.changedPlayers)) ? `${evidence.changedPlayers} spelers verschillen ten opzichte van het normale team.` : null,
    evidence.budgetMode === 'unlimited' ? 'De tijdelijke selectie is met onbeperkt budget doorgerekend en wordt na de ronde hersteld.' : null,
  ].filter(Boolean)
}

function chipGlobalExplanation(item) {
  const comparison = item.strategyComparison
  const local = item.localRecommendation
  const global = item.globalRecommendation
  if (!global) return ['Deze chip is niet gebruikt in het beste volledige plannerpad binnen de gekozen horizon.']
  if (local?.round === global.round) return [`Kansanalyse en complete strategie wijzen beide naar speelronde ${global.round}.`]
  const lines = [`De complete strategie kiest speelronde ${global.round} in plaats van de lokaal beste speelronde ${local?.round}.`]
  if (global.valueSemantics === 'embedded-in-squad-path') lines.push('De waarde van deze squadchip zit in de gewijzigde teamroute en vervolgrondes; daarom wordt geen losse directe 0,0-waarde gebruikt.')
  const changedChips = comparison?.affectedChipSchedule
    ? comparison.affectedChipSchedule.global.filter((entry) => !comparison.affectedChipSchedule.counterfactual.some((other) => other.chipId === entry.chipId && other.round === entry.round))
    : []
  const changedTransfers = comparison?.affectedTransfers
    ? comparison.affectedTransfers.global.filter((entry) => !comparison.affectedTransfers.counterfactual.some((other) => other.round === entry.round && other.playerOutId === entry.playerOutId && other.playerInId === entry.playerInId))
    : []
  if (changedChips.length) lines.push(`Hierdoor verandert ook de inzet van ${changedChips.map((entry) => `${entry.chipId} in SR${entry.round}`).join(', ')}.`)
  if (changedTransfers.length) lines.push(`Het winnende pad bevat daarnaast ${changedTransfers.length} gewijzigde transferbeslissing(en).`)
  if (comparison?.counterfactualExecuted && Number.isFinite(Number(comparison.strategyDifference))) lines.push(`Het volledige plannerpad eindigt ${Math.abs(toNumber(comparison.strategyDifference)).toFixed(1).replace('.', ',')} punten ${comparison.strategyDifference >= 0 ? 'hoger' : 'lager'} dan het werkelijk doorgerekende vergelijkingspad.`)
  else lines.push('Voor dit verschil is geen volledig vergelijkingspad uitgevoerd; daarom tonen we geen exact seizoensverschil.')
  return lines
}

function createPolishedChipStrategySection(chipStrategy) {
  if (!chipStrategy || chipStrategy.mode === 'disabled') return ''
  if (!chipStrategy.valid) return createChipStrategySection(chipStrategy)
  const planner = chipStrategy.horizon?.plannerHorizon
  const primaryPeriods = (chipStrategy.periods ?? []).filter((period) => period.visibleInPrimaryResult)
  const previewPeriods = (chipStrategy.periods ?? []).filter((period) => !period.visibleInPrimaryResult && period.scanOnly)
  const schedule = (chipStrategy.globalSchedule ?? []).filter((entry) => entry.round >= planner?.startRound && entry.round <= planner?.endRound)
  const differences = primaryPeriods.flatMap((period) => period.recommendations ?? []).filter((item) => item.localRecommendation && item.globalRecommendation && item.localRecommendation.round !== item.globalRecommendation.round).length
  const labelForChip = (chipId) => primaryPeriods.flatMap((period) => period.recommendations ?? []).find((item) => item.chipId === chipId)?.label ?? chipId
  const coachText = schedule.length
    ? `De beste complete chipstrategie binnen deze horizon gebruikt ${schedule.map((entry) => `${labelForChip(entry.chipId)} in SR${entry.round}`).join(', ')}.`
    : 'Binnen de gekozen horizon levert bewaren of niet gebruiken van de chips het beste gevonden plannerpad op.'
  return `<section class="season-plan-panel manager-chip-strategy-result manager-chip-result-polished">
    <header class="optimizer-panel-header"><div><span class="optimizer-panel-eyebrow">FVT Manager</span><h3>Chipstrategie binnen de gekozen horizon</h3></div><span class="optimizer-panel-period">SR${planner?.startRound ?? '?'}â€“${planner?.endRound ?? '?'}</span></header>
    <div class="manager-chip-coach-summary"><strong>Coachconclusie</strong><p>De FVT Manager heeft speelronde ${planner?.startRound ?? '?'} tot en met ${planner?.endRound ?? '?'} volledig doorgerekend.</p><p>${escapeHtml(coachText)}</p>${differences ? `<small>Bij ${differences} chip${differences === 1 ? '' : 's'} wijkt het complete planneradvies af van de lokaal beste ronde.</small>` : ''}</div>
    ${primaryPeriods.map((period) => `<section class="manager-chip-result-period"><h4>${period.id === 'period-1' ? 'Periode 1' : 'Periode 2'} Â· SR${period.plannerRange.startRound}â€“${period.plannerRange.endRound}</h4><div class="manager-chip-result-grid">${(period.recommendations ?? []).filter((item) => item.visibleInPrimaryResult).map((item) => {
      const local = item.localOpportunity
      const global = item.globalRecommendation
      const evidenceLines = chipEvidenceLines(item)
      const globalLines = chipGlobalExplanation(item)
      const alternatives = item.alternatives ?? []
      return `<article class="manager-chip-result-card"><header><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.executionStatus === 'executed-in-season-planner' ? 'Ingezet in plannerpad' : item.executionStatus === 'not-selected' ? 'Niet gekozen' : item.decision === 'skip' ? 'Bewust overgeslagen' : 'Opportunity-advies')}</strong></header>
        ${local ? `<section><span class="manager-chip-result-kicker">Lokaal beste moment</span><div class="manager-chip-result-stats"><strong>SR${local.round}</strong><span>${Number.isFinite(Number(local.netValue)) ? `${toNumber(local.netValue).toFixed(1).replace('.', ',')} verwachte chipwaarde` : 'Waarde niet onderzocht'}</span><span>${chipConfidenceLabel(local.confidence)}</span></div>${evidenceLines.length ? `<h5>Waarom is deze ronde lokaal sterk?</h5><ul>${evidenceLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : '<p>Voor deze ronde is onvoldoende concrete evidence beschikbaar.</p>'}</section>` : `<section><span class="manager-chip-result-kicker">Opportunity-advies</span><p>${item.executionStatus === 'not-evaluated' ? 'Niet onderzocht binnen deze horizon.' : item.decision === 'skip' ? 'Je hebt gekozen deze chip in deze periode niet te gebruiken.' : 'Geen betekenisvolle lokale ronde gevonden.'}</p></section>`}
        <section><span class="manager-chip-result-kicker">Complete strategie binnen de gekozen horizon</span>${global ? `<div class="manager-chip-result-stats"><strong>SR${global.round}</strong><span>${Number.isFinite(Number(global.globalValue)) ? `${toNumber(global.globalValue).toFixed(1).replace('.', ',')} directe chipwaarde` : 'Directe waarde niet beschikbaar'}</span></div>` : ''}<h5>${local?.round === global?.round ? 'Waarom bevestigt het plannerpad deze ronde?' : 'Waarom kiest de FVT Manager deze route?'}</h5><ul>${globalLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></section>
        <blockquote>${local && global ? local.round === global.round ? `Kansanalyse en complete strategie wijzen beide naar speelronde ${global.round}.` : `Speelronde ${local.round} wint afzonderlijk; speelronde ${global.round} wint binnen de complete strategie.` : global ? `De complete strategie gebruikt ${item.label} in speelronde ${global.round}.` : `${item.label} wordt niet ingezet in het beste gevonden plannerpad.`}</blockquote>
        ${alternatives.length ? `<details class="manager-chip-alternatives"><summary>Bekijk ${alternatives.length} alternatieve ronde${alternatives.length === 1 ? '' : 's'}</summary>${alternatives.map((alternative) => `<div><strong>Speelronde ${alternative.round}</strong><span>${Number.isFinite(Number(alternative.netValue)) ? `${toNumber(alternative.netValue).toFixed(1).replace('.', ',')} xP` : 'Waarde niet onderzocht'}</span><p>${Number.isFinite(Number(alternative.valueDifferenceFromBest)) ? `${toNumber(alternative.valueDifferenceFromBest).toFixed(1).replace('.', ',')} punt lager dan de lokaal beste ronde.` : 'Geen exacte vergelijking beschikbaar.'}</p><small>${escapeHtml(alternative.explanation ?? 'Geen aanvullende evidence beschikbaar.')} Risico: ${escapeHtml(alternative.risk ?? 'onbekend')}.</small></div>`).join('')}</details>` : ''}</article>`
    }).join('')}</div></section>`).join('')}
    ${previewPeriods.length ? `<details class="manager-chip-preview"><summary>Vooruitblik na speelronde ${planner?.endRound} beschikbaar</summary><p>Deze rondes zijn alleen globaal gescand en niet samen met alle transfers uitgevoerd.</p></details>` : ''}
  </section>`
}

/*
|--------------------------------------------------------------------------
| Compleet resultaat
|--------------------------------------------------------------------------
*/

function createOptimizerResult({
  optimizerResult,
  startRound,
  roundCount,
}) {
  managerFixturePresentationCache.clear()
  const isPreseason = optimizerResult?.request?.seasonPhase === 'preseason'
  const isCurrentTeam = optimizerResult?.request?.team?.mode === 'current-team'
  const pitchHeading = isPreseason && isCurrentTeam
    ? { eyebrow: 'Geïmporteerde selectie', title: 'Jouw huidige selectie', period: 'Speelronde 1' }
    : isPreseason
      ? { eyebrow: 'Voor de eerste deadline', title: 'Nieuwe startselectie bouwen', period: 'Speelronde 1' }
      : undefined
  return `
    <div class="optimizer-result-layout">
      <div class="optimizer-result-main">
        ${createOptimizerPitch(
          optimizerResult.result,
          startRound,
          pitchHeading,
        )}

        ${createOptimizerBench(
          optimizerResult.result,
          startRound,
        )}

        ${createCoachIntelligenceSection(
          optimizerResult.coachIntelligence,
        )}

        ${createManagerAnalysisSection(
          optimizerResult.managerAnalysis,
        )}

        ${createPolishedChipStrategySection(
          optimizerResult.chipStrategyResult,
        )}

        ${createSeasonPlanSection(
          optimizerResult.seasonPlan,
          optimizerResult.managerAnalysis,
        )}
      </div>

      ${createOptimizerSummary({
        optimizerResult,
        startRound:
          optimizerResult.startRound ??
          optimizerResult.round ??
          startRound,
        roundCount:
          optimizerResult.roundCount ??
          1,
      })}
    </div>
  `
}

/*
|--------------------------------------------------------------------------
| Mijn Team
|--------------------------------------------------------------------------
*/

function createManagerTeamScreen() {
  return `
    <section class="manager-team-panel">
      <header class="manager-panel-header">
        <div>
          <span class="manager-panel-eyebrow">
            Stap 1
          </span>

          <h3>
            📋 Mijn Team
          </h3>

          <p>
            Kies of je een nieuw team wilt laten bouwen
            of jouw huidige Fantasy-team wilt verbeteren.
          </p>
        </div>

        <span class="manager-team-step-badge">
          1 van 3
        </span>
      </header>

      <div class="manager-team-mode-grid">
        <button
          class="manager-team-mode-card"
          id="manager-mode-new-team"
          type="button"
        >
          <span class="manager-team-mode-icon">
            🏗️
          </span>

          <strong>
            Nieuw team bouwen
          </strong>

          <p>
            Ik heb nog geen team of wil volledig opnieuw beginnen.
          </p>

          <small>
            De FVT Manager bouwt een nieuwe selectie vanaf het beschikbare budget.
          </small>
        </button>

        <button
          class="manager-team-mode-card"
          id="manager-mode-current-team"
          type="button"
        >
          <span class="manager-team-mode-icon">
            🔧
          </span>

          <strong>
            Mijn huidige team verbeteren
          </strong>

          <p>
            Ik importeer mijn huidige selectie uit Fantasy Eredivisie.
          </p>

          <small>
            De FVT Manager analyseert jouw team en geeft persoonlijk transferadvies.
          </small>
        </button>
      </div>

      <section
        class="manager-team-import"
        id="manager-team-import"
        hidden
      >
        <div class="manager-team-import-copy">
          <span class="manager-panel-eyebrow">
            Selectie importeren
          </span>

          <h4>
            Importeer jouw selectie en prijzen
          </h4>

          <p>
            Plak een screenshot of gebruik de bestaande tekstimport.
          </p>
        </div>

        <div class="manager-import-tabs" role="tablist" aria-label="Importmethode">
          <button class="is-active" id="manager-import-tab-screenshot" type="button" role="tab">📷 Screenshot plakken <small>Aanbevolen</small></button>
          <button id="manager-import-tab-text" type="button" role="tab">📋 Tekst kopiëren en plakken</button>
        </div>

        <section class="manager-screenshot-import" id="manager-screenshot-import">
          <input id="manager-screenshot-file" type="file" accept="image/png,image/jpeg,image/webp" hidden />
          <button class="manager-screenshot-dropzone" id="manager-screenshot-dropzone" type="button">
            <strong>Plak je teamscreenshot</strong>
            <span>Kopieer een screenshot van je Fantasy Eredivisie-team en druk op</span>
            <kbd>Ctrl + V</kbd>
            <span>of sleep hem hierheen</span>
          </button>
          <button class="manager-screenshot-file-button" id="manager-screenshot-file-button" type="button">Screenshot kiezen</button>
          <div class="manager-screenshot-preview" id="manager-screenshot-preview" hidden></div>
          <p class="manager-screenshot-privacy">🔒 Je screenshot wordt alleen op dit apparaat verwerkt en niet geüpload.</p>
          <div class="manager-screenshot-review" id="manager-screenshot-review"></div>
        </section>

        <label class="manager-team-paste-field" id="manager-text-import" hidden>
          <span>
            Gekopieerde teamgegevens
          </span>

          <textarea
            id="manager-team-paste-input"
            rows="10"
            placeholder="Klik hier en druk op Ctrl + V"
          ></textarea>

          <small>
            De FVT Manager herkent spelers, clubs, posities,
            huidige prijzen, verkoopprijzen en aankoopprijzen.
          </small>
        </label>

        <div
          class="manager-team-import-result"
          id="manager-team-import-result"
          hidden
        >
          <div class="manager-team-import-placeholder">
            <span>
              📋
            </span>

            <strong>
              Nog geen team geplakt
            </strong>

            <p>
              Kopieer jouw team vanuit Fantasy Eredivisie
              en plak het in het bovenstaande vak.
            </p>
          </div>
        </div>

        <section
          class="manager-team-status"
          id="manager-team-status"
          hidden
        >
          <header>
            <div>
              <span class="manager-panel-eyebrow">
                Spelstatus
              </span>

              <h4>
                Aanvullende gegevens
              </h4>
            </div>
          </header>

          <div class="manager-team-status-grid">
            <label>
              <span>⚽ Moment in het seizoen</span>
              <select id="manager-season-phase">
                <option value="preseason" selected>Vóór de eerste deadline</option>
                <option value="in-season">Seizoen is begonnen</option>
              </select>
            </label>
            <label>
              <span>
                💰 Geld op de bank
              </span>

              <div class="manager-money-input">
                <span class="manager-money-symbol">
                  €
                </span>

                <button
                  class="manager-money-button"
                  id="manager-team-bank-decrease"
                  type="button"
                  aria-label="Geld op de bank verlagen"
                >
                  −
                </button>

                <input
                  id="manager-team-bank"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value="0.0"
                />

                <button
                  class="manager-money-button"
                  id="manager-team-bank-increase"
                  type="button"
                  aria-label="Geld op de bank verhogen"
                >
                  +
                </button>

                <span class="manager-money-unit">
                  M
                </span>
              </div>
            </label>

            <label id="manager-free-transfers-field">
              <span>
                🔄 Vrije transfers
              </span>

              <select id="manager-team-free-transfers">
                <option value="0">
                  0 vrije transfers
                </option>

                <option
                  value="1"
                  selected
                >
                  1 vrije transfer
                </option>

                <option value="2">
                  2 vrije transfers
                </option>
              </select>
            </label>
            <div class="manager-preseason-ft-status" id="manager-preseason-ft-status">
              <span>🔄 Wissels vóór de eerste deadline</span>
              <strong>Onbeperkt</strong>
              <small>De eerste vrije transfer ontvang je na speelronde 1.</small>
            </div>
          </div>

          <button
            class="manager-team-continue-button"
            id="manager-team-continue"
            type="button"
            disabled
          >
            Verder naar Mijn Strategie →
          </button>
        </section>
      </section>
    </section>
  `
}

/*
|--------------------------------------------------------------------------
| Beginscherm
|--------------------------------------------------------------------------
*/

export function createOptimizerScreen() {
  const philosophySettings = [
  {
    key: 'expectedPoints',
    icon: '📊',
    label: 'Expected Points',
    description: 'Verwachte Fantasy-punten wegen zwaar mee.',
    tooltip:
      'Geeft extra prioriteit aan spelers met de hoogste verwachte Fantasy-punten, ook wanneer zij duurder zijn.',
    value: 35,
  },
  {
    key: 'fixtures',
    icon: '📅',
    label: 'Speelschema',
    description: 'Voorkeur voor spelers met gunstige wedstrijden.',
    tooltip:
      'Geeft extra prioriteit aan spelers met een gunstig programma binnen de gekozen planningsperiode.',
    value: 20,
  },
  {
    key: 'form',
    icon: '🔥',
    label: 'Vorm',
    description: 'Recente prestaties en actuele ontwikkeling.',
    tooltip:
      'Laat recente prestaties en actuele ontwikkeling zwaarder meetellen dan oudere cijfers.',
    value: 15,
  },
  {
    key: 'flexibility',
    icon: '🔄',
    label: 'Flexibiliteit',
    description: 'Een selectie die eenvoudig aangepast kan worden.',
    tooltip:
      'Houdt rekening met toekomstige transfers, prijsniveaus en hoe eenvoudig spelers later vervangen kunnen worden.',
    value: 10,
  },
  {
    key: 'teamValue',
    icon: '💰',
    label: 'Teamwaarde',
    description: 'Prijsontwikkeling en toekomstige verkoopwaarde.',
    tooltip:
      'Geeft meer voorkeur aan spelers met een sterke prijs-kwaliteitverhouding en mogelijke waardestijging.',
    value: 10,
  },
  {
    key: 'risk',
    icon: '🛡️',
    label: 'Zekerheid',
    description: 'Voorkeur voor spelers met een betrouwbare rol.',
    tooltip:
      'Vermijdt spelers met rotatierisico, blessures, schorsingen of een lage verwachte speeltijd.',
    value: 5,
  },
  {
    key: 'benchStrength',
    icon: '🪑',
    label: 'Banksterkte',
    description: 'Kwaliteit en inzetbaarheid van de wisselspelers.',
    tooltip:
      'Investeert meer budget in betrouwbare wisselspelers die kunnen invallen bij onverwachte afwezigheid.',
    value: 5,
  },
]

  return `
    <section class="optimizer-page">
      <header class="optimizer-hero">
        <div>
          <span class="eyebrow">
            🤖 FVT Manager
          </span>

          <h2>
            Jouw persoonlijke Fantasy Manager
          </h2>

          <p>
            Stel jouw managementfilosofie en spelregels in.
            De FVT Manager bouwt daarna de selectie en strategie
            die het beste bij jouw speelstijl passen.
          </p>
        </div>

        <div class="optimizer-status">
          <span>
            Aangedreven door
          </span>

          <strong>
            Fantasy Studio
          </strong>
        </div>
      </header>

      ${createManagerTeamScreen()}

      <div
  id="manager-strategy-section"
  hidden
>

<section class="manager-strategy-panel">
  <header class="manager-panel-header">
    <div>
      <span class="manager-panel-eyebrow">
        Stap 2
      </span>

      <h3>
        🧠 Basisstrategie
      </h3>

      <p>
        Kies een uitgangspunt voor jouw speelstijl.
        Daarna kun je alle instellingen volledig
        naar wens aanpassen.
      </p>
    </div>

    <span class="manager-strategy-status">
      ⭐ Aanbevolen startpunt
    </span>
  </header>

  <div class="manager-strategy-content">
    <label class="manager-strategy-field">
      <span>
        Geselecteerde basisstrategie
      </span>

      <select id="manager-strategy-preset">
        ${MANAGER_STRATEGIES
          .map(
            (
              strategy,
            ) => `
              <option value="${strategy.id}">
                ${strategy.name}
              </option>
            `,
          )
          .join('')}
      </select>
    </label>

    <div class="manager-strategy-description">
      <span
        class="manager-strategy-description-icon"
        aria-hidden="true"
      >
        💡
      </span>

      <div>
        <strong>
          Waarom deze strategie?
        </strong>

        <p id="manager-strategy-description">
          ${MANAGER_STRATEGIES[0].description}
        </p>
      </div>
    </div>
  </div>
</section>

<section class="manager-settings-grid">
        <section class="manager-panel manager-philosophy-panel">
          <header class="manager-panel-header">
            <div>
              <span class="manager-panel-eyebrow">
                Stap 3
              </span>

              <h3>
                📊 Managementfilosofie
              </h3>

              <p>
                Verdeel precies 100 strategiepunten.
                Een hoger getal betekent dat dit onderdeel
                zwaarder meetelt in het advies.
              </p>
            </div>

            <div
  class="manager-points-total is-valid"
  id="manager-points-total"
>
  <span class="manager-points-label">
    Strategiepunten
  </span>

  <div class="manager-points-fraction">
    <strong id="manager-points-value">
      100
    </strong>

    <span>
      / 100
    </span>
  </div>

  <small id="manager-points-message">
    ✓ Klaar om te berekenen
  </small>
</div>
          </header>

          <div class="manager-philosophy-list">
            ${philosophySettings
              .map(
                (setting) => `
                  <article class="manager-philosophy-row">
                    <div class="manager-philosophy-copy">
                      <span class="manager-setting-icon">
                        ${setting.icon}
                      </span>

                      <div class="manager-philosophy-details">
  <div class="manager-philosophy-title">
    <strong>
      ${setting.label}
    </strong>

    <button
      class="manager-info-button"
      type="button"
      aria-label="Meer informatie over ${setting.label}"
      data-tooltip="${escapeHtml(setting.tooltip)}"
    >
      i
    </button>
  </div>

  <p>
    ${setting.description}
  </p>

  <div
    class="manager-weight-bar"
    aria-hidden="true"
  >
    <span
      data-weight-key="${setting.key}"
      style="width: ${setting.value}%"
    ></span>
  </div>
</div>
                    </div>

                    <div class="manager-points-control">
                      <button
                        class="manager-points-button"
                        type="button"
                        data-points-action="decrease"
                        data-points-key="${setting.key}"
                        aria-label="${setting.label} verlagen"
                      >
                        −
                      </button>

                      <input
                        class="manager-points-input"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value="${setting.value}"
                        data-philosophy-key="${setting.key}"
                        aria-label="Strategiepunten voor ${setting.label}"
                      />

                      <button
                        class="manager-points-button"
                        type="button"
                        data-points-action="increase"
                        data-points-key="${setting.key}"
                        aria-label="${setting.label} verhogen"
                      >
                        +
                      </button>
                    </div>
                  </article>
                `,
              )
              .join('')}
          </div>
        </section>

        <section class="manager-panel manager-rules-panel">
          <header class="manager-panel-header">
            <div>
              <span class="manager-panel-eyebrow">
                Stap 4
              </span>

              <h3>
                ⚙️ Harde regels
              </h3>

              <p>
                Deze voorwaarden mag de FVT Manager
                tijdens het zoeken niet overtreden.
              </p>
            </div>
          </header>

          <div class="manager-rules-list">
            <article class="manager-rule-row">
              <label class="manager-rule-toggle">
                <input
                  id="manager-rule-club-limit-enabled"
                  type="checkbox"
                  checked
                />

                <span class="manager-checkbox"></span>

                <span class="manager-rule-copy">
                  <strong>
                    Maximaal spelers per club
                  </strong>

                  <small>
                    Beperk afhankelijkheid van één club.
                  </small>
                </span>
              </label>

              <select id="manager-rule-club-limit">
                <option value="1">
                  1 speler
                </option>

                <option value="2">
                  2 spelers
                </option>

                <option value="3" selected>
                  3 spelers
                </option>
              </select>
            </article>

            <article class="manager-rule-row">
              <label class="manager-rule-toggle">
                <input
                  id="manager-rule-playing-chance-enabled"
                  type="checkbox"
                  checked
                />

                <span class="manager-checkbox"></span>

                <span class="manager-rule-copy">
                  <strong>
                    Minimale speelkans
                  </strong>

                  <small>
                    Sluit spelers met te veel onzekerheid uit.
                  </small>
                </span>
              </label>

              <select id="manager-rule-playing-chance">
                ${Array.from(
                  {
                    length: 21,
                  },
                  (
                    _,
                    index,
                  ) => {
                    const value =
                      index * 5

                    return `
                      <option
                        value="${value}"
                        ${
                          value === 75
                            ? 'selected'
                            : ''
                        }
                      >
                        ${value}%
                      </option>
                    `
                  },
                ).join('')}
              </select>
            </article>

            <article class="manager-rule-row">
              <label class="manager-rule-toggle">
                <input
                  id="manager-rule-transfer-hit-enabled"
                  type="checkbox"
                  checked
                />

                <span class="manager-checkbox"></span>

                <span class="manager-rule-copy">
                  <strong>
                    Maximale transferstraf
                  </strong>

                  <small>
                    Begrens het aantal minpunten voor transfers.
                  </small>
                </span>
              </label>

              <select id="manager-rule-transfer-hit">
                <option value="0">
                  0 punten
                </option>

                <option value="-4">
                  -4 punten
                </option>

                <option value="-8" selected>
                  -8 punten
                </option>

                <option value="-12">
                  -12 punten
                </option>

                <option value="-16">
                  -16 punten
                </option>

                <option value="-20">
                  -20 punten
                </option>
              </select>
            </article>

            <article class="manager-rule-row">
              <label class="manager-rule-toggle">
                <input
                  id="manager-rule-bank-enabled"
                  type="checkbox"
                  checked
                />

                <span class="manager-checkbox"></span>

                <span class="manager-rule-copy">
                  <strong>
                    Minimaal budget op de bank
                  </strong>

                  <small>
                    Houd financiële ruimte over voor transfers.
                  </small>
                </span>
              </label>

              <select id="manager-rule-bank">
                ${Array.from(
                  {
                    length: 21,
                  },
                  (
                    _,
                    index,
                  ) => {
                    const value =
                      index * 0.25

                    return `
                      <option
                        value="${value.toFixed(2)}"
                        ${
                          value === 0.5
                            ? 'selected'
                            : ''
                        }
                      >
                        €${value.toFixed(2)}M
                      </option>
                    `
                  },
                ).join('')}
              </select>
            </article>
          </div>
        </section>
      </section>

      <section class="manager-planning-panel">
        <header class="manager-planning-header">
          <div>
            <span class="manager-panel-eyebrow">
              Stap 5
            </span>

            <h3>
              📅 Planning
            </h3>

            <p>
              Kies voor welke periode de FVT Manager
              de strategie moet berekenen.
            </p>
          </div>
        </header>

        <div class="optimizer-controls">
          <label>
            <span>
              Vanaf speelronde
            </span>

            <select id="optimizer-start-round">
              ${Array.from(
                {
                  length: 34,
                },
                (
                  _,
                  index,
                ) => `
                  <option value="${index + 1}">
                    Speelronde ${index + 1}
                  </option>
                `,
              ).join('')}
            </select>
          </label>

          <label>
            <span>
              Aantal speelrondes
            </span>

            <select id="optimizer-round-count">
              ${Array.from(
                {
                  length: 34,
                },
                (
                  _,
                  index,
                ) => `
                  <option
                    value="${index + 1}"
                    ${
                      index === 4
                        ? 'selected'
                        : ''
                    }
                  >
                    ${index + 1}
                    ${
                      index === 0
                        ? 'speelronde'
                        : 'speelrondes'
                    }
                  </option>
                `,
              ).join('')}
            </select>
          </label>

          <fieldset class="manager-chip-fieldset">
            <legend>🎯 Chipstrategie</legend>
            <p class="manager-chip-intro">Kies of de FVT Manager jouw chips plant, of leg per seizoenshelft zelf momenten vast.</p>
            <div class="manager-chip-mode" role="radiogroup" aria-label="Chipstrategie">
              ${[['automatic', 'FVT Manager kiest'], ['manual', 'Zelf plannen'], ['disabled', 'Geen chips gebruiken']].map(([value, label]) => `<label><input type="radio" name="manager-chip-mode" value="${value}" ${value === 'disabled' ? 'checked' : ''}><span>${label}</span></label>`).join('')}
            </div>
            <p class="manager-chip-mode-copy" data-manager-chip-mode-copy>De planner gebruikt in deze berekening geen chips.</p>
            <div class="manager-chip-grid" data-manager-chip-cards hidden>
            ${[
              ['wildcard', 'Wildcard', 'Onbeperkt wisselen zonder transferstraf.'],
              ['sugarDaddy', 'Suikeroom', 'Tijdelijk onbeperkt wisselen en onbeperkt budget.'],
              ['attacking', 'Aanvalluh!', 'Dubbele punten voor de drie selectiespitsen; die ronde geen captain.'],
              ['dynamicDuo', 'Dynamisch Duo', 'Captain ×3 en vice-captain ×2.'],
            ].map(([id, label, description]) => {
              const canonicalId = id === 'sugarDaddy' ? 'sugar-daddy' : id === 'dynamicDuo' ? 'dynamic-duo' : id
              return `<article class="manager-chip-option" data-manager-chip-card="${canonicalId}"><header><span><strong>${label}</strong><small>${description}</small></span><label class="manager-chip-enabled"><input type="checkbox" data-manager-chip="${id}" checked /><span class="manager-checkbox"></span><span>Meenemen</span></label></header><div class="manager-chip-periods">${[
                ['period-1', 'Periode 1', 1, 17], ['period-2', 'Periode 2', 18, 34],
              ].map(([periodId, periodLabel, firstRound, lastRound]) => `<section class="manager-chip-period"><span>${periodLabel} - SR${firstRound} t/m ${lastRound}</span><select data-manager-chip-round="${canonicalId}" data-manager-chip-period="${periodId}" aria-label="${label}, ${periodLabel}"><option value="undecided">Nog niet bepalen</option><option value="skip">Niet gebruiken</option>${Array.from({ length: lastRound - firstRound + 1 }, (_, index) => `<option value="${firstRound + index}">Speelronde ${firstRound + index}</option>`).join('')}</select><small data-manager-chip-availability="${canonicalId}:${periodId}">Beschikbaar</small><small data-manager-chip-context="${canonicalId}:${periodId}"></small></section>`).join('')}</div></article>`
            }).join('')}
            </div>
            <p class="manager-chip-undecided-note" data-manager-chip-undecided-note hidden>Je hoeft niet alle chips nu al vast te zetten. Kies 'Nog niet bepalen' wanneer je later wilt beslissen. De FVT Manager toont dan wel kansrijke rondes, maar voert de chip niet automatisch uit in de handmatige modus.</p>
          </fieldset>

          <button
            id="run-optimizer"
            type="button"
          >
            🤖 Bereken mijn strategie
          </button>
        </div>
        <p class="optimizer-horizon-advice" id="optimizer-horizon-advice">
          4–10 rondes: uitgebreide planning.
        </p>
      </section>

      <section
  id="optimizer-result"
  style="display: none;"
></section>
  `
}

/*
|--------------------------------------------------------------------------
| Scherm activeren
|--------------------------------------------------------------------------
*/

export function mountOptimizerScreen() {
  const mountedTeam = getManagerTeamState()
  const mountedSettings = getManagerSettings()

    const newTeamModeButton =
    document.querySelector(
      '#manager-mode-new-team',
    )

  const currentTeamModeButton =
    document.querySelector(
      '#manager-mode-current-team',
    )

  const teamImportSection =
    document.querySelector(
      '#manager-team-import',
    )

  const teamPasteInput =
    document.querySelector(
      '#manager-team-paste-input',
    )

  const teamImportResult =
    document.querySelector(
      '#manager-team-import-result',
    )

  const teamStatusSection =
    document.querySelector(
      '#manager-team-status',
    )

  const teamBankInput =
    document.querySelector(
      '#manager-team-bank',
    )

      const teamBankDecreaseButton =
    document.querySelector(
      '#manager-team-bank-decrease',
    )

  const teamBankIncreaseButton =
    document.querySelector(
      '#manager-team-bank-increase',
    )

  const freeTransfersSelect =
    document.querySelector(
      '#manager-team-free-transfers',
    )

  const screenshotTab = document.querySelector('#manager-import-tab-screenshot')
  const textImportTab = document.querySelector('#manager-import-tab-text')
  const screenshotImportSection = document.querySelector('#manager-screenshot-import')
  const textImportSection = document.querySelector('#manager-text-import')
  const screenshotFileInput = document.querySelector('#manager-screenshot-file')
  const screenshotFileButton = document.querySelector('#manager-screenshot-file-button')
  const screenshotDropzone = document.querySelector('#manager-screenshot-dropzone')
  const screenshotPreview = document.querySelector('#manager-screenshot-preview')
  const screenshotReview = document.querySelector('#manager-screenshot-review')

  const freeTransfersField =
    document.querySelector(
      '#manager-free-transfers-field',
    )

  const preseasonFreeTransfersStatus =
    document.querySelector(
      '#manager-preseason-ft-status',
    )

  const seasonPhaseSelect =
    document.querySelector(
      '#manager-season-phase',
    )

  const teamContinueButton =
    document.querySelector(
      '#manager-team-continue',
    )

  const strategySection =
    document.querySelector(
      '#manager-strategy-section',
    )

  const strategyPresetSelect =
  document.querySelector(
    '#manager-strategy-preset',
  )

const strategyDescription =
  document.querySelector(
    '#manager-strategy-description',
  )

  const chipInputs =
    Array.from(
      document.querySelectorAll(
        '[data-manager-chip]',
      ),
    )
  const chipModeInputs = Array.from(document.querySelectorAll('[name="manager-chip-mode"]'))
  const chipCards = document.querySelector('[data-manager-chip-cards]')
  const chipModeCopy = document.querySelector('[data-manager-chip-mode-copy]')
  const chipUndecidedNote = document.querySelector('[data-manager-chip-undecided-note]')
  const chipRoundInputs = Array.from(
    document.querySelectorAll('[data-manager-chip-round]'),
  )
  const startRoundSelect =
    document.querySelector(
      '#optimizer-start-round',
    )

  const roundCountSelect =
    document.querySelector(
      '#optimizer-round-count',
    )

  const horizonAdvice =
    document.querySelector(
      '#optimizer-horizon-advice',
    )

  const optimizerButton =
    document.querySelector(
      '#run-optimizer',
    )

  const resultContainer =
    document.querySelector(
      '#optimizer-result',
    )

  const pointsTotal =
    document.querySelector(
      '#manager-points-total',
    )

  const pointsValue =
    document.querySelector(
      '#manager-points-value',
    )

  const pointsMessage =
    document.querySelector(
      '#manager-points-message',
    )

  const weightBars =
    Array.from(
      document.querySelectorAll(
        '[data-weight-key]',
      ),
    )

  const philosophyInputs =
    Array.from(
      document.querySelectorAll(
        '.manager-points-input',
      ),
    )

  const philosophyButtons =
    Array.from(
      document.querySelectorAll(
        '.manager-points-button',
      ),
    )

  if (
    !startRoundSelect ||
    !roundCountSelect ||
    !optimizerButton ||
    !resultContainer ||
    !pointsTotal ||
    !pointsValue ||
    !pointsMessage
  ) {
    return
  }

  let resultIsCurrent = false
  let activeWorker = null
  let activeJobId = null
  let activeJobStartedAt = 0
  let elapsedTimer = null
  let jobSequence = 0
  let activeJobResolve = null
  let recognitionJobSequence = 0
  let activeRecognitionJobId = null
  let activeRecognitionController = null
  let screenshotObjectUrl = ''
  let screenshotDraft = null
  let screenshotReviewFilter = 'all'

  function releaseActiveWorker() {
    if (elapsedTimer !== null) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    activeWorker?.terminate()
    activeWorker = null
    activeJobId = null
    activeJobStartedAt = 0
    activeJobResolve = null
  }

  function cancelActiveJob({ showStatus = false } = {}) {
    if (!activeWorker) return false
    const resolveCancelledJob = activeJobResolve
    releaseActiveWorker()
    resolveCancelledJob?.({ cancelled: true })
    optimizerButton.disabled = false
    optimizerButton.textContent = 'ðŸ¤– Bereken mijn strategie'

    if (showStatus) {
      queueMicrotask(() => {
        resultIsCurrent = true
        resultContainer.classList.remove('has-optimizer-result')
        resultContainer.innerHTML = safeHtml(`
          <div class="optimizer-loading is-cancelled">
            <strong>Berekening geannuleerd</strong>
            <small>Jouw invoer is behouden. Je kunt veilig opnieuw berekenen.</small>
          </div>
        `)
      })
    }
    return true
  }

  function invalidateOptimizerResult() {
  cancelActiveJob()

  resultIsCurrent = false

  resultContainer.className = ''

  resultContainer.innerHTML = safeHtml('')

  resultContainer.style.display =
    'none'
}

  function playerId(player) {
    return String(player?.id ?? player?.playerId ?? '').trim()
  }

  function playerPosition(player) {
    const value = String(player?.fantasyPosition ?? player?.position ?? '').toLowerCase()
    if (['keeper', 'goalkeeper', 'doelman'].some((item) => value.includes(item))) return 'goalkeeper'
    if (['verdediger', 'defender'].some((item) => value.includes(item))) return 'defender'
    if (['middenvelder', 'midfielder'].some((item) => value.includes(item))) return 'midfielder'
    if (['spits', 'forward', 'aanvaller'].some((item) => value.includes(item))) return 'forward'
    return value
  }

  function screenshotPositionLabel(position) {
    return ({ goalkeeper: 'Keepers', defender: 'Verdedigers', midfielder: 'Middenvelders', forward: 'Spitsen' })[position] ?? position
  }

  function screenshotCurrentPrice(player) {
    for (const value of [player?.currentPrice, player?.endPrice, player?.price, player?.startPrice]) {
      if (value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value)
    }
    return null
  }

  function initializeScreenshotRoles(slots) {
    return slots.map((slot) => ({
      ...slot,
      currentPrice: slot.extractedPrices?.current ?? '',
      sellingPrice: slot.extractedPrices?.selling ?? '',
      purchasePrice: slot.extractedPrices?.purchase ?? '',
      priceSources: {
        current: slot.extractedPrices?.current === null ? 'database' : 'screenshot',
        selling: slot.extractedPrices?.selling === null ? 'empty' : 'screenshot',
        purchase: slot.extractedPrices?.purchase === null ? 'empty' : 'screenshot',
      },
      pricesConfirmed: false,
      editing: slot.status !== 'green' ||
        slot.extractedPrices?.selling === null || slot.extractedPrices?.purchase === null ||
        (slot.extractedPrices?.current === null && screenshotCurrentPrice(slot.matchedPlayer) === null),
      allowAnyPosition: false,
    }))
  }

  function screenshotPriceValue(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null
    const number = Number(String(value).trim().replace(',', '.'))
    return Number.isFinite(number) && number >= 0 ? number : Number.NaN
  }

  function screenshotPriceLabel(value, fallback = null) {
    const parsed = screenshotPriceValue(value)
    const displayed = parsed === null ? fallback : parsed
    return Number.isFinite(displayed) ? `€${displayed.toFixed(1).replace('.', ',')}` : parsed === null ? 'ontbreekt' : 'ongeldig'
  }

  function screenshotPriceSourceLabel(source) {
    return ({ screenshot: 'screenshot', database: 'database', manual: 'handmatig', empty: 'leeg' })[source] ?? 'leeg'
  }

  function screenshotSlotNeedsAttention(slot, duplicateIds = new Set()) {
    return !slot.matchedPlayer || slot.status !== 'green' || duplicateIds.has(playerId(slot.matchedPlayer)) ||
      ['currentPrice', 'sellingPrice', 'purchasePrice'].some((key) => {
        const value = screenshotPriceValue(slot[key])
        const databaseFallback = key === 'currentPrice' && value === null && screenshotCurrentPrice(slot.matchedPlayer) !== null
        return Number.isNaN(value) || (value === null && !databaseFallback && !slot.pricesConfirmed)
      })
  }

  function renderScreenshotReview() {
    if (!screenshotReview || !screenshotDraft) return
    const players = getPlayerProfiles().filter((player) => !getDatabaseSummary()?.activeSeason || player?.season === getDatabaseSummary().activeSeason)
    const validation = validateScreenshotDraft(screenshotDraft)
    const counts = { green: 0, yellow: 0, red: 0 }
    screenshotDraft.slots.forEach((slot) => { counts[slot.status ?? 'red'] += 1 })
    const selectedIds = screenshotDraft.slots.map((slot) => playerId(slot.matchedPlayer)).filter(Boolean)
    const duplicateIds = new Set(selectedIds.filter((id, index) => selectedIds.indexOf(id) !== index))
    const completedPlayers = screenshotDraft.slots.filter((slot) => slot.matchedPlayer).length
    const controlledPrices = screenshotDraft.slots.reduce((total, slot) => total + ['currentPrice', 'sellingPrice', 'purchasePrice'].filter((key) => {
      const value = screenshotPriceValue(slot[key])
      return Number.isFinite(value) || (value === null && slot.pricesConfirmed) || (key === 'currentPrice' && value === null && screenshotCurrentPrice(slot.matchedPlayer) !== null)
    }).length, 0)
    const attentionCount = screenshotDraft.slots.filter((slot) => screenshotSlotNeedsAttention(slot, duplicateIds)).length
    const groups = ['goalkeeper', 'defender', 'midfielder', 'forward'].map((position) => {
      const groupSlots = screenshotDraft.slots.filter((slot) => slot.expectedPosition === position)
      const visibleSlots = groupSlots.filter((slot) => screenshotReviewFilter === 'all' || screenshotSlotNeedsAttention(slot, duplicateIds))
      const cards = visibleSlots.map((slot) => {
        const options = players.filter((player) => slot.allowAnyPosition || playerPosition(player) === slot.expectedPosition)
        const selectedId = playerId(slot.matchedPlayer)
        const databasePrice = screenshotCurrentPrice(slot.matchedPlayer)
        const status = slot.status ?? (slot.matchedPlayer ? 'green' : 'red')
        const statusLabel = status === 'green' ? 'Betrouwbaar herkend' : status === 'yellow' ? 'Controle aanbevolen' : 'Niet herkend'
        const editing = slot.editing || status !== 'green'
        const priceInvalid = ['currentPrice', 'sellingPrice', 'purchasePrice'].some((key) => Number.isNaN(screenshotPriceValue(slot[key])))
        const compactPrices = `HP ${screenshotPriceLabel(slot.currentPrice, databasePrice)} · VP ${screenshotPriceLabel(slot.sellingPrice)} · AP ${screenshotPriceLabel(slot.purchasePrice)}`
        const editor = `<div class="manager-screenshot-editor">
          ${status === 'red' ? '<p>Kies deze speler handmatig.</p>' : ''}
          ${status === 'yellow' && slot.alternatives?.length ? `<p class="manager-screenshot-alternatives">Alternatieven: ${slot.alternatives.slice(0, 2).map((item) => escapeHtml(item.name)).join(', ')}</p>` : ''}
          <label>Zoek speler<input data-screenshot-search type="search" placeholder="Naam of club" autocomplete="off" /></label>
          <label>Speler<select data-screenshot-player><option value="">Kies een speler…</option>${options.sort((a, b) => String(a.name).localeCompare(String(b.name), 'nl')).map((player) => `<option value="${escapeHtml(playerId(player))}" ${playerId(player) === selectedId ? 'selected' : ''}>${escapeHtml(player.name)} · ${escapeHtml(player.club)} · €${toNumber(screenshotCurrentPrice(player)).toFixed(1)}m</option>`).join('')}</select></label>
          <small class="manager-screenshot-database-price">Databaseprijs: ${databasePrice === null ? 'niet beschikbaar' : `€${databasePrice.toFixed(1).replace('.', ',')}`}</small>
          <button type="button" data-screenshot-any-position>${slot.allowAnyPosition ? 'Terug naar verwachte positie' : 'Andere positie kiezen'}</button>
          <div class="manager-screenshot-prices">${[['currentPrice','HP','huidige prijs','current'],['sellingPrice','VP','verkoopprijs','selling'],['purchasePrice','AP','aankoopprijs','purchase']].map(([key,label,help,source]) => `<label title="${help}">${label}<input data-screenshot-price="${key}" inputmode="decimal" value="${escapeHtml(slot[key])}" placeholder="Leeg" /><small>Bron: ${escapeHtml(screenshotPriceSourceLabel(slot.priceSources?.[source]))}</small></label>`).join('')}</div>
          ${slot.rawText ? `<details class="manager-screenshot-evidence"><summary>Technische herkenningsdetails</summary><small>${escapeHtml(slot.rawText)}</small></details>` : ''}
          <div class="manager-screenshot-editor-actions"><button type="button" data-screenshot-accept>Speler bevestigen</button>${slot.editSnapshot ? '<button type="button" data-screenshot-cancel-edit>Annuleren</button>' : ''}</div>
        </div>`
        return `<article class="manager-screenshot-player is-${status}${editing ? ' is-editing' : ''}" data-screenshot-slot="${slot.slot}">
          <div class="manager-screenshot-player-heading"><span>${slot.slot}</span><div><strong>${escapeHtml(slot.matchedPlayer?.name ?? 'Geen speler gekozen')}</strong><small>${escapeHtml(slot.matchedPlayer?.club ?? screenshotPositionLabel(slot.expectedPosition))} · ${escapeHtml(screenshotPositionLabel(slot.expectedPosition))}</small></div><em>${statusLabel}</em></div>
          <div class="manager-screenshot-price-summary${priceInvalid ? ' has-error' : ''}">${escapeHtml(compactPrices)}</div>
          ${editing ? editor : `<div class="manager-screenshot-card-actions"><span>${statusLabel}</span><button type="button" data-screenshot-edit>Wijzigen</button></div>`}
        </article>`
      }).join('')
      return `<section class="manager-screenshot-position"><h5>${screenshotPositionLabel(position)} · ${groupSlots.filter((slot) => slot.matchedPlayer).length}/${groupSlots.length} herkend</h5><div>${cards || '<p class="manager-screenshot-group-complete">Geen aandachtspunten in deze groep.</p>'}</div></section>`
    }).join('')
    screenshotReview.innerHTML = safeHtml(`
      <header><div><span class="manager-panel-eyebrow">Selectie en prijzen</span><h4>Controleer je herkende team</h4></div><span>${completedPlayers} van 15 spelers herkend</span></header>
      <div class="manager-screenshot-confidence"><span class="is-green">${counts.green} betrouwbaar</span><span class="is-yellow">${counts.yellow} controleren</span><span class="is-red">${counts.red} handmatig</span></div>
      <div class="manager-screenshot-summary"><strong>${completedPlayers}/15 spelers compleet · ${controlledPrices}/45 prijzen gecontroleerd</strong><progress max="15" value="${completedPlayers}"></progress><small>De FVT Manager bepaalt na import automatisch je beste opstelling, bank, formatie, captain en vice-captain.</small></div>
      <div class="manager-screenshot-filters" role="group" aria-label="Controlefilter"><button type="button" data-screenshot-filter="all" class="${screenshotReviewFilter === 'all' ? 'is-active' : ''}">Alles</button><button type="button" data-screenshot-filter="attention" class="${screenshotReviewFilter === 'attention' ? 'is-active' : ''}">Alleen controleren${attentionCount ? ` (${attentionCount})` : ''}</button></div>
      ${(screenshotDraft.warnings ?? []).length ? `<div class="manager-screenshot-warnings">${screenshotDraft.warnings.map((warning) => `<p>⚠️ ${escapeHtml(warning)}</p>`).join('')}</div>` : ''}
      ${groups}
      <div class="manager-screenshot-import-bar"><div><strong>${validation.valid ? 'Je selectie en prijzen zijn klaar om te importeren' : `${completedPlayers} van 15 spelers compleet`}</strong>${!validation.valid ? validation.errors.slice(0, 3).map((error) => `<small>${escapeHtml(error)}</small>`).join('') : ''}</div><button class="manager-primary-button" type="button" data-screenshot-confirm ${validation.valid ? '' : 'disabled'}>Selectie importeren</button></div>`)
  }

  function clearScreenshotImport() {
    activeRecognitionController?.abort()
    activeRecognitionController = null
    activeRecognitionJobId = null
    recognitionJobSequence += 1
    if (screenshotObjectUrl) URL.revokeObjectURL(screenshotObjectUrl)
    screenshotObjectUrl = ''
    screenshotDraft = null
    screenshotReviewFilter = 'all'
    if (screenshotFileInput) screenshotFileInput.value = ''
    if (screenshotPreview) { screenshotPreview.hidden = true; screenshotPreview.innerHTML = safeHtml('') }
    if (screenshotReview) screenshotReview.innerHTML = safeHtml('')
    managerTeamState.importResult = null
    managerTeamState.purchasePrices = {}
    managerTeamState.manualSellingPrices = {}
    if (teamStatusSection) teamStatusSection.hidden = true
    invalidateOptimizerResult()
  }

  async function processScreenshotFile(file, inputSource = 'bestand') {
    invalidateOptimizerResult()
    activeRecognitionController?.abort()
    activeRecognitionController = new AbortController()
    const controller = activeRecognitionController
    if (screenshotObjectUrl) URL.revokeObjectURL(screenshotObjectUrl)
    screenshotObjectUrl = ''
    screenshotDraft = null
    screenshotReviewFilter = 'all'
    if (screenshotPreview) { screenshotPreview.hidden = true; screenshotPreview.innerHTML = safeHtml('') }
    const jobId = `recognition-${Date.now()}-${++recognitionJobSequence}`
    activeRecognitionJobId = jobId
    if (screenshotReview) screenshotReview.innerHTML = safeHtml('<div class="manager-screenshot-loading">Afbeelding voorbereiden…</div>')
    let result
    try {
      result = await recognizeFantasyTeamScreenshot({
        imageFile: file, playerDatabase: getPlayerProfiles(), activeSeason: getDatabaseSummary()?.activeSeason,
        signal: controller.signal,
        onProgress: (progress) => {
          if (activeRecognitionJobId !== jobId || !screenshotReview) return
          const label = progress.phase === 'ocr' ? `Tekst herkennen: regel ${progress.row ?? 0} van ${progress.total ?? 15}` : progress.phase === 'matching' ? 'Spelers lokaal vergelijken…' : 'Lokale OCR laden…'
          screenshotReview.innerHTML = safeHtml(`<div class="manager-screenshot-loading"><strong>${label}</strong><progress max="1" value="${Math.max(0, Math.min(1, progress.progress ?? 0))}"></progress><button type="button" data-screenshot-cancel>Annuleren</button></div>`)
        },
      })
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return
      result = { valid: false, errors: ['De lokale herkenning is onverwacht gestopt. Probeer het opnieuw.'] }
    }
    if (activeRecognitionJobId !== jobId) return
    activeRecognitionJobId = null
    activeRecognitionController = null
    if (!result.valid) {
      if (screenshotReview) screenshotReview.innerHTML = safeHtml(`<div class="manager-screenshot-errors">${result.errors.map((error) => `<p>⚠️ ${escapeHtml(error)}</p>`).join('')}</div>`)
      return
    }
    if (screenshotObjectUrl) URL.revokeObjectURL(screenshotObjectUrl)
    screenshotObjectUrl = URL.createObjectURL(file)
    if (screenshotPreview) {
      screenshotPreview.hidden = false
      screenshotPreview.innerHTML = safeHtml(`<img src="${screenshotObjectUrl}" alt="Voorbeeld teamscreenshot" /><div><strong>${escapeHtml(file.name || 'Geplakte screenshot')}</strong><span>${escapeHtml(inputSource)} · ${String(file.type).replace('image/', '').toUpperCase()} · ${(file.size / 1024 / 1024).toFixed(1)} MB · ${result.dimensions.width}×${result.dimensions.height}</span><button type="button" data-screenshot-replace>Andere screenshot plakken</button><button type="button" data-screenshot-remove>Screenshot verwijderen</button></div>`)
    }
    screenshotDraft = {
      slots: initializeScreenshotRoles(result.recognizedPlayers),
      warnings: result.warnings,
    }
    renderScreenshotReview()
  }

  function getProgressLabel(progress = {}) {
    const labels = {
      'request-validation': 'Aanvraag controleren',
      'resolving-current-team': 'Jouw selectie verwerken',
      'building-new-team': 'Nieuwe selectie bouwen',
      'preparing-preseason': 'Voorseizoen voorbereiden',
      'evaluating-current-team': 'Huidige selectie beoordelen',
      'building-preseason-squad': 'Voorseizoensteam bouwen',
      'optimizing-round-1-lineup': 'Opstelling voor speelronde 1 bepalen',
      'optimizing-lineup': 'Beste opstelling bepalen',
      'generating-first-transfer-advice': 'Eerste transferadvies berekenen',
      'planning-season': 'Seizoensstrategie onderzoeken',
      'planning-regular-season': 'Reguliere speelrondes onderzoeken',
      'building-timeline': 'Tijdlijn opbouwen',
      completed: 'Berekening afronden',
    }
    if (['planning-season', 'planning-regular-season'].includes(progress.phase) && progress.currentGeneration) {
      return `Speelronde ${progress.currentGeneration} van ${progress.totalGenerations} wordt onderzocht`
    }
    return labels[progress.phase] ?? 'FVT Manager analyseert jouw team'
  }

  function updateProgressCard(progress = {}) {
    const label = resultContainer.querySelector('[data-optimizer-progress-label]')
    const details = resultContainer.querySelector('[data-optimizer-progress-details]')
    if (label) label.textContent = getProgressLabel(progress)
    if (details) {
      const metrics = []
      if (progress.processedStates !== undefined) metrics.push(`${progress.processedStates} states`)
      if (progress.selectedActions !== undefined) metrics.push(`${progress.selectedActions} acties`)
      if (progress.bestScore !== null && progress.bestScore !== undefined) {
        metrics.push(`beste score ${formatExpectedPoints(progress.bestScore)}`)
      }
      details.textContent = metrics.join(' · ') || 'De berekening loopt op de achtergrond.'
    }
  }

  function runManagerOptimizerInWorker({ request, players, databaseSummary }) {
    cancelActiveJob()
    const jobId = `manager-${Date.now()}-${++jobSequence}`
    const worker = new Worker(
      new URL('../workers/managerOptimizer.worker.js', import.meta.url),
      { type: 'module' },
    )
    activeWorker = worker
    activeJobId = jobId
    activeJobStartedAt = performance.now()

    return new Promise((resolve, reject) => {
      activeJobResolve = resolve
      const finish = (callback) => {
        if (activeJobId !== jobId) return
        releaseActiveWorker()
        callback()
      }

      worker.addEventListener('message', (event) => {
        const message = event.data
        if (message?.jobId !== activeJobId || message.jobId !== jobId) return
        if (message.type === 'manager-optimizer-progress') {
          updateProgressCard(message.progress)
        } else if (message.type === 'manager-optimizer-result') {
          finish(() => resolve(message.result))
        } else if (message.type === 'manager-optimizer-error') {
          const error = new Error((message.errors ?? ['Onbekende Workerfout.']).join(' '))
          error.phase = message.phase
          finish(() => reject(error))
        }
      })
      worker.addEventListener('error', (event) => {
        console.error('FVT Manager Workerfout:', event.error ?? event.message)
        finish(() => reject(new Error('De achtergrondberekening kon niet worden gestart.')))
      })
      worker.addEventListener('messageerror', () => {
        finish(() => reject(new Error('Het Workerresultaat kon niet worden gelezen.')))
      })

      elapsedTimer = window.setInterval(() => {
        if (activeJobId !== jobId) return
        const elapsed = resultContainer.querySelector('[data-optimizer-elapsed]')
        if (elapsed) elapsed.textContent = `${((performance.now() - activeJobStartedAt) / 1000).toFixed(1)} sec`
      }, 200)

      worker.postMessage({
        type: 'run-manager-optimizer',
        jobId,
        request,
        players,
        databaseSummary,
        sentAt: Date.now(),
      })
    })
  }

  function synchronizeFreeTransferVisibility() {
    const isPreseason = managerTeamState.seasonPhase === 'preseason'
    if (freeTransfersField) freeTransfersField.hidden = isPreseason
    if (preseasonFreeTransfersStatus) preseasonFreeTransfersStatus.hidden = !isPreseason
  }

  function setTeamMode(
    mode,
  ) {
    managerTeamState.mode =
      mode

    if (mode === 'new-team') {
      managerTeamState.seasonPhase = 'preseason'
    }

    managerTeamState.seasonStatus = {
      phase: managerTeamState.seasonPhase,
      firstPlayableRound: 1,
    }

    if (seasonPhaseSelect) {
      seasonPhaseSelect.value = managerTeamState.seasonPhase
    }
    if (managerTeamState.seasonPhase === 'preseason' && startRoundSelect) {
      startRoundSelect.value = '1'
      managerSettings.planning.startRound = 1
    }
    synchronizeFreeTransferVisibility()

    invalidateOptimizerResult()

    newTeamModeButton
      ?.classList
      .toggle(
        'is-selected',
        mode ===
          'new-team',
      )

    currentTeamModeButton
      ?.classList
      .toggle(
        'is-selected',
        mode ===
          'current-team',
      )

    if (
      mode ===
      'new-team'
    ) {
      managerTeamState
        .importResult =
        null

      if (
        teamImportSection
      ) {
        teamImportSection.hidden =
          true
      }

      if (
        strategySection
      ) {
        strategySection.hidden =
          false
      }

      strategySection
        ?.scrollIntoView({
          behavior:
            'smooth',

          block:
            'start',
        })

      return
    }

    if (
      mode ===
      'current-team'
    ) {
      if (
        strategySection
      ) {
        strategySection.hidden =
          true
      }

      if (
        teamImportSection
      ) {
        teamImportSection.hidden =
          false
      }

      teamImportSection
        ?.scrollIntoView({
          behavior:
            'smooth',

          block:
            'start',
        })

      teamPasteInput
        ?.focus()
    }
  }

  function getImportedPlayerLabel(
    importedPlayer,
  ) {
    return (
      importedPlayer
        ?.player
        ?.name ??
      importedPlayer
        ?.importedName ??
      'Onbekende speler'
    )
  }

  function getImportedPlayerClub(
    importedPlayer,
  ) {
    return (
      importedPlayer
        ?.player
        ?.club ??
      importedPlayer
        ?.importedClub ??
      'Onbekende club'
    )
  }

  function renderImportedTeam(
    importResult,
  ) {
    if (
      !teamImportResult
    ) {
      return
    }

    const positionCounts =
      importResult
        ?.positionCounts ??
      {}

    const matchedAmount =
      importResult
        ?.matchedPlayers
        ?.length ??
      0

    const sourceLabel =
      importResult
        ?.source ===
        'list'
        ? 'Lijstweergave'
        : importResult?.sourceType === 'screenshot'
          ? 'Gecontroleerde screenshot'
          : 'Opstellingsweergave'

    if (
      !importResult
        ?.players
        ?.length
    ) {
      teamImportResult.innerHTML = safeHtml(`
        <div class="manager-team-import-error">
          <span>
            ⚠️
          </span>

          <strong>
            Geen spelers herkend
          </strong>

          <p>
            Controleer of je de volledige opstelling
            of lijstweergave hebt gekopieerd.
          </p>
        </div>
      `)

      if (
        teamStatusSection
      ) {
        teamStatusSection.hidden =
          true
      }

      return
    }

    teamImportResult.innerHTML = safeHtml(`
      <div
        class="
          manager-team-import-summary
          ${
            importResult.valid
              ? 'is-valid'
              : 'has-errors'
          }
        "
      >
        <header>
          <div>
            <span class="manager-team-import-status-icon">
              ${
                importResult.valid
                  ? '✅'
                  : '⚠️'
              }
            </span>

            <div>
              <strong>
                ${
                  importResult.valid
                    ? 'Team succesvol geïmporteerd'
                    : 'Team gedeeltelijk herkend'
                }
              </strong>

              <small>
                ${sourceLabel}
              </small>
            </div>
          </div>

          <span class="manager-team-player-total">
            ${matchedAmount} / 15 spelers
          </span>
        </header>

        <div class="manager-team-position-counts">
          <span>
            ${toNumber(
              positionCounts
                .goalkeeper,
            )} keepers
          </span>

          <span>
            ${toNumber(
              positionCounts
                .defender,
            )} verdedigers
          </span>

          <span>
            ${toNumber(
              positionCounts
                .midfielder,
            )} middenvelders
          </span>

          <span>
            ${toNumber(
              positionCounts
                .forward,
            )} spitsen
          </span>
        </div>

        ${
          importResult
            .errors
            ?.length
            ? `
              <div class="manager-team-import-errors">
                ${importResult
                  .errors
                  .map(
                    (
                      error,
                    ) => `
                      <p>
                        ⚠️ ${escapeHtml(
                          error,
                        )}
                      </p>
                    `,
                  )
                  .join('')}
              </div>
            `
            : ''
        }

        <div class="manager-team-imported-list">
          ${importResult
            .players
            .map(
              (
                importedPlayer,
              ) => `
                <article
                  class="
                    manager-team-imported-player
                    is-${escapeHtml(
                      importedPlayer
                        ?.status ??
                      'unknown',
                    )}
                  "
                >
                  <span class="manager-team-player-match">
                    ${
                      importedPlayer
                        ?.status ===
                        'matched'
                        ? '✓'
                        : '!'
                    }
                  </span>

                  <div class="manager-team-player-copy">
                    <strong>
                      ${escapeHtml(
                        getImportedPlayerLabel(
                          importedPlayer,
                        ),
                      )}
                    </strong>

                    <small>
                      ${escapeHtml(
                        getImportedPlayerClub(
                          importedPlayer,
                        ),
                      )}
                    </small>
                  </div>

                  <div class="manager-team-player-prices">
                    <span>
                      HP
                      <strong>
                        €${toNumber(
                          importedPlayer
                            ?.currentPrice,
                        ).toFixed(1)}
                      </strong>
                    </span>

                    <span>
                      VP
                      <strong>
                        €${toNumber(
                          importedPlayer
                            ?.sellingPrice,
                        ).toFixed(1)}
                      </strong>
                    </span>

                    <span>
                      AP
                      <strong>
                        €${toNumber(
                          importedPlayer
                            ?.purchasePrice,
                        ).toFixed(1)}
                      </strong>
                    </span>
                  </div>
                </article>
              `,
            )
            .join('')}
        </div>
      </div>
    `)

    if (
      teamStatusSection
    ) {
      teamStatusSection.hidden =
        !importResult.valid
    }

    if (
      teamContinueButton
    ) {
      teamContinueButton.disabled =
        !importResult.valid
    }
  }

  function importFantasyTeam() {
    if (
      !teamPasteInput
    ) {
      return
    }

    const text =
      teamPasteInput.value

    activeRecognitionJobId = null
    recognitionJobSequence += 1

    const databaseSummary =
      getDatabaseSummary()

    const activeSeason =
      databaseSummary
        ?.activeSeason ??
      ''

    const playerProfiles =
      getPlayerProfiles()

    const activeSeasonPlayers =
      playerProfiles.filter(
        (
          player,
        ) =>
          !activeSeason ||
          player?.season ===
            activeSeason,
      )

    const importResult =
      parseFantasyTeamText({
        text,

        players:
          activeSeasonPlayers,
      })

    managerTeamState
      .importResult =
      importResult

    invalidateOptimizerResult()

    renderImportedTeam(
      importResult,
    )
  }

  function synchronizeTeamStatus() {
    invalidateOptimizerResult()

    if (managerTeamState.mode === 'current-team') {
      managerTeamState.seasonPhase = seasonPhaseSelect?.value === 'preseason'
        ? 'preseason'
        : 'in-season'
      managerTeamState.seasonStatus = {
        phase: managerTeamState.seasonPhase,
        firstPlayableRound: 1,
      }
      if (managerTeamState.seasonPhase === 'preseason' && startRoundSelect) {
        startRoundSelect.value = '1'
        managerSettings.planning.startRound = 1
      }
    }
    synchronizeFreeTransferVisibility()

    managerTeamState.bank =
      toNumber(
        teamBankInput
          ?.value,
        0,
      )

    managerTeamState
      .freeTransfers = managerTeamState.seasonPhase === 'preseason'
      ? 0
      : Math.max(
        0,
        Math.min(
          2,
          Math.round(
            toNumber(
              freeTransfersSelect
                ?.value,
              1,
            ),
          ),
        ),
      )

    const chipAliases = {
      sugarDaddy: 'sugar-daddy',
      dynamicDuo: 'dynamic-duo',
    }
    const selectedChipMode = chipModeInputs.find((input) => input.checked)?.value
    const chipMode = ['disabled', 'manual', 'automatic'].includes(selectedChipMode)
      ? selectedChipMode
      : 'disabled'
    managerTeamState.chipStrategy = {
      ...managerTeamState.chipStrategy,
      mode: chipMode,
      allowedChips: chipInputs
        .filter((input) => input.checked)
        .map((input) => chipAliases[input.dataset.managerChip] ?? input.dataset.managerChip)
        .filter(Boolean),
      schedule: chipMode === 'manual' ? chipRoundInputs.map((input) => {
        const round = Number(input.value)
        const decision = ['undecided', 'skip'].includes(input.value) ? input.value : 'scheduled'
        return {
          chipId: input.dataset.managerChipRound,
          periodId: input.dataset.managerChipPeriod,
          round: decision === 'scheduled' && Number.isInteger(round) ? round : null,
          decision,
        }
      }) : [],
    }
    if (chipCards) chipCards.hidden = chipMode === 'disabled'
    if (chipUndecidedNote) chipUndecidedNote.hidden = chipMode !== 'manual'
    if (chipModeCopy) chipModeCopy.textContent = chipMode === 'automatic'
      ? 'De FVT Manager vergelijkt lokale chipmomenten met de beste complete chip- en transferstrategie.'
      : chipMode === 'manual'
        ? 'Plan iedere chip afzonderlijk voor periode 1 en periode 2.'
        : 'De planner gebruikt in deze berekening geen chips.'
    document.querySelectorAll('[data-manager-chip-card]').forEach((card) => {
      card.classList.toggle('is-manual', chipMode === 'manual')
      card.classList.toggle('is-automatic', chipMode === 'automatic')
    })
    const plannerStartRound = Math.max(1, Math.min(34, Number(startRoundSelect?.value) || 1))
    const plannerEndRound = Math.min(34, plannerStartRound + Math.max(1, Number(roundCountSelect?.value) || 1) - 1)
    const usedRounds = managerTeamState.chipStrategy?.state?.usedRounds ?? {}
    const selectedConcreteRounds = new Set()
    chipRoundInputs.forEach((input) => {
      const chipId = input.dataset.managerChipRound
      const periodId = input.dataset.managerChipPeriod
      const periodStart = periodId === 'period-1' ? 1 : 18
      const periodEnd = periodId === 'period-1' ? 17 : 34
      const usedRound = (usedRounds[chipId] ?? []).find((value) => Number(value) >= periodStart && Number(value) <= periodEnd)
      Array.from(input.options).forEach((option) => {
        if (['undecided', 'skip'].includes(option.value)) return
        const roundNumber = Number(option.value)
        option.hidden = roundNumber < plannerStartRound
        option.disabled = roundNumber < plannerStartRound || Boolean(usedRound)
      })
      if (input.selectedOptions[0]?.disabled || input.selectedOptions[0]?.hidden) input.value = 'undecided'
      input.disabled = chipMode !== 'manual' || Boolean(usedRound) || plannerStartRound > periodEnd
      const roundNumber = Number(input.value)
      input.setCustomValidity('')
      if (chipMode === 'manual' && Number.isInteger(roundNumber)) {
        if (selectedConcreteRounds.has(roundNumber)) input.setCustomValidity('Er kan maximaal Ã©Ã©n chip per speelronde worden gebruikt.')
        selectedConcreteRounds.add(roundNumber)
      }
      const statusElement = document.querySelector(`[data-manager-chip-availability="${chipId}:${periodId}"]`)
      if (statusElement) statusElement.textContent = usedRound
        ? `Al gebruikt in speelronde ${usedRound}`
        : plannerStartRound > periodEnd ? 'Periode verstreken'
          : plannerStartRound < periodStart ? 'Nog niet beschikbaar'
            : input.value === 'skip' ? 'Niet gebruiken'
              : input.value === 'undecided' ? 'Nog niet bepaald' : 'Beschikbaar'
      const contextElement = document.querySelector(`[data-manager-chip-context="${chipId}:${periodId}"]`)
      if (contextElement) contextElement.textContent = Number.isInteger(roundNumber)
        ? roundNumber <= plannerEndRound
          ? 'Deze chip wordt samen met je transfers en opstelling doorgerekend.'
          : 'Deze keuze ligt buiten de huidige planning. De FVT Manager beoordeelt de ronde wel, maar voert de volledige transferroute in deze berekening nog niet uit.'
        : input.value === 'undecided' ? 'De chip blijft beschikbaar; er wordt nog geen ronde verplicht vastgezet.' : ''
    })
    document.querySelectorAll('[data-manager-chip-availability]:not([data-manager-chip-availability*="\:"])').forEach((element) => {
      const chipId = element.dataset.managerChipAvailability
      const used = usedRounds[chipId] ?? []
      const period1 = used.some((roundNumber) => Number(roundNumber) <= 17) ? 'gebruikt' : 'beschikbaar'
      const period2 = used.some((roundNumber) => Number(roundNumber) >= 18) ? 'gebruikt' : 'beschikbaar'
      element.textContent = `Periode 1: ${period1} · Periode 2: ${period2}`
    })
  }

  const ruleBindings = [
    {
      key: 'maxPlayersPerClub',

      enabledElement:
        document.querySelector(
          '#manager-rule-club-limit-enabled',
        ),

      valueElement:
        document.querySelector(
          '#manager-rule-club-limit',
        ),

      parseValue:
        Number,
    },

    {
      key: 'minPlayingChance',

      enabledElement:
        document.querySelector(
          '#manager-rule-playing-chance-enabled',
        ),

      valueElement:
        document.querySelector(
          '#manager-rule-playing-chance',
        ),

      parseValue:
        Number,
    },

    {
      key: 'maxTransferHit',

      enabledElement:
        document.querySelector(
          '#manager-rule-transfer-hit-enabled',
        ),

      valueElement:
        document.querySelector(
          '#manager-rule-transfer-hit',
        ),

      parseValue:
        Number,
    },

    {
      key: 'minMoneyInBank',

      enabledElement:
        document.querySelector(
          '#manager-rule-bank-enabled',
        ),

      valueElement:
        document.querySelector(
          '#manager-rule-bank',
        ),

      parseValue:
        Number,
    },
  ]

function applyManagerStrategy(
  strategyId,
) {
  const strategy =
    MANAGER_STRATEGIES.find(
      (
        candidate,
      ) =>
        candidate.id ===
        strategyId,
    )

  if (
    !strategy
  ) {
    return
  }

  philosophyInputs.forEach(
    (
      input,
    ) => {
      const key =
        input.dataset
          .philosophyKey

      if (
        !key ||
        strategy
          .weights[
            key
          ] ===
          undefined
      ) {
        return
      }

      input.value =
        String(
          strategy
            .weights[
              key
            ],
        )
    },
  )

  if (
    strategyDescription
  ) {
    strategyDescription.textContent =
      strategy.description
  }

  updatePhilosophyState()
}

  function normalizePointsValue(
    value,
  ) {
    const number =
      Math.round(
        Number(value),
      )

    if (
      !Number.isFinite(
        number,
      )
    ) {
      return 0
    }

    return Math.min(
      100,
      Math.max(
        0,
        number,
      ),
    )
  }

  function getPhilosophyTotal() {
    return philosophyInputs.reduce(
      (
        total,
        input,
      ) =>
        total +
        normalizePointsValue(
          input.value,
        ),
      0,
    )
  }

strategyPresetSelect
  ?.addEventListener(
    'change',
    () => {
      applyManagerStrategy(
        strategyPresetSelect.value,
      )
    },
  )

newTeamModeButton
    ?.addEventListener(
      'click',
      () => {
        setTeamMode(
          'new-team',
        )
      },
    )

  currentTeamModeButton
    ?.addEventListener(
      'click',
      () => {
        setTeamMode(
          'current-team',
        )
      },
    )

  function setImportMethod(method) {
    const screenshotActive = method === 'screenshot'
    screenshotTab?.classList.toggle('is-active', screenshotActive)
    textImportTab?.classList.toggle('is-active', !screenshotActive)
    if (screenshotImportSection) screenshotImportSection.hidden = !screenshotActive
    if (textImportSection) textImportSection.hidden = screenshotActive
    if (teamImportResult) teamImportResult.hidden = screenshotActive
    activeRecognitionController?.abort()
    activeRecognitionController = null
    activeRecognitionJobId = null
    recognitionJobSequence += 1
    if (!screenshotActive) {
      if (screenshotObjectUrl) URL.revokeObjectURL(screenshotObjectUrl)
      screenshotObjectUrl = ''
      screenshotDraft = null
      if (screenshotPreview) { screenshotPreview.hidden = true; screenshotPreview.innerHTML = safeHtml('') }
      if (screenshotReview) screenshotReview.innerHTML = safeHtml('')
    } else {
      queueMicrotask(() => screenshotDropzone?.focus())
    }
    managerTeamState.importResult = null
    managerTeamState.purchasePrices = {}
    managerTeamState.manualSellingPrices = {}
    if (teamStatusSection) teamStatusSection.hidden = true
    invalidateOptimizerResult()
    if (!screenshotActive) importFantasyTeam()
  }

  screenshotTab?.addEventListener('click', () => setImportMethod('screenshot'))
  textImportTab?.addEventListener('click', () => setImportMethod('text'))
  screenshotFileButton?.addEventListener('click', () => screenshotFileInput?.click())
  screenshotDropzone?.addEventListener('dragover', (event) => { event.preventDefault(); screenshotDropzone.classList.add('is-dragging') })
  screenshotDropzone?.addEventListener('dragleave', () => screenshotDropzone.classList.remove('is-dragging'))
  screenshotDropzone?.addEventListener('drop', (event) => {
    event.preventDefault()
    screenshotDropzone.classList.remove('is-dragging')
    processScreenshotFile(event.dataTransfer?.files?.[0], 'Gesleept')
  })
  screenshotFileInput?.addEventListener('change', () => processScreenshotFile(screenshotFileInput.files?.[0], 'Bestand'))
  document.addEventListener('paste', (event) => {
    if (!screenshotImportSection?.isConnected) return
    if (screenshotImportSection?.hidden || event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return
    const image = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'))?.getAsFile()
      ?? Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith('image/'))
    event.preventDefault()
    if (!image) {
      if (screenshotReview) screenshotReview.innerHTML = safeHtml('<div class="manager-screenshot-warnings"><p>Er staat geen afbeelding op het klembord.</p></div>')
      return
    }
    processScreenshotFile(image, 'Klembord')
  })
  screenshotPreview?.addEventListener('click', (event) => {
    if (event.target.closest('[data-screenshot-replace]')) screenshotFileInput?.click()
    if (event.target.closest('[data-screenshot-remove]')) clearScreenshotImport()
  })
  screenshotReview?.addEventListener('input', (event) => {
    if (!event.target.matches('[data-screenshot-search]')) return
    const article = event.target.closest('[data-screenshot-slot]')
    const slot = screenshotDraft?.slots.find((item) => item.slot === Number(article?.dataset.screenshotSlot))
    const select = article?.querySelector('[data-screenshot-player]')
    if (!slot || !select) return
    const query = String(event.target.value).trim().toLocaleLowerCase('nl-NL')
    const selectedId = playerId(slot.matchedPlayer)
    const matches = getPlayerProfiles().filter((player) => (
      (slot.allowAnyPosition || playerPosition(player) === slot.expectedPosition) &&
      (!query || `${player.name} ${player.club}`.toLocaleLowerCase('nl-NL').includes(query))
    )).sort((a, b) => String(a.name).localeCompare(String(b.name), 'nl')).slice(0, 50)
    select.innerHTML = safeHtml(`<option value="">Kies een speler…</option>${matches.map((player) => `<option value="${escapeHtml(playerId(player))}" ${playerId(player) === selectedId ? 'selected' : ''}>${escapeHtml(player.name)} · ${escapeHtml(player.club)} · €${toNumber(screenshotCurrentPrice(player)).toFixed(1)}m</option>`).join('')}`)
  })
  screenshotReview?.addEventListener('change', (event) => {
    if (!screenshotDraft) return
    const article = event.target.closest('[data-screenshot-slot]')
    const slot = article
      ? screenshotDraft.slots.find((item) => item.slot === Number(article.dataset.screenshotSlot))
      : null
    if (slot && event.target.matches('[data-screenshot-player]')) {
      const selectedId = String(event.target.value)
      slot.matchedPlayer = getPlayerProfiles().find((player) => playerId(player) === selectedId) ?? null
      slot.matchedPlayerId = slot.matchedPlayer ? selectedId : null
      slot.status = slot.matchedPlayer ? 'yellow' : 'red'
      if (slot.priceSources?.current === 'database') slot.currentPrice = ''
    }
    if (slot && event.target.matches('[data-screenshot-price]')) {
      const key = event.target.dataset.screenshotPrice
      slot[key] = event.target.value
      const sourceKey = ({ currentPrice: 'current', sellingPrice: 'selling', purchasePrice: 'purchase' })[key]
      if (sourceKey) slot.priceSources[sourceKey] = String(event.target.value).trim() ? 'manual' : sourceKey === 'current' ? 'database' : 'empty'
      slot.pricesConfirmed = false
    }
    invalidateOptimizerResult()
    renderScreenshotReview()
  })
  screenshotReview?.addEventListener('click', (event) => {
    if (event.target.closest('[data-screenshot-cancel]')) {
      activeRecognitionController?.abort()
      activeRecognitionController = null
      activeRecognitionJobId = null
      recognitionJobSequence += 1
      screenshotReview.innerHTML = safeHtml('<div class="manager-screenshot-warnings"><p>Herkenning geannuleerd. Je kunt direct een andere screenshot plakken.</p></div>')
      return
    }
    if (!screenshotDraft) return
    const filterButton = event.target.closest('[data-screenshot-filter]')
    if (filterButton) {
      screenshotReviewFilter = filterButton.dataset.screenshotFilter
      renderScreenshotReview()
      return
    }
    const article = event.target.closest('[data-screenshot-slot]')
    const slot = article
      ? screenshotDraft.slots.find((item) => item.slot === Number(article.dataset.screenshotSlot))
      : null
    if (slot && event.target.closest('[data-screenshot-any-position]')) {
      slot.allowAnyPosition = !slot.allowAnyPosition
      invalidateOptimizerResult()
      renderScreenshotReview()
      return
    }
    if (slot && event.target.closest('[data-screenshot-edit]')) {
      slot.editSnapshot = {
        matchedPlayer: slot.matchedPlayer, matchedPlayerId: slot.matchedPlayerId, status: slot.status,
        currentPrice: slot.currentPrice, sellingPrice: slot.sellingPrice, purchasePrice: slot.purchasePrice,
        priceSources: { ...slot.priceSources }, pricesConfirmed: slot.pricesConfirmed, allowAnyPosition: slot.allowAnyPosition,
      }
      slot.editing = true
      renderScreenshotReview()
      return
    }
    if (slot && event.target.closest('[data-screenshot-cancel-edit]')) {
      Object.assign(slot, slot.editSnapshot)
      slot.editSnapshot = null
      slot.editing = false
      renderScreenshotReview()
      return
    }
    if (slot && event.target.closest('[data-screenshot-accept]')) {
      const invalidPrice = ['currentPrice', 'sellingPrice', 'purchasePrice'].some((key) => Number.isNaN(screenshotPriceValue(slot[key])))
      if (slot.matchedPlayer && !invalidPrice) {
        slot.status = 'green'
        slot.pricesConfirmed = true
        slot.editSnapshot = null
        slot.editing = false
      }
      invalidateOptimizerResult()
      renderScreenshotReview()
      return
    }

    if (event.target.closest('[data-screenshot-confirm]')) {
      const importResult = createScreenshotImportResult(screenshotDraft)
      if (!importResult.valid) { renderScreenshotReview(); return }
      managerTeamState.importResult = importResult
      managerTeamState.purchasePrices = { ...importResult.purchasePrices }
      managerTeamState.manualSellingPrices = { ...importResult.manualSellingPrices }
      invalidateOptimizerResult()
      if (teamImportResult) teamImportResult.hidden = false
      renderImportedTeam(importResult)
    }
  })

  teamPasteInput
    ?.addEventListener(
      'input',
      importFantasyTeam,
    )

  teamPasteInput
    ?.addEventListener(
      'paste',
      () => {
        window.setTimeout(
          importFantasyTeam,
          0,
        )
      },
    )

  function changeTeamBank(
    change,
  ) {
    if (
      !teamBankInput
    ) {
      return
    }

    const currentValue =
      toNumber(
        teamBankInput.value,
        0,
      )

    const nextValue =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (
              currentValue +
              change
            ) * 10,
          ) / 10,
        ),
      )

    teamBankInput.value =
      nextValue.toFixed(1)

    synchronizeTeamStatus()
  }

  teamBankDecreaseButton
    ?.addEventListener(
      'click',
      () => {
        changeTeamBank(
          -0.1,
        )
      },
    )

  teamBankIncreaseButton
    ?.addEventListener(
      'click',
      () => {
        changeTeamBank(
          0.1,
        )
      },
    )

  teamBankInput
    ?.addEventListener(
      'input',
      synchronizeTeamStatus,
    )

  freeTransfersSelect
    ?.addEventListener(
      'change',
      synchronizeTeamStatus,
    )

  seasonPhaseSelect
    ?.addEventListener(
      'change',
      synchronizeTeamStatus,
    )

  chipInputs.forEach(
    (
      input,
    ) => {
      input.addEventListener(
        'change',
        synchronizeTeamStatus,
      )
    },
  )

  teamContinueButton
    ?.addEventListener(
      'click',
      () => {
        synchronizeTeamStatus()

        if (
          !managerTeamState
            .importResult
            ?.valid
        ) {
          return
        }

        if (
          strategySection
        ) {
          strategySection.hidden =
            false
        }

        strategySection
          ?.scrollIntoView({
            behavior:
              'smooth',

            block:
              'start',
          })
      },
    )

    function synchronizeManagerSettings() {
    invalidateOptimizerResult()

    philosophyInputs.forEach(
      (
        input,
      ) => {
        const key =
          input.dataset
            .philosophyKey

        if (
          !key
        ) {
          return
        }

        managerSettings
          .philosophy[
            key
          ] =
          normalizePointsValue(
            input.value,
          )
      },
    )

    ruleBindings.forEach(
      (
        binding,
      ) => {
        if (
          !binding
            .enabledElement ||
          !binding
            .valueElement
        ) {
          return
        }

        managerSettings
          .rules[
            binding.key
          ] = {
          enabled:
            binding
              .enabledElement
              .checked,

          value:
            binding.parseValue(
              binding
                .valueElement
                .value,
            ),
        }
      },
    )

    managerSettings
      .planning
      .startRound =
      Number(
        startRoundSelect.value,
      )

    managerSettings
      .planning
      .roundCount =
      Number(
        roundCountSelect.value,
      )
  }

  function updatePhilosophyState({ invalidateResult = true } = {}) {
    if (invalidateResult) invalidateOptimizerResult()

    const total =
      getPhilosophyTotal()

    const difference =
      total -
      MANAGER_PHILOSOPHY_TOTAL

    pointsValue.textContent =
      String(total)

    pointsTotal.classList.toggle(
      'is-valid',
      difference === 0,
    )

    pointsTotal.classList.toggle(
      'is-over',
      difference > 0,
    )

    pointsTotal.classList.toggle(
      'is-under',
      difference < 0,
    )

    if (
      difference === 0
    ) {
      pointsMessage.textContent =
        '✓ Klaar om te berekenen'
    } else if (
      difference > 0
    ) {
      pointsMessage.textContent =
        `Nog ${difference} ${
          difference === 1
            ? 'punt'
            : 'punten'
        } verwijderen`
    } else {
      const missingPoints =
        Math.abs(
          difference,
        )

      pointsMessage.textContent =
        `Nog ${missingPoints} ${
          missingPoints === 1
            ? 'punt'
            : 'punten'
        } verdelen`
    }

    optimizerButton.disabled =
      difference !== 0

    optimizerButton.title =
      difference === 0
        ? ''
        : pointsMessage.textContent

    philosophyInputs.forEach(
      (
        input,
      ) => {
        const key =
          input.dataset
            .philosophyKey

        const value =
          normalizePointsValue(
            input.value,
          )

        const bar =
          weightBars.find(
            (
              candidate,
            ) =>
              candidate.dataset
                .weightKey ===
              key,
          )

        if (
          bar
        ) {
          bar.style.width =
            `${value}%`
        }
      },
    )

    synchronizeManagerSettings()
  }

  function updateRuleState(
    binding,
  ) {
    if (
      !binding
        .enabledElement ||
      !binding
        .valueElement
    ) {
      return
    }

    const enabled =
      binding
        .enabledElement
        .checked

    binding
      .valueElement
      .disabled =
      !enabled

    const ruleRow =
      binding
        .enabledElement
        .closest(
          '.manager-rule-row',
        )

    ruleRow?.classList.toggle(
      'is-disabled',
      !enabled,
    )

    synchronizeManagerSettings()
  }

  philosophyInputs.forEach(
    (
      input,
    ) => {
      input.addEventListener(
        'input',
        () => {
          input.value =
            String(
              normalizePointsValue(
                input.value,
              ),
            )

          updatePhilosophyState()
        },
      )

      input.addEventListener(
        'change',
        () => {
          input.value =
            String(
              normalizePointsValue(
                input.value,
              ),
            )

          updatePhilosophyState()
        },
      )
    },
  )

  philosophyButtons.forEach(
    (
      button,
    ) => {
      button.addEventListener(
        'click',
        () => {
          const key =
            button.dataset
              .pointsKey

          const action =
            button.dataset
              .pointsAction

          const input =
            philosophyInputs.find(
              (
                candidate,
              ) =>
                candidate
                  .dataset
                  .philosophyKey ===
                key,
            )

          if (
            !input
          ) {
            return
          }

          const currentValue =
            normalizePointsValue(
              input.value,
            )

          const change =
            action ===
            'increase'
              ? 1
              : -1

          input.value =
            String(
              normalizePointsValue(
                currentValue +
                  change,
              ),
            )

          updatePhilosophyState()
        },
      )
    },
  )

  ruleBindings.forEach(
    (
      binding,
    ) => {
      if (
        !binding
          .enabledElement ||
        !binding
          .valueElement
      ) {
        return
      }

      binding
        .enabledElement
        .addEventListener(
          'change',
          () => {
            updateRuleState(
              binding,
            )
          },
        )

      binding
        .valueElement
        .addEventListener(
          'change',
          synchronizeManagerSettings,
        )

      updateRuleState(
        binding,
      )
    },
  )

  startRoundSelect.addEventListener(
    'change',
    synchronizeManagerSettings,
  )

  roundCountSelect.addEventListener(
    'change',
    synchronizeManagerSettings,
  )
  chipModeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    const scrollContainer =
      document.querySelector(
        '.main-content',
      )

    const scrollTop =
      scrollContainer?.scrollTop ?? 0

    synchronizeTeamStatus()

    requestAnimationFrame(() => {
      if (
        scrollContainer
      ) {
        scrollContainer.scrollTop =
          scrollTop
      }
    })
  })
})
  chipRoundInputs.forEach((input) => input.addEventListener('change', synchronizeTeamStatus))

  roundCountSelect.addEventListener('change', () => {
    if (!horizonAdvice) return
    const rounds = Number(roundCountSelect.value)
    horizonAdvice.textContent = rounds <= 3
      ? '1–3 rondes: snelle planning.'
      : rounds <= 10
        ? '4–10 rondes: uitgebreide planning.'
        : rounds <= 17
          ? '11–17 rondes: deze berekening kan langer duren.'
          : '18–34 rondes: experimentele, zware planning.'
  })

  optimizerButton.addEventListener(
    'click',
    async () => {
      const philosophyTotal =
        getPhilosophyTotal()

      if (
        philosophyTotal !==
        MANAGER_PHILOSOPHY_TOTAL
      ) {
        updatePhilosophyState()

        return
      }

      synchronizeTeamStatus()
      synchronizeManagerSettings()

      const startRound =
        managerSettings
          .planning
          .startRound

      const roundCount =
        managerSettings
          .planning
          .roundCount

      optimizerButton.disabled =
        true

      optimizerButton.textContent =
  'FVT Manager analyseert...'

resultContainer.hidden = false

resultContainer.style.display =
  ''

resultContainer.className =
  'optimizer-placeholder'

resultContainer.innerHTML = safeHtml(`
        <div class="optimizer-loading">
          <span>
            🤖
          </span>

          <strong>
            FVT Manager analyseert jouw team
          </strong>

          <small>
            De gekozen managementfilosofie
            en harde regels worden verwerkt.
          </small>
        </div>
      `)

      resultIsCurrent = true

      const loadingCard = resultContainer.querySelector('.optimizer-loading')
      const loadingDetails = loadingCard?.querySelector('small')
      if (loadingDetails) {
        loadingDetails.innerHTML = safeHtml(`
          <span data-optimizer-progress-label>Aanvraag voorbereiden</span>
          <span data-optimizer-progress-details>De berekening start op de achtergrond.</span>
        `)
      }
      loadingCard?.insertAdjacentHTML('beforeend', safeHtml(`
        <div class="optimizer-progress-meta">
          <span>${roundCount} speelronde${roundCount === 1 ? '' : 's'}</span>
          <span data-optimizer-elapsed>0,0 sec</span>
        </div>
        <button class="optimizer-cancel-button" data-cancel-optimizer type="button">
          Berekening annuleren
        </button>
      `))
      loadingCard?.querySelector('[data-cancel-optimizer]')?.addEventListener(
        'click',
        () => cancelActiveJob({ showStatus: true }),
        { once: true },
      )

      await new Promise((resolve) => {
        requestAnimationFrame(resolve)
      })

      try {
        const optimizerResult = await runManagerOptimizerInWorker({
          request: createManagerOptimizerRequest({
            managerSettings: getManagerSettings(),
            managerTeamState: getManagerTeamState(),
          }),
          players: getPlayerProfiles(),
          databaseSummary: getDatabaseSummary(),
        })

        if (optimizerResult?.cancelled) return

        if (
          !optimizerResult?.valid
        ) {
          resultContainer.innerHTML = safeHtml(`
            <div class="optimizer-error">
              <span>
                ⚠️
              </span>

              <h3>
                De FVT Manager kon geen advies maken
              </h3>

              <p>
                ${
                  optimizerResult
                    ?.errors
                    ?.map(
                      escapeHtml,
                    )
                    .join('<br>') ??
                  'Er is een onbekende fout opgetreden.'
                }
              </p>
            </div>
          `)

          return
        }

        resultContainer.innerHTML =
          safeHtml(createOptimizerResult({
            optimizerResult,

            startRound:
              optimizerResult
                ?.period
                ?.startRound ??
              startRound,

            roundCount:
              optimizerResult
                ?.period
                ?.roundCount ??
              roundCount,
          }))

        resultContainer.classList.add(
          'has-optimizer-result',
        )
        resultContainer.dataset.workerMeta = JSON.stringify(
          optimizerResult.workerMeta ?? {},
        )

        resultContainer.scrollIntoView({
          behavior:
            'smooth',

          block:
            'start',
        })
      } catch (
        error
      ) {
        console.error(
          'FVT Manager UI-fout:',
          error,
        )

        resultContainer.innerHTML = safeHtml(`
          <div class="optimizer-error">
            <span>
              ⚠️
            </span>

            <h3>
              De FVT Manager kon niet worden weergegeven
            </h3>

            <p>
              ${
                escapeHtml(
                  error?.message,
                ) ||
                'Controleer de console voor meer informatie.'
              }
            </p>
          </div>
        `)
      } finally {
        optimizerButton.textContent =
          '🤖 Bereken mijn strategie'

        optimizerButton.disabled =
          getPhilosophyTotal() !== MANAGER_PHILOSOPHY_TOTAL
      }
    },
  )

  // Hydrate controls from the saved model before reading them back. Previously
  // mounting this screen silently reset bank, planning and strategy defaults.
  restoreManagerState(mountedTeam, mountedSettings)
  philosophyInputs.forEach(input => { input.value = String(managerSettings.philosophy[input.dataset.philosophyKey] ?? 0) })
  ruleBindings.forEach(binding => {
    const rule = managerSettings.rules[binding.key]
    if (rule && binding.enabledElement && binding.valueElement) {
      binding.enabledElement.checked = rule.enabled
      const option = [...binding.valueElement.options].find(item => Number(item.value) === Number(rule.value))
      binding.valueElement.value = option?.value ?? String(rule.value)
    }
  })
  startRoundSelect.value = String(managerSettings.planning.startRound)
  roundCountSelect.value = String(managerSettings.planning.roundCount)
  if (teamBankInput) teamBankInput.value = String(managerTeamState.bank)
  if (freeTransfersSelect) freeTransfersSelect.value = String(managerTeamState.freeTransfers)
  if (seasonPhaseSelect) seasonPhaseSelect.value = managerTeamState.seasonPhase
  chipModeInputs.forEach(input => { input.checked = input.value === managerTeamState.chipStrategy.mode })
  chipInputs.forEach(input => { input.checked = managerTeamState.chipStrategy.allowedChips.includes(({sugarDaddy:'sugar-daddy',dynamicDuo:'dynamic-duo'})[input.dataset.managerChip] ?? input.dataset.managerChip) })
  chipRoundInputs.forEach(input => {
    const choice = managerTeamState.chipStrategy.schedule.find(entry => entry.chipId === input.dataset.managerChipRound && entry.periodId === input.dataset.managerChipPeriod)
    input.value = choice?.decision === 'scheduled' ? String(choice.round) : choice?.decision ?? 'undecided'
  })
  newTeamModeButton?.classList.toggle('is-selected', managerTeamState.mode === 'new-team')
  currentTeamModeButton?.classList.toggle('is-selected', managerTeamState.mode === 'current-team')
  if (teamImportSection) teamImportSection.hidden = managerTeamState.mode !== 'current-team'
  if (strategySection) strategySection.hidden = !managerTeamState.mode || (managerTeamState.mode === 'current-team' && !managerTeamState.importResult?.valid)
  if (managerTeamState.importResult) {
    if (teamImportResult) teamImportResult.hidden = false
    renderImportedTeam(managerTeamState.importResult)
  }
  updatePhilosophyState()
  synchronizeFreeTransferVisibility()
}
