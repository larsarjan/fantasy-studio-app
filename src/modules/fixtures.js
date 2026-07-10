import { getFixtures } from '../services/database.js'

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
  Ajax: 'ajax.png',
  'ADO Den Haag': 'ado-den-haag.png',
  'ADO den Haag': 'ado-den-haag.png',
  AZ: 'az.png',
  'Cambuur Leeuwarden': 'cambuur-leeuwarden.png',
  Excelsior: 'excelsior.png',
  'FC Groningen': 'fc-groningen.png',
  'FC Twente': 'fc-twente.png',
  'FC Utrecht': 'fc-utrecht.png',
  Feyenoord: 'feyenoord.png',
  'Fortuna Sittard': 'fortuna-sittard.png',
  'Go Ahead Eagles': 'go-ahead-eagles.png',
  'N.E.C.': 'nec.png',
  NEC: 'nec.png',
  'PEC Zwolle': 'pec-zwolle.png',
  PSV: 'psv.png',
  'sc Heerenveen': 'sc-heerenveen.png',
  'SC Heerenveen': 'sc-heerenveen.png',
  'Sparta Rotterdam': 'sparta-rotterdam.png',
  Telstar: 'telstar.png',
  'Willem II': 'willem-ii.png',
}

function clubLogoUrl(club) {
  const filename = clubLogoMap[club]
  return filename ? `/club-logos/${filename}` : ''
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
      class="${className}"
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

  return {
    opponent: isHome ? fixture.away : fixture.home,
    venue: isHome ? 'T' : 'U',
    difficulty: isHome
      ? fixture.difficultyHome
      : fixture.difficultyAway,
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

function average(list, club) {
  if (!list.length) return '—'

  return (
    list.reduce(
      (sum, fixture) =>
        sum + viewForClub(fixture, club).difficulty,
      0,
    ) / list.length
  ).toFixed(2)
}

function renderClub(state) {
  const list = getClubFixtures(
    state.club,
    state.startRound,
    state.count,
  )

  return `
    <section class="fixture-summary">
      <div class="fixture-summary-club">
        ${renderClubLogo(state.club, 'summary-club-logo')}

        <div>
          <span class="eyebrow">Clubschema</span>
          <h2>${state.club}</h2>
          <p>
            Vanaf speelronde ${state.startRound}, volgende
            ${state.count} wedstrijd${state.count === 1 ? '' : 'en'}.
          </p>
        </div>
      </div>

      <div class="average-score">
        <span>Gemiddelde zwaarte</span>
        <strong>${average(list, state.club)}</strong>
      </div>
    </section>

    <div class="fixture-strip">
      ${list
        .map((fixture) => {
          const view = viewForClub(fixture, state.club)
          const meta = difficultyMeta[view.difficulty]

          return `
            <button
              class="fixture-card ${meta.className}"
              data-fixture-id="${fixture.id}"
              type="button"
            >
              <div class="fixture-card-top">
                <span>SR ${fixture.round}</span>
                <span class="venue-pill">${view.venue}</span>
              </div>

              <div class="fixture-opponent">
                ${renderClubLogo(view.opponent)}
                <strong>${view.opponent}</strong>
              </div>

              <small>${formatDate(fixture)}</small>

              <div class="difficulty-label">
                ${view.difficulty}/5 · ${meta.label}
              </div>
            </button>
          `
        })
        .join('')}
    </div>
  `
}

function renderRound(state) {
  const list = currentFixtures().filter(
    (fixture) => fixture.round === state.startRound,
  )

  return `
    <section class="fixture-summary">
      <div>
        <span class="eyebrow">Speelronde</span>
        <h2>Speelronde ${state.startRound}</h2>
        <p>Alle negen wedstrijden in één overzicht.</p>
      </div>
    </section>

    <div class="round-grid">
      ${list
        .map(
          (fixture) => `
            <button
              class="round-match"
              data-fixture-id="${fixture.id}"
              type="button"
            >
              <span class="round-date">
                ${formatDate(fixture)}
              </span>

              <div class="round-club-row">
                ${renderClubLogo(fixture.home, 'round-club-logo')}
                <strong>${fixture.home}</strong>
              </div>

              <span class="versus">tegen</span>

              <div class="round-club-row">
                ${renderClubLogo(fixture.away, 'round-club-logo')}
                <strong>${fixture.away}</strong>
              </div>

              <div class="round-difficulty-row">
                <span class="${
                  difficultyMeta[fixture.difficultyHome].className
                }">
                  T ${fixture.difficultyHome}
                </span>

                <span class="${
                  difficultyMeta[fixture.difficultyAway].className
                }">
                  U ${fixture.difficultyAway}
                </span>
              </div>
            </button>
          `,
        )
        .join('')}
    </div>
  `
}

