import {
  players as fallbackPlayers,
} from '../data/players.js'

import {
  fixtures as fallbackFixtures,
} from '../data/fixtures.js'

import { fetchSheet, hasPublishedSheet } from './googleSheets.js'
import { normalizeChipUsage, normalizeEliteClubExposure, normalizeEliteFormation, normalizeElitePlayerStat, normalizeEliteTransfer } from './eliteManagerIntelligence.js'
import { normalizeTransferClubOverview, normalizeTransferRow } from './transferDeadlineData.js'
import { normalizeEuropeanFixture } from './europeanFixtureContext.js'
import { TRANSFER_DEADLINE_ENABLED } from '../constants/featureFlags.js'

import { calculateFantasyLabels } from '../fantasy/fantasyLabelEngine.js'

import {
  buildPlayerModel,
} from '../domain/playerModel.js'

import {
  createPlayerHistorySummary,
  createPreviousSeasonStats,
  findPlayerHistory,
  findPreviousSeasonPlayer,
} from './playerHistory.js'

import {
  calculateExperience,
} from './experienceEngine.js'

import {
  calculateDataConfidence,
} from './dataConfidenceEngine.js'

import {
  precomputeFantasyScores,
} from './fantasyScorePrecompute.js'

import {
  calculatePlayerMatchProfile,
} from './playerMatchStatsEngine.js'

import {
  loadDatabaseCache,
  saveDatabaseCache,
} from './databaseStorage.js'

let database = {
  players: [],
  historicalPlayers: [],
  fixtures: [],
  europeanFixtures: [],
  teamRatings: [],
  results: [],
  playerMetadata: [],
  playerMatchStats: [],
  elitePlayerStats: [],
  eliteTransfers: [],
  eliteSyncControl: [],
  chipUsage: [],
  eliteFormations: [],
  eliteClubExposure: [],
  transferDeadline: [],
  transferClubOverview: [],
}

let syncStatus = {
  source: 'Lokaal',
  lastSync: null,
  message: 'Lokale reservegegevens actief',
  state: 'local',
}

function cleanText(value) {
  return String(value ?? '').trim()
}

function cleanNumber(value) {
  const text = cleanText(value)
    .replace('€', '')
    .replace('%', '')
    .replace(/\s/g, '')
    .replace(',', '.')

  if (!text) {
    return null
  }

  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function cleanBoolean(
  value,
) {
  if (
    value === true ||
    value === 1
  ) {
    return true
  }

  const normalized =
    cleanText(
      value,
    )
      .toLowerCase()

  return [
    'true',
    'waar',
    'ja',
    'yes',
    '1',
  ].includes(
    normalized,
  )
}

function cleanPercentage(value) {
  const text = cleanText(value)

  if (!text) {
    return null
  }

  const hasPercentSign =
    text.includes('%')

  const number = cleanNumber(text)

  if (!Number.isFinite(number)) {
    return null
  }

  /*
   * Google Sheets kan 100% in CSV
   * aanleveren als 1.
   *
   * Daarom:
   * 1 wordt 100
   * 0,75 wordt 75
   *
   * Staat er letterlijk 100%,
   * dan blijft het gewoon 100.
   */
  if (
    !hasPercentSign &&
    number >= 0 &&
    number <= 1
  ) {
    return number * 100
  }

  return Math.max(
    0,
    Math.min(100, number),
  )
}

function normalizeDate(value) {
  const text = cleanText(value)

  if (!text) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text
  }

  const dutchDate = text.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/,
  )

  if (dutchDate) {
    const [, day, month, year] = dutchDate

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const excelSerial = Number(text)

  if (
    Number.isFinite(excelSerial) &&
    excelSerial > 20000 &&
    excelSerial < 80000
  ) {
    const date = new Date(
      Date.UTC(1899, 11, 30),
    )

    date.setUTCDate(
      date.getUTCDate() + excelSerial,
    )

    return date.toISOString().slice(0, 10)
  }

  const parsedDate = new Date(text)

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10)
  }

  return text
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function firstValue(record, names) {
  for (const name of names) {
    if (record[name] !== undefined && cleanText(record[name]) !== '') {
      return record[name]
    }
  }

  return ''
}

function mapPlayer(
  record,
  index,
) {
  const name =
    cleanText(
      firstValue(
        record,
        [
          'Speler',
          'Naam',
          'Player',
        ],
      ),
    )

  return {
    id:
      cleanText(
        firstValue(
          record,
          [
            'PlayerID',
            'playerId',
            'Player ID',
            'Speler ID',
            'Speler_ID',
            'ID',
          ],
        ),
      ) ||
      `${slugify(name)}-${index + 1}`,

    name,

    season:
      cleanText(
        firstValue(
          record,
          [
            'Seizoen',
            'Season',
          ],
        ),
      ),

    position:
      cleanText(
        firstValue(
          record,
          [
            'Positie',
            'Position',
          ],
        ),
      ),

    club:
      cleanText(
        firstValue(
          record,
          [
            'Club',
            'Team',
          ],
        ),
      ),

    xG:
      cleanNumber(
        firstValue(
          record,
          [
            'xG',
            'Expected Goals',
          ],
        ),
      ) ?? 0,

    xA:
      cleanNumber(
        firstValue(
          record,
          [
            'xA',
            'Expected Assists',
          ],
        ),
      ) ?? 0,

    startPrice:
      cleanNumber(
        firstValue(
          record,
          [
            'Beginprijs',
            'Startprijs',
          ],
        ),
      ),

    endPrice:
      cleanNumber(
        firstValue(
          record,
          [
            'Eindprijs',
            'Huidige prijs',
          ],
        ),
      ),

    valueDevelopment:
      cleanNumber(
        firstValue(
          record,
          [
            'Waardeontwikkeling',
          ],
        ),
      ),

    selectedPct:
      cleanNumber(
        firstValue(
          record,
          [
            'Gespeeld',
            'Gespeeld %',
            'Gekozen %',
          ],
        ),
      ),

    cornersTaken:
      cleanNumber(
        firstValue(
          record,
          [
            'Corners genomen',
            'Corners Taken',
          ],
        ),
      ) ?? 0,

    /*
     * Actuele wedstrijdstatistieken
     * komen niet langer uit SPELERS.
     *
     * PLAYER_MATCH_STATS is daarvoor
     * de centrale bron.
     */
    points: 0,
    saves: 0,
    savePoints: 0,
    penaltiesSaved: 0,
    optaBonus: 0,
    goals: 0,
    assists: 0,
    minutes: 0,
    minutePoints: 0,
    cleanSheets: 0,
    cleanSheetPoints: 0,
    goalsAgainst: 0,
    goalsAgainstMinus: 0,
    yellowCards: 0,
    redCards: 0,
    penaltiesMissed: 0,
  }
}

