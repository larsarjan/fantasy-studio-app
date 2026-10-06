const PUBLISHED_SHEET_ID =
  '2PACX-1vRys5Fr3lEOy8f1lcltjcHqApzfwlhe4-1KMcaOUdmzsvG73KgbRGvflgtklGsSrGM9Prt4RsGq08eB'

const BASE_URL =
  `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_SHEET_ID}/pub`

const SHEET_GIDS = {
  SPELERS: '0',
  SPELERS_HISTORIE: '1818115160',
  WEDSTRIJDEN: '987182802',
  TEAM_RATINGS: '1178297655',
  RESULTS: '776264419',
  PLAYER_METADATA: '1096170677',
  PLAYER_MATCH_STATS: '1473841294',
  // Vul deze waarden in nadat de nieuwe tabbladen afzonderlijk als CSV zijn gepubliceerd.
  ELITE_PLAYER_STATS: '1374530400',
  ELITE_TRANSFERS: '38559593',
  ELITE_SYNC_CONTROLE: '918754832',
  CHIP_GEBRUIK: '2111638371',
  ELITE_FORMATIONS: '1758286734',
  ELITE_CLUB_EXPOSURE: '231456850',
  TRANSFERS_2026_27: '813354455',
  TRANSFER_CLUB_OVERVIEW: '725320659',
  EUROPE_2026_27: '637872629',
}

export function hasPublishedSheet(sheetName) {
  return Boolean(SHEET_GIDS[sheetName])
}

export function createSheetUrl(
  sheetName,
) {
  const gid =
    SHEET_GIDS[sheetName]

  if (!gid) {
    throw new Error(
      `Geen gid ingesteld voor tabblad ${sheetName}.`,
    )
  }

  /*
   * Iedere synchronisatie krijgt een unieke URL.
   * Dit voorkomt dat Google of de browser een oudere
   * gepubliceerde CSV-versie uit de cache teruggeeft.
   */
  const cacheBust =
    Date.now()

  return (
    `${BASE_URL}` +
    `?gid=${gid}` +
    `&single=true` +
    `&output=csv` +
    `&cacheBust=${cacheBust}`
  )
}

function wait(
  milliseconds,
) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      )
    },
  )
}

export async function fetchSheet(
  sheetName,
  options = {},
) {
  const maximumAttempts =
    Number(
      options.maximumAttempts,
    ) || 3

  const timeoutMilliseconds =
    Number(
      options.timeoutMilliseconds,
    ) || 15000

  let lastError =
    null

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt += 1
  ) {
    const controller =
      new AbortController()

    const timeoutId =
      setTimeout(
        () => {
          controller.abort()
        },
        timeoutMilliseconds,
      )

    try {
      const response =
        await fetch(
          createSheetUrl(
            sheetName,
          ),
          {
            cache:
              'no-store',

            signal:
              controller.signal,
          },
        )

      clearTimeout(
        timeoutId,
      )

      if (!response.ok) {
        throw new Error(
          `Tabblad ${sheetName} kon niet worden geladen (${response.status}).`,
        )
      }

      const csv =
        await response.text()

      if (!csv.trim()) {
        throw new Error(
          `Tabblad ${sheetName} is leeg.`,
        )
      }

      return parseCsv(
        csv,
      )
    } catch (error) {
      clearTimeout(
        timeoutId,
      )

      lastError =
        error?.name ===
        'AbortError'
          ? new Error(
              `Tabblad ${sheetName} reageerde niet binnen ${Math.round(
                timeoutMilliseconds /
                1000,
              )} seconden.`,
            )
          : error

      console.warn(
        `Poging ${attempt}/${maximumAttempts} voor ${sheetName} mislukt:`,
        lastError,
      )

      if (
        attempt <
        maximumAttempts
      ) {
        await wait(
          attempt * 1000,
        )
      }
    }
  }

  throw (
    lastError ??
    new Error(
      `Tabblad ${sheetName} kon niet worden geladen.`,
    )
  )
}

export function parseCsv(csvText) {
  const rows = []
  let row = []
  let value = ''
  let insideQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    const nextCharacter = csvText[index + 1]

    if (character === '"' && insideQuotes && nextCharacter === '"') {
      value += '"'
      index += 1
      continue
    }

    if (character === '"') {
      insideQuotes = !insideQuotes
      continue
    }

    if (character === ',' && !insideQuotes) {
      row.push(value)
      value = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }

      row.push(value)
      value = ''

      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row)
      }

      row = []
      continue
    }

    value += character
  }

  row.push(value)

  if (row.some((cell) => cell.trim() !== '')) {
    rows.push(row)
  }

  if (rows.length < 2) {
    return []
  }

  const headers = rows[0].map((header) => header.trim())

  return rows.slice(1).map((cells) => {
    const record = {}

    headers.forEach((header, index) => {
      if (header) {
        record[header] = (cells[index] ?? '').trim()
      }
    })

    return record
  })
}