function renderCompare(state) {
  const selected = state.compareClubs.filter(Boolean)

  return `
    <section class="fixture-summary">
      <div>
        <span class="eyebrow">Schema vergelijken</span>
        <h2>
          ${selected.length} club${selected.length === 1 ? '' : 's'}
          geselecteerd
        </h2>
        <p>
          Vanaf speelronde ${state.startRound}, volgende
          ${state.count} wedstrijden.
        </p>
      </div>
    </section>

    <div
      class="compare-fixtures-grid"
      style="--compare-columns:${Math.max(selected.length, 1)}"
    >
      ${selected
        .map((club) => {
          const list = getClubFixtures(
            club,
            state.startRound,
            state.count,
          )

          return `
            <article class="compare-club-card">
              <header>
                <div class="compare-club-heading">
                  ${renderClubLogo(club, 'compare-club-logo')}

                  <div>
                    <span class="eyebrow">Club</span>
                    <h3>${club}</h3>
                  </div>
                </div>

                <div class="mini-average">${average(list, club)}</div>
              </header>

              <div class="compare-fixture-list">
                ${list
                  .map((fixture) => {
                    const view = viewForClub(fixture, club)

                    return `
                      <button
                        class="compare-fixture-row ${
                          difficultyMeta[view.difficulty].className
                        }"
                        data-fixture-id="${fixture.id}"
                        type="button"
                      >
                        <span>SR ${fixture.round}</span>

                        <span class="compare-opponent">
                          ${renderClubLogo(
                            view.opponent,
                            'compare-opponent-logo',
                          )}
                          <strong>${view.opponent}</strong>
                        </span>

                        <span>${view.venue}</span>
                        <b>${view.difficulty}</b>
                      </button>
                    `
                  })
                  .join('')}
              </div>
            </article>
          `
        })
        .join('')}
    </div>
  `
}

function detailPanel(fixture) {
  if (!fixture) {
    return `
      <aside class="fixture-detail-panel empty">
        <span class="eyebrow">Wedstrijdinformatie</span>
        <h3>Kies een wedstrijd</h3>
        <p>Klik op een wedstrijd om hier de details te bekijken.</p>
      </aside>
    `
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

      <div class="detail-difficulty-grid">
        <div
          class="${
            difficultyMeta[fixture.difficultyHome].className
          }"
        >
          <div class="detail-difficulty-club">
            ${renderClubLogo(
              fixture.home,
              'detail-difficulty-logo',
            )}
            <span>${fixture.home}</span>
          </div>

          <strong>${fixture.difficultyHome}/5</strong>
          <small>
            ${difficultyMeta[fixture.difficultyHome].label}
          </small>
        </div>

        <div
          class="${
            difficultyMeta[fixture.difficultyAway].className
          }"
        >
          <div class="detail-difficulty-club">
            ${renderClubLogo(
              fixture.away,
              'detail-difficulty-logo',
            )}
            <span>${fixture.away}</span>
          </div>

          <strong>${fixture.difficultyAway}/5</strong>
          <small>
            ${difficultyMeta[fixture.difficultyAway].label}
          </small>
        </div>
      </div>

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
        <div>
          <span class="eyebrow">Eredivisie 2026/27</span>
          <h2>Speelschema & fixture difficulty</h2>
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

      <div class="fixture-controls">
        <label>
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

        <label>
          <span>Vanaf speelronde</span>
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

        <div class="count-control">
          <span>Volgende wedstrijden</span>

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

export function mountFixturesScreen() {
  const state = {
    mode: 'club',
    club: 'FC Utrecht',
    startRound: 1,
    count: 5,
    compareClubs: ['FC Utrecht', 'Ajax', 'PSV', 'Feyenoord'],
    selectedFixtureId: null,
  }

  const content = document.querySelector('#fixture-content')
  const detail = document.querySelector('#fixture-detail')
  const clubSelect = document.querySelector('#fixture-club')
  const roundSelect = document.querySelector('#fixture-round')
  const compareWrap = document.querySelector(
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

  compareSelects.forEach((select, index) => {
    select.value = state.compareClubs[index]
  })

  function render() {
    clubSelect
      .closest('label')
      .classList.toggle('hidden', state.mode !== 'club')

    compareWrap.classList.toggle(
      'hidden',
      state.mode !== 'compare',
    )

    content.innerHTML =
      state.mode === 'club'
        ? renderClub(state)
        : state.mode === 'round'
          ? renderRound(state)
          : renderCompare(state)

    detail.innerHTML = detailPanel(
      currentFixtures().find(
        (fixture) => fixture.id === state.selectedFixtureId,
      ),
    )

    document
      .querySelectorAll('[data-fixture-id]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          state.selectedFixtureId = button.dataset.fixtureId
          render()
        })
      })
  }

  modeButtons.forEach((button) =>
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode
      state.selectedFixtureId = null

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

  compareSelects.forEach((select) =>
    select.addEventListener('change', () => {
      state.compareClubs[Number(select.dataset.index)] =
        select.value

      state.selectedFixtureId = null
      render()
    }),
  )

  render()
}
