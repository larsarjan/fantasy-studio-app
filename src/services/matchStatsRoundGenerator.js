import {
  getEnrichedPlayers,
  getFixtures,
} from './database.js'

/*
|--------------------------------------------------------------------------
| Match Stats Round Generator
|--------------------------------------------------------------------------
|
| Genereert voor één seizoen en speelronde alle invoerregels voor:
|
| PLAYER_MATCH_STATS
|
| De generator:
|
| - zoekt alle wedstrijden van de gekozen speelronde;
| - koppelt iedere actuele speler aan de wedstrijd van zijn club;
| - ondersteunt dubbele speelrondes;
| - vult veilige standaardwaarden in;
| - sorteert de regels per wedstrijd en club;
| - maakt tabgescheiden tekst voor Google Sheets.
|
*/

/*
|--------------------------------------------------------------------------
| Configuratie
|--------------------------------------------------------------------------
*/

const DEFAULT_STATUS =
  'NotSelected'

const MATCH_STATS_COLUMNS = [
  {
    key:
      'playerId',

    label:
      'Speler ID',
  },

  {
    key:
      'playerName',

    label:
      'Speler',
  },

  {
    key:
      'season',

    label:
      'Seizoen',
  },

  {
    key:
      'round',

    label:
      'Gameweek',
  },

  {
    key:
      'fixtureId',

    label:
      'FixtureId',
  },

  {
    key:
      'status',

    label:
      'Status',
  },

  {
    key:
      'minutes',

    label:
      'Minutes',
  },

  {
    key:
      'goals',

    label:
      'Goals',
  },

  {
    key:
      'assists',

    label:
      'Assists',
  },

  {
    key:
      'optaBonus',

    label:
      'OptaBonus',
  },

  {
    key:
      'cleanSheet',

    label:
      'CleanSheet',
  },

  {
    key:
      'goalsConceded',

    label:
      'GoalsConceded',
  },

  {
    key:
      'saves',

    label:
      'Saves',
  },

  {
    key:
      'penaltiesSaved',

    label:
      'PenaltiesSaved',
  },

  {
    key:
      'penaltiesMissed',

    label:
      'PenaltiesMissed',
  },

  {
    key:
      'ownGoals',

    label:
      'OwnGoals',
  },

  {
    key:
      'yellowCards',

    label:
      'YellowCards',
  },

  {
    key:
      'redCards',

    label:
      'RedCards',
  },

  {
    key:
      'notes',

    label:
      'Notitie',
  },
]

/*
|--------------------------------------------------------------------------
| Teksthelpers
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  return String(value ?? '')
    .trim()
}

function normalizeText(value) {
  return cleanText(value)
    .toLocaleLowerCase(
      'nl-NL',
    )
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .replace(
      /\s+/g,
      ' ',
    )
}

function sameValue(
  leftValue,
  rightValue,
) {
  return (
    normalizeText(leftValue) ===
    normalizeText(rightValue)
  )
}

function sameClub(
  leftClub,
  rightClub,
) {
  return sameValue(
    leftClub,
    rightClub,
  )
}

/*
|--------------------------------------------------------------------------
| Getalhelpers
|--------------------------------------------------------------------------
*/

function toInteger(
  value,
  fallback = 0,
) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.trunc(number)
}

/*
|--------------------------------------------------------------------------
| Validatie
|--------------------------------------------------------------------------
*/

function validateGeneratorOptions({
  season,
  round,
}) {
  const errors = []

  if (!cleanText(season)) {
    errors.push(
      'Kies een seizoen.',
    )
  }

  const roundNumber =
    toInteger(
      round,
      0,
    )

  if (
    roundNumber < 1 ||
    roundNumber > 34
  ) {
    errors.push(
      'De speelronde moet tussen 1 en 34 liggen.',
    )
  }

  return {
    valid:
      errors.length === 0,

    errors,

    season:
      cleanText(season),

    round:
      roundNumber,
  }
}

/*
|--------------------------------------------------------------------------
| Data selecteren
|--------------------------------------------------------------------------
*/

function getRoundFixtures({
  fixtures,
  season,
  round,
}) {
  return fixtures
    .filter(
      (fixture) =>
        sameValue(
          fixture.season,
          season,
        ),
    )
    .filter(
      (fixture) =>
        Number(
          fixture.round,
        ) ===
        Number(round),
    )
    .filter(
      (fixture) =>
        fixture.id &&
        fixture.home &&
        fixture.away,
    )
    .sort(
      (left, right) => {
        const dateDifference =
          cleanText(
            left.date,
          ).localeCompare(
            cleanText(
              right.date,
            ),
          )

        if (
          dateDifference !== 0
        ) {
          return dateDifference
        }

        const timeDifference =
          cleanText(
            left.time,
          ).localeCompare(
            cleanText(
              right.time,
            ),
          )

        if (
          timeDifference !== 0
        ) {
          return timeDifference
        }

        return cleanText(
          left.home,
        ).localeCompare(
          cleanText(
            right.home,
          ),
          'nl',
        )
      },
    )
}

