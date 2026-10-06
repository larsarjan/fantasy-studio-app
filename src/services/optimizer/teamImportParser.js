/*
|--------------------------------------------------------------------------
| Fantasy Studio — Team Import Parser
|--------------------------------------------------------------------------
|
| Zet gekopieerde teamgegevens uit Fantasy Eredivisie om naar
| bruikbare spelersrecords.
|
| Ondersteunt:
|
| - kopiëren vanuit de lijstweergave;
| - eenvoudige herkenning vanuit de opstellingsweergave;
| - naam, club en positie;
| - HP: huidige prijs;
| - VP: verkoopprijs;
| - AP: aankoopprijs;
| - controle op onbekende en dubbele spelers.
|
*/

const POSITION_CODES = {
  KEE: 'goalkeeper',
  VER: 'defender',
  MID: 'midfielder',
  SPI: 'forward',
}

const POSITION_LABELS = {
  goalkeeper: 'Keeper',
  defender: 'Verdediger',
  midfielder: 'Middenvelder',
  forward: 'Spits',
}

/*
|--------------------------------------------------------------------------
| Algemene helpers
|--------------------------------------------------------------------------
*/

function cleanText(
  value,
) {
  return String(
    value ?? '',
  ).trim()
}

function normalizeText(
  value,
) {
  return cleanText(
    value,
  )
    .toLowerCase()
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .replace(
      /[^a-z0-9]+/g,
      ' ',
    )
    .trim()
}

function normalizePosition(
  value,
) {
  const normalized =
    cleanText(
      value,
    ).toUpperCase()

  return (
    POSITION_CODES[
      normalized
    ] ??
    ''
  )
}

function normalizeDatabasePosition(
  value,
) {
  const normalized =
    normalizeText(
      value,
    )

  if (
    [
      'keeper',
      'goalkeeper',
      'kee',
      'doelman',
    ].includes(
      normalized,
    )
  ) {
    return 'goalkeeper'
  }

  if (
    [
      'verdediger',
      'defender',
      'ver',
    ].includes(
      normalized,
    )
  ) {
    return 'defender'
  }

  if (
    [
      'middenvelder',
      'midfielder',
      'mid',
    ].includes(
      normalized,
    )
  ) {
    return 'midfielder'
  }

  if (
    [
      'spits',
      'aanvaller',
      'forward',
      'spi',
    ].includes(
      normalized,
    )
  ) {
    return 'forward'
  }

  return normalized
}

function toNumber(
  value,
  fallback = null,
) {
  const normalized =
    cleanText(
      value,
    )
      .replace(
        '€',
        '',
      )
      .replace(
        ',',
        '.',
      )
      .replace(
        /\s/g,
        '',
      )

  if (
    !normalized
  ) {
    return fallback
  }

  const number =
    Number(
      normalized,
    )

  return Number.isFinite(
    number,
  )
    ? number
    : fallback
}

function isNumericToken(
  value,
) {
  return (
    toNumber(
      value,
      null,
    ) !== null
  )
}

function getPlayerPosition(
  player,
) {
  return normalizeDatabasePosition(
    player?.fantasyPosition ??
    player?.position ??
    '',
  )
}

function getPlayerCurrentPrice(
  player,
) {
  return toNumber(
    player?.currentPrice ??
    player?.endPrice ??
    player?.startPrice ??
    player?.price,
    0,
  )
}

function getPlayerKey(
  player,
) {
  return String(
    player?.id ??
    player?.playerId ??
    [
      player?.name,
      player?.club,
      getPlayerPosition(
        player,
      ),
    ].join('-'),
  )
}

/*
|--------------------------------------------------------------------------
| Invoer opdelen
|--------------------------------------------------------------------------
*/

function createImportLines(
  text,
) {
  return cleanText(
    text,
  )
    .replace(
      /\r/g,
      '',
    )
    .replace(
      /\t/g,
      '\n',
    )
    .split(
      '\n',
    )
    .map(
      cleanText,
    )
    .filter(
      Boolean,
    )
}

