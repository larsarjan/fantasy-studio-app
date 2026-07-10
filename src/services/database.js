import {
  players as fallbackPlayers,
} from '../data/players.js'

import {
  fixtures as fallbackFixtures,
} from '../data/fixtures.js'

import { fetchSheet } from './googleSheets.js'

const CACHE_KEY = 'fantasy-studio-database-v1'
const STATUS_KEY = 'fantasy-studio-sync-status-v1'

let database = {
  players: fallbackPlayers,
  fixtures: fallbackFixtures,
  teamRatings: [],
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

function mapPlayer(record, index) {
  const name = cleanText(
    firstValue(record, ['Speler', 'Naam', 'Player']),
  )

  return {
    id:
      cleanText(firstValue(record, ['Speler ID', 'Speler_ID', 'ID'])) ||
      `${slugify(name)}-${index + 1}`,
    name,
    season: cleanText(firstValue(record, ['Seizoen', 'Season'])),
    position: cleanText(firstValue(record, ['Positie', 'Position'])),
    club: cleanText(firstValue(record, ['Club', 'Team'])),
    startPrice: cleanNumber(
      firstValue(record, ['Beginprijs', 'Startprijs']),
    ),
    endPrice: cleanNumber(
      firstValue(record, ['Eindprijs', 'Huidige prijs']),
    ),
    valueDevelopment: cleanNumber(
      firstValue(record, ['Waardeontwikkeling']),
    ),
    selectedPct: cleanNumber(
      firstValue(record, ['Gespeeld', 'Gespeeld %', 'Gekozen %']),
    ),
    points:
      cleanNumber(firstValue(record, ['Totaal Punten', 'Punten'])) ?? 0,
    saves:
      cleanNumber(firstValue(record, ['Reddingen'])) ?? 0,
    savePoints:
      cleanNumber(firstValue(record, ['Punten voor reddingen'])) ?? 0,
    penaltiesSaved:
      cleanNumber(firstValue(record, ['Strafschoppen gestopt'])) ?? 0,
    optaBonus:
      cleanNumber(
        firstValue(record, [
          'Bonuspunten namens OPTA',
          'OPTA Bonuspunt',
          'OPTA Bonuspunten',
        ]),
      ) ?? 0,
    goals:
      cleanNumber(firstValue(record, ['Doelpunten', 'Goals'])) ?? 0,
    assists:
      cleanNumber(firstValue(record, ['Assists'])) ?? 0,
    minutes:
      cleanNumber(firstValue(record, ['Gespeelde minuten'])) ?? 0,
    minutePoints:
      cleanNumber(
        firstValue(record, ['Punten voor gespeelde minuten']),
      ) ?? 0,
    cleanSheets:
      cleanNumber(
        firstValue(record, ['Cleansheets', 'Clean sheets']),
      ) ?? 0,
    cleanSheetPoints:
      cleanNumber(
        firstValue(record, ['Punten voor cleansheets']),
      ) ?? 0,
    goalsAgainst:
      cleanNumber(firstValue(record, ['Tegendoelpunten'])) ?? 0,
    goalsAgainstMinus:
      cleanNumber(
        firstValue(record, ['Minpunten voor tegendoelpunten']),
      ) ?? 0,
    yellowCards:
      cleanNumber(firstValue(record, ['Gele kaarten'])) ?? 0,
    redCards:
      cleanNumber(firstValue(record, ['Rode kaarten'])) ?? 0,
    penaltiesMissed:
      cleanNumber(firstValue(record, ['Strafschoppen gemist'])) ?? 0,
  }
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
    date: cleanText(firstValue(record, ['Datum'])),
    time: cleanText(firstValue(record, ['Tijd'])),
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
      firstValue(record, ['Club', 'Unnamed: 1']),
    ),
    attack: cleanNumber(
      firstValue(record, ['Aanval', 'Unnamed: 2']),
    ),
    midfield: cleanNumber(
      firstValue(record, ['Middenveld', 'Unnamed: 3']),
    ),
    defense: cleanNumber(
      firstValue(record, ['Verdediging', 'Unnamed: 4']),
    ),
    coach: cleanNumber(
      firstValue(record, ['Coach', 'Unnamed: 5']),
    ),
    form: cleanNumber(
      firstValue(record, ['Vorm', 'Unnamed: 6']),
    ),
    homeAdvantage: cleanNumber(
      firstValue(record, ['Thuisvoordeel', 'Unnamed: 7']),
    ),
  }
}

function saveCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(database))
  localStorage.setItem(STATUS_KEY, JSON.stringify(syncStatus))
}

function loadCache() {
  try {
    const cachedDatabase = JSON.parse(
      localStorage.getItem(CACHE_KEY) || 'null',
    )
    const cachedStatus = JSON.parse(
      localStorage.getItem(STATUS_KEY) || 'null',
    )

    if (
      cachedDatabase?.players?.length &&
      cachedDatabase?.fixtures?.length
    ) {
      database = cachedDatabase
    }

    if (cachedStatus) {
      syncStatus = cachedStatus
    }
  } catch (error) {
    console.warn('Lokale databasecache kon niet worden gelezen.', error)
  }
}

export function initializeDatabase() {
  loadCache()
}

export function getPlayers() {
  return database.players
}

export function getFixtures() {
  return database.fixtures
}

export function getTeamRatings() {
  return database.teamRatings
}

export function getSyncStatus() {
  return syncStatus
}

export function getDatabaseSummary() {
  const seasons = [
    ...new Set([
      ...database.players.map((player) => player.season),
      ...database.fixtures.map((fixture) => fixture.season),
    ].filter(Boolean)),
  ].sort()

  const fixtureSeasons = [
    ...new Set(
      database.fixtures
        .map((fixture) => fixture.season)
        .filter(Boolean),
    ),
  ].sort()

  const activeSeason = fixtureSeasons.at(-1) || seasons.at(-1) || ''
  const seasonFixtures = activeSeason
    ? database.fixtures.filter(
        (fixture) => fixture.season === activeSeason,
      )
    : database.fixtures

  const fixtureClubs = new Set(
    seasonFixtures
      .flatMap((fixture) => [fixture.home, fixture.away])
      .filter(Boolean),
  )

  return {
    players: database.players.length,
    fixtures: seasonFixtures.length,
    clubs: fixtureClubs.size,
    seasons,
    activeSeason,
  }
}

export async function synchronizeDatabase() {
  syncStatus = {
    ...syncStatus,
    message: 'Synchroniseren…',
    state: 'loading',
  }

  try {
    const [playerRows, fixtureRows, ratingRows] = await Promise.all([
      fetchSheet('SPELERS'),
      fetchSheet('WEDSTRIJDEN'),
      fetchSheet('TEAM_RATINGS'),
    ])

    const players = playerRows
      .map(mapPlayer)
      .filter((player) => player.name && player.season)

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

    if (!players.length) {
      throw new Error('Tabblad SPELERS bevat geen bruikbare spelers.')
    }

    if (!fixtures.length) {
      throw new Error(
        'Tabblad WEDSTRIJDEN bevat geen bruikbare wedstrijden.',
      )
    }

    database = {
      players,
      fixtures,
      teamRatings,
    }

    syncStatus = {
      source: 'Google Sheets',
      lastSync: new Date().toISOString(),
      message: `${players.length} spelers en ${fixtures.length} wedstrijden bijgewerkt`,
      state: 'success',
    }

    saveCache()

    window.dispatchEvent(
      new CustomEvent('fantasy-database-updated'),
    )

    return {
      ...getDatabaseSummary(),
      ratings: teamRatings.length,
    }
  } catch (error) {
    syncStatus = {
      ...syncStatus,
      message: error.message || 'Synchronisatie mislukt.',
      state: 'error',
    }

    throw error
  }
}