function getSeasonPlayers({
  players,
  season,
}) {
  return players
    .filter(
      (player) =>
        sameValue(
          player.season,
          season,
        ),
    )
    .filter(
      (player) =>
        player.id &&
        player.name &&
        player.club,
    )
}

function getFixturePlayers({
  players,
  fixture,
}) {
  return players
    .filter(
      (player) =>
        sameClub(
          player.club,
          fixture.home,
        ) ||
        sameClub(
          player.club,
          fixture.away,
        ),
    )
    .sort(
      (left, right) => {
        const clubDifference =
          cleanText(
            left.club,
          ).localeCompare(
            cleanText(
              right.club,
            ),
            'nl',
          )

        if (
          clubDifference !== 0
        ) {
          return clubDifference
        }

        return cleanText(
          left.name,
        ).localeCompare(
          cleanText(
            right.name,
          ),
          'nl',
        )
      },
    )
}

/*
|--------------------------------------------------------------------------
| Regel bouwen
|--------------------------------------------------------------------------
*/

function createMatchStatsRow({
  player,
  fixture,
}) {
  return {
    playerId:
      cleanText(
        player.id,
      ),

    playerName:
      cleanText(
        player.name,
      ),

    season:
      cleanText(
        fixture.season,
      ),

    round:
      toInteger(
        fixture.round,
        0,
      ),

    fixtureId:
      cleanText(
        fixture.id,
      ),

    status:
      DEFAULT_STATUS,

    minutes:
      0,

    goals:
      0,

    assists:
      0,

    optaBonus:
      0,

    cleanSheet:
      false,

    goalsConceded:
      0,

    saves:
      0,

    penaltiesSaved:
      0,

    penaltiesMissed:
      0,

    ownGoals:
      0,

    yellowCards:
      0,

    redCards:
      0,

    notes:
      '',

    /*
     * Onderstaande context wordt niet naar
     * Google Sheets geëxporteerd.
     *
     * De Studio kan deze gegevens wel gebruiken
     * voor controle, sortering en voorvertoning.
     */

    context: {
      playerClub:
        cleanText(
          player.club,
        ),

      position:
        cleanText(
          player.position,
        ),

      homeClub:
        cleanText(
          fixture.home,
        ),

      awayClub:
        cleanText(
          fixture.away,
        ),

      opponent:
        sameClub(
          player.club,
          fixture.home,
        )
          ? cleanText(
              fixture.away,
            )
          : cleanText(
              fixture.home,
            ),

      venue:
        sameClub(
          player.club,
          fixture.home,
        )
          ? 'home'
          : 'away',

      date:
        cleanText(
          fixture.date,
        ),

      time:
        cleanText(
          fixture.time,
        ),
    },
  }
}

/*
|--------------------------------------------------------------------------
| Dubbele regels voorkomen
|--------------------------------------------------------------------------
*/

function getRowKey(row) {
  return [
    row.season,
    row.round,
    row.fixtureId,
    row.playerId,
  ]
    .map(
      normalizeText,
    )
    .join('::')
}

function removeDuplicateRows(
  rows,
) {
  const uniqueRows =
    new Map()

  rows.forEach(
    (row) => {
      uniqueRows.set(
        getRowKey(row),
        row,
      )
    },
  )

  return [
    ...uniqueRows.values(),
  ]
}

/*
|--------------------------------------------------------------------------
| Sortering
|--------------------------------------------------------------------------
*/

function sortGeneratedRows(
  rows,
) {
  return [
    ...rows,
  ].sort(
    (left, right) => {
      const fixtureDifference =
        cleanText(
          left.fixtureId,
        ).localeCompare(
          cleanText(
            right.fixtureId,
          ),
        )

      if (
        fixtureDifference !== 0
      ) {
        return fixtureDifference
      }

      const clubDifference =
        cleanText(
          left.context
            ?.playerClub,
        ).localeCompare(
          cleanText(
            right.context
              ?.playerClub,
          ),
          'nl',
        )

      if (
        clubDifference !== 0
      ) {
        return clubDifference
      }

      return cleanText(
        left.playerName,
      ).localeCompare(
        cleanText(
          right.playerName,
        ),
        'nl',
      )
    },
  )
}

/*
|--------------------------------------------------------------------------
| Speelronde genereren
|--------------------------------------------------------------------------
*/

