import { safeHtml } from '../platform/html.js'
import {
  generateMatchStatsRoundExport,
} from '../services/matchStatsRoundGenerator.js'

function createRoundOptions() {
  return Array.from(
    {
      length: 34,
    },
    (_, index) =>
      index + 1,
  )
    .map(
      (round) => `
        <option value="${round}">
          Speelronde ${round}
        </option>
      `,
    )
    .join('')
}

function renderEmptyState() {
  return `
    <div class="input-empty-state">
      <span class="eyebrow">
        Nog niets gegenereerd
      </span>

      <h3>
        Kies een speelronde
      </h3>

      <p>
        Fantasy Studio koppelt automatisch
        alle spelers aan de juiste wedstrijd.
      </p>
    </div>
  `
}

function renderErrors(
  errors,
) {
  return `
    <div class="input-message input-message-error">
      <strong>
        Genereren mislukt
      </strong>

      <ul>
        ${errors
          .map(
            (error) => `
              <li>${error}</li>
            `,
          )
          .join('')}
      </ul>
    </div>
  `
}

function renderGenerationResult(
  generation,
) {
  if (!generation.success) {
    return renderErrors(
      generation.errors,
    )
  }

  const clubsWithoutPlayers =
    generation.summary
      .clubsWithoutPlayers

  return `
    <div class="input-result-summary">
      <div class="input-summary-card">
        <span>
          Wedstrijden
        </span>

        <strong>
          ${generation.summary.fixtureCount}
        </strong>
      </div>

      <div class="input-summary-card">
        <span>
          Unieke spelers
        </span>

        <strong>
          ${generation.summary.playerCount}
        </strong>
      </div>

      <div class="input-summary-card">
        <span>
          Gegenereerde regels
        </span>

        <strong>
          ${generation.summary.rowCount}
        </strong>
      </div>
    </div>

    ${
      clubsWithoutPlayers.length
        ? `
          <div class="input-message input-message-warning">
            <strong>
              Let op
            </strong>

            <p>
              Geen spelers gevonden voor:
              ${clubsWithoutPlayers.join(', ')}.
            </p>
          </div>
        `
        : ''
    }

    <div class="input-export-card">
      <div class="input-export-heading">
        <div>
          <span class="eyebrow">
            Google Sheets-export
          </span>

          <h3>
            PLAYER_MATCH_STATS
          </h3>
        </div>

        <button
          type="button"
          id="copy-match-stats"
          class="input-primary-button"
        >
          📋 Kopieer alle regels
        </button>
      </div>

      <p>
        Plak het gekopieerde blok vanaf cel A2
        in het tabblad PLAYER_MATCH_STATS.
      </p>

      <textarea
        id="match-stats-output"
        readonly
        spellcheck="false"
      >${generation.tsv}</textarea>

      <small id="copy-match-stats-status">
        ${generation.summary.rowCount}
        regels staan klaar.
      </small>
    </div>
  `
}

export function createInputScreen() {
  return `
    <section class="panel input-module">
      <div class="input-heading">
        <span class="eyebrow">
          Wedstrijddata
        </span>

        <h2>
          PLAYER_MATCH_STATS-generator
        </h2>

        <p>
          Genereer automatisch alle spelersregels
          voor één Eredivisiespeelronde.
        </p>
      </div>

      <div class="input-controls">
        <label>
          <span>
            Seizoen
          </span>

          <select id="input-season">
            <option value="2026/2027">
              2026/2027
            </option>
          </select>
        </label>

        <label>
          <span>
            Speelronde
          </span>

          <select id="input-round">
            ${createRoundOptions()}
          </select>
        </label>

        <button
          type="button"
          id="generate-match-stats"
          class="input-primary-button"
        >
          Genereer speelronde
        </button>
      </div>

      <div
        id="input-result"
        class="input-result"
      >
        ${renderEmptyState()}
      </div>
    </section>
  `
}

export function mountInputScreen() {
  const seasonSelect =
    document.querySelector(
      '#input-season',
    )

  const roundSelect =
    document.querySelector(
      '#input-round',
    )

  const generateButton =
    document.querySelector(
      '#generate-match-stats',
    )

  const result =
    document.querySelector(
      '#input-result',
    )

  if (
    !seasonSelect ||
    !roundSelect ||
    !generateButton ||
    !result
  ) {
    return
  }

  function mountCopyButton(
    generation,
  ) {
    const copyButton =
      document.querySelector(
        '#copy-match-stats',
      )

    const output =
      document.querySelector(
        '#match-stats-output',
      )

    const status =
      document.querySelector(
        '#copy-match-stats-status',
      )

    if (
      !copyButton ||
      !output
    ) {
      return
    }

    copyButton.addEventListener(
      'click',
      async () => {
        try {
          await navigator
            .clipboard
            .writeText(
              generation.tsv,
            )
        } catch {
          output.focus()
          output.select()

          document.execCommand(
            'copy',
          )
        }

        copyButton.textContent =
          'Gekopieerd ✓'

        if (status) {
          status.textContent =
            `${generation.summary.rowCount} regels zijn gekopieerd.`
        }

        window.setTimeout(
          () => {
            copyButton.textContent =
              '📋 Kopieer alle regels'
          },
          1800,
        )
      },
    )
  }

  generateButton.addEventListener(
    'click',
    () => {
      generateButton.disabled =
        true

      generateButton.textContent =
        'Genereren…'

      const generation =
        generateMatchStatsRoundExport({
          season:
            seasonSelect.value,

          round:
            Number(
              roundSelect.value,
            ),

          includeHeaders:
            false,
        })

      result.innerHTML =
        safeHtml(renderGenerationResult(
          generation,
        ))

      if (generation.success) {
        mountCopyButton(
          generation,
        )
      }

      generateButton.disabled =
        false

      generateButton.textContent =
        'Genereer speelronde'
    },
  )
}