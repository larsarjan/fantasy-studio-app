import { safeHtml } from '../platform/html.js'
import {
  getPlayerProfiles,
  getEuropeanFixtures,
  getFixtures,
  getResults,
  getSyncStatus,
  getTeamRatings,
} from '../services/database.js'

import { EUROPEAN_COMPETITIONS, applyEuropeanContextGate, buildEuropeanOverlayPlacements, findEuropeanFixtureContext, findLeagueFixturesAroundEuropeanFixture, formatEuropeanDate, renderEuropeanCompetitionLogo, renderEuropeanCompareBadge, renderEuropeanContextBadges, renderEuropeanPlacementOverlay } from '../services/europeanFixtureContext.js'

import {
  resolveExpectedClubLineup,
} from '../services/expectedClubLineupEngine.js'

import {
  calculateFixtureDifficulty,
} from '../services/difficultyEngine.js'

import {
  buildFixtureAnalysis,
  normalizeClubName as normalizeCanonicalClubName,
} from '../services/historyAnalytics.js'

export const COMPARE_CLUB_GROUPS = Object.freeze({
  top3: ['PSV', 'Feyenoord', 'Ajax'],
  europe: ['N.E.C.', 'AZ', 'FC Twente'],
  challengers: ['FC Utrecht', 'sc Heerenveen', 'FC Groningen'],
  midfield: ['Sparta Rotterdam', 'Go Ahead Eagles', 'Fortuna Sittard'],
  relegation: ['PEC Zwolle', 'Excelsior', 'Telstar'],
  promoted: ['ADO Den Haag', 'Cambuur Leeuwarden', 'Willem II'],
})

const compareClubGroupLabels = Object.freeze({
  manual: 'Handmatig', top3: 'Traditionele top 3', europe: 'Europees spelende clubs', challengers: 'Uitdagers', midfield: 'Middenmoot', relegation: 'Degradatiekandidaten', promoted: 'Promovendi',
})

export function resolveCompareClubGroup(group, availableClubs) {
  return (COMPARE_CLUB_GROUPS[group] ?? []).map((wanted) => availableClubs.find((club) => normalizeCanonicalClubName(club) === normalizeCanonicalClubName(wanted)) ?? '')
}

function currentFixtures() {
  return getFixtures()
}

function currentClubs() {
  const fixtures = currentFixtures()

  return [
    ...new Set(
      fixtures
        .flatMap((fixture) => [fixture.home, fixture.away])
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, 'nl'))
}

const difficultyMeta = {
  1: { label: 'Zeer makkelijk', className: 'difficulty-1' },
  2: { label: 'Makkelijk', className: 'difficulty-2' },
  3: { label: 'Gemiddeld', className: 'difficulty-3' },
  4: { label: 'Moeilijk', className: 'difficulty-4' },
  5: { label: 'Zeer moeilijk', className: 'difficulty-5' },
}

const clubLogoMap = {
  ajax: 'ajax.png',
  'ado den haag': 'ado-den-haag.png',
  az: 'az.png',
  'cambuur leeuwarden': 'cambuur-leeuwarden.png',
  cambuur: 'cambuur-leeuwarden.png',
  excelsior: 'excelsior.png',
  'fc groningen': 'fc-groningen.png',
  'fc twente': 'fc-twente.png',
  'fc utrecht': 'fc-utrecht.png',
  feyenoord: 'feyenoord.png',
  'fortuna sittard': 'fortuna-sittard.png',
  'go ahead eagles': 'go-ahead-eagles.png',
  nec: 'nec.png',
  'n.e.c.': 'nec.png',
  'pec zwolle': 'pec-zwolle.png',
  psv: 'psv.png',
  'sc heerenveen': 'sc-heerenveen.png',
  heerenveen: 'sc-heerenveen.png',
  'sparta rotterdam': 'sparta-rotterdam.png',
  telstar: 'telstar.png',
  'willem ii': 'willem-ii.png',
}

function normalizeClubName(club) {
  return String(club || '')
    .trim()
    .toLocaleLowerCase('nl-NL')
    .replace(/\s+/g, ' ')
}

function clubLogoSlug(club) {
  const filename = clubLogoMap[normalizeClubName(club)]
  return filename ? filename.replace(/\.png$/i, '') : 'onbekend'
}

function clubLogoUrl(club) {
  const filename = clubLogoMap[normalizeClubName(club)]
  return filename ? `./club-logos/${filename}` : ''
}

function renderClubLogo(club, className = 'club-logo') {
  const url = clubLogoUrl(club)

  if (!url) {
    return `
      <span class="${className} club-logo-fallback" aria-hidden="true">
        ${String(club || '?').charAt(0)}
      </span>
    `
  }

  return `
    <img
      class="${className} club-logo--${clubLogoSlug(club)}"
      src="${url}"
      alt="${club}"
      loading="lazy"
      onerror="this.replaceWith(Object.assign(document.createElement('span'), {
        className: '${className} club-logo-fallback',
        textContent: '${String(club || '?').charAt(0)}'
      }))"
    />
  `
}

function formatDate(fixture) {
  if (fixture.date) {
    const [year, month, day] = fixture.date.split('-')

    return `${day}-${month}-${year}${
      fixture.time ? ` · ${fixture.time}` : ''
    }`
  }

  return fixture.dateLabel || `Speelronde ${fixture.round}`
}

function viewForClub(fixture, club) {
  const isHome = fixture.home === club

  const calculation =
    calculateFixtureDifficulty({
      fixture,
      results: getResults(),
      teamRatings: getTeamRatings(),
    })

  const dynamicView = isHome
    ? calculation?.home
    : calculation?.away

  return {
  club,

  opponent:
    isHome
      ? fixture.away
      : fixture.home,

  venue:
    isHome
      ? 'T'
      : 'U',

  difficulty:
    dynamicView?.difficulty ??
    (
      isHome
        ? fixture.difficultyHome
        : fixture.difficultyAway
    ),

  label:
    dynamicView?.label ??
    difficultyMeta[
      isHome
        ? fixture.difficultyHome
        : fixture.difficultyAway
    ]?.label ??
    'Gemiddeld',

  color:
    dynamicView?.color ??
    '#facc15',

  confidence:
    dynamicView?.confidence ?? 0,

  components:
    dynamicView?.components ?? {},

  effectiveWeights:
    dynamicView?.effectiveWeights ?? {},

  sampleSizes:
    dynamicView?.sampleSizes ?? {},
}
}

function getClubFixtures(club, startRound, count) {
  return currentFixtures()
    .filter(
      (fixture) =>
        fixture.round >= startRound &&
        (fixture.home === club || fixture.away === club),
    )
    .sort((a, b) => a.round - b.round)
    .slice(0, count)
}

const expectedLineupCache = new Map()
let expectedLineupCacheVersion = ''
let expectedLineupPlayers = null

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function normalizeFixtureStatus(value) {
  const status = String(value ?? '').trim().toLowerCase()
  if (['cancelled', 'canceled', 'afgelast'].includes(status)) return 'cancelled'
  if (['postponed', 'uitgesteld'].includes(status)) return 'postponed'
  if (['finished', 'played', 'afgelopen', 'gespeeld'].includes(status)) return 'finished'
  return 'scheduled'
}

function isHistoricalFixture(fixture) {
  if (normalizeFixtureStatus(fixture?.status) === 'finished') return true
  return getResults().some((result) => resultMatchesFixture(result, fixture))
}

function lineupCacheVersion() {
  const sync = getSyncStatus()
  return [sync?.source, sync?.state, sync?.lastSync].map((value) => String(value ?? '')).join('|')
}

function getCachedExpectedLineup(fixture, club) {
  const version = lineupCacheVersion()
  if (version !== expectedLineupCacheVersion) {
    expectedLineupCache.clear()
    expectedLineupCacheVersion = version
    expectedLineupPlayers = null
  }
  const key = [fixture.season, fixture.round, fixture.id, club, version].join('|')
  if (!expectedLineupCache.has(key)) {
    const seasonPlayers = (expectedLineupPlayers || (expectedLineupPlayers = getPlayerProfiles()))
      .filter((player) => String(player?.season ?? '') === String(fixture?.season ?? ''))
    expectedLineupCache.set(key, resolveExpectedClubLineup({
      club,
      players: seasonPlayers,
    }))
  }
  return expectedLineupCache.get(key)
}

function lineupStatusLabel(status) {
  if (status === 'expected') return 'Verwachte opstelling'
  if (status === 'provisional') return 'Voorlopige opstelling'
  if (status === 'confirmed') return 'Bevestigde opstelling'
  return 'Opstelling niet beschikbaar'
}

function renderExpectedPlayerCard(slot) {
  if (!slot.primary) {
    return `
      <div
        class="expected-lineup-player is-missing"
        style="--lineup-x:${slot.x}%;--lineup-y:${slot.y}%"
      >
        <strong>Onvoldoende data</strong>
        <small>${escapeHtml(slot.role)}</small>
      </div>
    `
  }
  const player = slot.primary
  const chanceValue =
  player.chance ??
  player.estimatedChance

const chance =
  chanceValue === null ||
  chanceValue === undefined
    ? escapeHtml(
        player.chanceLabel,
      )
    : `${chanceValue}%`
  const competitor = slot.competitor
    ? `
      <span class="expected-lineup-competitor">
        <b>${escapeHtml(slot.competitor.name)}</b>
        <small>
  ${
    slot.competitor.chance ??
    slot.competitor.estimatedChance ??
    escapeHtml(
      slot.competitor.chanceLabel,
    )
  }${
    (
      slot.competitor.chance ??
      slot.competitor.estimatedChance
    ) !== null &&
    (
      slot.competitor.chance ??
      slot.competitor.estimatedChance
    ) !== undefined
      ? '%'
      : ''
  }
</small>
      </span>
    `
    : ''

  return `
    <div
      class="expected-lineup-player"
      style="--lineup-x:${slot.x}%;--lineup-y:${slot.y}%"
      title="${escapeHtml(player.name)} · ${escapeHtml(slot.role)}"
    >
      <span class="expected-lineup-role">${escapeHtml(slot.role)}</span>
      <strong>${escapeHtml(player.name)}</strong>
      <small>${chance}</small>
      ${competitor}
    </div>
  `
}