function generateMatchStatsRound({
  season,
  round,

  players =
    getEnrichedPlayers(),

  fixtures =
    getFixtures(),
}) {
  const validation =
    validateGeneratorOptions({
      season,
      round,
    })

  if (!validation.valid) {
    return {
      success:
        false,

      errors:
        validation.errors,

      season:
        validation.season,

      round:
        validation.round,

      fixtures:
        [],

      rows:
        [],

      summary: {
        fixtureCount:
          0,

        playerCount:
          0,

        rowCount:
          0,

        clubsWithoutPlayers:
          [],
      },
    }
  }

  const roundFixtures =
    getRoundFixtures({
      fixtures,

      season:
        validation.season,

      round:
        validation.round,
    })

  if (!roundFixtures.length) {
    return {
      success:
        false,

      errors: [
        'Voor deze speelronde zijn geen wedstrijden gevonden.',
      ],

      season:
        validation.season,

      round:
        validation.round,

      fixtures:
        [],

      rows:
        [],

      summary: {
        fixtureCount:
          0,

        playerCount:
          0,

        rowCount:
          0,

        clubsWithoutPlayers:
          [],
      },
    }
  }

  const seasonPlayers =
    getSeasonPlayers({
      players,

      season:
        validation.season,
    })

  const generatedRows = []

  const clubsWithoutPlayers =
    new Set()

  roundFixtures.forEach(
    (fixture) => {
      const fixturePlayers =
        getFixturePlayers({
          players:
            seasonPlayers,

          fixture,
        })

      if (
        !fixturePlayers.some(
          (player) =>
            sameClub(
              player.club,
              fixture.home,
            ),
        )
      ) {
        clubsWithoutPlayers.add(
          fixture.home,
        )
      }

      if (
        !fixturePlayers.some(
          (player) =>
            sameClub(
              player.club,
              fixture.away,
            ),
        )
      ) {
        clubsWithoutPlayers.add(
          fixture.away,
        )
      }

      fixturePlayers.forEach(
        (player) => {
          generatedRows.push(
            createMatchStatsRow({
              player,
              fixture,
            }),
          )
        },
      )
    },
  )

  const rows =
    sortGeneratedRows(
      removeDuplicateRows(
        generatedRows,
      ),
    )

  const uniquePlayers =
    new Set(
      rows.map(
        (row) =>
          row.playerId,
      ),
    )

  return {
    success:
      true,

    errors:
      [],

    season:
      validation.season,

    round:
      validation.round,

    fixtures:
      roundFixtures,

    rows,

    summary: {
      fixtureCount:
        roundFixtures.length,

      playerCount:
        uniquePlayers.size,

      rowCount:
        rows.length,

      clubsWithoutPlayers: [
        ...clubsWithoutPlayers,
      ].sort(
        (left, right) =>
          left.localeCompare(
            right,
            'nl',
          ),
      ),
    },
  }
}

/*
|--------------------------------------------------------------------------
| Google Sheets-uitvoer
|--------------------------------------------------------------------------
*/

function formatCellValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return ''
  }

  if (
    typeof value ===
    'boolean'
  ) {
    return value
      ? 'TRUE'
      : 'FALSE'
  }

  return String(value)
    .replace(
      /\t/g,
      ' ',
    )
    .replace(
      /\r?\n/g,
      ' ',
    )
}

function buildMatchStatsHeaders() {
  return MATCH_STATS_COLUMNS.map(
    (column) =>
      column.label,
  )
}

function buildMatchStatsValues(
  row,
) {
  return MATCH_STATS_COLUMNS.map(
    (column) =>
      formatCellValue(
        row[column.key],
      ),
  )
}

function createMatchStatsTSV({
  rows,
  includeHeaders = false,
}) {
  const dataRows =
    Array.isArray(rows)
      ? rows
      : []

  const output = []

  if (includeHeaders) {
    output.push(
      buildMatchStatsHeaders(),
    )
  }

  dataRows.forEach(
    (row) => {
      output.push(
        buildMatchStatsValues(
          row,
        ),
      )
    },
  )

  return output
    .map(
      (values) =>
        values.join('\t'),
    )
    .join('\n')
}

/*
|--------------------------------------------------------------------------
| Volledige generatie voor Google Sheets
|--------------------------------------------------------------------------
*/

function generateMatchStatsRoundExport({
  season,
  round,
  players,
  fixtures,
  includeHeaders = false,
}) {
  const generation =
    generateMatchStatsRound({
      season,
      round,
      players,
      fixtures,
    })

  return {
    ...generation,

    tsv:
      generation.success
        ? createMatchStatsTSV({
            rows:
              generation.rows,

            includeHeaders,
          })
        : '',
  }
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

export {
  MATCH_STATS_COLUMNS,

  generateMatchStatsRound,
  generateMatchStatsRoundExport,

  createMatchStatsTSV,
  buildMatchStatsHeaders,
}