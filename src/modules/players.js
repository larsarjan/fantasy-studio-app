import { safeHtml } from '../platform/html.js'
import {
  getEnrichedPlayers,
  getFixtures,
  getEuropeanFixtures,
  getPlayerHistory,
  getPlayerProfiles,
  getAllPlayerProfiles,
  getPreviousSeasonStats,
  getResults,
  getTeamRatings,
  getElitePlayerStats,
  getEliteTransfers,
  getChipUsage,
} from '../services/database.js'

import { combineEuropeanSchedule, findEuropeanFixtureContext, renderEuropeanContextBadges, renderEuropeanFixtureCard } from '../services/europeanFixtureContext.js'

import { createElitePlayerLookup, ELITE_COHORTS, formatEliteMetric, isEliteCohortControlVisible, selectEliteView } from '../services/eliteManagerIntelligence.js'

import {
  calculatePlayerMatchProfile,
} from '../services/playerMatchStatsEngine.js'

import {
  getPlayerImage,
} from '../services/playerImages.js'

import {
  calculateFantasyOutlook,
} from '../services/fantasyOutlookEngine.js'

import {
  calculateFantasyScoutReport,
} from '../services/fantasyScoutEngine.js'

import {
  createFixtureModifier,
} from '../services/fixtureIntelligenceEngine.js'

import {
  createFantasyDNA,
} from '../services/modifierEngine.js'

import {
  calculatePlayerFantasyDNA,
} from '../services/fantasyDNABuilder.js'

import {
  calculateFvtScore,
} from '../services/fvtScoreEngine.js'

import {
  buildFvtInsights,
} from '../services/fvtInsightsEngine.js'

import {
  calculateFixtureDifficulty,
} from '../services/difficultyEngine.js'

import {
  renderFixtureDetailPanel,
} from './fixtures.js'

import {
  runOptimizerSandboxOnce,
} from '../services/optimizer/optimizerSandbox.js'

let expectedProjectionRounds = 5

const sortOptions = [
  ['points', 'Totaal punten'],
  ['pointsPerMillion', 'Punten per miljoen'],
  ['priceChange', 'Prijsverschil'],
['priceChangePercentage', 'Prijsontwikkeling %'],
  ['matches', 'Wedstrijden'],
  ['starts', 'Basisplaatsen'],
  ['substituteAppearances', 'Invalbeurten'],
  ['minutes', 'Minuten'],
  ['pointsPerMatch', 'Punten per wedstrijd'],
  ['pointsPer90', 'Punten per 90'],
  ['startPercentage', 'Basispercentage'],
  ['selectedPct', 'Gespeeld door %'],
  ['endPrice', 'Huidigeprijs'],
  ['startPrice', 'Beginprijs'],
  ['saves', 'Reddingen'],
  ['savePoints', 'Punten uit reddingen'],
  ['savesPerMatch', 'Reddingen per wedstrijd'],
  ['savesPer90', 'Reddingen per 90'],
  ['penaltiesSaved', 'Gestopte penalties'],
  ['cleanSheets', 'Clean sheets'],
  ['cleanSheetsPerMatch', 'Clean-sheetpercentage',],
  ['optaBonus', 'OPTA Bonus'],
  ['goals', 'Doelpunten'],
  ['assists', 'Assists'],
  ['goalContributions', 'Doelpuntbijdragen'],
['goalsPer90', 'Doelpunten per 90'],
['assistsPer90', 'Assists per 90'],
['totalCards', 'Totaal kaarten'],
['cardsPerMatch', 'Kaarten per wedstrijd'],
['cardsPer90', 'Kaarten per 90'],
['ownGoals', 'Eigen doelpunten'],
['penaltiesMissed', 'Gemiste penalties'],
['totalPenaltyPoints', 'Disciplinepunten'],
['expectedPoints','Expected Points',],
['expectedPointsPerRound','Expected Points per speelronde',],
['expectedMinutes','Verwachte minuten',],
['fvtFantasyScore','FVT Fantasy Score',],
['captainScore','Captain',],
['differentialScore','Differential'],
['budgetScore','Budgetoptie',],
['bonusScore','Bonuskanon',],
['longTermScore','Lange termijn',],
['transferScore','Transferprioriteit',],
['eliteSelectedPct','Top 100 gekozen %'],
['eliteStarterPct','Top 100 basis %'],
['eliteCaptainPct','Top 100 captain %'],
['eliteGapPct','Top 100 verschil met markt'],
]

const tableColumns = [
  { key: 'rank', label: '#', className: 'col-rank' },
  { key: 'name', label: 'Naam', className: 'col-name' },
  { key: 'club', label: 'Club', className: 'col-club' },
  { key: 'position', label: 'Positie' },
  { key: 'points', label: 'Punten' },
  {
key: 'pointsPerMillion',
  label: 'P/M',
   tooltip:
    'Punten per miljoen. Laat zien hoeveel fantasypunten een speler oplevert per miljoen van zijn actuele prijs.',
},
{
  key: 'priceChange',
  label: 'Δ €',
  tooltip:
    'Prijsverschil. Het verschil tussen de beginprijs en de actuele eindprijs, uitgedrukt in miljoenen.',
},

{
  key: 'priceChangePercentage',
  label: 'Δ %',
   tooltip:
    'Procentuele prijsontwikkeling. Laat zien hoeveel procent de spelersprijs is gestegen of gedaald sinds het begin van het seizoen.',
},
    {
    key: 'matches',
    label: 'Wed',
  },

  {
    key: 'starts',
    label: 'Basis',
  },

  {
  key: 'substituteAppearances',
  label: 'Inval',
},

  {
    key: 'minutes',
    label: 'Min',
  },

  {
    key: 'pointsPerMatch',
    label: 'P/W',
    tooltip:
    'Punten per wedstrijd. Het gemiddelde aantal fantasypunten per gespeelde wedstrijd.',
  },

  {
    key: 'pointsPer90',
    label: 'P/90',
    tooltip:
    'Punten per 90 minuten. Maakt spelers met verschillende hoeveelheden speeltijd beter vergelijkbaar.',
  },

  {
    key: 'startPercentage',
    label: 'Basis %',
  },
  { key: 'selectedPct', label: 'Gespeeld %' },
  { key: 'startPrice', label: 'Beginprijs' },
  { key: 'endPrice', label: 'Huidige prijs' },

  {
    key: 'saves',
    label: 'Reddingen',
    visibleFor: ['Doelman'],
  },

  {
  key: 'savePoints',
  label: 'Redding pt',
  visibleFor: ['Doelman'],
  tooltip:
    'Fantasy-punten die de doelman heeft verdiend met reddingen.',
},

  {
    key: 'cleanSheets',
    label: 'Clean sheets',
    visibleFor: [
      'Doelman',
      'Verdediger',
      'Middenvelder',
    ],
  },

{
  key: 'cleanSheetsPerMatch',
  label: 'CS%',
  tooltip:
    'Clean-sheetpercentage. Het percentage gespeelde wedstrijden waarin de speler een clean sheet behaalde.',

  visibleFor: [
    'Doelman',
    'Verdediger',
    'Middenvelder',
  ],
},

{
  key: 'savesPerMatch',
  label: 'Redd/W',
  visibleFor: ['Doelman'],
  tooltip:
    'Reddingen per wedstrijd. Het gemiddelde aantal reddingen per gespeeld duel.',
},

{
  key: 'savesPer90',
  label: 'Redd/90',
  visibleFor: ['Doelman'],
  tooltip:
    'Reddingen per 90 minuten. Maakt keepers met verschillende speeltijd beter vergelijkbaar.',
},

  {
    key: 'optaBonus',
    label: 'OPTA Bonus',
  },

  {
    key: 'penaltiesSaved',
    label: 'Gestopte penalties',
    visibleFor: ['Doelman'],
  },

  {
    key: 'goals',
    label: 'Doelpunten',
  },

  {
    key: 'assists',
    label: 'Assists',
  },

  {
  key: 'goalContributions',
  label: 'G+A',
  tooltip:
    'Doelpuntbijdragen. Het totaal van doelpunten en assists.',
},

{
  key: 'goalsPer90',
  label: 'G/90',
  tooltip:
    'Doelpunten per 90 minuten.',
},

{
  key: 'assistsPer90',
  label: 'A/90',
  tooltip:
    'Assists per 90 minuten.',
},

{
  key: 'xG',
  label: 'xG',
  tooltip:
    'Expected Goals. Het verwachte aantal doelpunten op basis van de kwaliteit van de kansen.',
},

{
  key: 'xA',
  label: 'xA',
  tooltip:
    'Expected Assists. Het verwachte aantal assists op basis van de gecreëerde kansen.',
},

{
  key: 'cornersTaken',
  label: 'Corners',
  tooltip:
    'Totaal aantal genomen corners.',
},

  {
    key: 'yellowCards',
    label: 'Gele kaarten',
  },

  {
    key: 'redCards',
    label: 'Rode kaarten',
  },

  {
  key: 'totalCards',
  label: 'Kaarten',
},

{
  key: 'cardsPerMatch',
  label: 'K/W',
  tooltip:
    'Kaarten per wedstrijd. Het gemiddelde totale aantal gele en rode kaarten per gespeeld duel.',
},

{
  key: 'cardsPer90',
  label: 'K/90',
  tooltip:
    'Kaarten per 90 minuten.',
},

{
  key: 'ownGoals',
  label: 'Eigen goals',
},

{
  key: 'penaltiesMissed',
  label: 'Penalty gemist',
},

{
  key: 'totalPenaltyPoints',
  label: 'Minpunten',
  tooltip:
    'Totale minpunten door gele kaarten, rode kaarten, gemiste penalties en eigen doelpunten.',
},

{
  key:
    'expectedPoints',

  label:
    'xP',

  tooltip:
    'Verwachte Fantasy-punten over de geselecteerde speelrondes.',

  sortable:
    true,

  align:
    'center',

  value:
    (
      player,
    ) =>
      player.expectedPoints ??
      '—',
},

{
  key:
    'expectedPointsPerRound',

  label:
    'xP/SR',

  tooltip:
    'Gemiddeld aantal verwachte Fantasy-punten per speelronde.',

  sortable:
    true,

  align:
    'center',

  value:
    (
      player,
    ) =>
      player.expectedPointsPerRound ??
      '—',
},

{
  key:
    'expectedMinutes',

  label:
    'xMin',

  tooltip:
    'Totaal aantal verwachte speelminuten over de geselecteerde speelrondes.',

  sortable:
    true,

  align:
    'center',

  value:
    (
      player,
    ) =>
      player.expectedMinutes ??
      '—',
},

{
  key: 'fvtFantasyScore',
  label: 'FVT',
  tooltip: 'FVT Fantasy Score',
  sortable: true,
  align: 'center',
  value: (player) =>
    player.fvtFantasyScore ?? '—',
},

{
  key: 'captainScore',
  label: 'CAP',
  tooltip: 'Captain',
  sortable: true,
  align: 'center',
  value: (player) =>
    player.captainScore ?? '—',
},

{
  key: 'differentialScore',
  label: 'DIF',
  tooltip: 'Differential',
  sortable: true,
  align: 'center',
  value: (player) =>
    player.differentialScore ?? '—',
},

{
  key: 'budgetScore',
  label: 'BUD',
  tooltip: 'Budget',
  sortable: true,
  align: 'center',
  value: (player) =>
    player.budgetScore ?? '—',
},

{
  key: 'bonusScore',
  label: 'BON',
  tooltip: 'Bonus',
  sortable: true,
  align: 'center',
  value: (player) =>
    player.bonusScore ?? '—',
},

{
  key: 'longTermScore',
  label: 'LT',
  tooltip: 'Lange termijn',
  sortable: true,
  align: 'center',
  value: (player) =>
    player.longTermScore ?? '—',
},

{
  key: 'transferScore',
  label: 'TR',
  tooltip: 'Transfer',
  sortable: true,
  align: 'center',
  value: (player) =>
    player.transferScore ?? '—',
},
{ key: 'eliteSelectedPct', label: 'Top 100 gekozen', tooltip: 'Aantal en percentage geldige Top 100-teams met deze speler.', sortable: true },
{ key: 'eliteStarterPct', label: 'Top 100 basis', tooltip: 'Aantal en percentage geldige Top 100-teams met deze speler in de basis.', sortable: true },
{ key: 'eliteCaptainPct', label: 'Top 100 captain', tooltip: 'Gelockte captainkeuzes bij de laatste publiek beschikbare deadline.', sortable: true },
{ key: 'eliteGapPct', label: 'Elite verschil', tooltip: 'Verschil in procentpunten tussen Top 100 en de algemene markt.', sortable: true },
]

const playerColumnGroups = {
  general: {
    label: 'Algemeen',
    icon: '📊',

    columns: [
      'club',
      'position',
      'matches',
      'starts',
      'substituteAppearances',
      'minutes',
      'startPercentage',
      'selectedPct',
      'startPrice',
      'endPrice',
    ],

    defaultSort:
      'minutes',
  },

  fantasy: {
    label: 'Fantasy',
    icon: '⭐',

    columns: [
      'points',
      'pointsPerMillion',
      'pointsPerMatch',
      'pointsPer90',
      'priceChange',
      'priceChangePercentage',
      'optaBonus',
    ],

    defaultSort:
      'points',
  },

expectation: {
  label:
    'Verwachting',

  icon:
    '🎯',

  columns: [
    'expectedPoints',
    'expectedPointsPerRound',
    'expectedMinutes',
  ],

  defaultSort:
    'expectedPoints',
},

elite: {
  label: 'Topmanagers',
  icon: '🏆',
  columns: ['eliteSelectedPct', 'eliteStarterPct', 'eliteCaptainPct', 'eliteGapPct'],
  defaultSort: 'eliteSelectedPct',
},

profile: {
  label: 'Fantasy Profiel',
  icon: '💎',

  columns: [
    'fvtFantasyScore',
    'captainScore',
    'differentialScore',
    'budgetScore',
    'bonusScore',
    'longTermScore',
    'transferScore',
  ],

  defaultSort:
    'fvtFantasyScore',
},

  attack: {
    label: 'Aanvallend',
    icon: '⚽',

    columns: [
  'goals',
  'assists',
  'goalContributions',
  'goalsPer90',
  'assistsPer90',
  'xG',
  'xA',
  'cornersTaken',
],

    defaultSort:
      'goalContributions',
  },

  defending: {
    label: 'Verdedigend',
    icon: '🛡️',

    columns: [
  'saves',
  'savePoints',
  'savesPerMatch',
  'savesPer90',
  'penaltiesSaved',
  'cleanSheets',
  'cleanSheetsPerMatch',
  'goalsConceded',
],

    defaultSort:
      'cleanSheets',
  },

  discipline: {
    label: 'Discipline',
    icon: '🟨',

    columns: [
      'yellowCards',
      'redCards',
      'totalCards',
      'cardsPerMatch',
      'cardsPer90',
      'ownGoals',
      'penaltiesMissed',
      'totalPenaltyPoints',
    ],

    defaultSort:
      'yellowCards',
  },
}