function collectFollowingNumbers({
  lines,
  startIndex,
  amount = 3,
}) {
  const numbers = []

  for (
    let index =
      startIndex;
    index <
      lines.length;
    index += 1
  ) {
    const line =
      lines[
        index
      ]

    if (
      normalizePosition(
        line,
      )
    ) {
      break
    }

    if (
      isNumericToken(
        line,
      )
    ) {
      numbers.push(
        toNumber(
          line,
          0,
        ),
      )
    }

    if (
      numbers.length >=
      amount
    ) {
      break
    }
  }

  return numbers
}

/*
|--------------------------------------------------------------------------
| Speler koppelen aan database
|--------------------------------------------------------------------------
*/

function findDatabasePlayer({
  name,
  club,
  position,
  players,
}) {
  const normalizedName =
    normalizeText(
      name,
    )

  const normalizedClub =
    normalizeText(
      club,
    )

  const normalizedPosition =
    normalizeDatabasePosition(
      position,
    )

  const nameMatches =
    players.filter(
      (player) =>
        normalizeText(
          player?.name,
        ) ===
        normalizedName,
    )

  if (
    nameMatches.length === 0
  ) {
    return {
      status: 'unmatched',

      player: null,

      matches: [],
    }
  }

  if (
    nameMatches.length === 1
  ) {
    return {
      status: 'matched',

      player:
        nameMatches[0],

      matches:
        nameMatches,
    }
  }

  const clubMatches =
    nameMatches.filter(
      (player) =>
        !normalizedClub ||
        normalizeText(
          player?.club,
        ) ===
          normalizedClub,
    )

  if (
    clubMatches.length === 1
  ) {
    return {
      status: 'matched',

      player:
        clubMatches[0],

      matches:
        clubMatches,
    }
  }

  const positionMatches =
    (
      clubMatches.length
        ? clubMatches
        : nameMatches
    ).filter(
      (player) =>
        !normalizedPosition ||
        getPlayerPosition(
          player,
        ) ===
          normalizedPosition,
    )

  if (
    positionMatches.length ===
    1
  ) {
    return {
      status: 'matched',

      player:
        positionMatches[0],

      matches:
        positionMatches,
    }
  }

  return {
    status: 'ambiguous',

    player: null,

    matches:
      positionMatches.length
        ? positionMatches
        : clubMatches.length
          ? clubMatches
          : nameMatches,
  }
}

/*
|--------------------------------------------------------------------------
| Lijstweergave parser
|--------------------------------------------------------------------------
|
| Verwacht rond een positiecode ongeveer deze structuur:
|
| Ajax
| Henrique
| AJA
| -
| VER
| 6.5
| 6.5
| 6.5
|
*/

function parseListView({
  lines,
  players,
}) {
  const importedPlayers = []

  lines.forEach(
    (
      line,
      index,
    ) => {
      const position =
        normalizePosition(
          line,
        )

      if (
        !position
      ) {
        return
      }

      const hasSeparator =
        lines[
          index - 1
        ] === '-'

      const clubCode =
        hasSeparator
          ? lines[
              index - 2
            ]
          : ''

      const name =
        hasSeparator
          ? lines[
              index - 3
            ]
          : lines[
              index - 2
            ]

      const club =
        hasSeparator
          ? lines[
              index - 4
            ]
          : lines[
              index - 3
            ]

      if (
        !name ||
        !club
      ) {
        return
      }

      const prices =
        collectFollowingNumbers({
          lines,

          startIndex:
            index + 1,

          amount: 3,
        })

      const [
        currentPrice,
        sellingPrice,
        purchasePrice,
      ] =
        prices

      const match =
        findDatabasePlayer({
          name,
          club,
          position,
          players,
        })

      importedPlayers.push({
        importSource:
          'list',

        status:
          match.status,

        player:
          match.player,

        matches:
          match.matches,

        importedName:
          name,

        importedClub:
          club,

        importedClubCode:
          clubCode,

        importedPosition:
          position,

        currentPrice:
          currentPrice ??
          getPlayerCurrentPrice(
            match.player,
          ),

        sellingPrice:
          sellingPrice ??
          currentPrice ??
          getPlayerCurrentPrice(
            match.player,
          ),

        purchasePrice:
          purchasePrice ??
          currentPrice ??
          getPlayerCurrentPrice(
            match.player,
          ),
      })
    },
  )

  return importedPlayers
}