function mapHistoricalPlayer(
  record,
  index,
) {
  const name = cleanText(
    firstValue(
      record,
      [
        'Speler',
        'Naam',
        'Player',
      ],
    ),
  )

  return {
    id:
      cleanText(
        firstValue(
          record,
          [
            'PlayerID',
            'playerId',
            'Player ID',
            'Speler ID',
            'Speler_ID',
            'ID',
          ],
        ),
      ) ||
      `${slugify(name)}-${index + 1}`,

    name,

    season:
      cleanText(
        firstValue(
          record,
          [
            'Seizoen',
            'Season',
          ],
        ),
      ),

    position:
      cleanText(
        firstValue(
          record,
          [
            'Positie',
            'Position',
          ],
        ),
      ),

    club:
      cleanText(
        firstValue(
          record,
          [
            'Club',
            'Team',
          ],
        ),
      ),

    xG:
      cleanNumber(
        firstValue(
          record,
          ['xG'],
        ),
      ) ?? 0,

    xA:
      cleanNumber(
        firstValue(
          record,
          ['xA'],
        ),
      ) ?? 0,

    startPrice:
      cleanNumber(
        firstValue(
          record,
          [
            'Beginprijs',
            'Startprijs',
          ],
        ),
      ),

    endPrice:
      cleanNumber(
        firstValue(
          record,
          [
            'Eindprijs',
            'Huidige prijs',
          ],
        ),
      ),

    valueDevelopment:
      cleanNumber(
        firstValue(
          record,
          ['Waardeontwikkeling'],
        ),
      ),

    selectedPct:
      cleanNumber(
        firstValue(
          record,
          [
            'Gespeeld',
            'Gespeeld %',
            'Gekozen %',
          ],
        ),
      ),

    cornersTaken:
      cleanNumber(
        firstValue(
          record,
          [
            'Corners genomen',
            'Corners Taken',
          ],
        ),
      ) ?? 0,

    points:
      cleanNumber(
        firstValue(
          record,
          [
            'Totaal Punten',
            'Punten',
          ],
        ),
      ) ?? 0,

    saves:
      cleanNumber(
        firstValue(
          record,
          ['Reddingen'],
        ),
      ) ?? 0,

    savePoints:
      cleanNumber(
        firstValue(
          record,
          ['Punten voor reddingen'],
        ),
      ) ?? 0,

    penaltiesSaved:
      cleanNumber(
        firstValue(
          record,
          ['Strafschoppen gestopt'],
        ),
      ) ?? 0,

    optaBonus:
      cleanNumber(
        firstValue(
          record,
          [
            'Bonuspunten namens OPTA',
            'OPTA Bonuspunt',
            'OPTA Bonuspunten',
          ],
        ),
      ) ?? 0,

    goals:
      cleanNumber(
        firstValue(
          record,
          [
            'Doelpunten',
            'Goals',
          ],
        ),
      ) ?? 0,

    assists:
      cleanNumber(
        firstValue(
          record,
          ['Assists'],
        ),
      ) ?? 0,

    minutes:
      cleanNumber(
        firstValue(
          record,
          ['Gespeelde minuten'],
        ),
      ) ?? 0,

    minutePoints:
      cleanNumber(
        firstValue(
          record,
          ['Punten voor gespeelde minuten'],
        ),
      ) ?? 0,

    cleanSheets:
      cleanNumber(
        firstValue(
          record,
          [
            'Cleansheets',
            'Clean sheets',
          ],
        ),
      ) ?? 0,

    cleanSheetPoints:
      cleanNumber(
        firstValue(
          record,
          ['Punten voor cleansheets'],
        ),
      ) ?? 0,

    goalsAgainst:
      cleanNumber(
        firstValue(
          record,
          ['Tegendoelpunten'],
        ),
      ) ?? 0,

    goalsAgainstMinus:
      cleanNumber(
        firstValue(
          record,
          ['Minpunten voor tegendoelpunten'],
        ),
      ) ?? 0,

    yellowCards:
      cleanNumber(
        firstValue(
          record,
          ['Gele kaarten'],
        ),
      ) ?? 0,

    redCards:
      cleanNumber(
        firstValue(
          record,
          ['Rode kaarten'],
        ),
      ) ?? 0,

    penaltiesMissed:
      cleanNumber(
        firstValue(
          record,
          ['Strafschoppen gemist'],
        ),
      ) ?? 0,
  }
}