const fixedPlayerColumnKeys = [
  'rank',
  'name',
]

function formatTableValue(
  player,
  key,
  index,
) {
  const projection =
    getProjectionForRounds(
      player,
    )

  switch (key) {
    case 'rank':
      return index + 1

    case 'name':
      return renderPlayerTableIdentity(
        player,
      )

    case 'club':
      return player.club

    case 'position':
      return `
        <span class="position-badge">
          ${player.position}
        </span>
      `

    case 'expectedPoints':
      return formatDecimal(
        projection.expectedPoints,
      )

    case 'expectedPointsPerRound':
      return formatDecimal(
        projection
          .expectedPointsPerRound,
      )

    case 'expectedMinutes':
      return formatNumber(
        projection.expectedMinutes,
      )

    case 'pointsPerMillion':
case 'pointsPerMatch':
case 'pointsPer90':
case 'goalsPer90':
case 'assistsPer90':
case 'savesPerMatch':
case 'savesPer90':
case 'cardsPerMatch':
case 'cardsPer90':
  return formatDecimal(
    player[key],
  )

    case 'cleanSheetsPerMatch':
      return `${formatDecimal(
        Number(
          player
            .cleanSheetsPerMatch,
        ) * 100,
      )}%`

    case 'startPercentage':
      return `${formatNumber(
        player.startPercentage ??
          0,
      )}%`

    case 'priceChange': {
      const value =
        Number(
          player.priceChange,
        ) || 0

      const sign =
        value > 0
          ? '+'
          : ''

      return `${sign}${formatDecimal(
        value,
      )}`
    }

    case 'priceChangePercentage': {
      const value =
        Number(
          player
            .priceChangePercentage,
        ) || 0

      const sign =
        value > 0
          ? '+'
          : ''

      return `${sign}${formatDecimal(
        value,
      )}%`
    }

    case 'selectedPct':
      return formatPct(
        player.selectedPct,
      )

    case 'eliteSelectedPct':
    case 'eliteStarterPct':
    case 'eliteCaptainPct': {
      const prefix = key.replace('Pct', '')
      const percentage = player[key]
      const count = player[`${prefix}Count`]
      const valid = player.eliteValidTeams
      return percentage === null || percentage === undefined ? '—' : `${count} / ${valid} · ${formatDecimal(percentage)}%`
    }

    case 'eliteGapPct':
      return player.eliteGapPct === null || player.eliteGapPct === undefined ? '—' : `${player.eliteGapPct > 0 ? '+' : ''}${formatDecimal(player.eliteGapPct)} pp`

    case 'startPrice':
      return formatPrice(
        player.startPrice,
      )

    case 'endPrice':
      return formatPrice(
        player.endPrice,
      )

    default:
      return formatNumber(
        player[key],
      )
  }
}

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

function formatDecimal(
  value,
  fallback = '—',
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback
  }

  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return new Intl.NumberFormat(
    'nl-NL',
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ).format(number)
}

function formatCalculationValue(
  value,
  fallback = '—',
) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return new Intl.NumberFormat(
    'nl-NL',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(number)
}

function getProjectionForRounds(
  player,
  roundCount =
    expectedProjectionRounds,
) {
  const projection =
    player
      ?.expectedPointsProjection

  const rounds =
    Array.isArray(
      projection?.rounds,
    )
      ? projection.rounds
      : []

  const safeRoundCount =
    Math.max(
      1,
      Math.min(
        10,
        Number(
          roundCount,
        ) || 5,
      ),
    )

  /*
   * De projectie bevat de komende
   * speelrondes al in de juiste volgorde.
   */
  const selectedRounds =
    rounds.slice(
      0,
      safeRoundCount,
    )

  /*
   * Oude opgeslagen spelers zonder
   * rounds-array blijven voorlopig
   * werken via de bestaande velden.
   */
  if (!selectedRounds.length) {
    return {
      expectedPoints:
        Number(
          player
            ?.expectedPoints,
        ) || 0,

      expectedPointsPerRound:
        Number(
          player
            ?.expectedPointsPerRound,
        ) || 0,

      expectedMinutes:
        Number(
          player
            ?.expectedMinutes,
        ) || 0,

      roundCount:
        safeRoundCount,
    }
  }

  const expectedPoints =
    selectedRounds.reduce(
      (
        total,
        round,
      ) =>
        total +
        (
          Number(
            round
              ?.expectedPoints,
          ) || 0
        ),
      0,
    )

  const expectedMinutes =
    selectedRounds.reduce(
      (
        total,
        round,
      ) =>
        total +
        (
          Number(
            round
              ?.expectedMinutes,
          ) || 0
        ),
      0,
    )

  return {
    expectedPoints,

    expectedPointsPerRound:
      expectedPoints /
      safeRoundCount,

    expectedMinutes,

    roundCount:
      safeRoundCount,
  }
}

function renderScoutStars(stars) {
  const filledStars =
    Math.max(
      0,
      Math.min(
        5,
        Number(stars) || 0,
      ),
    )

  return Array.from(
    { length: 5 },
    (_, index) =>
      index < filledStars
        ? '★'
        : '☆',
  ).join('')
}

function renderPlayerPhoto(player) {
  const playerImage =
    getPlayerImage(
      `${player.id}.webp`,
    )

  if (playerImage) {
    return `
      <div class="player-detail-photo has-image">
        <img
          src="${playerImage}"
          alt="${player.name}"
          loading="lazy"
        />
      </div>
    `
  }

  return `
    <div class="player-detail-photo has-placeholder">
      <div
        class="player-detail-photo-studio"
        role="img"
        aria-label="Geen spelersfoto beschikbaar"
      >
        <span
          class="player-detail-photo-light"
          aria-hidden="true"
        ></span>

        <span
          class="player-detail-photo-floor"
          aria-hidden="true"
        ></span>

        <span
          class="player-detail-photo-logo"
          aria-hidden="true"
        >
          <strong>FVT</strong>
          <small>STUDIO</small>
        </span>
      </div>
    </div>
  `
}

function renderPlayerTableIdentity(
  player,
) {
  const playerImage =
    getPlayerImage(
      `${player.id}.webp`,
    )

  const initial =
    String(
      player.name ?? '?',
    )
      .trim()
      .charAt(0)
      .toUpperCase()

  return `
    <div class="player-table-identity">
      <div
        class="
          player-table-avatar
          ${
            playerImage
              ? 'has-image'
              : 'has-placeholder'
          }
        "
      >
        ${
          playerImage
            ? `
              <img
                src="${playerImage}"
                alt=""
                loading="lazy"
              />
            `
            : `
              <span aria-hidden="true">
                ${initial}
              </span>
            `
        }

        <span
          class="player-table-avatar-status"
          aria-hidden="true"
        ></span>
      </div>

      <div class="player-table-identity-copy">
        <strong class="player-table-name">
          ${player.name}
        </strong>

        <div class="player-table-meta">
          <span class="player-table-club">
            ${player.club}
          </span>

          <span
            class="player-table-position"
          >
            ${player.position}
          </span>
        </div>
      </div>
    </div>
  `
}

function renderPlayerDetailPlaceholder({
  eyebrow,
  title,
  description,
}) {
  return `
    <div class="player-detail-placeholder">
      <span class="eyebrow">
        ${eyebrow}
      </span>

      <h3>${title}</h3>

      <p>${description}</p>

      <span class="player-detail-placeholder-badge">
        Binnenkort
      </span>
    </div>
  `
}

/*
|--------------------------------------------------------------------------
| Spelerprofiel — persoonlijk speelschema
|--------------------------------------------------------------------------
|
| Dit onderdeel gebruikt dezelfde database,
| difficulty-engine, kleuren en CSS-klassen
| als het grote Speelschema.
|
*/

const playerFixtureClubLogoMap = {
  ajax: 'ajax.png',
  'ado den haag': 'ado-den-haag.png',
  az: 'az.png',
  'cambuur leeuwarden':
    'cambuur-leeuwarden.png',
  cambuur:
    'cambuur-leeuwarden.png',
  excelsior: 'excelsior.png',
  'fc groningen':
    'fc-groningen.png',
  'fc twente':
    'fc-twente.png',
  'fc utrecht':
    'fc-utrecht.png',
  feyenoord:
    'feyenoord.png',
  'fortuna sittard':
    'fortuna-sittard.png',
  'go ahead eagles':
    'go-ahead-eagles.png',
  nec: 'nec.png',
  'n.e.c.': 'nec.png',
  'pec zwolle':
    'pec-zwolle.png',
  psv: 'psv.png',
  'sc heerenveen':
    'sc-heerenveen.png',
  heerenveen:
    'sc-heerenveen.png',
  'sparta rotterdam':
    'sparta-rotterdam.png',
  telstar:
    'telstar.png',
  'willem ii':
    'willem-ii.png',
}

function normalizePlayerFixtureClub(
  club,
) {
  return String(
    club || '',
  )
    .trim()
    .toLocaleLowerCase(
      'nl-NL',
    )
    .replace(
      /\s+/g,
      ' ',
    )
}

function getPlayerFixtureLogoUrl(
  club,
) {
  const filename =
    playerFixtureClubLogoMap[
      normalizePlayerFixtureClub(
        club,
      )
    ]

  return filename
    ? `./club-logos/${filename}`
    : ''
}

function getPlayerFixtureLogoSlug(
  club,
) {
  const filename =
    playerFixtureClubLogoMap[
      normalizePlayerFixtureClub(
        club,
      )
    ]

  return filename
    ? filename.replace(
        /\.png$/i,
        '',
      )
    : 'onbekend'
}

function renderPlayerFixtureClubLogo(
  club,
  className = 'club-logo',
) {
  const url =
    getPlayerFixtureLogoUrl(
      club,
    )

  const initial =
    String(
      club || '?',
    )
      .trim()
      .charAt(0)
      .toUpperCase()

  if (!url) {
    return `
      <span
        class="
          ${className}
          club-logo-fallback
        "
        aria-hidden="true"
      >
        ${initial}
      </span>
    `
  }

  return `
    <img
      class="
        ${className}
        club-logo--${getPlayerFixtureLogoSlug(
          club,
        )}
      "
      src="${url}"
      alt="${club}"
      loading="lazy"
      onerror="
        this.replaceWith(
          Object.assign(
            document.createElement('span'),
            {
              className:
                '${className} club-logo-fallback',

              textContent:
                '${initial}'
            },
          ),
        )
      "
    />
  `
}

function formatPlayerFixtureDate(
  fixture,
) {
  if (fixture?.date) {
    const [
      year,
      month,
      day,
    ] =
      String(
        fixture.date,
      ).split('-')

    return `${day}-${month}-${year}${
      fixture.time
        ? ` · ${fixture.time}`
        : ''
    }`
  }

  return (
    fixture?.dateLabel ||
    `Speelronde ${
      fixture?.round ?? '—'
    }`
  )
}

function playerFixtureMatchesResult(
  fixture,
  result,
) {
  return (
    String(
      fixture?.season || '',
    ) ===
      String(
        result?.season || '',
      ) &&

    normalizePlayerFixtureClub(
      fixture?.home,
    ) ===
      normalizePlayerFixtureClub(
        result?.home,
      ) &&

    normalizePlayerFixtureClub(
      fixture?.away,
    ) ===
      normalizePlayerFixtureClub(
        result?.away,
      )
  )
}

function isPlayerFixturePlayed(
  fixture,
) {
  return getResults().some(
    (result) =>
      playerFixtureMatchesResult(
        fixture,
        result,
      ),
  )
}

function getPlayerFixtureStartRound() {
  const fixtures =
    getFixtures()

  if (!fixtures.length) {
    return 1
  }

  const rounds = [
    ...new Set(
      fixtures
        .map(
          (fixture) =>
            Number(
              fixture.round,
            ),
        )
        .filter(
          (round) =>
            Number.isFinite(
              round,
            ) &&
            round >= 1,
        ),
    ),
  ].sort(
    (
      left,
      right,
    ) =>
      left - right,
  )

  for (
    const round of rounds
  ) {
    const roundFixtures =
      fixtures.filter(
        (fixture) =>
          Number(
            fixture.round,
          ) === round,
      )

    const playedFixtures =
      roundFixtures.filter(
        isPlayerFixturePlayed,
      )

    /*
     * De eerste nog niet volledig
     * afgeronde speelronde wordt
     * automatisch geopend.
     */
    if (
      playedFixtures.length <
      roundFixtures.length
    ) {
      return round
    }
  }

  return (
    rounds.at(-1) ||
    1
  )
}

function getPlayerUpcomingFixtures({
  club,
  startRound,
  count,
}) {
  return getFixtures()
    .filter(
      (fixture) =>
        Number(
          fixture.round,
        ) >=
          Number(
            startRound,
          ) &&

        (
          normalizePlayerFixtureClub(
            fixture.home,
          ) ===
            normalizePlayerFixtureClub(
              club,
            ) ||

          normalizePlayerFixtureClub(
            fixture.away,
          ) ===
            normalizePlayerFixtureClub(
              club,
            )
        ),
    )
    .sort(
      (
        left,
        right,
      ) => {
        const roundDifference =
          Number(
            left.round,
          ) -
          Number(
            right.round,
          )

        if (
          roundDifference !== 0
        ) {
          return roundDifference
        }

        const dateDifference =
          String(
            left.date || '',
          ).localeCompare(
            String(
              right.date || '',
            ),
          )

        if (
          dateDifference !== 0
        ) {
          return dateDifference
        }

        return String(
          left.time || '',
        ).localeCompare(
          String(
            right.time || '',
          ),
        )
      },
    )
    .slice(
      0,
      Number(
        count,
      ) || 5,
    )
}

function getPlayerFixtureView(
  fixture,
  club,
) {
  const isHome =
    normalizePlayerFixtureClub(
      fixture.home,
    ) ===
    normalizePlayerFixtureClub(
      club,
    )

  const calculation =
    calculateFixtureDifficulty({
      fixture,

      results:
        getResults(),

      teamRatings:
        getTeamRatings(),
    })

  const dynamicView =
    isHome
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
      Number(
        dynamicView
          ?.difficulty ??
        (
          isHome
            ? fixture
                .difficultyHome
            : fixture
                .difficultyAway
        ) ??
        3,
      ),

    label:
      dynamicView?.label ??
      'Gemiddeld',

    color:
      dynamicView?.color ??
      '#ffdb0a',

    confidence:
      Number(
        dynamicView
          ?.confidence,
      ) || 0,
  }
}

function calculatePlayerFixtureAverage(
  fixtures,
  club,
) {
  if (
    !fixtures.length
  ) {
    return '—'
  }

  const total =
    fixtures.reduce(
      (
        sum,
        fixture,
      ) =>
        sum +
        getPlayerFixtureView(
          fixture,
          club,
        ).difficulty,
      0,
    )

  return (
    total /
    fixtures.length
  ).toFixed(2)
}

