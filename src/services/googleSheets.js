const PUBLISHED_SHEET_ID =
  '2PACX-1vRys5Fr3lEOy8f1lcltjcHqApzfwlhe4-1KMcaOUdmzsvG73KgbRGvflgtklGsSrGM9Prt4RsGq08eB'

const BASE_URL =
  `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_SHEET_ID}/pub`

const SHEET_GIDS = {
  SPELERS: '0',
  WEDSTRIJDEN: '987182802',
  TEAM_RATINGS: '1178297655',
}

export function createSheetUrl(sheetName) {
  const gid = SHEET_GIDS[sheetName]

  if (!gid) {
    throw new Error(`Geen gid ingesteld voor tabblad ${sheetName}.`)
  }

  return `${BASE_URL}?output=csv&gid=${gid}&_=${Date.now()}`
}

export async function fetchSheet(sheetName) {
  const response = await fetch(createSheetUrl(sheetName), {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(
      `Tabblad ${sheetName} kon niet worden geladen (${response.status}).`,
    )
  }

  const csv = await response.text()

  if (!csv.trim()) {
    throw new Error(`Tabblad ${sheetName} is leeg.`)
  }

  return parseCsv(csv)
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