function mapPlayerMetadata(record) {
  return {
    playerId: cleanText(
  firstValue(record, [
    'PlayerID',
    'playerId',
    'Player ID',
    'Speler ID',
  ]),
),

    playerName: cleanText(
      firstValue(record, [
        'playerName',
        'Speler',
      ]),
    ),

    fantasyPosition: cleanText(
      firstValue(record, [
        'fantasyPosition',
      ]),
    ),

    roles: cleanText(
      firstValue(record, [
        'roles',
      ]),
    )
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean),

fantasyLabels: cleanText(
  firstValue(record, [
    'fantasyLabels',
    'labels',
    'fantasyProfile',
  ]),
)
  .split(',')
  .map((label) =>
    label.trim().toLowerCase(),
  )
  .filter(Boolean),

fantasyLabelMode: cleanText(
  firstValue(record, [
    'fantasyLabelMode',
    'labelMode',
  ]),
)
  .trim()
  .toLowerCase(),

    status: cleanText(
      firstValue(record, [
        'status',
      ]),
    ),

    chanceOfPlaying: cleanPercentage(
  firstValue(record, [
    'chanceOfPlaying',
    'chanceofPlaying',
  ]),
),

    expectedMinutes: cleanNumber(
      firstValue(record, [
        'expectedMinutes',
      ]),
    ),

    expectedRole: cleanText(
  firstValue(record, [
    'expectedRole',
    'Expected Role',
    'Verwachte rol',
  ]),
),

expectedStarter:
  cleanText(
    firstValue(record, [
      'expectedStarter',
      'Expected Starter',
      'Verwachte basisspeler',
    ]),
  ).toUpperCase() === 'TRUE',

rotationRisk:
  cleanText(
    firstValue(record, [
      'rotationRisk',
      'Rotation Risk',
      'Rotatierisico',
    ]),
  ).toUpperCase() === 'TRUE',

injuryRisk:
  cleanText(
    firstValue(record, [
      'injuryRisk',
      'Injury Risk',
      'Blessurerisico',
    ]),
  ).toUpperCase() === 'TRUE',

premiumSigning:
  cleanText(
    firstValue(record, [
      'premiumSigning',
      'Premium Signing',
      'Dure aankoop',
    ]),
  ).toUpperCase() === 'TRUE',

newLeague:
  cleanText(
    firstValue(record, [
      'newLeague',
      'New League',
      'Nieuwe competitie',
    ]),
  ).toUpperCase() === 'TRUE',

manualPotential: cleanNumber(
  firstValue(record, [
    'manualPotential',
    'Manual Potential',
    'Handmatige potentie',
  ]),
),

manualAvailability: cleanNumber(
  firstValue(record, [
    'manualAvailability',
    'Manual Availability',
    'Handmatige speelzekerheid',
  ]),
),

manualRisk: cleanNumber(
  firstValue(record, [
    'manualRisk',
    'Manual Risk',
    'Handmatig risico',
  ]),
),

dataConfidence: cleanText(
  firstValue(record, [
    'dataConfidence',
    'Data Confidence',
    'Databetrouwbaarheid',
  ]),
)
  .trim()
  .toLowerCase(),

    penalties:
      cleanText(
        firstValue(record, [
          'penalties',
        ]),
      ) === 'TRUE',

    corners:
      cleanText(
        firstValue(record, [
          'corners',
        ]),
      ) === 'TRUE',

    freeKicks:
      cleanText(
        firstValue(record, [
          'freeKicks',
        ]),
      ) === 'TRUE',

    notes: cleanText(
      firstValue(record, [
        'notes',
      ]),
    ),

    lastUpdated: cleanText(
      firstValue(record, [
        'lastUpdated',
      ]),
    ),
  }
}

function mapPlayerMatchStat(
  record,
  index,
) {
  const playerId =
    cleanText(
      firstValue(
        record,
        [
          'Speler ID',
          'Speler_ID',
          'PlayerId',
          'Player ID',
        ],
      ),
    )

  const season =
    cleanText(
      firstValue(
        record,
        [
          'Seizoen',
          'Season',
        ],
      ),
    )

  const round =
    cleanNumber(
      firstValue(
        record,
        [
          'Gameweek',
          'Speelronde',
          'Round',
        ],
      ),
    ) ??
    0

  const fixtureId =
    cleanText(
      firstValue(
        record,
        [
          'FixtureId',
          'Fixture ID',
          'Wedstrijd ID',
        ],
      ),
    )

  return {
    id:
      [
        season,
        round,
        fixtureId,
        playerId,
      ]
        .filter(Boolean)
        .join('-') ||
      `player-match-stat-${index + 1}`,

    playerId,

    playerName:
      cleanText(
        firstValue(
          record,
          [
            'Speler',
            'Naam',
            'Player',
          ],
        ),
      ),

    season,

    round,

    fixtureId,

    matchStatus:
  cleanBoolean(
    firstValue(
      record,
      [
        'Matchstatus',
        'Match Status',
        'MatchStatus',
        'Finished',
        'Played',
      ],
    ),
  ),

    status:
      cleanText(
        firstValue(
          record,
          [
            'Status',
          ],
        ),
      ),

    minutes:
      cleanNumber(
        firstValue(
          record,
          [
            'Minutes',
            'Minuten',
          ],
        ),
      ) ??
      0,

    goals:
      cleanNumber(
        firstValue(
          record,
          [
            'Goals',
            'Doelpunten',
          ],
        ),
      ) ??
      0,

    assists:
      cleanNumber(
        firstValue(
          record,
          [
            'Assists',
          ],
        ),
      ) ??
      0,

    optaBonus:
      cleanNumber(
        firstValue(
          record,
          [
            'OptaBonus',
            'OPTA Bonus',
          ],
        ),
      ) ??
      0,

    cleanSheet:
      cleanBoolean(
        firstValue(
          record,
          [
            'CleanSheet',
            'Clean sheet',
          ],
        ),
      ),

    goalsConceded:
      cleanNumber(
        firstValue(
          record,
          [
            'GoalsConceded',
            'Tegendoelpunten',
          ],
        ),
      ) ??
      0,

    saves:
      cleanNumber(
        firstValue(
          record,
          [
            'Saves',
            'Reddingen',
          ],
        ),
      ) ??
      0,

    penaltiesSaved:
      cleanNumber(
        firstValue(
          record,
          [
            'PenaltiesSaved',
            'Strafschoppen gestopt',
          ],
        ),
      ) ??
      0,

    penaltiesMissed:
      cleanNumber(
        firstValue(
          record,
          [
            'PenaltyMissed',
            'PenaltiesMissed',
            'Strafschoppen gemist',
          ],
        ),
      ) ??
      0,

    ownGoals:
      cleanNumber(
        firstValue(
          record,
          [
            'OwnGoals',
            'Eigen doelpunten',
          ],
        ),
      ) ??
      0,

    yellowCards:
      cleanNumber(
        firstValue(
          record,
          [
            'YellowCards',
            'Gele kaarten',
          ],
        ),
      ) ??
      0,

    redCards:
      cleanNumber(
        firstValue(
          record,
          [
            'RedCards',
            'Rode kaarten',
          ],
        ),
      ) ??
      0,

    notes:
      cleanText(
        firstValue(
          record,
          [
            'Notitie',
            'Notes',
            'Opmerking',
          ],
        ),
      ),
  }
}

function normalizeFantasyLabelMode(value) {
  const mode = cleanText(value)
    .trim()
    .toLowerCase()

  if (
    mode === 'auto' ||
    mode === 'merge'
  ) {
    return mode
  }

  return 'manual'
}