function renderPlayerFixtureCard(
  fixture,
  club,
) {
  const view =
    getPlayerFixtureView(
      fixture,
      club,
    )

  return `
    <button
  type="button"
      class="
        fixture-card
        player-fixture-card
      "
      data-player-schedule-fixture-id="${fixture.id}"
      style="
        --difficulty-color:
          ${view.color};

        border-color:
          ${view.color};
      "
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
        ${renderPlayerFixtureClubLogo(
          view.opponent,
        )}

        <strong>
          ${view.opponent}
        </strong>
      </div>

      <small>
        ${formatPlayerFixtureDate(
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
          ${view.difficulty.toFixed(1)}/5
          ·
          ${view.label}
        </span>
      </div>

      <div class="player-fixture-confidence">
        <span>
          Betrouwbaarheid
        </span>

        <strong>
          ${Math.round(
            view.confidence,
          )}%
        </strong>
      </div>
      ${renderEuropeanContextBadges(findEuropeanFixtureContext(fixture,club,getEuropeanFixtures()))}
    </button>
  `
}

function renderPlayerSchedule(
  player,
  {
    startRound = 1,
    count = 5,
    selectedFixtureId = null,
  } = {},
) {
  const fixtures =
    getPlayerUpcomingFixtures({
      club:
        player.club,

      startRound,

      count,
    })

    const selectedFixture =
  selectedFixtureId
    ? getFixtures().find(
        (fixture) =>
          String(
            fixture.id,
          ) ===
          String(
            selectedFixtureId,
          ),
      )
    : null

  const average =
    calculatePlayerFixtureAverage(
      fixtures,
      player.club,
    )

  return `
    <div class="player-schedule">
      <section class="player-schedule-heading">
        <div>
          <span class="eyebrow">
            Persoonlijk speelschema
          </span>

          <h3>
            ${player.club}
          </h3>

          <p>
            Vanaf speelronde
            ${startRound}.
          </p>
        </div>

        <div class="player-schedule-average">
          <span>
            Schemawaarde
          </span>

          <strong>
            ${average}
          </strong>
        </div>
      </section>

      <section class="player-schedule-controls">
        <div>
          <span>
            Aankomende wedstrijden
          </span>

          <div class="player-schedule-count-buttons">
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
                      player-schedule-count
                      ${
                        value ===
                        Number(
                          count,
                        )
                          ? 'active'
                          : ''
                      }
                    "
                    data-player-fixture-count="${value}"
                  >
                    ${value}
                  </button>
                `
              },
            ).join('')}
          </div>
          ${
  selectedFixture
    ? `
      <section
        class="
          player-schedule-detail
        "
      >
        <div
          class="
            player-schedule-detail-heading
          "
        >
          <div>
            <span class="eyebrow">
              Wedstrijddetails
            </span>

            <h3>
              Volledige wedstrijdanalyse
            </h3>
          </div>

          <button
            type="button"
            class="
              player-schedule-detail-close
            "
            data-player-schedule-close
            aria-label="
              Sluit wedstrijddetails
            "
          >
            ×
          </button>
        </div>

        ${renderFixtureDetailPanel(
          selectedFixture,
        )}
      </section>
    `
    : ''
}
        </div>
      </section>

      ${
        fixtures.length
          ? `
            <div
              class="
                fixture-strip
                player-fixture-strip
              "
            >
              ${combineEuropeanSchedule(fixtures,getEuropeanFixtures(),player.club)
                .map(
                  (item) => item.kind==='europe'
                    ? renderEuropeanFixtureCard(item.fixture,{compact:true})
                    : renderPlayerFixtureCard(item.fixture,player.club),
                )
                .join('')}
            </div>
          `
          : `
            <div class="player-schedule-empty">
              <strong>
                Geen aankomende wedstrijden
              </strong>

              <p>
                Voor ${player.club} zijn vanaf
                speelronde ${startRound} geen
                wedstrijden gevonden.
              </p>
            </div>
          `
      }
    </div>
  `
}

function getPlayerSeasonKey(player) {
  return `${player.season}::${player.id}`
}

function enrichPlayerWithMatchStats(
  player,
) {
  const matchProfile =
    calculatePlayerMatchProfile(
      player,
      {
        season: player.season,
      },
    )

  const hasMatchStats =
    Array.isArray(
      matchProfile?.wedstrijden,
    ) &&
    matchProfile.wedstrijden.length > 0

  return {
    ...player,

    savePoints:
      hasMatchStats
        ? Number(
            matchProfile
              ?.punten
              ?.reddingen,
          ) || 0
        : Number(
            player.savePoints,
          ) || 0,
  }
}

/*
|--------------------------------------------------------------------------
| Spelerslijst — FVT- en Fantasy Profiel-scores
|--------------------------------------------------------------------------
|
| Deze analyse wordt één keer opgebouwd wanneer het spelersscherm opent.
| Daardoor kunnen we sorteren en kolommen tonen zonder bij iedere render
| alle engines opnieuw uit te voeren.
|
*/

function enrichPlayerWithFantasyScores(
  player,
  referencePlayers,
) {
  const fixtureModifier =
    createFixtureModifier({
      player,
      startRound: 1,
      roundCount: 5,
    })

  const outlook =
    calculateFantasyOutlook(
      player,
      {
        fixtureScore:
          fixtureModifier.score,
      },
    )

  const fvtResult =
    calculateFvtScore(
      player,
      {
        outlook,
      },
    )

  const fantasyDNA =
    calculatePlayerFantasyDNA(
      player,
      {
        baseScore:
          outlook.calculation
            ?.baseScore ??
          outlook.score,

        startRound: 1,
        roundCount: 5,

        outlook,

        fvtScore:
          fvtResult,

        referencePlayers,
      },
    )

  const fantasyProfile =
    fantasyDNA.fantasyProfile ?? {}

  return {
    fvtFantasyScore:
      Number(
        fvtResult.score,
      ) || 0,

    captainScore:
      Number(
        fantasyProfile
          .captain
          ?.score,
      ) || 0,

    differentialScore:
      Number(
        fantasyProfile
          .differential
          ?.score,
      ) || 0,

    budgetScore:
      Number(
        fantasyProfile
          .budget
          ?.score,
      ) || 0,

    bonusScore:
      Number(
        fantasyProfile
          .bonus
          ?.score,
      ) || 0,

    longTermScore:
      Number(
        fantasyProfile
          .longTerm
          ?.score,
      ) || 0,

    transferScore:
      Number(
        fantasyProfile
          .transfer
          ?.score,
      ) || 0,
  }
}

function getFantasyScorePresentation(
  score,
) {
    const rawScore =
    Number(
      score,
    ) || 0

  const normalizedScore =
    Math.max(
      0,
      Math.min(
        100,
        rawScore <= 10
          ? rawScore * 10
          : rawScore,
      ),
    )

  if (normalizedScore >= 95) {
    return {
      score: normalizedScore,
      label: 'Must Have',
      icon: '👑',
      level: 'must-have',
    }
  }

  if (normalizedScore >= 90) {
    return {
      score: normalizedScore,
      label: 'Elite Fantasy Pick',
      icon: '⭐',
      level: 'elite',
    }
  }

  if (normalizedScore >= 85) {
    return {
      score: normalizedScore,
      label: 'Sterke aanrader',
      icon: '🔥',
      level: 'strong',
    }
  }

  if (normalizedScore >= 80) {
    return {
      score: normalizedScore,
      label: 'Goede keuze',
      icon: '✅',
      level: 'good',
    }
  }

  if (normalizedScore >= 70) {
    return {
      score: normalizedScore,
      label: 'Interessante keuze',
      icon: '👍',
      level: 'interesting',
    }
  }

  if (normalizedScore >= 60) {
    return {
      score: normalizedScore,
      label: 'Situatieafhankelijk',
      icon: '⚖️',
      level: 'situational',
    }
  }

  if (normalizedScore >= 50) {
    return {
      score: normalizedScore,
      label: 'Alleen overwegen',
      icon: '🤔',
      level: 'consider',
    }
  }

  return {
    score: normalizedScore,
    label: 'Af te raden',
    icon: '⚠️',
    level: 'risky',
  }
}

function getFantasyScoreSummary({
  score,
  position,
}) {
  const normalizedScore =
    Number(score) || 0

  if (normalizedScore >= 95) {
    return 'Een absolute topkeuze binnen Fantasy Eredivisie.'
  }

  if (normalizedScore >= 90) {
    return 'Behoort momenteel tot de aantrekkelijkste spelers van de competitie.'
  }

  if (normalizedScore >= 85) {
    return 'Een zeer sterke keuze met meerdere duidelijke pluspunten.'
  }

  if (normalizedScore >= 80) {
    return 'Een betrouwbare en aantrekkelijke optie voor de komende periode.'
  }

  if (normalizedScore >= 70) {
    return 'Een interessante keuze, afhankelijk van jouw team en strategie.'
  }

  if (normalizedScore >= 60) {
    return 'Vooral interessant wanneer de rol, prijs en planning goed aansluiten.'
  }

  if (normalizedScore >= 50) {
    return 'Alleen overwegen wanneer je bewust kiest voor extra risico.'
  }

  return position === 'Doelman'
    ? 'Op dit moment geen overtuigende keuze tussen de beschikbare doelmannen.'
    : 'Op dit moment geen overtuigende keuze binnen zijn positie.'
}

function getFormRoundLabel(
  match,
  index,
) {
  const round =
    match?.fixture?.round ??
    match?.round ??
    null

  return round
    ? `Ronde ${round}`
    : `Wedstrijd ${index + 1}`
}

function renderFormOutlookDetails(
  formResult,
) {
  const form =
    formResult ?? {
      score: 5,
      hasData: false,
      label: 'Nog geen data',
      continuityScore: 5,
      performanceScore: 5,
      roundCount: 0,
      playedRoundCount: 0,
      rounds: [],
    }

  const rounds =
    Array.isArray(form.rounds)
      ? form.rounds
      : []

  return `
    <details class="player-form-details">
      <summary>
        <span>
          Bekijk onderbouwing
        </span>

        <span
          class="player-form-details-chevron"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>

      <div class="player-form-details-content">
        <div class="player-form-components">
          <div>
            <span>
              Continuïteit
            </span>

            <strong>
              ${
                form.hasData
                  ? Number(
                      form.continuityScore,
                    ).toFixed(1)
                  : '-'
              }
            </strong>

            <small>
              60%
            </small>
          </div>

          <div>
            <span>
              Prestaties
            </span>

            <strong>
              ${
                form.hasData
                  ? Number(
                      form.performanceScore,
                    ).toFixed(1)
                  : '-'
              }
            </strong>

            <small>
              40%
            </small>
          </div>
        </div>

        ${
          form.hasData &&
          rounds.length
            ? `
              <div class="player-form-rounds">
                <span class="eyebrow">
                  Laatste vijf speelronden
                </span>

                ${rounds
                  .map(
                    (match, index) => `
                      <div class="player-form-round">
                        <div>
                          <strong>
                            ${getFormRoundLabel(
                              match,
                              index,
                            )}
                          </strong>

                          <span>
                            ${
                              match?.played
                                ? `${
                                    Number(
                                      match.minutes,
                                    ) || 0
                                  } minuten`
                                : 'Niet gespeeld'
                            }
                          </span>
                        </div>

                        <strong>
                          ${
                            match?.played
                              ? `${
                                  Number(
                                    match?.punten
                                      ?.totaal,
                                  ) || 0
                                } pt`
                              : '—'
                          }
                        </strong>
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            `
            : `
              <div class="player-form-empty">
                <strong>
                  Nog geen actuele vormdata
                </strong>

                <p>
  Er zijn nog geen afgeronde
  speelronden. De vormpijler
  krijgt daarom nog geen
  zichtbare beoordeling en
  telt niet mee in de
  FVT-basisscore.
</p>
              </div>
            `
        }
      </div>
    </details>
  `
}

function getOutlookPillarDefinitions(
  outlook,
) {
  return [
    {
      key:
        'availability',

      label:
        'Speelzekerheid',

      value:
        outlook.scores
          .availability,

      hasData:
        outlook.pillarData
          ?.availability
          ?.hasData !== false,

      title:
        'Speelzekerheid',

      description:
        'Hoe groot is de kans dat deze speler structureel minuten maakt?',

      explanation: [
        'De verwachte kans op spelen en het verwachte aantal minuten zijn leidend.',
        'Wanneer die gegevens ontbreken, kijkt Fantasy Studio naar de verwachte rol binnen de selectie.',
        'Blessures, schorsingen en rotatierisico kunnen de score verlagen.',
      ],
    },

    {
      key:
        'potential',

      label:
        'Fantasy-potentie',

      value:
        outlook.scores
          .potential,

      hasData:
        outlook.pillarData
          ?.potential
          ?.hasData !== false,

      title:
        'Fantasy-potentie',

      description:
        'Hoeveel structurele Fantasy-productie kan deze speler naar verwachting leveren?',

      explanation: [
        'Historische productie per 90 minuten wordt gebruikt wanneer voldoende betrouwbare data beschikbaar is.',
        'Zonder voldoende historie kijkt Fantasy Studio naar positie, clubniveau en verwachte rol.',
        'Penalty’s, spelhervattingen en een belangrijke rol kunnen de potentie verhogen.',
      ],
    },

    {
      key:
        'fixtures',

      label:
        'Programma',

      value:
        outlook.scores
          .fixtures,

      hasData:
        outlook.pillarData
          ?.fixtures
          ?.hasData !== false,

      title:
        'Programma',

      description:
        'Hoe gunstig zijn de komende wedstrijden voor deze speler?',

      explanation: [
        'De tegenstanders in de geselecteerde speelronden worden beoordeeld.',
        'Thuis- en uitwedstrijden, teamsterkte en historische uitslagen worden meegenomen.',
        'De positie van de speler bepaalt mede welke tegenstanders gunstig of ongunstig zijn.',
      ],
    },

    {
      key:
        'form',

      label:
        'Vorm',

      value:
        outlook.scores.form,

      hasData:
        outlook.form?.hasData ===
        true,

      title:
        'Vorm',

      description:
        'De actuele Fantasy-vorm over de laatste vijf geregistreerde speelronden.',

      explanation: [
        '60% continuïteit: basisplaatsen, invalbeurten, minuten en gemiste speelronden.',
        '40% prestaties: fantasypunten en de daarin verwerkte positieve en negatieve bijdragen.',
        'Zolang er nog geen afgeronde speelronden zijn, krijgt Vorm geen zichtbare beoordeling.',
      ],

    },

    {
      key:
        'value',

      label:
        'Waarde',

      value:
        outlook.scores.value,

      hasData:
        outlook.value?.hasData ===
        true,

      title:
        'Waarde',

      description:
        'Hoeveel actuele Fantasy-productie levert deze speler voor zijn prijs?',

      explanation: [
        'De actuele prijs wordt afgezet tegen punten per wedstrijd en punten per 90 minuten.',
        'Alleen prestaties uit het lopende Fantasy-seizoen tellen mee.',
        'De beoordeling wordt betrouwbaarder naarmate meer optredens beschikbaar zijn.',
      ],
    },

    {
      key:
        'risk',

      label:
        'Risico',

      value:
        outlook.scores.risk,

      hasData:
        outlook.pillarData
          ?.risk
          ?.hasData !== false,

      title:
        'Risico',

      description:
        'Hoe groot is de kans dat deze speler minder bruikbaar blijkt dan verwacht?',

      explanation: [
        'Blessures, schorsingen en twijfelachtige inzetbaarheid verhogen het risico.',
        'Een onzekere rol of duidelijk rotatierisico werkt eveneens negatief.',
        'Bij deze pijler is een lagere score gunstiger.',
      ],

      risk:
        true,
    },
  ]
}