/*
|--------------------------------------------------------------------------
| Opstellingsweergave parser
|--------------------------------------------------------------------------
|
| Bij een eenvoudige kopie uit de opstelling zoeken we naar exacte
| spelersnamen uit de database.
|
| Wanneer meerdere spelers exact dezelfde naam hebben, wordt de speler
| bewust als onduidelijk gemarkeerd.
|
*/

function parseLineupView({
  lines,
  players,
}) {
  const normalizedLines =
    new Set(
      lines.map(
        normalizeText,
      ),
    )

  const playersByName =
    new Map()

  players.forEach(
    (
      player,
    ) => {
      const name =
        normalizeText(
          player?.name,
        )

      if (
        !name
      ) {
        return
      }

      if (
        !playersByName.has(
          name,
        )
      ) {
        playersByName.set(
          name,
          [],
        )
      }

      playersByName
        .get(
          name,
        )
        .push(
          player,
        )
    },
  )

  const importedPlayers = []

  playersByName.forEach(
    (
      matches,
      normalizedName,
    ) => {
      if (
        !normalizedLines.has(
          normalizedName,
        )
      ) {
        return
      }

      const player =
        matches.length === 1
          ? matches[0]
          : null

      importedPlayers.push({
        importSource:
          'lineup',

        status:
          player
            ? 'matched'
            : 'ambiguous',

        player,

        matches,

        importedName:
          player?.name ??
          matches[0]?.name ??
          normalizedName,

        importedClub:
          player?.club ??
          '',

        importedClubCode:
          '',

        importedPosition:
          getPlayerPosition(
            player,
          ),

        currentPrice:
          getPlayerCurrentPrice(
            player,
          ),

        sellingPrice:
          getPlayerCurrentPrice(
            player,
          ),

        purchasePrice:
          getPlayerCurrentPrice(
            player,
          ),
      })
    },
  )

  return importedPlayers
}

/*
|--------------------------------------------------------------------------
| Dubbelen verwijderen
|--------------------------------------------------------------------------
*/

function removeDuplicateImports(
  importedPlayers,
) {
  const seen =
    new Set()

  return importedPlayers.filter(
    (
      importedPlayer,
    ) => {
      const key =
        importedPlayer
          ?.player
          ? getPlayerKey(
              importedPlayer.player,
            )
          : [
              normalizeText(
                importedPlayer
                  ?.importedName,
              ),

              normalizeText(
                importedPlayer
                  ?.importedClub,
              ),

              importedPlayer
                ?.importedPosition,
            ].join('-')

      if (
        seen.has(
          key,
        )
      ) {
        return false
      }

      seen.add(
        key,
      )

      return true
    },
  )
}

/*
|--------------------------------------------------------------------------
| Validatie
|--------------------------------------------------------------------------
*/

function createPositionCounts(
  importedPlayers,
) {
  return importedPlayers.reduce(
    (
      counts,
      importedPlayer,
    ) => {
      const position =
        importedPlayer
          ?.importedPosition ||
        getPlayerPosition(
          importedPlayer?.player,
        )

      if (
        counts[
          position
        ] !== undefined
      ) {
        counts[
          position
        ] += 1
      }

      return counts
    },
    {
      goalkeeper: 0,
      defender: 0,
      midfielder: 0,
      forward: 0,
    },
  )
}