function uniqueFantasyLabels(labels) {
  return [
    ...new Set(
      labels
        .map((label) =>
          cleanText(label)
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ]
}

/*
 * Hier komt later de automatische labelberekening.
 *
 * Voorlopig geven we bewust een lege lijst terug,
 * omdat handmatige labels leidend zijn zolang het
 * nieuwe seizoen nog niet begonnen is.
 */

function getAutomaticFantasyLabels(
  player,
  metadata,
) {
  return calculateFantasyLabels({
    ...player,

    fantasyPosition:
      metadata?.fantasyPosition ||
      player.position ||
      '',

    roles:
      metadata?.roles || [],

    status:
      metadata?.status || '',

    chanceOfPlaying:
      metadata?.chanceOfPlaying ??
      null,

    expectedMinutes:
      metadata?.expectedMinutes ??
      null,

    penalties:
      metadata?.penalties ??
      false,

    corners:
      metadata?.corners ??
      false,

    freeKicks:
      metadata?.freeKicks ??
      false,
  })
}

function resolveFantasyLabels({
  mode,
  manualLabels = [],
  automaticLabels = [],
}) {
  const normalizedMode =
    normalizeFantasyLabelMode(mode)

  const normalizedManual =
    uniqueFantasyLabels(
      manualLabels,
    )

  const normalizedAutomatic =
    uniqueFantasyLabels(
      automaticLabels,
    )

  if (normalizedMode === 'auto') {
    return normalizedAutomatic
  }

  if (normalizedMode === 'merge') {
    return uniqueFantasyLabels([
      ...normalizedManual,
      ...normalizedAutomatic,
    ])
  }

  return normalizedManual
}

function mapFixture(record, index) {
  const manualHome = cleanNumber(
    firstValue(record, ['Moeilijkheid_thuis_handmatig']),
  )
  const manualAway = cleanNumber(
    firstValue(record, ['Moeilijkheid_uit_handmatig']),
  )
  const autoHome = cleanNumber(
    firstValue(record, ['Moeilijkheid_thuis_auto']),
  )
  const autoAway = cleanNumber(
    firstValue(record, ['Moeilijkheid_uit_auto']),
  )

  return {
    id:
      cleanText(firstValue(record, ['ID'])) ||
      `wedstrijd-${index + 1}`,
    season: cleanText(firstValue(record, ['Seizoen'])),
    round:
      cleanNumber(firstValue(record, ['Speelronde'])) ?? 0,
    date: normalizeDate(
  firstValue(record, ['Datum']),
),
    time: cleanText(firstValue(record, ['Tijd'])),
    status: cleanText(firstValue(record, ['Status', 'Wedstrijdstatus'])),
    stadium: cleanText(firstValue(record, ['Stadion', 'Stadium'])),
    dateLabel: cleanText(
      firstValue(record, ['Datum/periode', 'Datum periode']),
    ),
    home: cleanText(firstValue(record, ['Thuisclub'])),
    away: cleanText(firstValue(record, ['Uitclub'])),
    manualHome,
    manualAway,
    autoHome,
    autoAway,
    difficultyHome:
      manualHome ??
      cleanNumber(
        firstValue(record, ['Moeilijkheid_thuis_definitief']),
      ) ??
      autoHome ??
      3,
    difficultyAway:
      manualAway ??
      cleanNumber(
        firstValue(record, ['Moeilijkheid_uit_definitief']),
      ) ??
      autoAway ??
      3,
    note: cleanText(firstValue(record, ['Opmerking'])),
  }
}

function mapTeamRating(record) {
  return {
    club: cleanText(
      firstValue(record, [
        'Club',
        'Unnamed: 1',
      ]),
    ),

    attack: cleanNumber(
      firstValue(record, [
        'Aanval',
        'Unnamed: 2',
      ]),
    ),

    midfield: cleanNumber(
      firstValue(record, [
        'Middenveld',
        'Unnamed: 3',
      ]),
    ),

    defense: cleanNumber(
      firstValue(record, [
        'Verdediging',
        'Unnamed: 4',
      ]),
    ),

    coach: cleanNumber(
      firstValue(record, [
        'Coach',
        'Unnamed: 5',
      ]),
    ),

    form: cleanNumber(
      firstValue(record, [
        'Vorm',
        'Unnamed: 6',
      ]),
    ),

    homeAdvantage: cleanNumber(
      firstValue(record, [
        'Thuisvoordeel',
        'Unnamed: 7',
      ]),
    ),

    weightedStrength: cleanNumber(
  firstValue(record, [
    'Gewogen_teamsterkte',
    'Gewogen Teamsterkte',
    'Gewogen teamsterkte',
    'gewogen_teamsterkte',
    'Teamsterkte',
    'Unnamed: 8',
    'Unnamed: 7',
  ]),
),
  }
}

function mapResult(record, index) {
  return {
    id:
      cleanText(firstValue(record, ['ID'])) ||
      `historisch-${index + 1}`,

    season: cleanText(
      firstValue(record, ['Seizoen', 'Season']),
    ),

    date: normalizeDate(
  firstValue(record, ['Datum', 'Date']),
    ),

    round: cleanNumber(
      firstValue(record, ['Speelronde', 'Round']),
    ),

    home: cleanText(
      firstValue(record, [
        'Thuisclub',
        'Thuis',
        'Home',
      ]),
    ),

    away: cleanText(
      firstValue(record, [
        'Uitclub',
        'Uit',
        'Away',
      ]),
    ),

    homeScore: cleanNumber(
      firstValue(record, [
        'Thuisscore',
        'Thuisdoelpunten',
      ]),
    ),

    awayScore: cleanNumber(
      firstValue(record, [
        'Uitscore',
        'Uitdoelpunten',
      ]),
    ),

    competition:
      cleanText(
        firstValue(record, ['Competitie']),
      ) || 'Eredivisie',
  }
}

async function saveCache() {
  await saveDatabaseCache({
    database,
    syncStatus,
  })
}

async function loadCache() {
  try {
    const cached =
      await loadDatabaseCache()

    const cachedDatabase =
      cached?.database ??
      null

    const cachedStatus =
      cached?.syncStatus ??
      null

    if (
      cachedDatabase?.players?.length &&
      cachedDatabase?.fixtures?.length
    ) {
      database = {
        ...cachedDatabase,

        historicalPlayers:
  cachedDatabase.historicalPlayers ??
  [],

        results:
          cachedDatabase.results ??
          [],

        playerMetadata:
          cachedDatabase.playerMetadata ??
          [],

        playerMatchStats:
          cachedDatabase.playerMatchStats ??
          [],

        europeanFixtures: cachedDatabase.europeanFixtures ?? [],

        elitePlayerStats: cachedDatabase.elitePlayerStats ?? [],
        eliteTransfers: cachedDatabase.eliteTransfers ?? [],
        eliteSyncControl: cachedDatabase.eliteSyncControl ?? [],
        chipUsage: cachedDatabase.chipUsage ?? [],
        eliteFormations: cachedDatabase.eliteFormations ?? [],
        eliteClubExposure: cachedDatabase.eliteClubExposure ?? [],
        transferDeadline: cachedDatabase.transferDeadline ?? [],
        transferClubOverview: cachedDatabase.transferClubOverview ?? [],
      }
    }

    if (cachedDatabase?.transferDeadline?.length) {
      database = {
        ...database,
        transferDeadline: cachedDatabase.transferDeadline,
        transferClubOverview: cachedDatabase.transferClubOverview ?? [],
      }
    }

    if (cachedStatus) {
      syncStatus =
        cachedStatus
    }
  } catch (error) {
    console.warn(
      'Lokale databasecache kon niet uit IndexedDB worden gelezen.',
      error,
    )
  }
}

export async function initializeDatabase() {
  // Authentication completes before main.js initializes the reference layer.
  // Dynamic import keeps pure domain tests independent from browser configuration.
  if (typeof window !== 'undefined') {
    try {
      const { loadReferenceData } = await import('../platform/referenceData.js')
      const cloud = await loadReferenceData()
      if (cloud?.database?.players?.length) {
        database = { ...database, ...cloud.database }
        syncStatus = cloud.syncStatus
        await saveCache()
        return
      }
    } catch {
      // Shared reference cache is an offline fallback, never a private user store.
    }
  }
  await loadCache()

  if (!database.players.length || !database.fixtures.length) {
    try { await synchronizeDatabase(); return } catch {
      syncStatus = { source: 'Geen data', lastSync: null, state: 'error', message: 'Voetbaldata kon niet laden. Probeer Synchroniseren opnieuw.' }
    }
  }

  // Oudere IndexedDB-caches bevatten dit later toegevoegde, optionele tabblad
  // nog niet. Laad alleen die lichte presentatiedataset zodat Europa-context
  // direct na een update zichtbaar is zonder een volledige handmatige sync.
  if (!getEuropeanFixtures().length && hasPublishedSheet('EUROPE_2026_27')) {
    try {
      const europeanRows = await fetchSheet('EUROPE_2026_27')
      database = {
        ...database,
        europeanFixtures: europeanRows.map(normalizeEuropeanFixture).filter(Boolean),
      }
      await saveCache()
    } catch (error) {
      console.warn('Europese programma-context kon bij het starten niet worden aangevuld.', error)
    }
  }
}

export function getPlayers() {
  return database.players
}

export function getHistoricalPlayers() {
  return Array.isArray(
    database.historicalPlayers,
  )
    ? database.historicalPlayers
    : []
}

export function getFixtures() {
  return database.fixtures
}

// Afzonderlijke presentation-only dataset. Nooit samenvoegen met getFixtures().
export function getEuropeanFixtures() {
  return Array.isArray(database.europeanFixtures) ? database.europeanFixtures : []
}

export function getTeamRatings() {
  return database.teamRatings
}

export function getResults() {
  return database.results
}

export function getElitePlayerStats() {
  return Array.isArray(database.elitePlayerStats) ? database.elitePlayerStats : []
}

export function getEliteTransfers() {
  return Array.isArray(database.eliteTransfers) ? database.eliteTransfers : []
}

export function getEliteSyncControl() {
  return Array.isArray(database.eliteSyncControl) ? database.eliteSyncControl : []
}

export function getChipUsage() {
  return Array.isArray(database.chipUsage) ? database.chipUsage : []
}

export function getEliteFormations() { return Array.isArray(database.eliteFormations) ? database.eliteFormations : [] }
export function getEliteClubExposure() { return Array.isArray(database.eliteClubExposure) ? database.eliteClubExposure : [] }
export function getTransferDeadlineRows() { return Array.isArray(database.transferDeadline) ? database.transferDeadline : [] }
export function getTransferClubOverview() { return Array.isArray(database.transferClubOverview) ? database.transferClubOverview : [] }

/*
|--------------------------------------------------------------------------
| Spelerswedstrijden
|--------------------------------------------------------------------------
*/

export function getPlayerMatchStats() {
  return Array.isArray(
    database.playerMatchStats,
  )
    ? database.playerMatchStats
    : []
}

export function getPlayerMatchStatsByPlayerId(
  playerId,
  season = '',
) {
  const normalizedPlayerId =
    String(
      playerId ?? '',
    ).trim()

  const normalizedSeason =
    String(
      season ?? '',
    ).trim()

  if (!normalizedPlayerId) {
    return []
  }

  return database
    .playerMatchStats
    .filter(
      (matchStat) =>
        String(
          matchStat.playerId ?? '',
        ).trim() ===
        normalizedPlayerId,
    )
    .filter(
      (matchStat) =>
        !normalizedSeason ||
        matchStat.season ===
          normalizedSeason,
    )
    .sort(
      (left, right) => {
        const roundDifference =
          Number(left.round) -
          Number(right.round)

        if (roundDifference !== 0) {
          return roundDifference
        }

        return String(
          left.fixtureId ?? '',
        ).localeCompare(
          String(
            right.fixtureId ?? '',
          ),
        )
      },
    )
}

export function getPlayerMatchStat({
  playerId,
  season,
  round,
  fixtureId,
}) {
  return (
    database
      .playerMatchStats
      .find(
        (matchStat) =>
          String(
            matchStat.playerId ?? '',
          ).trim() ===
            String(
              playerId ?? '',
            ).trim() &&
          matchStat.season ===
            season &&
          Number(
            matchStat.round,
          ) ===
            Number(round) &&
          String(
            matchStat.fixtureId ?? '',
          ).trim() ===
            String(
              fixtureId ?? '',
            ).trim(),
      ) ??
    null
  )
}

export function getSyncStatus() {
  return syncStatus
}

export function getDatabaseSummary() {
  const players =
    Array.isArray(database.players)
      ? database.players
      : []

      const historicalPlayers =
  Array.isArray(
    database.historicalPlayers,
  )
    ? database.historicalPlayers
    : []

  const fixtures =
    Array.isArray(database.fixtures)
      ? database.fixtures
      : []

  const results =
    Array.isArray(database.results)
      ? database.results
      : []

  const playerMetadata =
    Array.isArray(database.playerMetadata)
      ? database.playerMetadata
      : []

  const playerMatchStats =
    Array.isArray(database.playerMatchStats)
      ? database.playerMatchStats
      : []

  const seasons = [
    ...new Set(
      [
        ...players.map(
          (player) =>
            player.season,
        ),

        ...fixtures.map(
          (fixture) =>
            fixture.season,
        ),
      ].filter(Boolean),
    ),
  ].sort()

  const fixtureSeasons = [
    ...new Set(
      fixtures
        .map(
          (fixture) =>
            fixture.season,
        )
        .filter(Boolean),
    ),
  ].sort()

  const activeSeason =
    fixtureSeasons.at(-1) ||
    seasons.at(-1) ||
    ''

  const seasonFixtures =
    activeSeason
      ? fixtures.filter(
          (fixture) =>
            fixture.season ===
            activeSeason,
        )
      : fixtures

  const fixtureClubs =
    new Set(
      seasonFixtures
        .flatMap(
          (fixture) => [
            fixture.home,
            fixture.away,
          ],
        )
        .filter(Boolean),
    )

  return {
    players:
      players.length,

      historicalPlayers:
  historicalPlayers.length,

    fixtures:
      seasonFixtures.length,

    europeanFixtures:
      getEuropeanFixtures().length,

    clubs:
      fixtureClubs.size,

    seasons,

    activeSeason,

    results:
      results.length,

    playerMetadata:
      playerMetadata.length,

    playerMatchStats:
      playerMatchStats.length,
  }
}

export async function synchronizeDatabase() {
  syncStatus = {
    ...syncStatus,
    message: 'Synchroniseren…',
    state: 'loading',
  }

  let transferSnapshot = null

  // Start independent published-sheet requests together. Each settles before
  // consumption so optional failures cannot become unhandled rejections.
  const names = ['SPELERS','SPELERS_HISTORIE','WEDSTRIJDEN','TEAM_RATINGS','RESULTS','PLAYER_METADATA','PLAYER_MATCH_STATS','ELITE_PLAYER_STATS','ELITE_TRANSFERS','ELITE_SYNC_CONTROLE','CHIP_GEBRUIK','ELITE_FORMATIONS','ELITE_CLUB_EXPOSURE','EUROPE_2026_27', ...(TRANSFER_DEADLINE_ENABLED ? ['TRANSFERS_2026_27','TRANSFER_CLUB_OVERVIEW'] : [])]
  const requests = new Map(names.filter(hasPublishedSheet).map(name => [name, fetchSheet(name).then(value => ({ value }), error => ({ error }))]))
  const loadSheet = async name => { const result = await requests.get(name); if (result?.error) throw result.error; return result?.value ?? [] }

  try {
if (TRANSFER_DEADLINE_ENABLED) {
  const transferRows = await loadSheet('TRANSFERS_2026_27')
  let transferOverviewRows = []
  try {
    transferOverviewRows = await loadSheet('TRANSFER_CLUB_OVERVIEW')
  } catch (error) {
    console.warn('TRANSFER_CLUB_OVERVIEW is niet beschikbaar; clubtotalen worden uit transfers opgebouwd.', error)
  }
  transferSnapshot = {
    transferDeadline: transferRows.map(normalizeTransferRow).filter(Boolean),
    transferClubOverview: transferOverviewRows.map(normalizeTransferClubOverview).filter(Boolean),
  }
}

const playerRows =
  await loadSheet(
    'SPELERS',
  )

  const historicalPlayerRows =
  await loadSheet(
    'SPELERS_HISTORIE',
  )

const fixtureRows =
  await loadSheet(
    'WEDSTRIJDEN',
  )

const ratingRows =
  await loadSheet(
    'TEAM_RATINGS',
  )

const resultRows =
  await loadSheet(
    'RESULTS',
  )

const metadataRows =
  await loadSheet(
    'PLAYER_METADATA',
  )

const playerMatchStatRows =
  await loadSheet(
    'PLAYER_MATCH_STATS',
  )

const optionalEliteRows = {}
for (const sheetName of ['ELITE_PLAYER_STATS', 'ELITE_TRANSFERS', 'ELITE_SYNC_CONTROLE', 'CHIP_GEBRUIK', 'ELITE_FORMATIONS', 'ELITE_CLUB_EXPOSURE']) {
  if (!hasPublishedSheet(sheetName)) {
    optionalEliteRows[sheetName] = []
    continue
  }
  try {
    optionalEliteRows[sheetName] = await loadSheet(sheetName)
  } catch (error) {
    console.warn(`${sheetName} is niet beschikbaar; bestaande Fantasy Studio-data blijft bruikbaar.`, error)
    optionalEliteRows[sheetName] = []
  }
}

let europeanRows = null
try {
  europeanRows = hasPublishedSheet('EUROPE_2026_27') ? await loadSheet('EUROPE_2026_27') : []
} catch (error) {
  console.warn('EUROPE_2026_27 is niet beschikbaar; bestaande Europese context blijft actief.', error)
}

    const players = playerRows
      .map(mapPlayer)
      .filter((player) => player.name && player.season)

      const historicalPlayers =
  historicalPlayerRows
    .map(mapHistoricalPlayer)
    .filter(
      (player) =>
        player.name &&
        player.season,
    )

    const fixtures = fixtureRows
      .map(mapFixture)
      .filter(
        (fixture) =>
          fixture.home &&
          fixture.away &&
          fixture.round >= 1 &&
          fixture.round <= 34,
      )

    const teamRatings = ratingRows
  .map(mapTeamRating)
  .filter((rating) => rating.club && rating.club !== 'Club')

const results = resultRows
  .map(mapResult)
  .filter(
    (result) =>
      result.season &&
      result.date &&
      result.home &&
      result.away &&
      Number.isFinite(result.homeScore) &&
      Number.isFinite(result.awayScore),
  )
  .sort((left, right) =>
    left.date.localeCompare(right.date),
  )

  const playerMetadata = metadataRows
  .map(mapPlayerMetadata)
  .filter(
    (player) =>
      player.playerId &&
      player.playerName,
  )

  const playerMatchStats =
  playerMatchStatRows
    .map(
      mapPlayerMatchStat,
    )
    .filter(
      (matchStat) =>
        matchStat.playerId &&
        matchStat.season &&
        matchStat.round >= 1 &&
        matchStat.fixtureId,
    )

  const elitePlayerStats = optionalEliteRows.ELITE_PLAYER_STATS.map(normalizeElitePlayerStat).filter(Boolean)
  const eliteTransfers = optionalEliteRows.ELITE_TRANSFERS.map(normalizeEliteTransfer).filter(Boolean)
  const eliteSyncControl = optionalEliteRows.ELITE_SYNC_CONTROLE
  const chipUsage = optionalEliteRows.CHIP_GEBRUIK.map(normalizeChipUsage).filter(Boolean)
  const eliteFormations = optionalEliteRows.ELITE_FORMATIONS.map(normalizeEliteFormation).filter(Boolean)
  const eliteClubExposure = optionalEliteRows.ELITE_CLUB_EXPOSURE.map(normalizeEliteClubExposure).filter(Boolean)
  const transferDeadline = TRANSFER_DEADLINE_ENABLED
    ? transferSnapshot?.transferDeadline ?? getTransferDeadlineRows()
    : database.transferDeadline
  const transferClubOverview = TRANSFER_DEADLINE_ENABLED
    ? transferSnapshot?.transferClubOverview?.length ? transferSnapshot.transferClubOverview : getTransferClubOverview()
    : database.transferClubOverview
  const europeanFixtures = europeanRows === null ? getEuropeanFixtures() : europeanRows.map(normalizeEuropeanFixture).filter(Boolean)

    if (!players.length) {
      throw new Error('Tabblad SPELERS bevat geen bruikbare spelers.')
    }

    if (!fixtures.length) {
      throw new Error(
        'Tabblad WEDSTRIJDEN bevat geen bruikbare wedstrijden.',
      )
    }

if (!results.length) {
  throw new Error(
    'Tabblad RESULTS bevat geen bruikbare historische uitslagen.',
  )
}

    database = {
  players,
  historicalPlayers,
  fixtures,
  europeanFixtures,
  teamRatings,
  results,
  playerMetadata,
  playerMatchStats,
  elitePlayerStats,
  eliteTransfers,
  eliteSyncControl,
  chipUsage,
  eliteFormations,
  eliteClubExposure,
  transferDeadline,
  transferClubOverview,
}

const profiles =
  getPlayerProfiles()

database.players =
  await precomputeFantasyScores({
    profiles,

    rawPlayers:
      players,

    fixtures:
      database.fixtures,

    results:
      database.results,

    teamRatings:
      database.teamRatings,

    activeSeason:
      getDatabaseSummary()
        .activeSeason,
  })

    syncStatus = {
      source: 'Google Sheets',
      lastSync: new Date().toISOString(),
      message:
  `${players.length} spelers, ` +
  `${historicalPlayers.length} historische spelers, ` +
  `${fixtures.length} wedstrijden, ` +
  `${europeanFixtures.length} Europese contextwedstrijden, ` +
  `${results.length} historische uitslagen, ` +
  `${playerMetadata.length} metadatarecords en ` +
  `${playerMatchStats.length} spelerswedstrijden bijgewerkt`,
      state: 'success',
    }

    const { publishReferenceData } = await import('../platform/referenceData.js')
    await saveCache()
    try { await publishReferenceData(database) }
    catch {
      syncStatus = { ...syncStatus, state: 'warning', message: 'Voetbaldata geladen. Publiceren naar Studio Cloud is niet gelukt; probeer Synchroniseren opnieuw.' }
    }

    window.dispatchEvent(
      new CustomEvent('fantasy-database-updated'),
    )

    return {
  ...getDatabaseSummary(),
  ratings: teamRatings.length,
  metadata: playerMetadata.length,
  matchStats: playerMatchStats.length,
}
  } catch (error) {
    if (transferSnapshot?.transferDeadline?.length) {
      database = {
        ...database,
        transferDeadline: transferSnapshot.transferDeadline,
        transferClubOverview: transferSnapshot.transferClubOverview,
      }
      try {
        await saveCache()
      } catch (cacheError) {
        console.warn('Transferdata kon niet gedeeltelijk in de lokale cache worden opgeslagen.', cacheError)
      }
    }
    syncStatus = {
      ...syncStatus,
      message: error.message || 'Synchronisatie mislukt.',
      state: 'error',
    }

    throw error
  }
}

export function getPlayerMetadata() {
  return database.playerMetadata
}
export function getEnrichedPlayers() {
  const metadataById = new Map(
    database.playerMetadata
      .filter((metadata) => metadata.playerId)
      .map((metadata) => [
        String(metadata.playerId).trim(),
        metadata,
      ]),
  )

  const metadataNameGroups =
  new Map()

for (
  const metadata of
  database.playerMetadata
) {
  if (!metadata.playerName) {
    continue
  }

  const nameKey =
    slugify(
      metadata.playerName,
    )

  const current =
    metadataNameGroups.get(
      nameKey,
    ) || []

  current.push(
    metadata,
  )

  metadataNameGroups.set(
    nameKey,
    current,
  )
}

const metadataByName =
  new Map(
    [...metadataNameGroups]
      .filter(
        ([, records]) =>
          records.length === 1,
      )
      .map(
        ([nameKey, records]) => [
          nameKey,
          records[0],
        ],
      ),
  )

  return database.players.map((player) => {
  const metadata =
    metadataById.get(
      String(player.id).trim(),
    ) ||
    metadataByName.get(
      slugify(player.name),
    ) ||
    null

    const pointsPer90 =
  Number(player.minutes) > 0
    ? (
        Number(player.points) /
        Number(player.minutes)
      ) * 90
    : null

const currentPrice =
  Number(player.endPrice) > 0
    ? Number(player.endPrice)
    : Number(player.startPrice)

const pointsPerMillion =
  currentPrice > 0
    ? Number(player.points) /
      currentPrice
    : null

    const fantasyLabelMode =
  normalizeFantasyLabelMode(
    metadata?.fantasyLabelMode,
  )

const manualFantasyLabels =
  uniqueFantasyLabels(
    metadata?.fantasyLabels || [],
  )

const automaticFantasyLabels =
  getAutomaticFantasyLabels(
    player,
    metadata,
  )

const fantasyLabels =
  resolveFantasyLabels({
    mode: fantasyLabelMode,
    manualLabels:
      manualFantasyLabels,
    automaticLabels:
      automaticFantasyLabels,
  })

  return {
    ...player,

pointsPer90,

pointsPerMillion,

      metadataAvailable:
        Boolean(metadata),

      fantasyPosition:
        metadata?.fantasyPosition ||
        player.position ||
        '',

      roles:
        metadata?.roles || [],

        fantasyLabelMode,

manualFantasyLabels,

automaticFantasyLabels,

fantasyLabels,

      status:
        metadata?.status || '',

      chanceOfPlaying:
        metadata?.chanceOfPlaying ??
        null,

      expectedMinutes:
        metadata?.expectedMinutes ??
        null,

        expectedRole:
  metadata?.expectedRole ||
  'unknown',

expectedStarter:
  metadata?.expectedStarter ??
  null,

rotationRisk:
  metadata?.rotationRisk ??
  false,

injuryRisk:
  metadata?.injuryRisk ??
  false,

premiumSigning:
  metadata?.premiumSigning ??
  false,

newLeague:
  metadata?.newLeague ??
  false,

manualPotential:
  metadata?.manualPotential ??
  null,

manualAvailability:
  metadata?.manualAvailability ??
  null,

manualRisk:
  metadata?.manualRisk ??
  null,

dataConfidence:
  metadata?.dataConfidence ||
  '',

  scoutProfile: {
  expectedRole:
    metadata?.expectedRole ||
    'unknown',

  expectedStarter:
  metadata?.expectedStarter ??
  null,

  rotationRisk:
    metadata?.rotationRisk ??
    false,

  injuryRisk:
    metadata?.injuryRisk ??
    false,

  premiumSigning:
    metadata?.premiumSigning ??
    false,

  newLeague:
    metadata?.newLeague ??
    false,

  penalties:
    metadata?.penalties ??
    false,

  corners:
    metadata?.corners ??
    false,

  freeKicks:
  metadata?.freeKicks ??
  false,

status:
  metadata?.status ||
  '',

chanceOfPlaying:
  metadata?.chanceOfPlaying ??
  null,

expectedMinutes:
  metadata?.expectedMinutes ??
  null,

confidence:
  metadata?.dataConfidence ||
  '',

  overrides: {
    potential:
      metadata?.manualPotential ??
      null,

    availability:
      metadata?.manualAvailability ??
      null,

    risk:
      metadata?.manualRisk ??
      null,
  },
},

      penalties:
        metadata?.penalties ??
        false,

      corners:
        metadata?.corners ??
        false,

      freeKicks:
        metadata?.freeKicks ??
        false,

      metadataNotes:
        metadata?.notes || '',

      metadataLastUpdated:
        metadata?.lastUpdated || '',
    }
  })
}

export function getHistoricalPlayerProfiles() {
  const historicalPlayers =
    getHistoricalPlayers()

  const historySource = [
    ...historicalPlayers,
    ...getEnrichedPlayers(),
  ]

  return historicalPlayers.map(
    (player) => {
      const history =
        createPlayerHistorySummary(
          historySource,
          player,
        )

      const experience =
        calculateExperience(
          history,
        )

      const confidence =
        calculateDataConfidence({
          player,
          history,
          experience,
        })

      const minutes =
        Number(player.minutes) || 0

      const points =
        Number(player.points) || 0

      const goals =
        Number(player.goals) || 0

      const assists =
        Number(player.assists) || 0

      const saves =
        Number(player.saves) || 0

      const historicalMatchProfile = {
        wedstrijden: [],

        recenteWedstrijden: [],

        statistieken: {
          minuten:
            minutes,

          goals:
            goals,

          assists:
            assists,

          reddingen:
            saves,

          cleanSheets:
            Number(
              player.cleanSheets,
            ) || 0,

          optaBonus:
            Number(
              player.optaBonus,
            ) || 0,

          penaltiesGestopt:
            Number(
              player.penaltiesSaved,
            ) || 0,

          penaltiesGemist:
            Number(
              player.penaltiesMissed,
            ) || 0,

          geleKaarten:
            Number(
              player.yellowCards,
            ) || 0,

          rodeKaarten:
            Number(
              player.redCards,
            ) || 0,

          eigenDoelpunten:
            Number(
              player.ownGoals,
            ) || 0,

          gespeeldeWedstrijden:
  null,

basisplaatsen:
  null,

invalbeurten:
  null,
        },

        punten: {
          totaal:
            points,

          reddingen:
            Number(
              player.savePoints,
            ) || 0,
        },

        bijdragen: {},

        gemiddelden: {
          puntenPerWedstrijd:
  null,

puntenPer90:
  minutes > 0
    ? (points / minutes) * 90
    : null,

minutesPerAppearance:
  null,

startPercentage:
  null,
        },
      }

      const profile =
  buildPlayerModel(
    player,
    {
      history,
      experience,
      confidence,

      matchProfile:
        historicalMatchProfile,
    },
  )

return {
  ...profile,

  matches:
    null,

  starts:
    null,

  substituteAppearances:
    null,

  pointsPerMatch:
    null,

  pointsPer90:
    minutes > 0
      ? (points / minutes) * 90
      : null,

  minutesPerAppearance:
    null,

  startPercentage:
    null,
}
    },
  )
}

let profileCache = null
export function getPlayerProfiles() {
  if (profileCache?.database === database && profileCache.players === database.players) return profileCache.profiles
  const profiles = buildPlayerProfiles()
  profileCache = { database, players: database.players, profiles }
  return profiles
}

function buildPlayerProfiles() {
  const enrichedPlayers =
    getEnrichedPlayers()

  return enrichedPlayers.map(
    (player) => {
      const history =
        createPlayerHistorySummary(
          enrichedPlayers,
          player,
        )

      const experience =
        calculateExperience(
          history,
        )

      const confidence =
        calculateDataConfidence({
          player,
          history,
          experience,
        })

      const matchProfile =
  calculatePlayerMatchProfile(
    player,
    {
      season:
        player.season,
    },
  )

const model =
  buildPlayerModel(
    player,
    {
      history,
      experience,
      confidence,
      matchProfile,
    },
  )

return {
  ...model,

  expectedPointsProjection:
    player.expectedPointsProjection,

  expectedPoints:
    player.expectedPoints,

  expectedPointsPerRound:
    player.expectedPointsPerRound,

  projectedExpectedMinutes:
    player.projectedExpectedMinutes,
}
    },
  )
}

export function getAllPlayerProfiles() {
  return [
    ...getPlayerProfiles(),
    ...getHistoricalPlayerProfiles(),
  ]
}

export function getPlayerHistory(
  playerId,
) {
  return findPlayerHistory(
    getPlayerProfiles(),
    playerId,
  )
}

export function getPreviousSeasonPlayer(
  player,
) {
  return findPreviousSeasonPlayer(
    getPlayerProfiles(),
    player,
  )
}

export function getPreviousSeasonStats(
  player,
) {
  return createPreviousSeasonStats(
    getPlayerProfiles(),
    player,
  )
}

export function getPlayerHistorySummary(
  player,
) {
  return createPlayerHistorySummary(
    getPlayerProfiles(),
    player,
  )
}