function renderOutlookPillarInfo(
  pillar,
) {
  return `
    <span
      class="player-form-info"
      tabindex="0"
      aria-label="
        Uitleg over ${pillar.title}
      "
    >
      i

      <span
        class="player-form-tooltip"
        role="tooltip"
      >
        <strong>
          ${pillar.title}
        </strong>

        <span>
          ${pillar.description}
        </span>

        ${pillar.explanation
          .map(
            (line) => `
              <span>
                ${line}
              </span>
            `,
          )
          .join('')}

        ${
          !pillar.hasData
            ? `
              <small>
                Voor deze pijler is momenteel
                nog onvoldoende actuele data.
                De pijler wordt daarom niet
                zichtbaar beoordeeld en telt
                niet mee in de FVT-basisscore.
              </small>
            `
            : ''
        }
      </span>
    </span>
  `
}

function renderOutlookPillarDetails(
  pillar,
  outlook,
  player,
) {
  if (
    pillar.hasData !==
    true
  ) {
    return ''
  }

  /*
   * Vorm heeft al een eigen uitgebreide
   * onderbouwing met speelronden.
   */
  if (
    pillar.key ===
    'form'
  ) {
    return renderFormOutlookDetails(
      outlook.form,
    )
  }

  /*
   * Programma krijgt een specifieke
   * berekeningsonderbouwing.
   */
  if (
    pillar.key ===
    'fixtures'
  ) {
    const fixtureOutlook =
      createFixtureModifier({
        player,

        startRound:
          1,

        roundCount:
          5,
      })
        ?.details ?? {}

    const rounds =
      Array.isArray(
        fixtureOutlook.rounds,
      )
        ? fixtureOutlook.rounds
        : []

    return `
      <details class="player-form-details">
        <summary>
          <span>
            Bekijk onderbouwing
          </span>

          <span
            class="player-form-details-chevron"
            aria-hidden="true"
          >
            ▾
          </span>
        </summary>

        <div class="player-form-details-content">
          <div class="player-pillar-details-heading">
            <span class="eyebrow">
              Scoreopbouw
            </span>

            <strong>
              Programma
            </strong>
          </div>

          <div class="player-pillar-details-score">
            <span>
              Eindscore
            </span>

            <strong>
              ${Number(
                pillar.value,
              ).toFixed(1)}
            </strong>
          </div>

          <div class="player-fixture-weight-intro">
  <strong>
    Aflopende weging
  </strong>

  <p>
    De eerstvolgende speelronde
    telt het zwaarst mee. De invloed
    neemt daarna geleidelijk af.
  </p>

  <span>
    35% · 25% · 18% · 12% · 10%
  </span>
</div>

<div class="player-fixture-details-list">
  ${rounds
    .map(
      (
        roundReport,
        index,
      ) => {
        const fixtures =
          Array.isArray(
            roundReport.fixtures,
          )
            ? roundReport.fixtures
            : []

        const fallbackWeights = [
          0.35,
          0.25,
          0.18,
          0.12,
          0.10,
        ]

        const weight =
          Number(
            roundReport.weight,
          ) ||
          fallbackWeights[
            index
          ] ||
          0

        const weightPercentage =
          Number.isFinite(
            Number(
              roundReport
                .weightPercentage,
            ),
          )
            ? Number(
                roundReport
                  .weightPercentage,
              )
            : Math.round(
                weight * 100,
              )

        const roundScore =
          Number(
            roundReport.score,
          ) || 0

        const contribution =
          Number.isFinite(
            Number(
              roundReport
                .weightedContribution,
            ),
          )
            ? Number(
                roundReport
                  .weightedContribution,
              )
            : roundScore *
              weight

        if (
          roundReport.type ===
          'blank'
        ) {
          return `
            <div
              class="
                player-fixture-detail-card
                is-blank
              "
            >
              <div class="player-fixture-detail-heading">
                <div>
                  <strong>
                    SR ${roundReport.round}
                  </strong>

                  <span>
                    Geen wedstrijd
                  </span>
                </div>

                <strong>
                  ${roundScore.toFixed(1)}
                </strong>
              </div>

              <div class="player-fixture-detail-calculation">
                <div>
                  <span>
                    Wedstrijdscore
                  </span>

                  <strong>
                    ${roundScore.toFixed(1)}
                  </strong>
                </div>

                <div>
                  <span>
                    Weging
                  </span>

                  <strong>
                    ${weightPercentage}%
                  </strong>
                </div>

                <div>
                  <span>
                    Bijdrage
                  </span>

                  <strong>
                    ${contribution.toFixed(2)}
                  </strong>
                </div>
              </div>
            </div>
          `
        }

        const fixtureLabel =
          fixtures
            .map(
              (fixture) => `
                ${fixture.opponent}
                ${
                  fixture.isHome
                    ? '(T)'
                    : '(U)'
                }
              `,
            )
            .join(' + ')

        return `
          <div class="player-fixture-detail-card">
            <div class="player-fixture-detail-heading">
              <div>
                <strong>
                  SR ${roundReport.round}
                </strong>

                <span>
                  ${fixtureLabel}
                </span>

                ${
                  roundReport.type ===
                  'double'
                    ? `
                      <small>
                        Dubbele speelronde
                      </small>
                    `
                    : ''
                }
              </div>

              <strong>
                ${roundScore.toFixed(1)}
              </strong>
            </div>

            <div class="player-fixture-detail-calculation">
              <div>
                <span>
                  Wedstrijdscore
                </span>

                <strong>
                  ${roundScore.toFixed(1)}
                </strong>
              </div>

              <div>
                <span>
                  Weging
                </span>

                <strong>
                  ${weightPercentage}%
                </strong>
              </div>

              <div>
                <span>
                  Bijdrage
                </span>

                <strong>
                  ${contribution.toFixed(2)}
                </strong>
              </div>
            </div>

            <div class="player-fixture-formula">
              ${roundScore.toFixed(1)}
              ×
              ${weightPercentage}%
              =
              ${contribution.toFixed(2)}
            </div>
          </div>
        `
      },
    )
    .join('')}
</div>

<div class="player-fixture-total">
  <span>
    Gewogen programmascore
  </span>

  <strong>
    ${Number(
      pillar.value,
    ).toFixed(1)}
  </strong>
</div>
        </div>
      </details>
    `
  }

  /*
   * De overige pijlers gebruiken voorlopig
   * nog de algemene onderbouwing.
   */
  const explanation =
    Array.isArray(
      pillar.explanation,
    )
      ? pillar.explanation
      : []

  return `
    <details class="player-form-details">
      <summary>
        <span>
          Bekijk onderbouwing
        </span>

        <span
          class="player-form-details-chevron"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>

      <div class="player-form-details-content">
        <div class="player-pillar-details-heading">
          <span class="eyebrow">
            Onderbouwing
          </span>

          <strong>
            ${pillar.title}
          </strong>
        </div>

        <div class="player-pillar-details-score">
          <span>
            Actuele beoordeling
          </span>

          <strong>
            ${
              Number.isFinite(
                Number(
                  pillar.value,
                ),
              )
                ? Number(
                    pillar.value,
                  ).toFixed(1)
                : '—'
            }
          </strong>
        </div>

        ${
          explanation.length
            ? `
              <ul class="player-pillar-details-list">
                ${explanation
                  .map(
                    (line) => `
                      <li>
                        ${line}
                      </li>
                    `,
                  )
                  .join('')}
              </ul>
            `
            : ''
        }

        ${
          pillar.key ===
          'risk'
            ? `
              <p class="player-pillar-details-note">
                Bij Risico is een lagere score
                gunstiger.
              </p>
            `
            : ''
        }
      </div>
    </details>
  `
}

/*
|--------------------------------------------------------------------------
| Fantasy Profiel — kleur volgens dezelfde schaal als het speelschema
|--------------------------------------------------------------------------
|
| Normale pijlers:
| hoge score = gunstig = groen
| lage score = ongunstig = rood
|
| Risico:
| lage score = gunstig = groen
| hoge score = ongunstig = rood
|
*/

function getOutlookPillarColor(
  value,
  {
    risk = false,
    hasData = true,
  } = {},
) {
  if (!hasData) {
    return {
      color: '#526078',
      level: 'neutral',
    }
  }

  const numericValue =
    Number(value)

  if (
    !Number.isFinite(
      numericValue,
    )
  ) {
    return {
      color: '#526078',
      level: 'neutral',
    }
  }

  const normalizedValue =
    Math.max(
      0,
      Math.min(
        10,
        numericValue,
      ),
    )

  /*
   * Bij Risico is een lage score juist goed.
   * Daarom draaien we de score alleen voor
   * de kleurweergave om.
   */
  const favorableScore =
    risk
      ? 10 - normalizedValue
      : normalizedValue

  if (
    favorableScore >= 8
  ) {
    return {
      color: '#08a84e',
      level: 'difficulty-1',
    }
  }

  if (
    favorableScore >= 6
  ) {
    return {
      color: '#a9e65c',
      level: 'difficulty-2',
    }
  }

  if (
    favorableScore >= 4
  ) {
    return {
      color: '#ffdb0a',
      level: 'difficulty-3',
    }
  }

  if (
    favorableScore >= 2
  ) {
    return {
      color: '#f47a13',
      level: 'difficulty-4',
    }
  }

  return {
    color: '#d7192d',
    level: 'difficulty-5',
  }
}

function renderOutlookPillar(
  pillar,
  outlook,
  player,
) {
  const hasData =
    pillar.hasData === true

  const value =
    Number(
      pillar.value,
    )

  const displayValue =
    !hasData
      ? 'Nog geen data'
      : pillar.key ===
            'value' &&
          outlook.value
            ?.stage
            ?.id ===
            'provisional'
        ? 'Voorlopig'
        : pillar.key ===
              'value' &&
            outlook.value
              ?.stage
              ?.id ===
              'building'
          ? 'In opbouw'
          : Number.isFinite(
                value,
              )
            ? value.toFixed(
                1,
              )
            : 'Nog geen data'

  const fillPercentage =
    hasData &&
    Number.isFinite(
      value,
    )
      ? Math.max(
          0,
          Math.min(
            100,
            value * 10,
          ),
        )
      : 0

  const presentation =
    getOutlookPillarColor(
      value,
      {
        risk:
          pillar.risk === true,

        hasData,
      },
    )

  const details =
    renderOutlookPillarDetails(
      pillar,
      outlook,
      player,
    )

  return `
    <div
      class="
        player-outlook-factor
        outlook-${presentation.level}
        ${
          details
            ? 'has-details'
            : ''
        }
        ${
          hasData
            ? ''
            : 'has-no-data'
        }
      "
      style="
        --outlook-factor-color:
          ${presentation.color};
      "
    >
      <div class="player-outlook-factor-heading">
        <div class="player-outlook-factor-title">
          <span>
            ${pillar.label}
          </span>

          ${renderOutlookPillarInfo(
            pillar,
          )}
        </div>

        <strong
          class="player-outlook-factor-value"
        >
          ${displayValue}
        </strong>
      </div>

      <div class="player-outlook-factor-track">
        <div
          class="
            player-outlook-factor-fill
            ${
              pillar.risk
                ? 'risk'
                : ''
            }
            ${
              hasData
                ? ''
                : 'neutral'
            }
          "
          style="
            width:
              ${fillPercentage}%;
          "
        ></div>
      </div>

      ${details}
    </div>
  `
}

/*
|--------------------------------------------------------------------------
| Fantasy Profiel — Premium Cards
|--------------------------------------------------------------------------
*/

function renderFantasyProfileInfo(
  profile,
) {
  const components =
    Array.isArray(
      profile?.components,
    )
      ? profile.components
      : []

  const profileTitle =
    profile?.shortLabel ??
    profile?.label ??
    'Fantasy Profiel'

  const profileAssessment =
    profile?.hasData
      ? profile?.label
      : 'Nog geen data'

  return `
    <span
      class="fantasy-profile-info"
      tabindex="0"
      aria-label="
        Uitleg over
        ${profileTitle}
      "
    >
      i

      <span
        class="fantasy-profile-tooltip"
        role="tooltip"
      >
        <span
          class="fantasy-profile-tooltip-heading"
        >
          <strong>
            <span aria-hidden="true">
              ${profile?.icon ?? '⭐'}
            </span>

            ${profileTitle}
          </strong>

          <span
            class="
              fantasy-profile-tooltip-assessment
              ${
                profile?.accent
                  ? `is-${profile.accent}`
                  : ''
              }
            "
          >
            ${profileAssessment}
          </span>
        </span>

        <span
          class="fantasy-profile-tooltip-description"
        >
          ${
            profile?.question ??
            profile?.description ??
            ''
          }
        </span>

        ${
          components.length
            ? `
              <span
                class="fantasy-profile-tooltip-title"
              >
                Scoreopbouw
              </span>

              <span
                class="fantasy-profile-tooltip-components"
              >
                ${components
                  .map(
                    (component) => `
                      <span
                        class="
                          fantasy-profile-tooltip-component
                          ${
                            component.available
                              ? ''
                              : 'is-unavailable'
                          }
                        "
                      >
                        <span
                          class="fantasy-profile-component-label"
                        >
                          ${component.label}
                        </span>

                        ${
                          component.available
                            ? `
                              <strong
                                class="fantasy-profile-component-score"
                              >
                                ${formatNumber(
                                  component.score,
                                )}
                              </strong>

                              <span
                                class="fantasy-profile-component-weight"
                              >
                                weging
                                <strong>
                                  ${formatNumber(
                                    component.effectiveWeight,
                                  )}%
                                </strong>
                              </span>
                            `
                            : `
                              <span
                                class="fantasy-profile-component-missing"
                              >
                                Nog geen data
                              </span>
                            `
                        }
                      </span>
                    `,
                  )
                  .join('')}
              </span>
            `
            : ''
        }

        <small>
          De eindscore is de gewogen optelsom
          van bovenstaande onderdelen.
          Ontbrekende gegevens worden tijdelijk
          neutraal beoordeeld en automatisch
          vervangen zodra voldoende data
          beschikbaar is.
        </small>
      </span>
    </span>
  `
}