function createImportErrors({
  importedPlayers,
  positionCounts,
}) {
  const errors = []

  if (
    importedPlayers.length !==
    15
  ) {
    errors.push(
      `Er zijn ${importedPlayers.length} van de 15 spelers herkend.`,
    )
  }

  const expectedPositionCounts = {
    goalkeeper: 2,
    defender: 5,
    midfielder: 5,
    forward: 3,
  }

  Object.entries(
    expectedPositionCounts,
  ).forEach(
    (
      [
        position,
        expectedAmount,
      ],
    ) => {
      const actualAmount =
        positionCounts[
          position
        ]

      if (
        actualAmount !==
        expectedAmount
      ) {
        errors.push(
          `${POSITION_LABELS[position]}: ${actualAmount} gevonden, ${expectedAmount} verwacht.`,
        )
      }
    },
  )

  const unmatchedPlayers =
    importedPlayers.filter(
      (
        importedPlayer,
      ) =>
        importedPlayer.status ===
        'unmatched',
    )

  if (
    unmatchedPlayers.length
  ) {
    errors.push(
      `${unmatchedPlayers.length} ${
        unmatchedPlayers.length ===
        1
          ? 'speler kon'
          : 'spelers konden'
      } niet aan de database worden gekoppeld.`,
    )
  }

  const ambiguousPlayers =
    importedPlayers.filter(
      (
        importedPlayer,
      ) =>
        importedPlayer.status ===
        'ambiguous',
    )

  if (
    ambiguousPlayers.length
  ) {
    errors.push(
      `${ambiguousPlayers.length} ${
        ambiguousPlayers.length ===
        1
          ? 'speler heeft'
          : 'spelers hebben'
      } meerdere mogelijke matches.`,
    )
  }

  return errors
}

/*
|--------------------------------------------------------------------------
| Publieke parser
|--------------------------------------------------------------------------
*/

export function parseFantasyTeamText({
  text,
  players = [],
}) {
  const lines =
    createImportLines(
      text,
    )

  if (
    !lines.length
  ) {
    return {
      valid: false,

      source: 'unknown',

      players: [],

      matchedPlayers: [],

      unmatchedPlayers: [],

      ambiguousPlayers: [],

      positionCounts:
        createPositionCounts(
          [],
        ),

      errors: [
        'Er is nog geen teamtekst geplakt.',
      ],

      warnings: [],
    }
  }

  const listPlayers =
    parseListView({
      lines,
      players,
    })

  const source =
    listPlayers.length
      ? 'list'
      : 'lineup'

  const importedPlayers =
    removeDuplicateImports(
      listPlayers.length
        ? listPlayers
        : parseLineupView({
            lines,
            players,
          }),
    )

  const positionCounts =
    createPositionCounts(
      importedPlayers,
    )

  const errors =
    createImportErrors({
      importedPlayers,
      positionCounts,
    })

  const matchedPlayers =
    importedPlayers.filter(
      (
        importedPlayer,
      ) =>
        importedPlayer.status ===
        'matched',
    )

  const unmatchedPlayers =
    importedPlayers.filter(
      (
        importedPlayer,
      ) =>
        importedPlayer.status ===
        'unmatched',
    )

  const ambiguousPlayers =
    importedPlayers.filter(
      (
        importedPlayer,
      ) =>
        importedPlayer.status ===
        'ambiguous',
    )

  return {
    valid:
      errors.length === 0,

    source,

    players:
      importedPlayers,

    matchedPlayers,

    unmatchedPlayers,

    ambiguousPlayers,

    positionCounts,

    errors,

    warnings:
      source === 'lineup'
        ? [
            'De opstellingsweergave bevat mogelijk geen persoonlijke aankoop- en verkoopprijzen. Controleer deze waarden voor het berekenen.',
          ]
        : [],

    rawLines:
      lines,
  }
}