function renderExpectedClubField(lineup) {
  const warnings = lineup.warnings.length
    ? `<ul>${lineup.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
    : '<p>Geen bijzondere onzekerheden uit de beschikbare data.</p>'

  return `
    <section class="expected-club-lineup">
      <div class="expected-club-lineup-heading">
        <div>
          <span class="eyebrow">${escapeHtml(lineupStatusLabel(lineup.status))}</span>
          <h4>${escapeHtml(lineup.club)}</h4>
        </div>
        <strong>${lineup.formation ? `Formatie ${escapeHtml(lineup.formation)}` : 'Formatie onzeker'}</strong>
      </div>

      <div class="expected-lineup-pitch" aria-label="${escapeHtml(lineupStatusLabel(lineup.status))} van ${escapeHtml(lineup.club)}">
        <div class="expected-lineup-halfway"></div>
        <div class="expected-lineup-circle"></div>
        ${lineup.slots.map(renderExpectedPlayerCard).join('')}
      </div>

      <div class="expected-lineup-coverage">
        <div>
          <strong>Datadekking: ${escapeHtml(lineup.coverage.level)}</strong>
          <span>${lineup.coverage.percentage}% van de beschikbare rol-, minuten-, kans- en statusinputs</span>
        </div>
        ${warnings}
      </div>
    </section>
  `
}

function renderExpectedMatchCenter(fixture) {
  if (!fixture || isHistoricalFixture(fixture)) return ''
  const status = normalizeFixtureStatus(fixture.status)
  if (status === 'cancelled') {
    return `<section class="expected-match-center is-empty"><strong>Wedstrijd afgelast</strong><p>Voor deze wedstrijd wordt geen actuele verwachte opstelling getoond.</p></section>`
  }

  const homeLineup = getCachedExpectedLineup(fixture, fixture.home)
  const awayLineup = getCachedExpectedLineup(fixture, fixture.away)
  const overallStatus = [homeLineup.status, awayLineup.status].includes('unavailable')
    ? 'unavailable'
    : [homeLineup.status, awayLineup.status].includes('provisional')
      ? 'provisional'
      : 'expected'
  const postponed = status === 'postponed'

  return `
    <section class="expected-match-center">
      <header class="expected-match-center-header">
        <div>
          <span class="eyebrow">Verwachte opstellingen</span>
          <h3>${escapeHtml(fixture.home)} – ${escapeHtml(fixture.away)}</h3>
          <p>Speelronde ${Number(fixture.round)} · ${escapeHtml(formatDate(fixture))}</p>
        </div>
        <span class="expected-lineup-status is-${overallStatus}">${escapeHtml(lineupStatusLabel(overallStatus))}</span>
      </header>

      <p class="expected-match-center-explanation">
        Gebaseerd op beschikbare rollen, verwachte minuten, speelkans en beschikbaarheid. Dit is geen officiële opstelling.
      </p>
      ${postponed ? '<p class="expected-match-warning">Deze wedstrijd is uitgesteld. De verwachte opstelling kan veranderen.</p>' : ''}

      <div class="expected-lineups-stack">
        ${renderExpectedClubField(homeLineup)}
        ${renderExpectedClubField(awayLineup)}
      </div>
    </section>
  `
}

function average(list, club) {
  if (!list.length) {
    return '—'
  }

  const NO_FIXTURE_DIFFICULTY = 5.5
  const DOUBLE_GAMEWEEK_BONUS = 0.8

  let total = 0
  let rounds = 0

  const groupedRounds = new Map()

  list.forEach((fixture) => {
    const round = Number(fixture.round)

    if (!groupedRounds.has(round)) {
      groupedRounds.set(round, [])
    }

    groupedRounds.get(round).push(fixture)
  })

  const startRound = Math.min(
    ...groupedRounds.keys(),
  )

  const endRound = Math.max(
    ...groupedRounds.keys(),
  )

  for (
    let round = startRound;
    round <= endRound;
    round++
  ) {
    const fixtures =
      groupedRounds.get(round) || []

    rounds++

    // Geen wedstrijd
    if (!fixtures.length) {
      total += NO_FIXTURE_DIFFICULTY
      continue
    }

    // Eén wedstrijd
    if (fixtures.length === 1) {
      total += viewForClub(
        fixtures[0],
        club,
      ).difficulty

      continue
    }

    // Dubbele speelronde
    const averageDifficulty =
      fixtures.reduce(
        (sum, fixture) =>
          sum +
          viewForClub(
            fixture,
            club,
          ).difficulty,
        0,
      ) / fixtures.length

    total += Math.max(
      1,
      averageDifficulty -
        DOUBLE_GAMEWEEK_BONUS,
    )
  }

  return (total / rounds).toFixed(2)
}

/*
|==============================================================================
| UITLEG WEDSTRIJD- EN SCHEMAWAARDES
|==============================================================================
*/

const fixtureDifficultyKeys = [
  'teamStrength',
  'recentForm',
  'venueForm',
  'production',
  'history',
]

function formatDifficultyWeight(value) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return 'Niet actief'
  }

  return `${number.toFixed(1)}%`
}

function renderFixtureDifficultyInfo(
  fixture,
  view,
) {
  const availableFactors =
    fixtureDifficultyKeys
      .map((key) => {
        const value =
          view.components?.[key]

        const weight =
          Number(
            view.effectiveWeights?.[key],
          ) || 0

        const hasData =
          value !== null &&
          value !== undefined &&
          weight > 0

        return {
          key,
          value,
          weight,
          hasData,
        }
      })

  return `
    <span
      class="fixture-score-info"
      aria-label="
        Uitleg wedstrijdwaarde
        ${Number(
          view.difficulty,
        ).toFixed(1)}
      "
    >
      i

      <span
        class="fixture-score-tooltip"
        role="tooltip"
      >
        <span class="fixture-score-tooltip-header">
          <span>
            <small>
              Uitleg wedstrijdwaarde
            </small>

            <strong>
              ${view.club} tegen
              ${view.opponent}
            </strong>
          </span>

          <b
            style="
              --difficulty-color:
                ${view.color};
            "
          >
            ${Number(
              view.difficulty,
            ).toFixed(1)}/5
          </b>
        </span>

        <span class="fixture-score-tooltip-rule">
          Lager is gunstiger
        </span>

        <span class="fixture-score-tooltip-factors">
          ${availableFactors
            .map(
              ({
                key,
                value,
                weight,
                hasData,
              }) => `
                <span
                  class="
                    fixture-score-tooltip-factor
                    ${
                      hasData
                        ? ''
                        : 'is-unavailable'
                    }
                  "
                >
                  <span>
                    <strong>
                      ${difficultyFactorLabel(
                        key,
                      )}
                    </strong>

                    <b>
                      ${
                        hasData
                          ? formatDifficultyWeight(
                              weight,
                            )
                          : 'Niet actief'
                      }
                    </b>
                  </span>

                  <small>
                    ${difficultyFactorText({
                      key,
                      value,
                      side:
                        view,
                      fixture,
                    })}
                  </small>
                </span>
              `,
            )
            .join('')}
        </span>

        <span class="fixture-score-tooltip-confidence">
          <span>
            Betrouwbaarheid
          </span>

          <strong>
            ${Math.round(
              Number(
                view.confidence,
              ) || 0,
            )}%
          </strong>
        </span>
      </span>
    </span>
  `
}

function calculateClubSchemaSummary(
  list,
  club,
) {
  if (!list.length) {
    return {
      value:
        '—',

      rounds:
        [],
    }
  }

  const NO_FIXTURE_DIFFICULTY =
    5.5

  const DOUBLE_GAMEWEEK_BONUS =
    0.8

  const groupedRounds =
    new Map()

  list.forEach((fixture) => {
    const round =
      Number(
        fixture.round,
      )

    if (
      !groupedRounds.has(
        round,
      )
    ) {
      groupedRounds.set(
        round,
        [],
      )
    }

    groupedRounds
      .get(round)
      .push(fixture)
  })

  const startRound =
    Math.min(
      ...groupedRounds.keys(),
    )

  const endRound =
    Math.max(
      ...groupedRounds.keys(),
    )

  const roundResults = []

  for (
    let round = startRound;
    round <= endRound;
    round++
  ) {
    const fixtures =
      groupedRounds.get(
        round,
      ) || []

    if (!fixtures.length) {
      roundResults.push({
        round,

        value:
          NO_FIXTURE_DIFFICULTY,

        label:
          'Geen wedstrijd',

        explanation:
          'Geen wedstrijd betekent geen mogelijkheid om fantasypunten te behalen.',
      })

      continue
    }

    if (fixtures.length === 1) {
      const fixture =
        fixtures[0]

      const view =
        viewForClub(
          fixture,
          club,
        )

      roundResults.push({
        round,

        value:
          Number(
            view.difficulty,
          ),

        label:
          `${view.opponent} (${
            view.venue
          })`,

        explanation:
          `${Number(
            view.difficulty,
          ).toFixed(
            1,
          )}/5 · ${view.label}`,
      })

      continue
    }

    const fixtureScores =
      fixtures.map(
        (fixture) =>
          Number(
            viewForClub(
              fixture,
              club,
            ).difficulty,
          ),
      )

    const averageDifficulty =
      fixtureScores.reduce(
        (
          total,
          value,
        ) =>
          total +
          value,
        0,
      ) /
      fixtureScores.length

    const adjustedDifficulty =
      Math.max(
        1,
        averageDifficulty -
          DOUBLE_GAMEWEEK_BONUS,
      )

    roundResults.push({
      round,

      value:
        adjustedDifficulty,

      label:
        'Dubbele speelronde',

      explanation:
        `${fixtureScores
          .map(
            (value) =>
              value.toFixed(1),
          )
          .join(
            ' + ',
          )} gemiddeld, daarna 0,8 bonus`,
    })
  }

  const total =
    roundResults.reduce(
      (
        sum,
        round,
      ) =>
        sum +
        round.value,
      0,
    )

  return {
    value:
      (
        total /
        roundResults.length
      ).toFixed(2),

    rounds:
      roundResults,
  }
}

function renderSchemaValueInfo(
  schemaSummary,
  club,
) {
  if (
    !schemaSummary.rounds.length
  ) {
    return ''
  }

  return `
    <span
      class="fixture-schema-info"
      tabindex="0"
      aria-label="
        Uitleg schemawaarde
        ${schemaSummary.value}
      "
    >
      i

      <span
        class="fixture-schema-tooltip"
        role="tooltip"
      >
        <span class="fixture-schema-tooltip-header">
          <span>
            <small>
              Uitleg schemawaarde
            </small>

            <strong>
              ${club}
            </strong>
          </span>

          <b>
            ${schemaSummary.value}
          </b>
        </span>

        <span class="fixture-schema-tooltip-rule">
          Gemiddelde van de geselecteerde
          speelronden. Lager is gunstiger.
        </span>

        <span class="fixture-schema-rounds">
          ${schemaSummary.rounds
            .map(
              (round) => `
                <span class="fixture-schema-round">
                  <span>
                    <small>
                      SR ${round.round}
                    </small>

                    <strong>
                      ${round.label}
                    </strong>

                    <em>
                      ${round.explanation}
                    </em>
                  </span>

                  <b>
                    ${Number(
                      round.value,
                    ).toFixed(1)}
                  </b>
                </span>
              `,
            )
            .join('')}
        </span>

        <span class="fixture-schema-calculation">
          <span>
            Eindgemiddelde
          </span>

          <strong>
            ${schemaSummary.value}
          </strong>
        </span>
      </span>
    </span>
  `
}

function renderClub(state) {
  const list =
    getClubFixtures(
      state.club,
      state.startRound,
      state.count,
    )

  const schemaSummary =
    calculateClubSchemaSummary(
      list,
      state.club,
    )
  const overlayPlacements=state.showEurope?buildEuropeanOverlayPlacements(list,currentFixtures(),getEuropeanFixtures(),state.club):[]
  const overlaysByAnchor=new Map()
  overlayPlacements.forEach(placement=>{
    const key=String(placement.anchorFixtureId)
    overlaysByAnchor.set(key,[...(overlaysByAnchor.get(key)??[]),placement])
  })

  return `
    <section class="fixture-summary">
      <div class="fixture-summary-club">
        ${renderClubLogo(
          state.club,
          'summary-club-logo',
        )}

        <div>
          <span class="eyebrow">
            Clubschema
          </span>

          <h2>
            ${state.club}
          </h2>

          <p>
            Vanaf speelronde
            ${state.startRound},
            volgende ${state.count}
            wedstrijd${
              state.count === 1
                ? ''
                : 'en'
            }.
          </p>
        </div>
      </div>

      <div class="average-score">
        <div class="average-score-heading">
          <span>
            Schemawaarde
          </span>

          ${renderSchemaValueInfo(
            schemaSummary,
            state.club,
          )}
        </div>

        <strong>
          ${schemaSummary.value}
        </strong>
      </div>
    </section>

    <div class="fixture-strip">
      ${list
        .map((fixture) => {
          const view =
            viewForClub(
              fixture,
              state.club,
            )

          return `
            <div class="fixture-card-shell">
              <button
                class="fixture-card"
                style="
                  --difficulty-color:
                    ${view.color};

                  border-color:
                    ${view.color};
                "
                data-fixture-id="${fixture.id}"
                type="button"
              >
              <div class="fixture-card-top">
                <span>
                  SR ${fixture.round}
                </span>

                <span class="venue-pill">
                  ${view.venue}
                </span>
              </div>

              <div class="fixture-opponent">
                ${renderClubLogo(
                  view.opponent,
                )}

                <strong>
                  ${view.opponent}
                </strong>
              </div>

              <small>
                ${formatDate(
                  fixture,
                )}
              </small>

              <div
                class="difficulty-label"
                style="
                  background:
                    ${view.color};
                "
              >
                <span class="difficulty-label-text">
                  ${Number(
                    view.difficulty,
                  ).toFixed(1)}/5 ·
                  ${view.label}
                </span>

                ${renderFixtureDifficultyInfo(
                  fixture,
                  view,
                )}
              </div>
              </button>
              ${(overlaysByAnchor.get(String(fixture.id))??[]).map(renderEuropeanPlacementOverlay).join('')}
            </div>
          `
        })
        .join('')}
    </div>

    ${renderExpectedMatchCenter(
      currentFixtures().find(
        (fixture) => fixture.id === state.selectedFixtureId,
      ),
    )}
  `
}

export function renderEuropeanContextOverlay(fixture,club,europeanFixtures,showEurope=true) {
  if (!showEurope) return ''
  const context=findEuropeanFixtureContext(fixture,club,europeanFixtures)
  const placement=context.before.length?'before':'after'
  return renderEuropeanContextBadges(context,{interactive:true,placement})
}

export function resolveEuropeanOverlayLayout(currentRect,adjacentRect) {
  if (!currentRect || !adjacentRect) return 'outside'
  const sameRow=Math.abs(Number(currentRect.top)-Number(adjacentRect.top))<Math.min(Number(currentRect.height)||278,Number(adjacentRect.height)||278)*0.35
  return sameRow?'horizontal':'vertical'
}

export function calculateEuropeanOverlayPosition(currentRect,adjacentRect,placement='after',overlayHeight=44) {
  const layout=resolveEuropeanOverlayLayout(currentRect,adjacentRect)
  let left=Number(currentRect?.width)/2||0
  let top=(Number(currentRect?.height)||278)+overlayHeight/2+8
  if(layout==='horizontal'){
    const boundary=placement==='before'?(Number(adjacentRect.right)+Number(currentRect.left))/2:(Number(currentRect.right)+Number(adjacentRect.left))/2
    left=boundary-Number(currentRect.left)
    top=(Number(currentRect?.height)||278)-16+overlayHeight/2
  }else if(layout==='vertical'){
    const boundary=placement==='before'?(Number(adjacentRect.bottom)+Number(currentRect.top))/2:(Number(currentRect.bottom)+Number(adjacentRect.top))/2
    top=boundary-Number(currentRect.top)
  }else if(placement==='before'){
    top=-(overlayHeight/2+8)
  }
  return {layout,left,top}
}

function positionEuropeanContextOverlays() {
  document.querySelectorAll('.fixture-strip').forEach((strip)=>{
    const shells=[...strip.querySelectorAll(':scope > .fixture-card-shell')]
    strip.classList.toggle('has-european-overlays',shells.some((shell)=>shell.querySelector(':scope > .european-context.is-overlay')))
    const shellsById=new Map(shells.map(shell=>[String(shell.querySelector('[data-fixture-id]')?.dataset.fixtureId),shell]))
    strip.querySelectorAll('.european-context.is-overlay').forEach((overlay)=>{
      const shell=overlay.closest('.fixture-card-shell')
      const placement=overlay.dataset.europePlacement==='before'?'before':'after'
      const previous=shellsById.get(String(overlay.dataset.europePreviousId))
      const next=shellsById.get(String(overlay.dataset.europeNextId))
      const current=previous??next??shell
      const adjacent=previous&&next?(current===previous?next:previous):null
      const currentRect=current.getBoundingClientRect()
      const adjacentRect=adjacent?.getBoundingClientRect()
      const overlayHeight=Math.max(overlay.getBoundingClientRect().height,44)
      const position=calculateEuropeanOverlayPosition(currentRect,adjacentRect,placement,overlayHeight)
      const layout=position.layout
      overlay.classList.remove('is-between-horizontal','is-between-vertical','is-outside-range')
      overlay.classList.add(layout==='horizontal'?'is-between-horizontal':layout==='vertical'?'is-between-vertical':'is-outside-range')
      const currentOffset=current===shell?0:current.getBoundingClientRect().left-shell.getBoundingClientRect().left
      overlay.style.left=`${position.left+currentOffset}px`
      overlay.style.top=`${position.top}px`
      overlay.style.right='auto'
      overlay.style.bottom='auto'
      overlay.style.transform='translate(-50%, -50%)'
    })
  })
}

function renderRound(state) {
  const list = currentFixtures()
    .filter(
      (fixture) =>
        Number(fixture.round) ===
        Number(state.startRound),
    )
    .sort((left, right) => {
      const dateDifference =
        String(left.date || '').localeCompare(
          String(right.date || ''),
        )

      if (dateDifference !== 0) {
        return dateDifference
      }

      return String(left.time || '').localeCompare(
        String(right.time || ''),
      )
    })

  const matchCount = list.length

  const roundDescription =
    matchCount === 1
      ? '1 wedstrijd in deze fantasy-speelronde.'
      : `${matchCount} wedstrijden in deze fantasy-speelronde.`

  return `
    <section class="fixture-summary">
      <div>
        <span class="eyebrow">
          Speelronde
        </span>

        <h2>
          Speelronde ${state.startRound}
        </h2>

        <p>
          ${roundDescription}
        </p>
      </div>
    </section>

    ${
      list.length
        ? `
          <div class="round-grid">
            ${list
              .map((fixture) => {
                const homeView =
                  viewForClub(
                    fixture,
                    fixture.home,
                  )

                const awayView =
                  viewForClub(
                    fixture,
                    fixture.away,
                  )

                return `
                  <button
                    class="round-match"
                    data-fixture-id="${fixture.id}"
                    type="button"
                  >
                    <span class="round-date">
                      ${formatDate(fixture)}
                    </span>

                    <div class="round-team-analysis">
                      <div class="round-team-side">
                        <div class="round-club-row">
                          ${renderClubLogo(
                            fixture.home,
                            'round-club-logo',
                          )}

                          <strong>
                            ${fixture.home}
                          </strong>
                        </div>

                        <div
                          class="round-difficulty-dynamic"
                          style="
                            --difficulty-color:
                              ${homeView.color};
                            border-color:
                              ${homeView.color};
                            background:
                              color-mix(
                                in srgb,
                                ${homeView.color} 82%,
                                #111827
                              );
                          "
                        >
                          <span>
                            Thuis
                          </span>

                          <strong>
                            ${Number(
                              homeView.difficulty,
                            ).toFixed(1)}/5
                          </strong>

                          <small>
                            ${homeView.label}
                          </small>
                        </div>
                      </div>

                      <div class="round-versus">
                        <span>tegen</span>
                      </div>

                      <div class="round-team-side">
                        <div class="round-club-row">
                          ${renderClubLogo(
                            fixture.away,
                            'round-club-logo',
                          )}

                          <strong>
                            ${fixture.away}
                          </strong>
                        </div>

                        <div
                          class="round-difficulty-dynamic"
                          style="
                            --difficulty-color:
                              ${awayView.color};
                            border-color:
                              ${awayView.color};
                            background:
                              color-mix(
                                in srgb,
                                ${awayView.color} 82%,
                                #111827
                              );
                          "
                        >
                          <span>
                            Uit
                          </span>

                          <strong>
                            ${Number(
                              awayView.difficulty,
                            ).toFixed(1)}/5
                          </strong>

                          <small>
                            ${awayView.label}
                          </small>
                        </div>
                      </div>
                    </div>
                    ${renderEuropeanContextBadges(findEuropeanFixtureContext(fixture,fixture.home,state.showEurope?getEuropeanFixtures():[]))}
                    ${renderEuropeanContextBadges(findEuropeanFixtureContext(fixture,fixture.away,state.showEurope?getEuropeanFixtures():[]))}
                  </button>
                `
              })
              .join('')}
          </div>
        `
        : `
          <div class="round-empty-state">
            <strong>
              Geen wedstrijden
            </strong>

            <p>
              In speelronde ${state.startRound}
              staan momenteel geen wedstrijden
              in het fantasy-speelschema.
            </p>
          </div>
        `
    }
      ${renderExpectedMatchCenter(
      currentFixtures().find(
        (fixture) =>
          fixture.id ===
          state.selectedFixtureId,
      ),
    )}
      `
}

function renderCompare(state) {
  const selected =
    state.compareClubs.filter(Boolean)

  /*
   * In de vergelijkingsweergave betekent
   * 'count' voortaan het aantal speelrondes,
   * niet het aantal wedstrijden per club.
   */
  const rounds = Array.from(
    { length: state.count },
    (_, index) =>
      state.startRound + index,
  ).filter((round) => round <= 34)

  const visibleFixturesByClub = new Map(selected.map((club) => [
    club,
    currentFixtures().filter((fixture) => rounds.includes(Number(fixture.round)) && (fixture.home === club || fixture.away === club)),
  ]))
  const europePlacementsByClub = new Map(selected.map((club) => [
    club,
    buildEuropeanOverlayPlacements(visibleFixturesByClub.get(club),currentFixtures(),getEuropeanFixtures(),club),
  ]))

  function renderCompareEuropeanContext(fixtures,club) {
    const fixtureIds=new Set(fixtures.map((fixture)=>String(fixture.id)))
    return (europePlacementsByClub.get(club)??[])
      .filter((placement)=>fixtureIds.has(String(placement.anchorFixtureId)))
      .map((placement)=>renderEuropeanCompareBadge(placement,club))
      .join('')
  }

  function fixturesForClubAndRound(
    club,
    round,
  ) {
    return currentFixtures()
      .filter(
        (fixture) =>
          Number(fixture.round) === round &&
          (
            fixture.home === club ||
            fixture.away === club
          ),
      )
      .sort((left, right) =>
        String(left.date || '').localeCompare(
          String(right.date || ''),
        ),
      )
  }

  function schemaValueForClub(club) {
  const NO_FIXTURE_DIFFICULTY = 5.5
  const DOUBLE_GAMEWEEK_BONUS = 0.8

  if (!rounds.length) {
    return '—'
  }

  const roundValues = rounds.map(
    (round) => {
      const fixtures =
        fixturesForClubAndRound(
          club,
          round,
        )

      // Geen wedstrijd: geen punten mogelijk
      if (!fixtures.length) {
        return NO_FIXTURE_DIFFICULTY
      }

      // Normale speelronde
      if (fixtures.length === 1) {
        return Number(
          viewForClub(
            fixtures[0],
            club,
          ).difficulty,
        )
      }

      // Dubbele speelronde
      const averageDifficulty =
        fixtures.reduce(
          (total, fixture) =>
            total +
            Number(
              viewForClub(
                fixture,
                club,
              ).difficulty,
            ),
          0,
        ) / fixtures.length

      return Math.max(
        1,
        averageDifficulty -
          DOUBLE_GAMEWEEK_BONUS,
      )
    },
  )

  const schemaValue =
    roundValues.reduce(
      (total, value) =>
        total + value,
      0,
    ) / roundValues.length

  return schemaValue.toFixed(2)
}

  function renderCompareFixture(
    fixture,
    club,
  ) {
    const view =
      viewForClub(fixture, club)

    return `
      <button
        class="compare-fixture-row"
        data-fixture-id="${fixture.id}"
        type="button"
        style="
          --difficulty-color: ${view.color};
          border-color: ${view.color};
          background:
            color-mix(
              in srgb,
              ${view.color} 72%,
              #111827
            );
          box-shadow:
            0 6px 18px
            color-mix(
              in srgb,
              ${view.color} 22%,
              transparent
            );
        "
      >
        <span class="compare-fixture-venue">
          ${view.venue}
        </span>

        <span class="compare-opponent">
          ${renderClubLogo(
            view.opponent,
            'compare-opponent-logo',
          )}

          <strong>
            ${view.opponent}
          </strong>
        </span>

        <b>
          ${Number(
            view.difficulty,
          ).toFixed(1)}
        </b>
      </button>
    `
  }

  return `
    <section class="fixture-summary">
      <div>
        <span class="eyebrow">
          Schema vergelijken
        </span>

        <h2>
          ${selected.length}
          club${
            selected.length === 1
              ? ''
              : 's'
          }
          geselecteerd
        </h2>

        <p>
          Speelronde ${rounds[0]}
          tot en met
          ${rounds.at(-1)}.
          Lege en dubbele speelrondes
          worden afzonderlijk weergegeven.
        </p>
      </div>
    </section>

    <div
      class="compare-round-table"
      style="
        --compare-columns:
          ${Math.max(
            selected.length,
            1,
          )};
      "
    >
    <div class="compare-round-header">
      <div class="compare-round-corner">
  SR
</div>

        ${selected
  .map(
    (club) => `
      <div class="compare-round-club-header">
        ${renderClubLogo(
          club,
          'compare-club-logo',
        )}

        <div class="compare-club-header-content">
          <span class="eyebrow">
            Club
          </span>

          <strong>
            ${club}
          </strong>

          <div class="compare-schema-value">
            <span>
              Schemawaarde
            </span>

            <b>
              ${schemaValueForClub(club)}
            </b>

            <span
              class="schema-info"
              tabindex="0"
              aria-label="Uitleg schemawaarde"
            >
              i

              <span class="schema-info-tooltip">
                <strong>Schemawaarde</strong>

                <span>
                  Combineert de moeilijkheid van
                  tegenstanders met lege en dubbele
                  speelrondes.
                </span>

                <span>
                  Geen wedstrijd telt als 5,5.
                  Een dubbele speelronde krijgt een
                  bonus van 0,8.
                </span>

                <b>
                  Lager is gunstiger.
                </b>
              </span>
            </span>
          </div>
        </div>
      </div>
    `,
  )
  .join('')}
      </div>

      ${rounds
        .map(
          (round) => `
            <div class="compare-round-line">
              <div class="compare-round-number">
  <strong>${round}</strong>
</div>

              ${selected
                .map((club) => {
                  const fixtures =
                    fixturesForClubAndRound(
                      club,
                      round,
                    )

                  if (!fixtures.length) {
                    return `
                      <div
                        class="
                          compare-round-cell
                          is-empty
                        "
                      >
                        <span>
                          Geen wedstrijd
                        </span>

                        <small>
                          Geen punten mogelijk
                        </small>
                      </div>
                    `
                  }

                  return `
                    <div
                      class="
                        compare-round-cell
                        ${
                          fixtures.length > 1
                            ? 'has-double'
                            : ''
                        }
                      "
                    >
                      ${
                        fixtures.length > 1
                          ? `
                            <div
                              class="
                                compare-double-label
                              "
                            >
                              Dubbele speelronde
                            </div>
                          `
                          : ''
                      }

                      ${fixtures
                        .map(
                          (fixture) =>
                            renderCompareFixture(
                              fixture,
                              club,
                            ),
                        )
                        .join('')}
                      ${renderCompareEuropeanContext(fixtures,club)}
                    </div>
                  `
                })
                .join('')}
            </div>
          `,
        )
        .join('')}
    </div>
  `
}

function formatAnalysisNumber(value, digits = 1) {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0)
}

function renderRatingStars(rating) {
  const roundedRating = Math.round(Number(rating) || 0)

  return `
    <span
      class="fixture-rating-stars"
      aria-label="${formatAnalysisNumber(rating)} van 5"
    >
      ${Array.from(
        { length: 5 },
        (_, index) => `
          <span class="${index < roundedRating ? 'active' : ''}">
            ★
          </span>
        `,
      ).join('')}
    </span>
  `
}

function renderFixtureForm(matches) {
  if (!matches.length) {
    return `
      <span class="fixture-analysis-empty">
        Geen recente wedstrijden
      </span>
    `
  }

  return `
    <div class="fixture-form-row">
      ${matches
        .map(
          (match) => `
            <span
              class="fixture-form-result fixture-form-${match.outcome.toLowerCase()}"
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

function clampFantasyRating(
  value,
  minimum = 1,
  maximum = 5,
) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      Number(value) || 3,
    ),
  )
}

function findFantasyTeamRating(club) {
  return (
    getTeamRatings().find(
      (rating) =>
        String(rating.club || '')
          .trim()
          .toLowerCase() ===
        String(club || '')
          .trim()
          .toLowerCase(),
    ) || null
  )
}

function fantasyLineBaseRating(
  teamRating,
  line,
) {
  if (!teamRating) {
    return 3
  }

  const attack =
    Number(teamRating.attack) || 3

  const midfield =
    Number(teamRating.midfield) || 3

  const defense =
    Number(teamRating.defense) || 3

  const coach =
    Number(teamRating.coach) || 3

  if (line === 'Aanvallers') {
    return attack
  }

  if (line === 'Middenvelders') {
    return (
      midfield * 0.7 +
      attack * 0.2 +
      coach * 0.1
    )
  }

  if (line === 'Verdedigers') {
    return (
      defense * 0.75 +
      coach * 0.25
    )
  }

  if (line === 'Keeper') {
    return (
      defense * 0.65 +
      coach * 0.2 +
      midfield * 0.15
    )
  }

  return 3
}

function fantasyMatchupModifier(
  line,
  difficulty,
) {
  const matchupAdvantage =
    3 - Number(difficulty || 3)

  /*
   * Aanvallers reageren het sterkst op een
   * gunstige of ongunstige tegenstander.
   *
   * Verdedigers en keepers iets voorzichtiger,
   * omdat één tegendoelpunt veel invloed heeft.
   */
  const sensitivity = {
  Aanvallers: 0.42,
  Middenvelders: 0.34,
  Verdedigers: 0.3,
  Keeper: 0.26,
}

  return (
    matchupAdvantage *
    (sensitivity[line] || 0.5)
  )
}

function fantasyHistoryModifier(
  line,
  historyValue,
) {
  if (
    historyValue === null ||
    historyValue === undefined
  ) {
    return 0
  }

  /*
   * In de difficulty-engine betekent:
   * onder 50 = historisch gunstig;
   * boven 50 = historisch ongunstig.
   *
   * Historie blijft bewust een kleine correctie.
   */
  const advantage =
    (50 - Number(historyValue)) / 50

  const sensitivity = {
  Aanvallers: 0.14,
  Middenvelders: 0.12,
  Verdedigers: 0.1,
  Keeper: 0.08,
}

  return (
    advantage *
    (sensitivity[line] || 0.18)
  )
}

function fantasyRatingLabel(rating) {
  const value = Number(rating) || 3

  if (value >= 4.55) {
    return 'Uitzonderlijke keuze'
  }

  if (value >= 4.05) {
    return 'Sterke keuze'
  }

  if (value >= 3.55) {
    return 'Interessante keuze'
  }

  if (value >= 2.85) {
    return 'Twijfelgeval'
  }

  if (value >= 2.25) {
    return 'Liever vermijden'
  }

  return 'Zeer onaantrekkelijk'
}

function buildFantasyLineDisplay({
  club,
  line,
  liveRating,
  liveConfidence,
  recentPlayed,
  difficultySide,
}) {
  const teamRating =
    findFantasyTeamRating(club)

  const baseRating =
    fantasyLineBaseRating(
      teamRating,
      line,
    )

  const matchupModifier =
    fantasyMatchupModifier(
      line,
      difficultySide.difficulty,
    )

  const historyModifier =
    fantasyHistoryModifier(
      line,
      difficultySide.components?.history,
    )

  const rawPreseasonRating =
  baseRating +
  matchupModifier +
  historyModifier

/*
 * Trek extreme beoordelingen iets richting 3.
 *
 * 5,0 wordt ongeveer 4,5
 * 4,5 wordt ongeveer 4,1
 * 4,0 wordt ongeveer 3,8
 * 2,0 wordt ongeveer 2,3
 * 1,0 wordt ongeveer 1,5
 */
const preseasonRating =
  clampFantasyRating(
    3 +
      (rawPreseasonRating - 3) * 0.74,
    1.4,
    4.6,
  )

  /*
   * Actuele data groeit gedurende vijf duels
   * van 0% naar 100% invloed.
   */
  const liveWeight = Math.max(
    0,
    Math.min(
      1,
      Number(recentPlayed || 0) / 5,
    ),
  )

  const rawFinalRating =
  preseasonRating * (1 - liveWeight) +
  Number(liveRating || 3) * liveWeight

const finalRating =
  clampFantasyRating(
    3 +
      (rawFinalRating - 3) * 0.9,
    1.3,
    4.7,
  )

  const historicalMatches =
    Number(
      difficultySide.sampleSizes?.history,
    ) || 0

  const confidenceScore = Math.round(
    Math.min(
      95,
      52 +
        liveWeight * 33 +
        Math.min(
          historicalMatches,
          10,
        ) * 1,
    ),
  )

  const reasons = []

  if (teamRating) {
    reasons.push(
      `${club} heeft voor deze linie een vaste teamrating van ` +
      `${baseRating.toFixed(1)} uit 5.`,
    )
  }

  if (
    Number(difficultySide.difficulty) <= 2.2
  ) {
    reasons.push(
      `De wedstrijd geldt met ${Number(
        difficultySide.difficulty,
      ).toFixed(1)}/5 als een gunstige matchup.`,
    )
  } else if (
    Number(difficultySide.difficulty) >= 3.8
  ) {
    reasons.push(
      `De wedstrijd geldt met ${Number(
        difficultySide.difficulty,
      ).toFixed(1)}/5 als een zware matchup.`,
    )
  } else {
    reasons.push(
      `De wedstrijdmoeilijkheid van ${Number(
        difficultySide.difficulty,
      ).toFixed(1)}/5 zorgt voor een beperkte correctie.`,
    )
  }

  if (historicalMatches > 0) {
    reasons.push(
      `De historische matchup is gebaseerd op ` +
      `${historicalMatches} onderlinge duels.`,
    )
  }

  if (!recentPlayed) {
    reasons.push(
      'Er is nog geen actuele vormdata uit dit seizoen; ' +
      'de beoordeling gebruikt daarom teamkwaliteit, matchup en historie.',
    )
  } else if (recentPlayed < 5) {
    reasons.push(
      `${recentPlayed} actuele wedstrijd${
        recentPlayed === 1 ? '' : 'en'
      } telt gedeeltelijk mee; vanaf vijf duels is de vorm volledig actief.`,
    )
  } else {
    reasons.push(
      'De actuele seizoensvorm telt volledig mee.',
    )
  }

  return {
    rating: Number(
      finalRating.toFixed(1),
    ),

    confidenceData: {
      ...liveConfidence,

      confidence: confidenceScore,

      label:
        fantasyRatingLabel(
          finalRating,
        ),

      reasons,
    },
  }
}

function renderFantasyRating(
  club,
  line,
  rating,
  confidenceData,
) {
  const ratingScore = Math.round(
  Math.max(
    0,
    Math.min(
      100,
      (Number(rating) / 5) * 100,
    ),
  ),
)

const dataConfidence =
  Number(
    confidenceData?.confidence,
  ) || 0

const reasons =
  confidenceData?.reasons || []

  return `
    <article class="fixture-fantasy-rating-card">
      <div class="fixture-fantasy-rating">
        <div>
          <span>${club}</span>

          <strong>${line}</strong>

          <small>
            ${
              confidenceData?.label ||
              'Geen beoordeling'
            }
          </small>
        </div>

        <div class="fixture-fantasy-rating-score">
          ${renderRatingStars(rating)}

          <b>
  ${ratingScore}%
</b>
        </div>
      </div>

      <details class="fixture-rating-explanation">
        <summary>
          Waarom deze score?
        </summary>

        <div class="fixture-rating-confidence">
  <span>Databetrouwbaarheid</span>
  <strong>${dataConfidence}%</strong>
</div>

        ${
          reasons.length
            ? `
                <ul>
                  ${reasons
                    .map(
                      (reason) =>
                        `<li>${reason}</li>`,
                    )
                    .join('')}
                </ul>
              `
            : `
                <p>
                  Nog geen uitleg beschikbaar.
                </p>
              `
        }
      </details>
    </article>
  `
}

function difficultyFactorText({
  key,
  value,
  side,
  fixture,
}) {
  const ownClub = side.club
  const opponent = side.opponent

  if (value === null || value === undefined) {
    if (key === 'recentForm') {
      return `Nog geen recente vormdata uit ${fixture.season}.`
    }

    if (key === 'venueForm') {
      return `Nog onvoldoende thuis-/uitdata uit ${fixture.season}.`
    }

    if (key === 'production') {
      return `Nog geen actuele productiegegevens uit ${fixture.season}.`
    }

    return 'Nog onvoldoende gegevens beschikbaar.'
  }

  if (key === 'teamStrength') {
    const ownStrength =
      side.components.ownTeamStrength

    const opponentStrength =
      side.components.opponentTeamStrength

    const difference =
  opponentStrength - ownStrength

if (difference <= -30) {
  return (
    `${ownClub} is op basis van de vaste ` +
    `teamratings duidelijk sterker dan ${opponent}.`
  )
}

if (difference <= -18) {
  return (
    `${ownClub} heeft een behoorlijk voordeel ` +
    `in vaste teamsterkte.`
  )
}

if (difference <= -8) {
  return (
    `${ownClub} heeft een licht voordeel ` +
    `in vaste teamsterkte.`
  )
}

if (difference < 8) {
  return (
    `${ownClub} en ${opponent} zijn qua vaste ` +
    `teamsterkte redelijk aan elkaar gewaagd.`
  )
}

if (difference < 18) {
  return (
    `${opponent} heeft een licht voordeel ` +
    `in vaste teamsterkte.`
  )
}

if (difference < 30) {
  return (
    `${opponent} heeft een behoorlijk voordeel ` +
    `in vaste teamsterkte.`
  )
}

return (
  `${opponent} is op basis van de vaste ` +
  `teamratings duidelijk sterker dan ${ownClub}.`
)
  }

  if (key === 'recentForm') {
    if (value < 35) {
      return `${opponent} verkeert in zwakke recente vorm.`
    }

    if (value < 55) {
      return `${opponent} presteert recent wisselvallig.`
    }

    if (value < 75) {
      return `${opponent} verkeert in goede recente vorm.`
    }

    return `${opponent} verkeert in uitstekende recente vorm.`
  }

  if (key === 'venueForm') {
    const venueText =
      ownClub === fixture.home
        ? 'uitwedstrijden'
        : 'thuiswedstrijden'

    if (value < 35) {
      return `${opponent} presteert zwak in recente ${venueText}.`
    }

    if (value < 55) {
      return `${opponent} presteert gemiddeld in recente ${venueText}.`
    }

    if (value < 75) {
      return `${opponent} presteert sterk in recente ${venueText}.`
    }

    return `${opponent} presteert uitzonderlijk sterk in recente ${venueText}.`
  }

  if (key === 'production') {
    if (value < 35) {
      return `${opponent} combineert een beperkte doelproductie met defensieve kwetsbaarheid.`
    }

    if (value < 55) {
      return `De doelproductie en defensieve cijfers van ${opponent} zijn redelijk gemiddeld.`
    }

    if (value < 75) {
      return `${opponent} heeft sterke aanvallende en defensieve productiecijfers.`
    }

    return `${opponent} heeft uitzonderlijk sterke productiecijfers.`
  }

  if (key === 'history') {
    if (value < 25) {
      return `De historische matchup is zeer gunstig voor ${ownClub}.`
    }

    if (value < 45) {
      return `De historische matchup is licht gunstig voor ${ownClub}.`
    }

    if (value < 55) {
      return `De onderlinge historie is vrijwel in balans.`
    }

    if (value < 75) {
      return `De historische matchup is licht ongunstig voor ${ownClub}.`
    }

    return `De historische matchup is zeer ongunstig voor ${ownClub}.`
  }

  return ''
}

function difficultyFactorLabel(key) {
  const labels = {
    teamStrength: 'Relatieve teamsterkte',
    recentForm: 'Recente vorm',
    venueForm: 'Thuis-/uitvorm',
    production: 'Productie',
    history: 'Historische matchup',
  }

  return labels[key] || key
}

function renderDifficultyExplanation(
  side,
  fixture,
) {
  const keys = [
    'teamStrength',
    'recentForm',
    'venueForm',
    'production',
    'history',
  ]

  return `
    <details class="difficulty-explanation">
      <summary>
        Waarom deze score?
      </summary>

      <div class="difficulty-explanation-content">
        <div class="difficulty-explanation-result">
          <div>
            <span>Moeilijkheid voor</span>
            <strong>${side.club}</strong>
          </div>

          <div
            class="difficulty-explanation-score"
            style="
              --difficulty-color: ${side.color};
              border-color: ${side.color};
            "
          >
            <strong>
              ${Number(side.difficulty).toFixed(1)}/5
            </strong>
            <span>${side.label}</span>
          </div>
        </div>

        <div class="difficulty-confidence">
          <span>Betrouwbaarheid</span>
          <strong>${side.confidence}%</strong>
        </div>

        <div class="difficulty-factor-list">
          ${keys
            .map((key) => {
              const value =
                side.components[key]

              const weight =
                side.effectiveWeights?.[key] || 0

              const hasData =
                value !== null &&
                value !== undefined &&
                weight > 0

              return `
                <article
                  class="
                    difficulty-factor
                    ${hasData ? '' : 'is-unavailable'}
                  "
                >
                  <div class="difficulty-factor-heading">
                    <strong>
                      ${difficultyFactorLabel(key)}
                    </strong>

                    <span>
                      ${
                        hasData
                          ? `${Number(weight).toFixed(1)}% invloed`
                          : 'Nog niet actief'
                      }
                    </span>
                  </div>

                  <div class="difficulty-factor-bar">
                    <span
                      style="
                        width: ${
                          hasData
                            ? Math.max(
                                4,
                                Math.min(100, weight),
                              )
                            : 0
                        }%;
                        background: ${side.color};
                      "
                    ></span>
                  </div>

                  <p>
                    ${difficultyFactorText({
                      key,
                      value,
                      side,
                      fixture,
                    })}
                  </p>
                </article>
              `
            })
            .join('')}
        </div>
      </div>
    </details>
  `
}

function getFavoriteDescription(
  homeDifficulty,
  awayDifficulty,
  fixture,
) {
  const difference =
    Number(awayDifficulty.difficulty) -
    Number(homeDifficulty.difficulty)

  /*
   * Hoe lager de moeilijkheid voor een club,
   * hoe gunstiger de wedstrijd voor die club.
   */
  if (difference >= 1.5) {
    return {
      favorite: fixture.home,
      underdog: fixture.away,
      text:
        `${fixture.home} is de duidelijke favoriet in deze wedstrijd.`,
    }
  }

  if (difference >= 0.6) {
    return {
      favorite: fixture.home,
      underdog: fixture.away,
      text:
        `${fixture.home} lijkt vooraf licht in het voordeel.`,
    }
  }

  if (difference <= -1.5) {
    return {
      favorite: fixture.away,
      underdog: fixture.home,
      text:
        `${fixture.away} is de duidelijke favoriet in deze wedstrijd.`,
    }
  }

  if (difference <= -0.6) {
    return {
      favorite: fixture.away,
      underdog: fixture.home,
      text:
        `${fixture.away} lijkt vooraf licht in het voordeel.`,
    }
  }

  return {
    favorite: null,
    underdog: null,
    text:
      `${fixture.home} en ${fixture.away} zijn vooraf behoorlijk aan elkaar gewaagd.`,
  }
}

function getHistorySummary(
  fixture,
  analysis,
) {
  const summary = analysis.headToHeadSummary
  const matches = Number(summary.matches) || 0

  if (!matches) {
    return (
      'Er zijn nog onvoldoende onderlinge duels ' +
      'om een historisch patroon vast te stellen.'
    )
  }

  const homeWins = Number(summary.wins) || 0
  const awayWins = Number(summary.losses) || 0

  const homeWinShare = homeWins / matches
  const awayWinShare = awayWins / matches

  if (homeWinShare >= 0.7) {
    return (
      `${fixture.home} won ${homeWins} van de laatste ` +
      `${matches} ontmoetingen met ${fixture.away}.`
    )
  }

  if (awayWinShare >= 0.7) {
    return (
      `${fixture.away} won ${awayWins} van de laatste ` +
      `${matches} ontmoetingen met ${fixture.home}.`
    )
  }

  if (
    homeWinShare >= 0.5 &&
    homeWins > awayWins
  ) {
    return (
      `${fixture.home} heeft op basis van de laatste ` +
      `${matches} ontmoetingen een licht historisch voordeel.`
    )
  }

  if (
    awayWinShare >= 0.5 &&
    awayWins > homeWins
  ) {
    return (
      `${fixture.away} heeft op basis van de laatste ` +
      `${matches} ontmoetingen een licht historisch voordeel.`
    )
  }

  return (
    `De laatste ${matches} onderlinge ontmoetingen ` +
    'leveren geen duidelijk historisch voordeel op.'
  )
}

function getGoalExpectationSummary(
  analysis,
  hasEnoughPredictionData,
) {
  if (!hasEnoughPredictionData) {
    return (
      'Voor een actuele doelpuntenverwachting zijn nog onvoldoende ' +
      'wedstrijden uit dit seizoen gespeeld.'
    )
  }

  const totalGoals =
    Number(analysis.expectedTotalGoals) || 0

  if (totalGoals >= 3.4) {
    return (
      'Een open en doelpuntrijke wedstrijd ligt op basis van de actuele cijfers voor de hand.'
    )
  }

  if (totalGoals >= 2.5) {
    return (
      'De wedstrijd heeft een redelijke kans op meerdere doelpunten.'
    )
  }

  return (
    'Een gesloten wedstrijd met relatief weinig doelpunten lijkt waarschijnlijker.'
  )
}

function getBestFantasyLine(
  ratings,
) {
  const lines = [
    {
      key: 'attack',
      label: 'aanvallers',
      rating: Number(ratings.attack) || 0,
    },
    {
      key: 'midfield',
      label: 'middenvelders',
      rating: Number(ratings.midfield) || 0,
    },
    {
      key: 'defense',
      label: 'verdedigers',
      rating: Number(ratings.defense) || 0,
    },
    {
      key: 'goalkeeper',
      label: 'keeper',
      rating: Number(ratings.goalkeeper) || 0,
    },
  ]

  return lines.sort(
    (a, b) => b.rating - a.rating,
  )[0]
}

function buildFantasyInsight(
  fixture,
  analysis,
  favoriteInfo,
) {
  const homeBest = getBestFantasyLine(
    analysis.ratings.home,
  )

  const awayBest = getBestFantasyLine(
    analysis.ratings.away,
  )

  if (favoriteInfo.favorite === fixture.home) {
    if (homeBest.rating >= 4.5) {
      return (
        `${fixture.home}-${homeBest.label} behoren in deze ` +
        'wedstrijd tot de aantrekkelijkste Fantasy-keuzes.'
      )
    }

    if (homeBest.rating >= 4) {
      return (
        `Overweeg vooral de ${homeBest.label} van ` +
        `${fixture.home}.`
      )
    }

    return (
      `Spelers van ${fixture.home} hebben de voorkeur, ` +
      'maar controleer de waardering per linie.'
    )
  }

  if (favoriteInfo.favorite === fixture.away) {
    if (awayBest.rating >= 4.5) {
      return (
        `${fixture.away}-${awayBest.label} behoren in deze ` +
        'wedstrijd tot de aantrekkelijkste Fantasy-keuzes.'
      )
    }

    if (awayBest.rating >= 4) {
      return (
        `Overweeg vooral de ${awayBest.label} van ` +
        `${fixture.away}.`
      )
    }

    return (
      `Spelers van ${fixture.away} hebben de voorkeur, ` +
      'maar controleer de waardering per linie.'
    )
  }

  if (
    homeBest.rating >= 4 &&
    awayBest.rating >= 4
  ) {
    return (
      'Beide ploegen bieden interessante Fantasy-opties. ' +
      'De aanvallende linies lijken het aantrekkelijkst.'
    )
  }

  return (
    'Geen vanzelfsprekende captainwedstrijd. ' +
    'Kies gericht op basis van de waardering per linie.'
  )
}

function matchIndicatorStars(value) {
  const rating = Math.max(
    0,
    Math.min(5, Number(value) || 0),
  )

  return renderRatingStars(rating)
}

function getFavoriteNarrative({
  fixture,
  homePercentage,
  awayPercentage,
}) {
  const difference = Math.abs(
    homePercentage - awayPercentage,
  )

  const favoriteClub =
    homePercentage > awayPercentage
      ? fixture.home
      : awayPercentage > homePercentage
        ? fixture.away
        : null

  const underdogClub =
    favoriteClub === fixture.home
      ? fixture.away
      : fixture.home

  if (!favoriteClub || difference <= 2) {
    return {
      title: 'Volledig in balans',
      description:
        'Deze wedstrijd is op papier vrijwel gelijkwaardig. Kleine details kunnen de doorslag geven.',
    }
  }

  if (difference <= 6) {
    return {
      title: `Klein voordeel ${favoriteClub}`,
      description:
        `${favoriteClub} heeft een klein statistisch voordeel, ` +
        `maar ${underdogClub} heeft volop uitzicht op een resultaat.`,
    }
  }

  if (difference <= 14) {
    return {
      title: `${favoriteClub} is licht favoriet`,
      description:
        `${favoriteClub} heeft de beste papieren, ` +
        'maar het verschil tussen beide ploegen blijft beperkt.',
    }
  }

  if (difference <= 24) {
    return {
      title: `${favoriteClub} is duidelijke favoriet`,
      description:
        `${favoriteClub} behoort deze wedstrijd vaker te winnen, ` +
        `maar ${underdogClub} kan nog steeds voor een verrassing zorgen.`,
    }
  }

  if (difference <= 36) {
    return {
      title: `${favoriteClub} is de grote favoriet`,
      description:
        `De meeste indicatoren wijzen in het voordeel van ${favoriteClub}. ` +
        `Puntverlies zou enigszins verrassend zijn.`,
    }
  }

  return {
    title:
      `${favoriteClub} moet deze wedstrijd normaal gesproken winnen`,
    description:
      `De krachtsverhouding is duidelijk in het voordeel van ${favoriteClub}. ` +
      'Een ander resultaat zou een serieuze verrassing zijn.',
  }
}

function getPredictionConfidence({
  analysis,
  homePercentage,
  awayPercentage,
}) {
  const homePlayed =
    Number(
      analysis.homeRecentSummary?.played,
    ) || 0

  const awayPlayed =
    Number(
      analysis.awayRecentSummary?.played,
    ) || 0

  const recentSample = Math.min(
    homePlayed,
    awayPlayed,
  )

  const historySample =
    Number(
      analysis.headToHeadSummary?.matches,
    ) || 0

  const percentageDifference =
    Math.abs(
      homePercentage - awayPercentage,
    )

  /*
   * Basis: 45
   * Actuele data: maximaal +28
   * Historie: maximaal +8
   * Duidelijkheid van het verschil: maximaal +12
   */
  const confidence = Math.round(
    Math.max(
      45,
      Math.min(
        93,
        45 +
          Math.min(recentSample / 8, 1) * 28 +
          Math.min(historySample, 10) * 0.8 +
          Math.min(
            percentageDifference,
            40,
          ) * 0.3,
      ),
    ),
  )

  let label = 'Beperkt'
  let stars = 2

  if (confidence >= 80) {
    label = 'Hoog'
    stars = 5
  } else if (confidence >= 68) {
    label = 'Goed'
    stars = 4
  } else if (confidence >= 56) {
    label = 'Redelijk'
    stars = 3
  }

  return {
    confidence,
    label,
    stars,
  }
}

function renderMatchIndicators({
  fixture,
  analysis,
  homeDifficulty,
  awayDifficulty,
  hasEnoughPredictionData,
}) {
  const homeDifficultyValue =
  Number(homeDifficulty.difficulty) || 3

const awayDifficultyValue =
  Number(awayDifficulty.difficulty) || 3

/*
 * Hoe gunstiger de moeilijkheid voor een club,
 * hoe groter zijn geschatte favorietenpercentage.
 *
 * Een verschil van 0 geeft 50/50.
 * Een verschil van 1 geeft ongeveer 62/38.
 * Grote verschillen worden begrensd op 88/12.
 */
const difficultyDifference =
  awayDifficultyValue -
  homeDifficultyValue

function getFavoritePercentage(difference) {
  const absoluteDifference = Math.abs(difference)

  let advantage = 0

  if (absoluteDifference < 0.25) {
    advantage = 0
  } else if (absoluteDifference < 0.75) {
    advantage = 3
  } else if (absoluteDifference < 1.25) {
    advantage = 6
  } else if (absoluteDifference < 1.75) {
    advantage = 10
  } else if (absoluteDifference < 2.25) {
    advantage = 14
  } else if (absoluteDifference < 2.75) {
    advantage = 18
  } else {
    advantage = 22
  }

  return difference >= 0
    ? 50 + advantage
    : 50 - advantage
}

const homeFavoritePercentage =
  getFavoritePercentage(
    difficultyDifference,
  )

const awayFavoritePercentage =
  100 - homeFavoritePercentage

const favoriteClub =
  homeFavoritePercentage > awayFavoritePercentage
    ? fixture.home
    : awayFavoritePercentage > homeFavoritePercentage
      ? fixture.away
      : null

      const favoriteNarrative =
  getFavoriteNarrative({
    fixture,
    homePercentage:
      homeFavoritePercentage,
    awayPercentage:
      awayFavoritePercentage,
  })

const predictionConfidence =
  getPredictionConfidence({
    analysis,
    homePercentage:
      homeFavoritePercentage,
    awayPercentage:
      awayFavoritePercentage,
  })

  const goalRating = hasEnoughPredictionData
    ? Math.max(
        1,
        Math.min(
          5,
          Number(analysis.expectedTotalGoals) || 1,
        ),
      )
    : null

  const bothTeamsRating = hasEnoughPredictionData
    ? Math.max(
        1,
        Math.min(
          5,
          (
            Number(
              analysis.bothTeamsScoreIndicator,
            ) || 0
          ) / 20,
        ),
      )
    : null

  const homeIsFavorite =
  homeFavoritePercentage >=
  awayFavoritePercentage

const favoriteRatings = homeIsFavorite
  ? analysis.ratings.home
  : analysis.ratings.away

  const cleanSheetRating = hasEnoughPredictionData
    ? Math.max(
        1,
        Math.min(
          5,
          (
            Number(favoriteRatings.defense) +
            Number(favoriteRatings.goalkeeper)
          ) / 2,
        ),
      )
    : null

    const renderFavoriteIndicator = () => {
  return `
    <article class="fixture-favorite-indicator">
      <div class="fixture-favorite-heading">
        <span>Favorietenverhouding</span>

        <strong>
          ${favoriteNarrative.title}
        </strong>

        <small>
          ${favoriteNarrative.description}
        </small>
      </div>

      <div class="fixture-favorite-team">
        <div class="fixture-favorite-team-row">
          <span>${fixture.home}</span>

          <strong>
            ${homeFavoritePercentage}%
          </strong>
        </div>

        <div class="fixture-favorite-bar">
          <span
            style="
              width:
                ${homeFavoritePercentage}%;
            "
          ></span>
        </div>
      </div>

      <div class="fixture-favorite-team">
        <div class="fixture-favorite-team-row">
          <span>${fixture.away}</span>

          <strong>
            ${awayFavoritePercentage}%
          </strong>
        </div>

        <div class="fixture-favorite-bar">
          <span
            style="
              width:
                ${awayFavoritePercentage}%;
            "
          ></span>
        </div>
      </div>

      <div class="fixture-prediction-confidence">
        <div>
          <span>
            Vertrouwen in voorspelling
          </span>

          <strong>
            ${predictionConfidence.label}
          </strong>
        </div>

        <div
          class="fixture-confidence-stars"
          aria-label="
            ${predictionConfidence.stars}
            van 5 sterren
          "
        >
          ${Array.from(
            { length: 5 },
            (_, index) => `
              <span
                class="${
                  index <
                  predictionConfidence.stars
                    ? 'active'
                    : ''
                }"
              >
                ★
              </span>
            `,
          ).join('')}
        </div>

        <small>
          ${predictionConfidence.confidence}%
          modelbetrouwbaarheid
        </small>
      </div>
    </article>
  `

  return `
    <article class="fixture-favorite-indicator">
      <div class="fixture-favorite-heading">
        <span>Favoriet</span>

        <strong>
          ${favoriteClub || 'Geen duidelijke favoriet'}
        </strong>

        <small>${verdict}</small>
      </div>

      <div class="fixture-favorite-team">
        <div class="fixture-favorite-team-row">
          <span>${fixture.home}</span>
          <strong>${homeFavoritePercentage}%</strong>
        </div>

        <div class="fixture-favorite-bar">
          <span
            style="
              width: ${homeFavoritePercentage}%;
            "
          ></span>
        </div>
      </div>

      <div class="fixture-favorite-team">
        <div class="fixture-favorite-team-row">
          <span>${fixture.away}</span>
          <strong>${awayFavoritePercentage}%</strong>
        </div>

        <div class="fixture-favorite-bar">
          <span
            style="
              width: ${awayFavoritePercentage}%;
            "
          ></span>
        </div>
      </div>
    </article>
  `
}

  const renderIndicator = ({
    label,
    value,
    detail,
  }) => `
    <article
      class="
        fixture-match-indicator
        ${value === null ? 'is-unavailable' : ''}
      "
    >
      <div>
        <span>${label}</span>
        <strong>${detail}</strong>
      </div>

      ${
        value === null
          ? `
            <small>
              Nog geen actuele data
            </small>
          `
          : matchIndicatorStars(value)
      }
    </article>
  `

  return `
    <div class="fixture-match-indicators">
      ${renderFavoriteIndicator()}

      ${renderIndicator({
        label: 'Doelpunten',
        value: goalRating,
        detail: hasEnoughPredictionData
          ? `${formatAnalysisNumber(
              analysis.expectedTotalGoals,
            )} verwacht`
          : 'Voorspelling volgt',
      })}

      ${renderIndicator({
        label: 'Beide teams scoren',
        value: bothTeamsRating,
        detail: hasEnoughPredictionData
          ? `${formatAnalysisNumber(
              analysis.bothTeamsScoreIndicator,
              0,
            )}% kansindicatie`
          : 'Voorspelling volgt',
      })}

      ${renderIndicator({
        label: `Clean sheet ${favoriteClub}`,
        value: cleanSheetRating,
        detail: hasEnoughPredictionData
          ? 'Fantasy-indicatie'
          : 'Voorspelling volgt',
      })}
    </div>
  `
}

function renderMatchSummary({
  fixture,
  analysis,
  homeDifficulty,
  awayDifficulty,
}) {
  const homePlayed =
    Number(analysis.homeRecentSummary.played) || 0

  const awayPlayed =
    Number(analysis.awayRecentSummary.played) || 0

  const hasEnoughPredictionData =
    homePlayed >= 3 &&
    awayPlayed >= 3

  const favoriteInfo =
    getFavoriteDescription(
      homeDifficulty,
      awayDifficulty,
      fixture,
    )

  const historyText =
    getHistorySummary(
      fixture,
      analysis,
    )

  const goalsText =
    getGoalExpectationSummary(
      analysis,
      hasEnoughPredictionData,
    )

  const fantasyInsight =
    buildFantasyInsight(
      fixture,
      analysis,
      favoriteInfo,
    )

  return `
    <section class="fixture-match-summary">
      <div class="fixture-analysis-heading">
        <div>
          <span class="eyebrow">
            Wedstrijdanalyse
          </span>

          <h4>
            Analyse
          </h4>
        </div>
      </div>

      <div class="fixture-summary-conclusion">
        <strong>
          ${favoriteInfo.text}
        </strong>

        <p>${historyText}</p>
        <p>${goalsText}</p>
      </div>

      ${renderMatchIndicators({
        fixture,
        analysis,
        homeDifficulty,
        awayDifficulty,
        hasEnoughPredictionData,
      })}

      <div class="fixture-fantasy-insight">
        <span>Fantasy Insight</span>
        <strong>${fantasyInsight}</strong>
      </div>
    </section>
  `
}

export function renderFixtureDetailPanel(
  fixture,
) {
  if (!fixture) {
    return `
      <aside class="fixture-detail-panel empty">
        <span class="eyebrow">Wedstrijdinformatie</span>
        <h3>Kies een wedstrijd</h3>
        <p>Klik op een wedstrijd om hier de details te bekijken.</p>
      </aside>
    `
  }

const calculation =
  calculateFixtureDifficulty({
    fixture,
    results: getResults(),
    teamRatings: getTeamRatings(),
  })

const analysis = calculation.analysis

const homeDifficulty = calculation.home
const awayDifficulty = calculation.away

const {
  homeRecentMatches,
  awayRecentMatches,
  homeVenueSummary,
  awayVenueSummary,
  headToHeadMatches,
  headToHeadSummary,
  venueHeadToHeadMatches,
  venueHeadToHeadSummary,
  expectedHomeGoals,
  expectedAwayGoals,
  confidence,
  ratings,
} = analysis

const homePlayed =
  Number(
    analysis.homeRecentSummary.played,
  ) || 0

const awayPlayed =
  Number(
    analysis.awayRecentSummary.played,
  ) || 0

const homeFantasyLines = {
  attack: buildFantasyLineDisplay({
    club: fixture.home,
    line: 'Aanvallers',
    liveRating: ratings.home.attack,
    liveConfidence: confidence.home.attack,
    recentPlayed: homePlayed,
    difficultySide: homeDifficulty,
  }),

  midfield: buildFantasyLineDisplay({
    club: fixture.home,
    line: 'Middenvelders',
    liveRating: ratings.home.midfield,
    liveConfidence: confidence.home.midfield,
    recentPlayed: homePlayed,
    difficultySide: homeDifficulty,
  }),

  defense: buildFantasyLineDisplay({
    club: fixture.home,
    line: 'Verdedigers',
    liveRating: ratings.home.defense,
    liveConfidence: confidence.home.defense,
    recentPlayed: homePlayed,
    difficultySide: homeDifficulty,
  }),

  goalkeeper: buildFantasyLineDisplay({
    club: fixture.home,
    line: 'Keeper',
    liveRating: ratings.home.goalkeeper,
    liveConfidence: confidence.home.goalkeeper,
    recentPlayed: homePlayed,
    difficultySide: homeDifficulty,
  }),
}

const awayFantasyLines = {
  attack: buildFantasyLineDisplay({
    club: fixture.away,
    line: 'Aanvallers',
    liveRating: ratings.away.attack,
    liveConfidence: confidence.away.attack,
    recentPlayed: awayPlayed,
    difficultySide: awayDifficulty,
  }),

  midfield: buildFantasyLineDisplay({
    club: fixture.away,
    line: 'Middenvelders',
    liveRating: ratings.away.midfield,
    liveConfidence: confidence.away.midfield,
    recentPlayed: awayPlayed,
    difficultySide: awayDifficulty,
  }),

  defense: buildFantasyLineDisplay({
    club: fixture.away,
    line: 'Verdedigers',
    liveRating: ratings.away.defense,
    liveConfidence: confidence.away.defense,
    recentPlayed: awayPlayed,
    difficultySide: awayDifficulty,
  }),

  goalkeeper: buildFantasyLineDisplay({
    club: fixture.away,
    line: 'Keeper',
    liveRating: ratings.away.goalkeeper,
    liveConfidence: confidence.away.goalkeeper,
    recentPlayed: awayPlayed,
    difficultySide: awayDifficulty,
  }),
}

  return `
    <aside class="fixture-detail-panel">
      <span class="eyebrow">Wedstrijdinformatie</span>

      <div class="detail-match-heading">
        <div class="detail-club">
          ${renderClubLogo(fixture.home, 'detail-club-logo')}
          <strong>${fixture.home}</strong>
        </div>

        <span>–</span>

        <div class="detail-club">
          ${renderClubLogo(fixture.away, 'detail-club-logo')}
          <strong>${fixture.away}</strong>
        </div>
      </div>

      <p>
        ${formatDate(fixture)} · Speelronde ${fixture.round}
      </p>

      ${renderMatchSummary({
  fixture,
  analysis,
  homeDifficulty,
  awayDifficulty,
})}

      <div class="detail-difficulty-grid">
  <div
    class="detail-difficulty-dynamic"
    style="
      --difficulty-color: ${homeDifficulty.color};
      border-color: ${homeDifficulty.color};
      background:
        color-mix(
          in srgb,
          ${homeDifficulty.color} 78%,
          #111827
        );
    "
  >
    <div class="detail-difficulty-club">
      ${renderClubLogo(
        fixture.home,
        'detail-difficulty-logo',
      )}
      <span>${fixture.home}</span>
    </div>

    <strong>
      ${Number(
        homeDifficulty.difficulty,
      ).toFixed(1)}/5
    </strong>

    <small>${homeDifficulty.label}</small>
  </div>

  <div
    class="detail-difficulty-dynamic"
    style="
      --difficulty-color: ${awayDifficulty.color};
      border-color: ${awayDifficulty.color};
      background:
        color-mix(
          in srgb,
          ${awayDifficulty.color} 78%,
          #111827
        );
    "
  >
    <div class="detail-difficulty-club">
      ${renderClubLogo(
        fixture.away,
        'detail-difficulty-logo',
      )}
      <span>${fixture.away}</span>
    </div>

    <strong>
      ${Number(
        awayDifficulty.difficulty,
      ).toFixed(1)}/5
    </strong>

    <small>${awayDifficulty.label}</small>
  </div>
</div>

<section class="fixture-analysis-section">
  <div class="fixture-analysis-heading">
    <div>
      <span class="eyebrow">
        Wedstrijdmoeilijkheid
      </span>

      <h4>
        Onderbouwing per club
      </h4>
    </div>
  </div>

  <div class="difficulty-explanation-list">
    ${renderDifficultyExplanation(
      homeDifficulty,
      fixture,
    )}

    ${renderDifficultyExplanation(
      awayDifficulty,
      fixture,
    )}
  </div>
</section>
      <section class="fixture-analysis-section">
        <span class="eyebrow">
          Historische analyse
        </span>

        ${
  homeRecentMatches.length >= 3 &&
  awayRecentMatches.length >= 3
    ? `
      <h4>
        Verwachte score:
        ${formatAnalysisNumber(expectedHomeGoals)}
        –
        ${formatAnalysisNumber(expectedAwayGoals)}
      </h4>

      <p>
        Gebaseerd op
        ${homeRecentMatches.length} recente wedstrijden van
        ${fixture.home},
        ${awayRecentMatches.length} van ${fixture.away}
        en ${headToHeadMatches.length} onderlinge duels.
      </p>

      <div class="prediction-reliability">
        <span>Databetrouwbaarheid</span>

        <strong>
          ${
            Math.min(
              homeRecentMatches.length,
              awayRecentMatches.length,
            ) >= 8
              ? 'Hoog'
              : Math.min(
                    homeRecentMatches.length,
                    awayRecentMatches.length,
                  ) >= 5
                ? 'Goed'
                : 'Beperkt'
          }
        </strong>
      </div>
    `
    : `
      <h4>
        Verwachte score nog niet beschikbaar
      </h4>

      <p>
        Er zijn nog onvoldoende competitiewedstrijden gespeeld
        in seizoen ${fixture.season}.
      </p>

      <p class="fixture-analysis-note">
        De voorspelling wordt automatisch geactiveerd zodra
        beide clubs minimaal drie actuele wedstrijden hebben gespeeld.
        De historische gegevens worden al wel gebruikt voor de
        wedstrijdmoeilijkheid.
      </p>
    `
}
      </section>
            <section class="fixture-analysis-section">
        <div class="fixture-analysis-heading">
          <div>
            <span class="eyebrow">
              Wedstrijdhistorie
            </span>

            <h4>
              Onderling en op deze locatie
            </h4>
          </div>
        </div>

        <div class="fixture-history-block">
          <span class="fixture-history-label">
            Laatste ${headToHeadMatches.length} onderlinge duels
          </span>

          <div class="fixture-history-balance">
            <article>
              <span>${fixture.home}</span>
              <strong>${headToHeadSummary.wins}</strong>
              <small>gewonnen</small>
            </article>

            <article>
              <span>Gelijk</span>
              <strong>${headToHeadSummary.draws}</strong>
              <small>gespeeld</small>
            </article>

            <article>
              <span>${fixture.away}</span>
              <strong>${headToHeadSummary.losses}</strong>
              <small>gewonnen</small>
            </article>
          </div>
        </div>

        <div class="fixture-history-block fixture-history-location">
          <span class="fixture-history-label">
            ${fixture.home} thuis tegen ${fixture.away}
          </span>

          ${
            venueHeadToHeadMatches.length
              ? `
                <div class="fixture-history-balance">
                  <article>
                    <span>${fixture.home}</span>
                    <strong>${venueHeadToHeadSummary.wins}</strong>
                    <small>gewonnen</small>
                  </article>

                  <article>
                    <span>Gelijk</span>
                    <strong>${venueHeadToHeadSummary.draws}</strong>
                    <small>gespeeld</small>
                  </article>

                  <article>
                    <span>${fixture.away}</span>
                    <strong>${venueHeadToHeadSummary.losses}</strong>
                    <small>gewonnen</small>
                  </article>
                </div>

                <div class="fixture-history-goals">
                  <span>
                    Gemiddelde score
                  </span>

                  <strong>
                    ${formatAnalysisNumber(
                      venueHeadToHeadSummary.averageGoalsFor,
                    )}
                    –
                    ${formatAnalysisNumber(
                      venueHeadToHeadSummary.averageGoalsAgainst,
                    )}
                  </strong>
                </div>
              `
              : `
                <p class="fixture-analysis-empty">
                  Geen eerdere ontmoetingen op deze locatie gevonden.
                </p>
              `
          }
        </div>

        <div class="fixture-venue-form-grid">
          <article>
            <span>
              Laatste thuiswedstrijden
            </span>

            <strong>${fixture.home}</strong>

            <small>
              ${homeVenueSummary.wins}W ·
              ${homeVenueSummary.draws}G ·
              ${homeVenueSummary.losses}V
            </small>

            <b>
              ${formatAnalysisNumber(
                homeVenueSummary.averageGoalsFor,
              )}
              goals voor
            </b>
          </article>

          <article>
            <span>
              Laatste uitwedstrijden
            </span>

            <strong>${fixture.away}</strong>

            <small>
              ${awayVenueSummary.wins}W ·
              ${awayVenueSummary.draws}G ·
              ${awayVenueSummary.losses}V
            </small>

            <b>
              ${formatAnalysisNumber(
                awayVenueSummary.averageGoalsFor,
              )}
              goals voor
            </b>
          </article>
        </div>
      </section>
            <section class="fixture-analysis-section">
        <div class="fixture-analysis-heading">
          <div>
            <span class="eyebrow">
              Fantasy-indicatie
            </span>

            <h4>
              Waardering per linie
            </h4>
          </div>
        </div>

        <div class="fixture-fantasy-team">
          <div class="fixture-fantasy-team-heading">
            ${renderClubLogo(
              fixture.home,
              'fixture-analysis-club-logo',
            )}

            <strong>${fixture.home}</strong>
          </div>

          <div class="fixture-fantasy-list">
         ${renderFantasyRating(
  fixture.home,
  'Aanvallers',
  homeFantasyLines.attack.rating,
  homeFantasyLines.attack.confidenceData,
)}

            ${renderFantasyRating(
  fixture.home,
  'Middenvelders',
  homeFantasyLines.midfield.rating,
  homeFantasyLines.midfield.confidenceData,
            )}

            ${renderFantasyRating(
  fixture.home,
  'Verdedigers',
  homeFantasyLines.defense.rating,
  homeFantasyLines.defense.confidenceData,
            )}

            ${renderFantasyRating(
  fixture.home,
  'Keeper',
  homeFantasyLines.goalkeeper.rating,
  homeFantasyLines.goalkeeper.confidenceData,
            )}
          </div>
        </div>

        <div class="fixture-fantasy-team">
          <div class="fixture-fantasy-team-heading">
            ${renderClubLogo(
              fixture.away,
              'fixture-analysis-club-logo',
            )}

            <strong>${fixture.away}</strong>
          </div>

          ${renderFantasyRating(
  fixture.away,
  'Aanvallers',
  awayFantasyLines.attack.rating,
  awayFantasyLines.attack.confidenceData,
            )}

            ${renderFantasyRating(
  fixture.away,
  'Middenvelders',
  awayFantasyLines.midfield.rating,
  awayFantasyLines.midfield.confidenceData,
            )}

            ${renderFantasyRating(
  fixture.away,
  'Verdedigers',
  awayFantasyLines.defense.rating,
  awayFantasyLines.defense.confidenceData,
            )}

            ${renderFantasyRating(
  fixture.away,
  'Keeper',
  awayFantasyLines.goalkeeper.rating,
  awayFantasyLines.goalkeeper.confidenceData,
            )}
          </div>
        </div>
      </section>
      <div class="detail-note">
        <strong>Handmatige override</strong>
        <p>
          Bij synchronisatie gebruikt Fantasy Studio automatisch
          jullie handmatige score als die is ingevuld; anders de
          automatische score.
        </p>
      </div>
    </aside>
  `
}

export function createFixturesScreen() {
  const clubs = currentClubs()

  return `
    <section class="panel fixtures-module">
      <div class="panel-heading fixtures-heading">
  <div class="fixtures-heading-title">
    <span class="eyebrow">
      Eredivisie 2026/27
    </span>

    <h2>
      Speelschema & fixture difficulty
    </h2>
  </div>

  <div
    class="fixture-difficulty-legend"
    aria-label="Legenda schemawaardes"
  >
    <span class="fixture-legend-title">
      Schemawaardes
    </span>

    <div class="fixture-legend-labels">
      <span>Uitstekend</span>
      <span>Gunstig</span>
      <span>In balans</span>
      <span>Ongunstig</span>
      <span>Zwaar</span>
    </div>

    <div class="fixture-legend-scale">
      <div class="fixture-legend-gradient"></div>

      <div
        class="fixture-legend-marker hidden"
        id="fixture-legend-marker"
      >
        <span id="fixture-legend-value">
          2.8
        </span>
      </div>
    </div>

    <div class="fixture-legend-values">
      <span>1.0</span>
      <span>2.0</span>
      <span>3.0</span>
      <span>4.0</span>
      <span>5.0</span>
    </div>

    <small>
      Lager is gunstiger
    </small>
  </div>

        <div class="fixture-mode-switch">
          <button
            class="fixture-mode active"
            data-mode="club"
            type="button"
          >
            Per club
          </button>

          <button
            class="fixture-mode"
            data-mode="round"
            type="button"
          >
            Per speelronde
          </button>

          <button
            class="fixture-mode"
            data-mode="compare"
            type="button"
          >
            Vergelijken
          </button>
        </div>
      </div>

      <div class="fixture-sticky-legend" aria-label="Compacte legenda schemawaarde en Europese context">
        <div class="sticky-schema-legend">
          <strong>Schemawaarde</strong>
          <div class="sticky-schema-scale" aria-hidden="true">
            <span class="sticky-schema-gradient"></span>
            <span class="sticky-schema-values"><b>1</b><b>2</b><b>3</b><b>4</b><b>5</b></span>
          </div>
          <small>Lager is gunstiger</small>
        </div>
        <span class="sticky-legend-divider" aria-hidden="true"></span>
        <div class="sticky-europe-legend">
          <strong>Europa</strong>
          <span>${renderEuropeanCompetitionLogo('UCL',{variant:'legend'})}UCL</span>
          <span>${renderEuropeanCompetitionLogo('UEL',{variant:'legend'})}UEL</span>
          <span>${renderEuropeanCompetitionLogo('UECL',{variant:'legend'})}UECL</span>
        </div>
      </div>

      <div class="fixture-controls">
        <label class="fixture-club-control">
          <span>Club</span>
          <select id="fixture-club">
            ${clubs
              .map(
                (club) => `
                  <option
                    value="${club}"
                    ${club === 'FC Utrecht' ? 'selected' : ''}
                  >
                    ${club}
                  </option>
                `,
              )
              .join('')}
          </select>
        </label>

        <label id="fixture-round-control" class="fixture-round-control">
  <span id="fixture-round-label">
    Vanaf speelronde
  </span>

  <select id="fixture-round">
            ${Array.from(
              { length: 34 },
              (_, index) => index + 1,
            )
              .map(
                (round) =>
                  `<option value="${round}">${round}</option>`,
              )
              .join('')}
          </select>
        </label>

        <label class="european-fixture-toggle">
          <span>Europese context</span>
          <span class="european-switch">
            <input id="fixture-europe-toggle" type="checkbox" checked>
            <span class="european-switch-track" aria-hidden="true"><span></span></span>
            <b class="european-switch-state">Aan</b>
          </span>
        </label>

        <div
  class="count-control"
  id="fixture-count-control"
>
          <span>Volgende wedstrijden</span>

          <select id="fixture-count-select" class="fixture-count-select hidden">
            ${Array.from({ length: 10 }, (_, index) => index + 1).map((count) => `<option value="${count}" ${count === 5 ? 'selected' : ''}>${count} wedstrijd${count === 1 ? '' : 'en'}</option>`).join('')}
          </select>

          <div class="count-buttons">
            ${Array.from(
              { length: 10 },
              (_, index) => index + 1,
            )
              .map(
                (count) => `
                  <button
                    class="count-button ${
                      count === 5 ? 'active' : ''
                    }"
                    data-count="${count}"
                    type="button"
                  >
                    ${count}
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>

        <label class="hidden" id="compare-club-group-control">
          <span>Clubgroep</span>
          <select id="compare-club-group">
            ${Object.entries(compareClubGroupLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
          </select>
        </label>

        <div
          class="compare-club-selectors hidden"
          id="compare-club-selectors"
        >
          ${[0, 1, 2, 3]
            .map(
              (index) => `
                <label>
                  <span>Club ${index + 1}</span>

                  <select
                    class="compare-club-select"
                    data-index="${index}"
                  >
                    <option value="">— Kies club —</option>

                    ${clubs
                      .map(
                        (club) =>
                          `<option value="${club}">${club}</option>`,
                      )
                      .join('')}
                  </select>
                </label>
              `,
            )
            .join('')}
        </div>
      </div>

      <div class="fixture-workspace">
        <div id="fixture-content"></div>
        <div id="fixture-detail"></div>
      </div>
    </section>
  `
}

function testDynamicDifficultyEngine() {
  const fixtures = getFixtures()
  const results = getResults()
  const teamRatings = getTeamRatings()
  const fortunaRating = teamRatings.find(
  (rating) =>
    String(rating.club)
      .toLowerCase()
      .includes('fortuna'),
)

console.log(
  'Fortuna-rating uit database:',
  fortunaRating,
)

  const testFixture =
    fixtures.find(
      (fixture) =>
        fixture.home === 'FC Utrecht' &&
        fixture.away === 'PSV',
    ) || fixtures[0]

  if (!testFixture) {
    console.warn(
      'Difficulty Engine-test: geen wedstrijd gevonden.',
    )
    return
  }

  const calculation =
    calculateFixtureDifficulty({
      fixture: testFixture,
      results,
      teamRatings,
    })

  console.group(
    `Dynamic Difficulty: ${testFixture.home} - ${testFixture.away}`,
  )

  console.log('Wedstrijd:', testFixture)

  console.table({
    thuisploeg: {
      club: calculation.home.club,
      tegenstander: calculation.home.opponent,
      moeilijkheid: calculation.home.difficulty,
      label: calculation.home.label,
      confidence: `${calculation.home.confidence}%`,
      teamkracht: calculation.home.components.teamStrength,
      vorm: calculation.home.components.recentForm,
      locatievorm: calculation.home.components.venueForm,
      productie: calculation.home.components.production,
      historie: calculation.home.components.history,
    },

    uitploeg: {
      club: calculation.away.club,
      tegenstander: calculation.away.opponent,
      moeilijkheid: calculation.away.difficulty,
      label: calculation.away.label,
      confidence: `${calculation.away.confidence}%`,
      teamkracht: calculation.away.components.teamStrength,
      vorm: calculation.away.components.recentForm,
      locatievorm: calculation.away.components.venueForm,
      productie: calculation.away.components.production,
      historie: calculation.away.components.history,
    },
  })

  console.log(
    'Volledige berekening:',
    calculation,
  )

  console.groupEnd()
}

function normalizeFixtureClubName(club) {
  return String(club || '')
    .trim()
    .toLocaleLowerCase('nl-NL')
    .replace(/\s+/g, ' ')
}

function resultMatchesFixture(
  result,
  fixture,
) {
  return (
    String(result.season || '') ===
      String(fixture.season || '') &&
    normalizeFixtureClubName(result.home) ===
      normalizeFixtureClubName(fixture.home) &&
    normalizeFixtureClubName(result.away) ===
      normalizeFixtureClubName(fixture.away)
  )
}

function isFixturePlayed(
  fixture,
  results,
) {
  return results.some(
    (result) =>
      resultMatchesFixture(
        result,
        fixture,
      ),
  )
}

function getAutomaticStartRound() {
  const fixtures = currentFixtures()
  const results = getResults()

  if (!fixtures.length) {
    return 1
  }

  const rounds = [
    ...new Set(
      fixtures
        .map((fixture) =>
          Number(fixture.round),
        )
        .filter(
          (round) =>
            Number.isFinite(round) &&
            round >= 1,
        ),
    ),
  ].sort((left, right) => left - right)

  for (const round of rounds) {
    const roundFixtures =
      fixtures.filter(
        (fixture) =>
          Number(fixture.round) === round,
      )

    const playedFixtures =
      roundFixtures.filter(
        (fixture) =>
          isFixturePlayed(
            fixture,
            results,
          ),
      )

    /*
     * Zodra een speelronde niet volledig
     * is afgerond, wordt dat de actieve ronde.
     *
     * Ook een deels gespeelde speelronde
     * blijft dus zichtbaar.
     */
    if (
      playedFixtures.length <
      roundFixtures.length
    ) {
      return round
    }
  }

  /*
   * Als alle speelronden volledig gespeeld zijn,
   * blijft speelronde 34 geselecteerd.
   */
  return rounds.at(-1) || 1
}

function renderLeagueContextFixture(item,direction) {
  if (!item) return ''
  const days=direction==='previous'?item.daysAfterPreviousLeagueFixture:item.daysBeforeNextLeagueFixture
  const relation=direction==='previous'?'NA':'VOOR'
  const arrow=direction==='previous'?'←':'→'
  return `<article class="european-programme-context-row">
    <strong>${arrow} ${days} ${days===1?'DAG':'DAGEN'} ${relation}</strong>
    <b>${escapeHtml(item.homeTeam)} – ${escapeHtml(item.awayTeam)}</b>
    <time>${escapeHtml(formatEuropeanDate({date:item.date,time:item.time}))}</time>
  </article>`
}

export function renderEuropeanFixtureDetailPanel(fixture,{club='',eredivisieFixtures=[]}={}) {
  if (!fixture) return renderFixtureDetailPanel(null)
  const identity = EUROPEAN_COMPETITIONS[fixture.competition] || EUROPEAN_COMPETITIONS.UECL
  const venue = fixture.homeAway === 'T' ? 'Thuis' : fixture.homeAway === 'U' ? 'Uit' : 'Locatie onbekend'
  const round = [fixture.phase, fixture.europeanRound ? `Europese ronde ${fixture.europeanRound}` : ''].filter(Boolean).join(' · ')
  const programmeContext=applyEuropeanContextGate(findLeagueFixturesAroundEuropeanFixture(fixture,eredivisieFixtures,club))
  const previous=programmeContext.previousLeagueFixture,next=programmeContext.nextLeagueFixture
  const minimumRest=Math.min(previous?.daysAfterPreviousLeagueFixture??Infinity,next?.daysBeforeNextLeagueFixture??Infinity)
  return `
    <aside class="fixture-detail-panel european-fixture-detail" style="--europe-accent:${identity.accent};--europe-primary:${identity.primary}">
      <div class="european-detail-heading">
        ${renderEuropeanCompetitionLogo(identity.code,{variant:'detail'})}
        <div><small>${identity.code}</small><h3>${escapeHtml(identity.name)}</h3></div>
      </div>
      <p><strong>${escapeHtml(fixture.club)}</strong> – <strong>${escapeHtml(fixture.opponent)}</strong></p>
      <p>${venue} · ${formatEuropeanDate(fixture)}</p>
      ${round ? `<p>${escapeHtml(round)}</p>` : ''}
      ${previous||next?`<section class="european-programme-context"><h4>Programmacontext</h4>${renderLeagueContextFixture(previous,'previous')}${renderLeagueContextFixture(next,'next')}${minimumRest<=3?`<div class="european-programme-warning"><strong>Korte rust</strong><p>Deze Europese wedstrijd ligt ${previous&&next?'tussen twee Eredivisiewedstrijden':'vlak naast een Eredivisiewedstrijd'}.</p></div>`:''}</section>`:''}
      <div class="detail-note"><p>Deze wedstrijd telt niet mee voor Fantasy-punten.</p></div>
    </aside>
  `
}

export function mountFixturesScreen() {
  testDynamicDifficultyEngine()

  const state = {
    mode: 'club',
    club: 'FC Utrecht',
    startRound: getAutomaticStartRound(),
    count: 5,
    compareClubGroup: 'manual',
    compareClubs: ['', '', '', ''],
    showEurope: true,
    selectedFixtureId: null,
    selectedEuropeFixtureId: null,
    selectedEuropeClub: '',
  }

  const content = document.querySelector('#fixture-content')
  const detail = document.querySelector('#fixture-detail')
  const mainLegend = document.querySelector('.fixture-difficulty-legend')
  const stickyLegend = document.querySelector('.fixture-sticky-legend')
  const clubSelect = document.querySelector('#fixture-club')
  const roundSelect =
  document.querySelector(
    '#fixture-round',
  )

const roundLabel =
  document.querySelector(
    '#fixture-round-label',
  )

const countControl =
  document.querySelector(
    '#fixture-count-control',
  )

const countSelect = document.querySelector('#fixture-count-select')
const compareGroupControl = document.querySelector('#compare-club-group-control')
  const compareGroupSelect = document.querySelector('#compare-club-group')
  const europeToggle = document.querySelector('#fixture-europe-toggle')
  const europeControl = europeToggle.closest('.european-fixture-toggle')

  if (window.__fantasyStudioFixtureLegendObserver) window.__fantasyStudioFixtureLegendObserver.disconnect()
  if (mainLegend && stickyLegend && 'IntersectionObserver' in window) {
    window.__fantasyStudioFixtureLegendObserver = new IntersectionObserver(([entry]) => {
      stickyLegend.classList.toggle('is-visible', !entry.isIntersecting || entry.intersectionRatio < 1)
    }, { threshold: [1] })
    window.__fantasyStudioFixtureLegendObserver.observe(mainLegend)
  } else if (stickyLegend) stickyLegend.classList.remove('is-visible')

const compareWrap =
  document.querySelector(
    '#compare-club-selectors',
  )

  const modeButtons = [
    ...document.querySelectorAll('.fixture-mode'),
  ]
  const countButtons = [
    ...document.querySelectorAll('.count-button'),
  ]
  const compareSelects = [
    ...document.querySelectorAll('.compare-club-select'),
  ]

  roundSelect.value =
  String(state.startRound)

  compareSelects.forEach((select, index) => {
    select.value = state.compareClubs[index]
  })

  function render() {
  const isClubMode =
    state.mode === 'club'

  const isRoundMode =
    state.mode === 'round'

  const isCompareMode =
    state.mode === 'compare'

  clubSelect
    .closest('label')
    .classList.toggle(
      'hidden',
      !isClubMode,
    )

  compareWrap.classList.toggle(
    'hidden',
    !isCompareMode,
  )

  compareGroupControl.classList.toggle('hidden', !isCompareMode)
  if (isCompareMode) europeControl.remove()
  else if (!europeControl.isConnected) countControl.before(europeControl)
  countSelect.classList.toggle('hidden', !isCompareMode)
  countControl.querySelector('.count-buttons').classList.toggle('hidden', isCompareMode)
  countSelect.value = String(state.count)
  compareGroupSelect.value = state.compareClubGroup
  europeToggle.checked = state.showEurope
  const europeStateLabel = document.querySelector('.european-switch-state')
  if (europeStateLabel) europeStateLabel.textContent = state.showEurope ? 'Aan' : 'Uit'

  countControl.classList.toggle(
    'hidden',
    isRoundMode,
  )

  roundLabel.textContent =
    isRoundMode
      ? 'Speelronde'
      : 'Vanaf speelronde'

  roundSelect.value =
    String(state.startRound)

  content.innerHTML =
    safeHtml(isClubMode
      ? renderClub(state)
      : isRoundMode
        ? renderRound(state)
        : renderCompare(state))

  detail.innerHTML = safeHtml(state.selectedEuropeFixtureId
    ? renderEuropeanFixtureDetailPanel(getEuropeanFixtures().find((fixture)=>fixture.europeMatchId===state.selectedEuropeFixtureId),{club:state.selectedEuropeClub||state.club,eredivisieFixtures:currentFixtures()})
    : renderFixtureDetailPanel(currentFixtures().find((fixture)=>fixture.id===state.selectedFixtureId)))

  document
    .querySelectorAll(
      '[data-fixture-id]',
    )
    .forEach((button) => {
      button.addEventListener(
        'click',
        () => {
          state.selectedFixtureId =
            button.dataset.fixtureId
          state.selectedEuropeFixtureId = null
          state.selectedEuropeClub = ''

          render()
        },
      )
    })

  document.querySelectorAll('[data-europe-context-id]').forEach((badge) => {
    const openEuropeanDetail = (event) => {
      event.preventDefault()
      event.stopPropagation()
      state.selectedEuropeFixtureId = badge.dataset.europeContextId
      state.selectedEuropeClub = badge.dataset.europeClub || ''
      state.selectedFixtureId = badge.closest('.fixture-card-shell')?.querySelector('[data-fixture-id]')?.dataset.fixtureId || null
      render()
    }
    badge.addEventListener('click', openEuropeanDetail)
    badge.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') openEuropeanDetail(event)
    })
  })

  requestAnimationFrame(positionEuropeanContextOverlays)
}

  europeToggle.addEventListener('change',()=>{state.showEurope=europeToggle.checked;state.selectedFixtureId=null;state.selectedEuropeFixtureId=null;state.selectedEuropeClub='';render()})

  if (window.__fantasyStudioEuropeOverlayResize) window.removeEventListener('resize',window.__fantasyStudioEuropeOverlayResize)
  window.__fantasyStudioEuropeOverlayResize=()=>requestAnimationFrame(positionEuropeanContextOverlays)
  window.addEventListener('resize',window.__fantasyStudioEuropeOverlayResize)

  modeButtons.forEach((button) =>
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode
      state.selectedFixtureId = null
      state.selectedEuropeFixtureId = null
      state.selectedEuropeClub = ''

      modeButtons.forEach((item) =>
        item.classList.toggle('active', item === button),
      )

      render()
    }),
  )

  clubSelect.addEventListener('change', () => {
    state.club = clubSelect.value
    state.selectedFixtureId = null
    render()
  })

  roundSelect.addEventListener('change', () => {
    state.startRound = Number(roundSelect.value)
    state.selectedFixtureId = null
    render()
  })

  countButtons.forEach((button) =>
    button.addEventListener('click', () => {
      state.count = Number(button.dataset.count)

      countButtons.forEach((item) =>
        item.classList.toggle('active', item === button),
      )

      state.selectedFixtureId = null
      render()
    }),
  )

  countSelect.addEventListener('change', () => {
    state.count = Number(countSelect.value)
    state.selectedFixtureId = null
    render()
  })

  compareGroupSelect.addEventListener('change', () => {
    state.compareClubGroup = compareGroupSelect.value
    if (state.compareClubGroup !== 'manual') {
      state.compareClubs = [...resolveCompareClubGroup(state.compareClubGroup, currentClubs()), '']
      compareSelects.forEach((select, index) => { select.value = state.compareClubs[index] ?? '' })
    }
    state.selectedFixtureId = null
    render()
  })

  compareSelects.forEach((select) =>
    select.addEventListener('change', () => {
      state.compareClubs[Number(select.dataset.index)] =
        select.value

      state.compareClubGroup = 'manual'
      compareGroupSelect.value = 'manual'

      state.selectedFixtureId = null
      render()
    }),
  )

  render()
}