function renderFantasyProfileCard(
  profile,
) {
  const score =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          profile?.score,
        ) || 0,
      ),
    )

  const fillHeight =
    `${score}%`

  return `
    <article
      class="
        fantasy-profile-card
        fantasy-profile-card-${profile?.accent ?? 'neutral'}
        ${
          profile?.hasData
            ? ''
            : 'has-no-data'
        }
      "
      style="
        --fantasy-profile-score:
          ${fillHeight};
      "
    >
      <div
        class="fantasy-profile-card-fill"
        aria-hidden="true"
      ></div>

      <div class="fantasy-profile-card-content">
        <div class="fantasy-profile-card-heading">
          <span
            class="fantasy-profile-card-icon"
            aria-hidden="true"
          >
            ${profile?.icon ?? '⭐'}
          </span>

          ${renderFantasyProfileInfo(
            profile,
          )}
        </div>

        <div class="fantasy-profile-card-score">
          <strong>
            ${
              profile?.hasData
                ? formatNumber(score)
                : '—'
            }
          </strong>

          <span>
            ${
              profile?.hasData
                ? profile.label
                : 'Nog geen data'
            }
          </span>
        </div>

        <div class="fantasy-profile-card-footer">
          <strong>
            ${profile?.shortLabel ?? ''}
          </strong>
        </div>
      </div>
    </article>
  `
}

function renderFantasyProfileGrid(
  fantasyProfile,
) {
  const items =
    Array.isArray(
      fantasyProfile?.items,
    )
      ? fantasyProfile.items
      : []

  if (!items.length) {
    return `
      <section class="fantasy-profile-section">
        <div class="fantasy-profile-section-heading">
          <div>
            <span class="eyebrow">
              Fantasy Profiel
            </span>

            <h3>
              Nog geen profiel beschikbaar
            </h3>
          </div>
        </div>
      </section>
    `
  }

  return `
    <section class="fantasy-profile-section">
      <div class="fantasy-profile-section-heading">
        <div>
          <span class="eyebrow">
            Fantasy Profiel
          </span>

          <h3>
            Zes invalshoeken op deze speler
          </h3>
        </div>

        <span class="fantasy-profile-section-badge">
          0–100
        </span>
      </div>

      <div class="fantasy-profile-grid">
        ${items
          .map(
            renderFantasyProfileCard,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderDetail(
  player,
  activeTab = 'overview',
  scheduleState = {},
) {
  if (!player) {
    return `
      <aside class="player-detail empty">
        <span class="eyebrow">
          Spelerinformatie
        </span>

        <h3>Kies een speler</h3>

        <p>
          Klik op een rij om rechts alle
          statistieken te bekijken.
        </p>
      </aside>
    `
  }

  const overviewActive =
    activeTab === 'overview'

  const outlookActive =
  activeTab === 'outlook'

  const scheduleActive =
  activeTab === 'schedule'

  const matchesActive =
  activeTab === 'matches'

  const historyActive =
    activeTab === 'history'

  const scoutActive =
    activeTab === 'scout'

  const eliteActive =
    activeTab === 'elite'

  const fixtureModifier =
  createFixtureModifier({
    player,

    /*
     * We beoordelen voorlopig de eerste
     * vijf speelrondes.
     *
     * Later maken we startRound dynamisch
     * op basis van de actuele speelronde.
     */
    startRound: 1,
    roundCount: 5,
  })

const outlook =
  calculateFantasyOutlook(
    player,
    {
      fixtureScore:
        fixtureModifier.score,
    },
  )

 const fvtScore =
  calculateFvtScore(
    player,
    {
      outlook,
    },
  )

const fvtInsights =
  buildFvtInsights({
    player,
    fvtScore,
  })

const fantasyDNA =
  calculatePlayerFantasyDNA(
    player,
    {
      baseScore:
        outlook.calculation
          ?.baseScore ??
        outlook.score,

      startRound: 1,

      roundCount: 5,

      /*
       * De bestaande engines hebben deze
       * informatie al berekend. De Fantasy
       * Profiel Builder combineert alleen
       * hun uitkomsten.
       */
      outlook,

      fvtScore,

      /*
       * Nodig voor de relatieve prijs per
       * positie bij Budgetoptie.
       */
      referencePlayers:
        getEnrichedPlayers(),
    },
  )

const scout =
  calculateFantasyScoutReport(
    player,
    outlook,
  ) 

  return `
    <aside class="player-detail">
      <header class="player-detail-header">
        ${renderPlayerPhoto(player)}

        <div class="player-detail-identity">
          <span class="eyebrow">
            ${player.position}
          </span>

          <h3>${player.name}</h3>

          <p>
            ${player.club}
            ·
            ${player.season}
          </p>
        </div>
      </header>

      <nav
        class="player-detail-tabs"
        aria-label="Spelerinformatie"
      >
        <button
          type="button"
          class="
            player-detail-tab
            ${overviewActive ? 'active' : ''}
          "
          data-player-detail-tab="overview"
        >
          Overzicht
        </button>

        <button
          type="button"
          class="
            player-detail-tab
            ${outlookActive ? 'active' : ''}
          "
          data-player-detail-tab="outlook"
        >
          Fantasy Profiel
        </button>

<button
  type="button"
  class="
    player-detail-tab
    ${scheduleActive ? 'active' : ''}
  "
  data-player-detail-tab="schedule"
>
  Speelschema
</button>

        <button
  type="button"
  class="
    player-detail-tab
    ${matchesActive ? 'active' : ''}
  "
  data-player-detail-tab="matches"
>
  Wedstrijden
</button>

        <button
          type="button"
          class="
            player-detail-tab
            ${historyActive ? 'active' : ''}
          "
          data-player-detail-tab="history"
        >
          Historie
        </button>

        <button
  type="button"
  class="
    player-detail-tab
    ${scoutActive ? 'active' : ''}
  "
  data-player-detail-tab="scout"
>
  Scout
</button>
        <button type="button" class="player-detail-tab ${eliteActive ? 'active' : ''}" data-player-detail-tab="elite">Topmanagers</button>
      </nav>

      <div class="player-detail-tab-content">
        ${
          overviewActive
            ? `
              <div class="player-highlight-grid">
                <div>
                  <span>Punten</span>

                  <strong>
                    ${formatNumber(player.points)}
                  </strong>
                </div>

                <div>
                  <span>Gespeeld door</span>

                  <strong>
                    ${formatPct(
                      player.selectedPct,
                    )}
                  </strong>
                </div>
              </div>

              <div class="player-stat-list">
                <div>
                  <span>Beginprijs</span>
                  <strong>
                    ${formatPrice(
                      player.startPrice,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Huidige prijs</span>
                  <strong>
                    ${formatPrice(
                      player.endPrice,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Reddingen</span>
                  <strong>
                    ${formatNumber(
                      player.saves,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Clean sheets</span>
                  <strong>
                    ${formatNumber(
                      player.cleanSheets,
                    )}
                  </strong>
                </div>

                <div>
                  <span>OPTA Bonus</span>
                  <strong>
                    ${formatNumber(
                      player.optaBonus,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Gestopte penalties
                  </span>

                  <strong>
                    ${formatNumber(
                      player.penaltiesSaved,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Doelpunten</span>
                  <strong>
                    ${formatNumber(
                      player.goals,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Assists</span>
                  <strong>
                    ${formatNumber(
                      player.assists,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Gele kaarten</span>
                  <strong>
                    ${formatNumber(
                      player.yellowCards,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Rode kaarten</span>
                  <strong>
                    ${formatNumber(
                      player.redCards,
                    )}
                  </strong>
                </div>
              </div>
            `
            : ''
        }

        ${
  outlookActive
    ? (() => {
const fantasyScorePresentation =
  getFantasyScorePresentation(
    fvtScore.score,
  )

  const fantasyScoreSummary =
  fvtInsights.summary

return `
  
        
        <div class="player-outlook">

            <section
  class="
    player-fvt-score-card
    ${fantasyScorePresentation.level}
  "
>
  <div class="player-fvt-score-heading">
  <div>
    <div class="player-fvt-score-title-row">
      <span class="eyebrow">
        FVT Fantasy Score™
      </span>

      <span
        class="player-fvt-score-info"
        tabindex="0"
        aria-label="
          De FVT Fantasy Score beoordeelt hoe
          aantrekkelijk een speler op dit moment
          is voor Fantasy Eredivisie.
        "
      >
        i

        <span
          class="player-fvt-score-tooltip"
          role="tooltip"
        >
          <strong>
            FVT Fantasy Score™
          </strong>

          <span>
            De score loopt van 0 tot 100 en wordt
            berekend uit Potentie, Speelzekerheid,
            Programma, Vorm, Waarde en Laag risico.
          </span>

          <small>
            Weging:
            30% · 25% · 15% · 15% · 10% · 5%
          </small>
        </span>
      </span>
    </div>

    <h3>
      Fantasy aantrekkelijkheid
    </h3>
  </div>
</div>

  <div class="player-fvt-score-main">
    <div class="player-fvt-score-number">
      <strong>
        ${Math.round(
  fvtScore.score,
)}
      </strong>

      <span>
        / 100
      </span>
    </div>

    <div
      class="
        player-fvt-score-label
        ${fantasyScorePresentation.level}
      "
    >
      <span aria-hidden="true">
        ${
  fvtInsights.decision.id ===
    'must-have'
    ? '👑'
    : fvtInsights.decision.id ===
        'strong-buy'
      ? '🔥'
      : fvtInsights.decision.id ===
          'serious-option'
        ? '✅'
        : fvtInsights.decision.id ===
            'strategy-dependent'
          ? '⚖️'
          : fvtInsights.decision.id ===
              'watchlist'
            ? '👀'
            : fvtInsights.decision.id ===
                'avoid'
              ? '⚠️'
              : 'ℹ️'
}
      </span>

      <strong>
       ${fvtInsights.decision.label}
      </strong>
    </div>
  </div>

  <div class="player-fvt-score-track">
    <div
      class="player-fvt-score-fill"
      style="
        width:
          ${fantasyScorePresentation.score}%;
      "
    ></div>
  </div>

  <p class="player-fvt-score-summary">
  ${fantasyScoreSummary}
</p>

</section>

      <div class="player-outlook-breakdown">
  ${getOutlookPillarDefinitions(
    outlook,
  )
    .map(
      (pillar) =>
        renderOutlookPillar(
          pillar,
          outlook,
          player,
        ),
    )
    .join('')}
</div>

<div class="player-outlook-tier">
  ${fvtInsights.stars.text}
  <br>
  ${fvtInsights.decision.label}
</div>

<div class="player-outlook-advice">
  ${fvtInsights.decision.text}
</div>

<div class="player-outlook-confidence">

  <span>Databetrouwbaarheid</span>

  <strong
    class="
      player-outlook-confidence-value
      ${outlook.confidence.value}
    "
  >
    ${formatDecimal(
      fvtScore.confidence.score,
    )}%
    ·
    ${fvtScore.confidence.label}
  </strong>

</div>

<div class="player-outlook-strengths">

  <h4>Sterke punten</h4>

  ${
    fvtInsights.strengths.length
      ? `
        <ul>
          ${fvtInsights.strengths
            .map(
              (item) => `
                <li>
                  <strong>${item.title}</strong><br>
                  <small>${item.text}</small>
                </li>
              `,
            )
            .join('')}
        </ul>
      `
      : `
        <p>
          Geen uitgesproken pluspunten.
        </p>
      `
  }

</div>

<div class="player-outlook-concerns">

  <h4>Aandachtspunten</h4>

  ${
    fvtInsights.concerns.length
      ? `
        <ul>
          ${fvtInsights.concerns
            .map(
              (item) => `
                <li>
                  <strong>${item.title}</strong><br>
                  <small>${item.text}</small>
                </li>
              `,
            )
            .join('')}
        </ul>
      `
      : `
        <p>
          Geen directe aandachtspunten.
        </p>
      `
  }

</div>

${renderFantasyProfileGrid(
  fantasyDNA.fantasyProfile,
)}

          </div>
        `
      })()
    : ''
}

${eliteActive ? renderElitePlayerProfile(player) : ''}

${
  scoutActive
    ? `
        <div class="player-scout-report">

          <section
            class="
              player-scout-hero
              ${scout.level}
            "
          >
            <div class="player-scout-hero-heading">
              <div>
                <span class="eyebrow">
                  Fantasy Scout
                </span>

                <div class="player-scout-stars">
                  ${renderScoutStars(
                    scout.stars,
                  )}
                </div>

                <h3>
                  ${scout.label}
                </h3>
              </div>

              <div class="player-scout-score">
                <strong>
                  ${formatDecimal(
                    scout.score / 10,
                  )}
                </strong>

                <small>/ 10</small>
              </div>
            </div>

            <div class="player-scout-score-track">
              <div
                class="player-scout-score-fill"
                style="
                  width: ${Math.max(
                    0,
                    Math.min(
                      100,
                      Number(scout.score),
                    ),
                  )}%;
                "
              ></div>
            </div>

            <div class="player-scout-quick-facts">
              <div>
                <span>Databetrouwbaarheid</span>

                <strong>
                  ${formatDecimal(
                    scout.confidence,
                  )}%
                </strong>
              </div>

              <div>
                <span>Fantasy-risico</span>

                <strong>
                  ${formatDecimal(
                    scout.risk / 10,
                  )}
                  / 10
                </strong>
              </div>

              <div>
                <span>Verwachte rol</span>

                <strong>
                  ${
                    player.profile
                      ?.scout
                      ?.expectedRole ===
                    'key-player'
                      ? 'Sleutelspeler'
                      : player.profile
                          ?.scout
                          ?.expectedRole ===
                        'starter'
                        ? 'Basisspeler'
                        : player.profile
                            ?.scout
                            ?.expectedRole ===
                          'rotation'
                          ? 'Rotatie'
                          : player.profile
                              ?.scout
                              ?.expectedRole ===
                            'backup'
                            ? 'Reserve'
                            : player.profile
                                ?.scout
                                ?.expectedRole ===
                              'prospect'
                              ? 'Talent'
                              : 'Onbekend'
                  }
                </strong>
              </div>
            </div>
          </section>

          <section class="player-scout-section">
            <div class="player-scout-section-heading">
              <span class="player-scout-section-icon positive">
                +
              </span>

              <h4>Sterke punten</h4>
            </div>

            ${
              scout.strengths.length
                ? `
                  <ul class="player-scout-list positive">
                    ${scout.strengths
                      .map(
                        (item) => `
                          <li>
                            <span>✓</span>
                            <p>${item}</p>
                          </li>
                        `,
                      )
                      .join('')}
                  </ul>
                `
                : `
                  <p class="player-scout-empty">
                    Nog geen duidelijke sterke punten.
                  </p>
                `
            }
          </section>

          <section class="player-scout-section">
            <div class="player-scout-section-heading">
              <span class="player-scout-section-icon warning">
                !
              </span>

              <h4>Aandachtspunten</h4>
            </div>

            ${
              scout.concerns.length
                ? `
                  <ul class="player-scout-list warning">
                    ${scout.concerns
                      .map(
                        (item) => `
                          <li>
                            <span>!</span>
                            <p>${item}</p>
                          </li>
                        `,
                      )
                      .join('')}
                  </ul>
                `
                : `
                  <p class="player-scout-empty">
                    Geen directe aandachtspunten.
                  </p>
                `
            }
          </section>

          <section class="player-scout-verdict">
            <span class="eyebrow">
              Scoutoordeel
            </span>

            <p>
              ${scout.verdict}
            </p>
          </section>

        </div>
      `
    : ''
}

${
  scheduleActive
    ? renderPlayerSchedule(
        player,
        scheduleState,
      )
    : ''
}

${
  matchesActive
    ? renderPlayerMatches(player)
    : ''
}

        ${
  historyActive
    ? (() => {
        const history =
          getPlayerHistory(
            player.id,
          )

        const previous =
          getPreviousSeasonStats(
            player,
          )

const experience =
  player.profile?.experience ?? {
    score: 0,
    totalMinutes: 0,
    seasonCount: 0,
    minutesScore: 0,
    seasonsScore: 0,
  }

  const confidence =
  player.profile?.confidence ?? {
    score: 20,
    level: 'low',
    label: 'Laag',
    reasons: [],
  }

        if (!previous) {
          return `
            <div class="player-detail-placeholder">
              <span class="eyebrow">
                Spelerhistorie
              </span>

              <h3>
                Geen vorig seizoen gevonden
              </h3>

              <p>
                Voor ${player.name} is nog geen
                eerder seizoen met dezelfde
                speler-ID gekoppeld.
              </p>
            </div>
          `
        }

        return `
          <div class="player-history-summary">
            <div class="player-history-heading">
              <div>
                <span class="eyebrow">
                  Vorig seizoen
                </span>

                <h3>
                  ${previous.season}
                </h3>

                <p>
                  ${previous.club}
                </p>
              </div>

              <strong>
                ${history.length}
                seizoen${
                  history.length === 1
                    ? ''
                    : 'en'
                }
              </strong>
            </div>

<div class="player-experience-card">
  <div class="player-experience-heading">
    <div>
      <span class="eyebrow">
        Eredivisie-ervaring
      </span>

      <h3>
        Experience Score
      </h3>
    </div>

    <div class="player-experience-score">
      <strong>
        ${formatDecimal(
          experience.score,
        )}
      </strong>

      <small>/ 100</small>
    </div>
  </div>

<div class="player-data-confidence">
  <span>Databetrouwbaarheid</span>

  <strong
    class="
      player-data-confidence-value
      ${confidence.level}
    "
  >
    ${formatDecimal(
      confidence.score,
    )}%
    ·
    ${confidence.label}
  </strong>
</div>

  <div class="player-experience-breakdown">
    <div>
      <span>Minutenscore</span>

      <strong>
        ${formatDecimal(
          experience.minutesScore,
        )}
      </strong>
    </div>

    <div>
      <span>Seizoenenscore</span>

      <strong>
        ${formatDecimal(
          experience.seasonsScore,
        )}
      </strong>
    </div>

    <div>
      <span>Historische minuten</span>

      <strong>
        ${formatNumber(
          experience.totalMinutes,
        )}
      </strong>
    </div>

    <div>
      <span>Volwaardige seizoenen</span>

      <strong>
        ${formatNumber(
          experience.seasonCount,
        )}
      </strong>
    </div>
  </div>
</div>

            <div class="player-highlight-grid">
              <div>
                <span>Punten</span>

                <strong>
                  ${formatNumber(
                    previous.points,
                  )}
                </strong>
              </div>

              <div>
                <span>Punten per 90</span>

                <strong>
                  ${formatDecimal(
                    previous.pointsPer90,
                  )}
                </strong>
              </div>
            </div>

            <div class="player-stat-list">
              <div>
                <span>Minuten</span>

                <strong>
                  ${formatNumber(
                    previous.minutes,
                  )}
                </strong>
              </div>

              <div>
                <span>Doelpunten</span>

                <strong>
                  ${formatNumber(
                    previous.goals,
                  )}
                </strong>
              </div>

              <div>
                <span>Assists</span>

                <strong>
                  ${formatNumber(
                    previous.assists,
                  )}
                </strong>
              </div>

              <div>
                <span>OPTA Bonus</span>

                <strong>
                  ${formatNumber(
                    previous.optaBonus,
                  )}
                </strong>
              </div>

              ${
                player.position ===
                'Doelman'
                  ? `
                    <div>
                      <span>Reddingen</span>

                      <strong>
                        ${formatNumber(
                          previous.saves,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Clean sheets</span>

                      <strong>
                        ${formatNumber(
                          previous.cleanSheets,
                        )}
                      </strong>
                    </div>
                  `
                  : ''
              }

              <div>
                <span>Gekozen door</span>

                <strong>
                  ${formatPct(
                    previous.selectedPct,
                  )}
                </strong>
              </div>

              <div>
                <span>Huidige prijs</span>

                <strong>
                  ${formatPrice(
                    previous.endPrice,
                  )}
                </strong>
              </div>
            </div>
          </div>
        `
      })()
    : ''
}
      </div>
    </aside>
  `
}

function getMatchStatusLabel(
  match,
) {
  const labels = {
    starter:
      'Basis',

    substitute:
      'Ingevallen',

    'unused-sub':
      'Niet ingevallen',

    'not-selected':
      'Niet bij de selectie',

    injured:
      'Geblesseerd',

    suspended:
      'Geschorst',

    postponed:
      'Uitgesteld',

    unknown:
      'Onbekend',
  }

  return (
    labels[
      match?.status
    ] ??
    match?.statusLabel ??
    'Onbekend'
  )
}

function renderMatchSummary({
  statistieken,
  gemiddelden,
  punten,
}) {
  return `
    <section class="player-match-section">
      <div class="player-match-section-heading">
        <div>
          <span class="eyebrow">
            Actueel seizoen
          </span>

          <h3>
            Wedstrijdprofiel
          </h3>
        </div>

        <strong class="player-match-total">
          ${formatNumber(
            punten.totaal ?? 0,
          )}
          pt
        </strong>
      </div>

      <div class="player-match-summary-grid">
        <div>
          <span>Gespeeld</span>

          <strong>
            ${formatNumber(
              statistieken
                .gespeeldeWedstrijden ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Basisplaatsen</span>

          <strong>
            ${formatNumber(
              statistieken
                .basisplaatsen ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Invalbeurten</span>

          <strong>
            ${formatNumber(
              statistieken
                .invalbeurten ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Minuten</span>

          <strong>
            ${formatNumber(
              statistieken.minuten ?? 0,
            )}
          </strong>
        </div>
      </div>

      <div class="player-match-average-grid">
        <div>
          <span>Punten per wedstrijd</span>

          <strong>
            ${formatDecimal(
              gemiddelden
                .puntenPerWedstrijd ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Punten per 90</span>

          <strong>
            ${formatDecimal(
              gemiddelden
                .puntenPer90 ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Minuten per optreden</span>

          <strong>
            ${formatDecimal(
              gemiddelden
                .minutesPerAppearance ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Basispercentage</span>

          <strong>
            ${formatNumber(
              gemiddelden
                .startPercentage ?? 0,
            )}%
          </strong>
        </div>
      </div>
    </section>
  `
}

function renderMatchStatistics(
  statistieken,
) {
  return `
    <section class="player-match-section">
      <div class="player-match-section-heading">
        <div>
          <span class="eyebrow">
            Wedstrijdstatistieken
          </span>

          <h3>
            Prestaties
          </h3>
        </div>
      </div>

      <div class="player-stat-list">
        <div>
          <span>Doelpunten</span>

          <strong>
            ${formatNumber(
              statistieken.goals ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Assists</span>

          <strong>
            ${formatNumber(
              statistieken.assists ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Doelpuntbijdragen</span>

          <strong>
            ${formatNumber(
              statistieken
                .doelpuntBetrokkenheid ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Clean sheets</span>

          <strong>
            ${formatNumber(
              statistieken.cleanSheets ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Reddingen</span>

          <strong>
            ${formatNumber(
              statistieken.reddingen ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>OPTA-bonus</span>

          <strong>
            ${formatNumber(
              statistieken.optaBonus ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Gele kaarten</span>

          <strong>
            ${formatNumber(
              statistieken.geleKaarten ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Rode kaarten</span>

          <strong>
            ${formatNumber(
              statistieken.rodeKaarten ?? 0,
            )}
          </strong>
        </div>
      </div>
    </section>
  `
}

function renderFantasyPoints({
  punten,
  minpunten,
}) {
  const pointRows = [
    {
      label:
        'Speelminuten',

      value:
        punten.speelminuten,
    },
    {
      label:
        'Doelpunten',

      value:
        punten.goals,
    },
    {
      label:
        'Assists',

      value:
        punten.assists,
    },
    {
      label:
        'Clean sheets',

      value:
        punten.cleanSheet,
    },
    {
      label:
        'Reddingen',

      value:
        punten.reddingen,
    },
    {
      label:
        'Gestopte penalties',

      value:
        punten.penaltyGestopt,
    },
    {
      label:
        'OPTA-bonus',

      value:
        punten.optaBonus,
    },
    {
      label:
        'Minpunten',

      value:
        minpunten,
    },
  ]

  return `
    <section class="player-match-section">
      <div class="player-match-section-heading">
        <div>
          <span class="eyebrow">
            Fantasy Eredivisie
          </span>

          <h3>
            Puntenopbouw
          </h3>
        </div>
      </div>

      <div class="player-match-points-list">
        ${pointRows
          .map(
            ({
              label,
              value,
            }) => {
              const number =
                Number(value) || 0

              return `
                <div class="player-match-points-row">
                  <span>
                    ${label}
                  </span>

                  <strong
                    class="${
                      number < 0
                        ? 'negative'
                        : number > 0
                          ? 'positive'
                          : ''
                    }"
                  >
                    ${
                      number > 0
                        ? '+'
                        : ''
                    }${formatNumber(
                      number,
                    )}
                  </strong>
                </div>
              `
            },
          )
          .join('')}

        <div class="
          player-match-points-row
          total
        ">
          <span>
            Totaal
          </span>

          <strong>
            ${formatNumber(
              punten.totaal ?? 0,
            )}
          </strong>
        </div>
      </div>
    </section>
  `
}

function renderContributionProfile({
  bijdragen,
  wedstrijden,
}) {
  return `
    <section class="player-match-section">
      <div class="player-match-section-heading">
        <div>
          <span class="eyebrow">
            Bijdrageprofiel
          </span>

          <h3>
            Waar komen de punten vandaan?
          </h3>
        </div>
      </div>

      <div class="player-stat-list">
        <div>
          <span>Aanvallend</span>

          <strong>
            ${formatNumber(
              bijdragen.aanvallend ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Verdedigend</span>

          <strong>
            ${formatNumber(
              bijdragen.verdedigend ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Speelminuten</span>

          <strong>
            ${formatNumber(
              bijdragen.speelminuten ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Bonus</span>

          <strong>
            ${formatNumber(
              bijdragen.bonus ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Discipline</span>

          <strong>
            ${formatNumber(
              bijdragen.discipline ?? 0,
            )}
          </strong>
        </div>

        <div>
          <span>Wedstrijdregels</span>

          <strong>
            ${formatNumber(
              wedstrijden.length,
            )}
          </strong>
        </div>
      </div>
    </section>
  `
}

function renderRecentMatches(
  recenteWedstrijden,
) {
  return `
    <section class="player-match-section">
      <div class="player-match-section-heading">
        <div>
          <span class="eyebrow">
            Recente speelrondes
          </span>

          <h3>
            Laatste wedstrijden
          </h3>
        </div>

        <strong class="player-match-count">
          ${recenteWedstrijden.length}
        </strong>
      </div>

      ${
        recenteWedstrijden.length
          ? `
            <div class="player-recent-matches">
              ${[
                ...recenteWedstrijden,
              ]
                .reverse()
                .map(
                  (match) => {
                    const opponent =
                      match.fixture
                        ?.opponent ||
                      'Onbekend'

                    const venue =
                      match.fixture
                        ?.venue

                    const opponentLabel =
                      venue === 'away'
                        ? `@ ${opponent}`
                        : opponent

                    const statusLabel =
                      getMatchStatusLabel(
                        match,
                      )

                    const matchDescription =
                      match.played
                        ? `${statusLabel} · ${formatNumber(
                            match.minutes,
                          )} minuten`
                        : statusLabel

                    const totalPoints =
                      Number(
                        match.punten
                          ?.totaal,
                      ) || 0

                    const statusClass =
                      match.status ===
                        'injured' ||
                      match.status ===
                        'suspended'
                        ? 'unavailable'
                        : match.played
                          ? 'played'
                          : 'not-played'

                    return `
                      <article
                        class="
                          player-recent-match
                          ${statusClass}
                        "
                      >
                        <div class="player-recent-match-round">
                          <span>
                            SR
                          </span>

                          <strong>
                            ${formatNumber(
                              match.round,
                            )}
                          </strong>
                        </div>

                        <div class="player-recent-match-main">
                          <strong>
                            ${opponentLabel}
                          </strong>

                          <span>
                            ${matchDescription}
                          </span>
                        </div>

                        <div class="player-recent-match-points">
                          <strong
                            class="${
                              totalPoints < 0
                                ? 'negative'
                                : totalPoints > 0
                                  ? 'positive'
                                  : ''
                            }"
                          >
                            ${
                              totalPoints > 0
                                ? '+'
                                : ''
                            }${formatNumber(
                              totalPoints,
                            )}
                          </strong>

                          <span>
                            punten
                          </span>
                        </div>
                      </article>
                    `
                  },
                )
                .join('')}
            </div>
          `
          : `
            <div class="player-match-empty">
              <p>
                Er zijn nog geen speelrondes
                beschikbaar.
              </p>
            </div>
          `
      }
    </section>
  `
}

function renderPlayerMatches(player) {
  const matchProfile =
    player.profile?.match

  if (!matchProfile) {
    return `
      <div class="player-detail-placeholder">
        <span class="eyebrow">
          Wedstrijdprofiel
        </span>

        <h3>
          Geen wedstrijdprofiel beschikbaar
        </h3>

        <p>
          De actuele wedstrijdgegevens konden
          niet aan deze speler worden gekoppeld.
        </p>
      </div>
    `
  }

  const statistieken =
    matchProfile.statistieken ?? {}

  const punten =
    matchProfile.punten ?? {}

  const bijdragen =
    matchProfile.bijdragen ?? {}

  const gemiddelden =
    matchProfile.gemiddelden ?? {}

  const wedstrijden =
    matchProfile.wedstrijden ?? []

  const recenteWedstrijden =
  matchProfile.recenteWedstrijden ?? []

  const heeftGespeeld =
    Number(
      statistieken
        .gespeeldeWedstrijden,
    ) > 0

  const minpunten =
    Number(
      punten.penaltyGemist ?? 0,
    ) +
    Number(
      punten.tegendoelpunten ?? 0,
    ) +
    Number(
      punten.geleKaarten ?? 0,
    ) +
    Number(
      punten.rodeKaarten ?? 0,
    ) +
    Number(
      punten.eigenDoelpunten ?? 0,
    )

  if (!heeftGespeeld) {
    return `
      <div class="player-detail-placeholder">
        <span class="eyebrow">
          Wedstrijdprofiel
        </span>

        <h3>
          Nog geen gespeelde wedstrijd
        </h3>

        <p>
          Er zijn ${formatNumber(
            statistieken
              .geregistreerdeWedstrijden ?? 0,
          )} wedstrijdregel${
            Number(
              statistieken
                .geregistreerdeWedstrijden,
            ) === 1
              ? ''
              : 's'
          } geregistreerd, maar nog geen
          gespeelde minuten voor ${player.name}.
        </p>
      </div>
    `
  }

  return `
    <div class="player-match-profile">
      ${renderMatchSummary({
      statistieken,
      gemiddelden,
      punten,
    })}

      ${renderMatchStatistics(
        statistieken,
      )}

      ${renderFantasyPoints({
        punten,
        minpunten,
      })}

            ${renderContributionProfile({
        bijdragen,
        wedstrijden,
      })}

      ${renderRecentMatches(
        recenteWedstrijden,
      )}

    </div>
  `
}

export function createPlayersScreen() {
  const players =
  getAllPlayerProfiles()
    .map(
      enrichPlayerWithMatchStats,
    )

  runOptimizerSandboxOnce({
    round: 1,
  })
  const seasons = uniqueValues(players, 'season')
  const positionOrder = [
  'Doelman',
  'Verdediger',
  'Middenvelder',
  'Spits',
]

const availablePositions =
  uniqueValues(players, 'position')

const positions = positionOrder.filter(
  (position) =>
    availablePositions.includes(position),
)
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
           <tr id="players-head-row">
             ${tableColumns.map((column) => `
                  <th
                    data-column-key="${column.key}"
                    class="${column.key === 'points' ? 'is-active-sort' : ''}"
                  >
                    ${column.label}
                    ${column.key === 'points'
                      ? '<span class="sort-indicator">↓</span>'
                      : ''}
                  </th>
                `).join('')}
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

const fantasySortKeys =
  new Set([
    'fvtFantasyScore',
    'captainScore',
    'differentialScore',
    'budgetScore',
    'bonusScore',
    'longTermScore',
    'transferScore',
  ])

const FANTASY_SCORE_CACHE_VERSION =
  'fantasy-profile-v1'

function getFantasyScoreStorageKey(
  season,
) {
  return [
    'fantasy-studio',
    FANTASY_SCORE_CACHE_VERSION,
    season,
  ].join('::')
}

function readFantasyScoreStorage(
  season,
) {
  try {
    const raw =
      localStorage.getItem(
        getFantasyScoreStorageKey(
          season,
        ),
      )

    if (!raw) {
      return {}
    }

    const parsed =
      JSON.parse(raw)

    return (
  parsed?.scores &&
  typeof parsed.scores === 'object'
    ? parsed.scores
    : {}
)
  } catch (error) {
    console.warn(
      'Fantasy-scorecache kon niet worden gelezen.',
      error,
    )

    return {}
  }
}

function writeFantasyScoreStorage(
  season,
  scoreMap,
) {
  try {
    const storedScores = {}

    scoreMap.forEach(
      (scores, key) => {
        if (
          key.startsWith(
            `${season}::`,
          )
        ) {
          storedScores[key] =
            scores
        }
      },
    )

    localStorage.setItem(
      getFantasyScoreStorageKey(
        season,
      ),
      JSON.stringify({
        savedAt:
          new Date().toISOString(),

        scores:
          storedScores,
      }),
    )
  } catch (error) {
    console.warn(
      'Fantasy-scorecache kon niet worden opgeslagen.',
      error,
    )
  }
}

function createExpectedProjectionControl() {
  const control =
    document.createElement(
      'div',
    )

  control.className =
    'player-expected-projection-control'

  control.hidden = true

  control.innerHTML = safeHtml(`
    <div class="player-schedule-controls">
      <div>
        <span>
          Aantal speelrondes
        </span>

        <div class="player-schedule-count-buttons">
          ${Array.from(
            {
              length: 10,
            },
            (
              _,
              index,
            ) => {
              const roundCount =
                index + 1

              return `
                <button
                  type="button"
                  class="
                    player-schedule-count
                    ${
                      roundCount ===
                      expectedProjectionRounds
                        ? 'active'
                        : ''
                    }
                  "
                  data-expected-projection-rounds="${roundCount}"
                  aria-label="
                    Projectie over
                    ${roundCount}
                    speelronde${
                      roundCount === 1
                        ? ''
                        : 's'
                    }
                  "
                >
                  ${roundCount}
                </button>
              `
            },
          ).join('')}
        </div>
      </div>
    </div>
  `)

  return control
}

export function getPlayerDetailProfile({
  playerId,
  season,
} = {}) {
  const normalizedId =
    String(playerId ?? '').trim()

  const normalizedSeason =
    String(season ?? '').trim()

  return getPlayerProfiles()
    .map(
      enrichPlayerWithMatchStats,
    )
    .find(
      (player) =>
        String(
          player?.id ?? '',
        ).trim() ===
          normalizedId &&
        (
          !normalizedSeason ||
          String(
            player?.season ?? '',
          ).trim() ===
            normalizedSeason
        ),
    ) ?? null
}

function renderElitePlayerProfile(player) {
  const cohorts = [1000, 100, 10].map(cohort => selectEliteView(getElitePlayerStats(), { season: player?.season, cohort }).find(row => String(row.playerId) === String(player?.id))).filter(Boolean)
  if (!cohorts.length) return '<div class="intel-empty">Nog geen Topmanager-data voor deze speler.</div>'
  const round = Math.max(...cohorts.map(row => row.gameweek)), statuses = getChipUsage().filter(row => row.season === player?.season && row.round === round).map(row => row.status), status = statuses.includes('Lopend') ? 'Lopend' : statuses.includes('Definitief') ? 'Definitief' : 'Locked', top100 = cohorts.find(row => row.cohort === 100), transfer = getEliteTransfers().find(row => row.season === player?.season && row.gameweek === round && row.cohort === 100 && String(row.playerId) === String(player?.id))
  return `<section class="fantasy-profile-section elite-profile"><div class="fantasy-profile-section-heading"><div><span class="eyebrow">Topmanagers</span><h3>Snapshot SR${round} · ${status}</h3></div></div><h4>Actueel · selectie en markt</h4><div class="elite-profile-grid"><article><small>Algemene markt</small><strong>${Number.isFinite(Number(player?.ownership)) ? `${Number(player.ownership).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%` : '—'}</strong></article>${cohorts.map(row => `<article><small>Top ${row.cohort} gekozen</small><strong>${formatEliteMetric(row.selected, row.validTeams)}</strong>${row.cohort===100&&row.eliteGapPercentagePoints!==null?`<span>${row.eliteGapPercentagePoints>0?'+':''}${formatDecimal(row.eliteGapPercentagePoints)} pp tegenover markt</span>`:''}</article>`).join('')}${transfer?`<article><small>Top 100 transfers</small><strong>${transfer.netTransfers>0?'+':''}${transfer.netTransfers} netto</strong><span>${transfer.boughtCount} gekocht · ${transfer.soldCount} verkocht · ${transfer.comparisonManagers} gemeenschappelijke managers</span></article>`:''}</div><h4>Locked terugblik · deadline SR${round}</h4>${top100?`<div class="elite-profile-grid"><article><small>Basis</small><strong>${formatEliteMetric(top100.starter,top100.validTeams)}</strong></article><article><small>Bank</small><strong>${formatEliteMetric(top100.bench,top100.validTeams)}</strong></article><article><small>Captain</small><strong>${formatEliteMetric(top100.captain,top100.validTeams)}</strong></article><article><small>Vice-captain</small><strong>${formatEliteMetric(top100.vice,top100.validTeams)}</strong></article></div>`:''}<p class="elite-profile-note">Bezit en historische opstelling zijn verschillende signalen. Captaincy voorspelt niet automatisch de volgende ronde.</p></section>`
}

export function renderPlayerDetailProfile(
  player,
  activeTab = 'overview',
  scheduleState = {},
) {
  return renderDetail(
    player,
    activeTab,
    scheduleState,
  )
}

let pendingPlayerSelection =
  null

export function setPlayersScreenSelection({
  season,
  playerId,
} = {}) {
  pendingPlayerSelection = {
    season:
      String(
        season ?? '',
      ).trim(),

    playerId:
      String(
        playerId ?? '',
      ).trim(),
  }
}

export function mountPlayersScreen() {
    const players =
  getAllPlayerProfiles()
    .map(
      enrichPlayerWithMatchStats,
    )

  function applyEliteRows(season, cohort) {
    const eliteByPlayer = createElitePlayerLookup(getElitePlayerStats(), { season, cohort })
    players.forEach(player => {
      const row = player.season === season ? eliteByPlayer.get(String(player.id)) : null
      player.eliteSelectedPct = row?.selected.percentage ?? null
      player.eliteSelectedCount = row?.selected.count ?? null
      player.eliteStarterPct = row?.starter.percentage ?? null
      player.eliteStarterCount = row?.starter.count ?? null
      player.eliteCaptainPct = row?.captain.percentage ?? null
      player.eliteCaptainCount = row?.captain.count ?? null
      player.eliteGapPct = row?.eliteGapPercentagePoints ?? null
      player.eliteValidTeams = row?.validTeams ?? null
      player.eliteRound = row?.gameweek ?? null
    })
  }

  const seasons = uniqueValues(players, 'season')

const fantasyScoreCache =
  new Map()

  seasons.forEach(
  (season) => {
    const storedScores =
      readFantasyScoreStorage(
        season,
      )

    Object.entries(
      storedScores,
    ).forEach(
      ([key, scores]) => {
        fantasyScoreCache.set(
          key,
          scores,
        )

        const player =
          players.find(
            (candidate) =>
              getPlayerSeasonKey(
                candidate,
              ) === key,
          )

        if (player) {
          Object.assign(
            player,
            scores,
          )
        }
      },
    )
  },
)

let fantasyScoresLoading =
  false

function waitForNextBatch() {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        0,
      )
    },
  )
}

async function ensureFantasyScores(
  targetSeason,
) {
  if (fantasyScoresLoading) {
    return
  }

  const seasonPlayers =
    players.filter(
      (player) =>
        player.season ===
        targetSeason,
    )

  /*
   * De scores worden tegenwoordig al tijdens
   * de databasesynchronisatie berekend.
   *
   * Wanneer alle zeven scores aanwezig zijn,
   * hoeft de spelerspagina niets opnieuw
   * te berekenen.
   */
  const fantasyScoreKeys = [
    'fvtFantasyScore',
    'captainScore',
    'differentialScore',
    'budgetScore',
    'bonusScore',
    'longTermScore',
    'transferScore',
  ]

  const hasPrecomputedScores =
    seasonPlayers.every(
      (player) =>
        fantasyScoreKeys.every(
          (key) =>
            player[key] !== null &&
            player[key] !== undefined &&
            Number.isFinite(
              Number(
                player[key],
              ),
            ),
        ),
    )

  if (hasPrecomputedScores) {
    return
  }

  const missingPlayers =
    seasonPlayers.filter(
      (player) =>
        !fantasyScoreCache.has(
          getPlayerSeasonKey(
            player,
          ),
        ),
    )

  if (!missingPlayers.length) {
    return
  }

  fantasyScoresLoading = true
  sort.disabled = true

  const originalLabel =
    count.textContent

  try {
    const batchSize = 8

    for (
      let index = 0;
      index < missingPlayers.length;
      index += batchSize
    ) {
      const batch =
        missingPlayers.slice(
          index,
          index + batchSize,
        )

      batch.forEach(
        (player) => {
          const key =
            getPlayerSeasonKey(
              player,
            )

          const scores =
            enrichPlayerWithFantasyScores(
              player,
              seasonPlayers,
            )

          fantasyScoreCache.set(
            key,
            scores,
          )

          Object.assign(
            player,
            scores,
          )
        },
      )

      count.textContent =
        `${Math.min(
          index + batchSize,
          missingPlayers.length,
        )}/${missingPlayers.length}`

            await waitForNextBatch()
    }

    writeFantasyScoreStorage(
      targetSeason,
      fantasyScoreCache,
    )
  } finally {
    fantasyScoresLoading = false
    sort.disabled = false
    count.textContent =
      originalLabel
  }
}

  const state = {
  search: '',
  season: seasons.at(-1) || '',
  position: '',
  club: '',

  activeColumnGroup:
    'fantasy',

  eliteCohort: 100,

  sortBy:
    'points',

  direction:
    'desc',

  selectedPlayerKey:
    null,

  detailTab:
  'overview',

fixtureStartRound:
  getPlayerFixtureStartRound(),

fixtureCount:
  5,

  selectedScheduleFixtureId:
  null,
}

  if (
    pendingPlayerSelection
      ?.playerId
  ) {
    if (
      pendingPlayerSelection
        .season
    ) {
      state.season =
        pendingPlayerSelection
          .season
    }

    state.selectedPlayerKey =
      `${state.season}::${
        pendingPlayerSelection
          .playerId
      }`

    state.detailTab =
      'overview'

    state.search = ''
    state.position = ''
    state.club = ''

    pendingPlayerSelection =
      null
  }

  const body = document.querySelector('#players-body')
  const headRow = document.querySelector('#players-head-row')
  const tableWrap = document.querySelector('.players-table-wrap')
  const detail = document.querySelector('#player-detail')
  const count = document.querySelector('#player-result-count')
  const search = document.querySelector('#player-search')
  const season = document.querySelector('#player-season')
  const position = document.querySelector('#player-position')
  const club = document.querySelector('#player-club')
  const sort = document.querySelector('#player-sort')
  const direction = document.querySelector('#player-direction')

const columnGroupControl =
  document.createElement(
    'div',
  )

columnGroupControl.className =
  'player-column-groups'

columnGroupControl.setAttribute(
  'aria-label',
  'Kolomgroepen',
)

columnGroupControl.innerHTML =
  safeHtml(Object
    .entries(
      playerColumnGroups,
    )
    .map(
      ([
        key,
        group,
      ]) => `
        <button
          type="button"
          class="
            player-column-group
            ${
              key ===
              state.activeColumnGroup
                ? 'active'
                : ''
            }
          "
          data-player-column-group="${key}"
        >
          <span aria-hidden="true">
            ${group.icon}
          </span>

          ${group.label}
        </button>
      `,
    )
    .join(''))

const expectedProjectionControl =
  createExpectedProjectionControl()

const eliteCohortControl = document.createElement('label')
eliteCohortControl.className = 'player-elite-cohort'
eliteCohortControl.innerHTML = safeHtml(`<span>Topmanager-cohort</span><select data-player-elite-cohort><option value="1">#1</option>${ELITE_COHORTS.map(size => `<option value="${size}" ${size === state.eliteCohort ? 'selected' : ''}>Top ${size}</option>`).join('')}</select><small data-player-elite-round>Laatste publiek beschikbare locked ronde</small>`)

tableWrap.prepend(
  columnGroupControl,
  expectedProjectionControl,
  eliteCohortControl,
)

function updateEliteCohortControl() {
  eliteCohortControl.hidden = !isEliteCohortControlVisible(state.activeColumnGroup)
  const latestRound = Math.max(0, ...players.filter(player => player.season === state.season).map(player => Number(player.eliteRound) || 0))
  const statuses = getChipUsage().filter(row => row.season === state.season && row.round === latestRound).map(row => row.status)
  const status = statuses.includes('Lopend') ? 'Lopend' : statuses.includes('Definitief') ? 'Definitief' : 'Locked'
  eliteCohortControl.querySelector('[data-player-elite-round]').textContent = latestRound ? `SR${latestRound} · ${status}` : 'Geen locked ronde beschikbaar'
  tableColumns.forEach(column => {
    if (!['eliteSelectedPct', 'eliteStarterPct', 'eliteCaptainPct'].includes(column.key)) return
    const metric = column.key === 'eliteSelectedPct' ? 'gekozen' : column.key === 'eliteStarterPct' ? 'basis' : 'captain'
    column.label = `${state.eliteCohort === 1 ? '#1' : `Top ${state.eliteCohort}`} ${metric}`
  })
}

updateEliteCohortControl()
eliteCohortControl.querySelector('[data-player-elite-cohort]').addEventListener('change', event => {
  state.eliteCohort = Number(event.target.value)
  applyEliteRows(state.season, state.eliteCohort)
  updateEliteCohortControl()
  render()
})

/*
 * De periodekeuze verschijnt alleen
 * binnen de tab Verwachting.
 */
function updateExpectedProjectionControl() {
  expectedProjectionControl.hidden =
  state.activeColumnGroup !==
  'expectation'

  expectedProjectionControl
    .querySelectorAll(
      '[data-expected-projection-rounds]',
    )
    .forEach(
      (button) => {
        button.classList.toggle(
          'active',
          Number(
            button.dataset
              .expectedProjectionRounds,
          ) ===
            expectedProjectionRounds,
        )
      },
    )
}

expectedProjectionControl
  .querySelectorAll(
    '[data-expected-projection-rounds]',
  )
  .forEach(
    (button) => {
      button.addEventListener(
        'click',
        () => {
          const nextRoundCount =
            Number(
              button.dataset
                .expectedProjectionRounds,
            )

          if (
            !Number.isInteger(
              nextRoundCount,
            ) ||
            nextRoundCount < 1 ||
            nextRoundCount > 10 ||
            nextRoundCount ===
              expectedProjectionRounds
          ) {
            return
          }

          expectedProjectionRounds =
            nextRoundCount

          updateExpectedProjectionControl()

          /*
           * render() berekent de tabel opnieuw.
           * Daardoor veranderen ook de
           * ranglijst en de sortering direct.
           */
          render()
        },
      )
    },
  )

/*
 * De bestaande tabknoppen veranderen
 * state.activeColumnGroup zelf al.
 *
 * Deze extra listener zorgt alleen dat
 * de periodekeuze wordt getoond of verborgen.
 */
columnGroupControl.addEventListener(
  'click',
  (event) => {
    const button =
      event.target.closest(
        '[data-player-column-group]',
      )

    if (!button) {
      return
    }

    requestAnimationFrame(
      () => {
        updateExpectedProjectionControl()
      },
    )
  },
)

updateExpectedProjectionControl()

season.value = state.season

  function filteredPlayers() {
  const query =
    state.search
      .trim()
      .toLowerCase()

  function getSortValue(
    player,
  ) {
    /*
     * De Verwachting-kolommen moeten
     * dezelfde dynamische projectie
     * gebruiken als de zichtbare tabel.
     */
    if (
      state.sortBy ===
        'expectedPoints' ||
      state.sortBy ===
        'expectedPointsPerRound' ||
      state.sortBy ===
        'expectedMinutes'
    ) {
      const projection =
        getProjectionForRounds(
          player,
        )

      return (
        projection[
          state.sortBy
        ] ?? null
      )
    }

    return (
      player[state.sortBy] ??
      null
    )
  }

  return players
    .filter(
      (player) =>
        !state.season ||
        player.season ===
          state.season,
    )
    .filter(
      (player) =>
        !state.position ||
        player.position ===
          state.position,
    )
    .filter(
      (player) =>
        !state.club ||
        player.club ===
          state.club,
    )
    .filter(
      (player) => {
        if (!query) {
          return true
        }

        return (
          player.name
            .toLowerCase()
            .includes(query) ||
          player.club
            .toLowerCase()
            .includes(query)
        )
      },
    )
    .sort(
      (
        leftPlayer,
        rightPlayer,
      ) => {
        const left =
          getSortValue(
            leftPlayer,
          )

        const right =
          getSortValue(
            rightPlayer,
          )

        if (left === null || left === undefined) return right === null || right === undefined ? leftPlayer.name.localeCompare(rightPlayer.name, 'nl') : 1
        if (right === null || right === undefined) return -1

        if (
          typeof left ===
            'string' ||
          typeof right ===
            'string'
        ) {
          const leftText =
            String(left)

          const rightText =
            String(right)

          return (
            state.direction ===
              'asc'
              ? leftText.localeCompare(
                  rightText,
                  'nl',
                )
              : rightText.localeCompare(
                  leftText,
                  'nl',
                )
          )
        }

        const leftNumber =
          Number(left)

        const rightNumber =
          Number(right)

        const safeLeft =
          Number.isFinite(
            leftNumber,
          )
            ? leftNumber
            : -Infinity

        const safeRight =
          Number.isFinite(
            rightNumber,
          )
            ? rightNumber
            : -Infinity

        return (
          state.direction ===
            'asc'
            ? safeLeft -
              safeRight
            : safeRight -
              safeLeft
        )
      },
    )
}

  function scrollToActiveColumn(behavior = 'smooth') {
    const header = document.querySelector(
      `.players-table th[data-column-key="${state.sortBy}"]`,
    )

    if (!header || !tableWrap) return

    const stickyWidth = 431
    const targetLeft = Math.max(0, header.offsetLeft - stickyWidth - 24)

    tableWrap.scrollTo({
      left: targetLeft,
      behavior,
    })
  }

  function render() {
  const list = filteredPlayers()

  const activeGroup =
  playerColumnGroups[
    state.activeColumnGroup
  ] ??
  playerColumnGroups.fantasy

const activeColumnKeys =
  new Set([
    ...fixedPlayerColumnKeys,
    ...activeGroup.columns,
  ])

const visibleColumns =
  tableColumns.filter(
    (column) => {
      if (
        !activeColumnKeys.has(
          column.key,
        )
      ) {
        return false
      }

      /*
       * Zonder positiefilter tonen we alle
       * kolommen binnen de gekozen groep.
       *
       * Zodra bijvoorbeeld 'Doelman' is
       * geselecteerd, gelden de bestaande
       * visibleFor-regels.
       */
      if (
        column.visibleFor &&
        state.position &&
        !column.visibleFor.includes(
          state.position,
        )
      ) {
        return false
      }

      return true
    },
  )

  count.textContent = list.length

  if (
  !state.selectedPlayerKey ||
  !list.some(
    (player) =>
      getPlayerSeasonKey(player) ===
      state.selectedPlayerKey,
  )
) {
  state.selectedPlayerKey =
    list[0]
      ? getPlayerSeasonKey(list[0])
      : null
}

  headRow.innerHTML = safeHtml(visibleColumns
  .map(
    (column) => `
      <th
        data-column-key="${column.key}"
        class="${
          column.key === state.sortBy
            ? 'is-active-sort'
            : ''
        }"
      >
        <span class="player-column-heading">
          <span>
            ${column.label}
          </span>

          ${
            column.tooltip
              ? `
                <span
                  class="player-column-tooltip"
                  tabindex="0"
                  aria-label="${column.tooltip}"
                >
                  <span
                    class="player-column-tooltip-icon"
                    aria-hidden="true"
                  >
                    ?
                  </span>

                  <span
                    class="player-column-tooltip-content"
                    role="tooltip"
                  >
                    <strong>
                      ${column.label}
                    </strong>

                    <span>
                      ${column.tooltip}
                    </span>
                  </span>
                </span>
              `
              : ''
          }

          ${
            column.key === state.sortBy
              ? `
                  <span class="sort-indicator">
                    ${
                      state.direction === 'desc'
                        ? '↓'
                        : '↑'
                    }
                  </span>
                `
              : ''
          }
        </span>
      </th>
    `,
  )
  .join(''))

  body.innerHTML = safeHtml(list.length
    ? list
        .map(
          (player, index) => `
            <tr
              data-player-key="${getPlayerSeasonKey(player)}"
              class="${
                getPlayerSeasonKey(player) ===
state.selectedPlayerKey
                  ? 'selected'
                  : ''
              }"
            >
              ${visibleColumns
                .map(
                  (column) => `
                    <td
                      data-column-key="${column.key}"
                      class="${
                        column.key === state.sortBy
                          ? 'is-active-sort'
                          : ''
                      }"
                    >
                      ${formatTableValue(
                        player,
                        column.key,
                        index,
                      )}
                    </td>
                  `,
                )
                .join('')}
            </tr>
          `,
        )
        .join('')
    : `
        <tr>
          <td colspan="${visibleColumns.length}">
            <div class="table-empty">
              Geen spelers gevonden met deze filters.
            </div>
          </td>
        </tr>
      `)

  const selected = players.find(
  (player) =>
    getPlayerSeasonKey(player) ===
    state.selectedPlayerKey,
)

  detail.innerHTML = safeHtml(renderDetail(
  selected,
  state.detailTab,
  {
    startRound:
      state.fixtureStartRound,

    count:
      state.fixtureCount,

    selectedFixtureId:
      state.selectedScheduleFixtureId,
  },
))

detail
  .querySelectorAll(
    '[data-player-detail-tab]',
  )
  .forEach((tab) => {
    tab.addEventListener(
      'click',
      () => {
        state.detailTab =
  tab.dataset.playerDetailTab

if (
  state.detailTab !==
  'schedule'
) {
  state
    .selectedScheduleFixtureId =
    null
}

render()
      },
    )
  })

  detail
  .querySelectorAll(
    '[data-player-fixture-count]',
  )
  .forEach(
    (button) => {
      button.addEventListener(
        'click',
        () => {
          state.fixtureCount =
            Number(
              button.dataset
                .playerFixtureCount,
            ) || 5

          state
            .selectedScheduleFixtureId =
            null

          render()
        },
      )
    },
  )

detail
  .querySelectorAll(
    '[data-player-schedule-fixture-id]',
  )
  .forEach(
    (button) => {
      button.addEventListener(
        'click',
        () => {
          state
            .selectedScheduleFixtureId =
            button.dataset
              .playerScheduleFixtureId

          render()

          requestAnimationFrame(
            () => {
              detail
                .querySelector(
                  '.player-schedule-detail',
                )
                ?.scrollIntoView({
                  behavior:
                    'smooth',

                  block:
                    'start',
                })
            },
          )
        },
      )
    },
  )

detail
  .querySelector(
    '[data-player-schedule-close]',
  )
  ?.addEventListener(
    'click',
    () => {
      state
        .selectedScheduleFixtureId =
        null

      render()
    },
  )

columnGroupControl
  .querySelectorAll(
    '[data-player-column-group]',
  )
  .forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset
        .playerColumnGroup ===
        state.activeColumnGroup,
    )
  })

  columnGroupControl
  .querySelectorAll(
    '[data-player-column-group]',
  )
  .forEach((button) => {
    button.addEventListener(
  'click',
  async () => {
    const groupKey =
      button.dataset
        .playerColumnGroup

    const nextGroup =
      playerColumnGroups[
        groupKey
      ]

    if (
      !nextGroup ||
      groupKey ===
        state.activeColumnGroup
    ) {
      return
    }

    state.activeColumnGroup =
      groupKey

    updateEliteCohortControl()

    state.sortBy =
      nextGroup.defaultSort

    state.direction =
      'desc'

    sort.value =
      state.sortBy

    direction.dataset.direction =
      state.direction

    direction.textContent =
      'Hoog → laag'

    /*
     * Fantasy Profiel gebruikt berekende
     * scores. Die moeten eerst beschikbaar
     * zijn voordat de tabel wordt getoond.
     */
    if (
      fantasySortKeys.has(
        state.sortBy,
      )
    ) {
      await ensureFantasyScores(
        state.season,
      )
    }

    render()

    requestAnimationFrame(
      () => {
        scrollToActiveColumn(
          'auto',
        )
      },
    )
  },
)
  })

document
  .querySelectorAll(
    '.player-column-tooltip',
  )
  .forEach((tooltip) => {
    tooltip.addEventListener(
      'click',
      (event) => {
        event.stopPropagation()
      },
    )
  })

  document
    .querySelectorAll(
      '.players-table th[data-column-key]',
    )
    .forEach((header) => {
      header.addEventListener('click', () => {
        const columnKey =
          header.dataset.columnKey

        if (
          !columnKey ||
          columnKey === 'rank'
        ) {
          return
        }

        if (state.sortBy === columnKey) {
          state.direction =
            state.direction === 'desc'
              ? 'asc'
              : 'desc'
        } else {
          state.sortBy = columnKey
          state.direction = 'desc'
        }

        sort.value = state.sortBy
        direction.dataset.direction =
          state.direction

        direction.textContent =
          state.direction === 'desc'
            ? 'Hoog → laag'
            : 'Laag → hoog'

        render()

        requestAnimationFrame(() => {
          scrollToActiveColumn()
        })
      })
    })

  document
  .querySelectorAll('[data-player-key]')
    .forEach((row) => {
      row.addEventListener('click', () => {
  state.selectedPlayerKey =
  row.dataset.playerKey

state.detailTab =
  'overview'

state.selectedScheduleFixtureId =
  null

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
    applyEliteRows(state.season, state.eliteCohort)
    state.selectedPlayerKey = null
    render()
  })

  position.addEventListener('change', () => {
    state.position = position.value
    state.selectedPlayerKey = null
    render()
  })

  club.addEventListener('change', () => {
    state.club = club.value
    state.selectedPlayerKey = null
    render()
  })

  sort.addEventListener(
  'change',
  async () => {
    state.sortBy =
      sort.value

    if (
      fantasySortKeys.has(
        state.sortBy,
      )
    ) {
      await ensureFantasyScores(
        state.season,
      )
    }

    render()

    requestAnimationFrame(
      () => {
        scrollToActiveColumn()
      },
    )
  },
)

  direction.addEventListener('click', () => {
    state.direction =
      state.direction === 'desc' ? 'asc' : 'desc'

    direction.dataset.direction = state.direction
    direction.textContent =
      state.direction === 'desc'
        ? 'Hoog → laag'
        : 'Laag → hoog'

    render()

    requestAnimationFrame(() => {
      scrollToActiveColumn('auto')
    })
  })

  applyEliteRows(state.season, state.eliteCohort)

  render()

  requestAnimationFrame(() => {
    scrollToActiveColumn('auto')
  })
}
