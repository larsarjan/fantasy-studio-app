import {
  getEnrichedPlayers,
} from '../database.js'

import {
  optimizeLineupForPeriod,
  optimizeLineupForRound,
} from './optimizerLineup.js'

/*
|--------------------------------------------------------------------------
| Optimizer Engine
|--------------------------------------------------------------------------
|
| Centrale ingang voor de optimizer.
|
| Voorlopig gebruiken we deze module om
| de lineup-engine met echte spelers uit
| de Fantasy Studio-database te testen.
|
*/

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizeId(
  value,
) {
  return String(
    value ?? '',
  ).trim()
}

function findPlayerById(
  players,
  playerId,
) {
  const normalizedId =
    normalizeId(
      playerId,
    )

  return players.find(
    (player) =>
      normalizeId(
        player?.id,
      ) ===
      normalizedId,
  ) ?? null
}

function createConsolePlayerRow(
  candidate,
) {
  return {
    Naam:
      candidate
        ?.player
        ?.name ??
      'Onbekend',

    Club:
      candidate
        ?.player
        ?.club ??
      '—',

    Positie:
      candidate
        ?.position ??
      '—',

    xP:
      candidate
        ?.expectedPoints ??
      0,

    xMin:
      candidate
        ?.expectedMinutes ??
      0,

    Speelkans:
      candidate
        ?.appearanceProbability ??
      0,
  }
}

/*
|--------------------------------------------------------------------------
| Bestaande selectie optimaliseren
|--------------------------------------------------------------------------
*/

/**
 * Publieke ingang voor een reeds samengestelde
 * selectie van vijftien volledige spelerobjecten.
 */
export function optimizeExistingSquad({
  squad = [],
  round = 1,
} = {}) {
  return optimizeLineupForRound({
    squad,
    round,
  })
}

/**
 * Publieke ingang voor een reeds samengestelde
 * selectie van vijftien spelers over meerdere
 * opeenvolgende speelrondes.
 */
export function optimizeExistingSquadForPeriod({
  squad = [],
  startRound = 1,
  roundCount = 1,
} = {}) {
  return optimizeLineupForPeriod({
    squad,
    startRound,
    roundCount,
  })
}

/*
|--------------------------------------------------------------------------
| Tijdelijke databasetest
|--------------------------------------------------------------------------
*/

/**
 * Zoekt vijftien spelers op basis van ID
 * en test daarmee de lineup-engine.
 *
 * Deze functie is tijdelijk handig zolang
 * Fantasy Studio nog geen Mijn Team-scherm heeft.
 */
export function runOptimizerTest({
  playerIds = [],
  round = 1,
  startRound = round,
  roundCount = 1,
} = {}) {
  const players =
    getEnrichedPlayers()

  const requestedIds =
    Array.isArray(
      playerIds,
    )
      ? playerIds
          .map(
            normalizeId,
          )
          .filter(Boolean)
      : []

    const normalizedStartRound =
    Number(startRound) || 1

  const normalizedRoundCount =
    Math.max(
      1,
      Math.min(
        10,
        Number(roundCount) || 1,
      ),
    )

  const endRound =
    normalizedStartRound +
    normalizedRoundCount -
    1

  console.group(
    normalizedRoundCount === 1
      ? `Fantasy Studio Optimizer — speelronde ${normalizedStartRound}`
      : `Fantasy Studio Optimizer — speelronde ${normalizedStartRound} t/m ${endRound}`,
  )

  if (
    requestedIds.length !== 15
  ) {
    const result = {
      valid: false,

      errors: [
        `De test verwacht precies 15 speler-ID's; ontvangen: ${requestedIds.length}.`,
      ],

            round:
        normalizedRoundCount === 1
          ? normalizedStartRound
          : null,

      startRound:
        normalizedStartRound,

      endRound,

      roundCount:
        normalizedRoundCount,

      result:
        null,
    }

    console.error(
      result.errors[0],
    )

    console.groupEnd()

    return result
  }

  const squad =
    requestedIds
      .map(
        (playerId) =>
          findPlayerById(
            players,
            playerId,
          ),
      )

  const missingIds =
    requestedIds.filter(
      (
        playerId,
        index,
      ) =>
        !squad[index],
    )

  if (
    missingIds.length
  ) {
    const result = {
      valid: false,

      errors: [
        `De volgende speler-ID's zijn niet gevonden: ${missingIds.join(', ')}.`,
      ],

            round:
        normalizedRoundCount === 1
          ? normalizedStartRound
          : null,

      startRound:
        normalizedStartRound,

      endRound,

      roundCount:
        normalizedRoundCount,

      result:
        null,
    }

    console.error(
      result.errors[0],
    )

    console.groupEnd()

    return result
  }

    const optimizerResult =
    normalizedRoundCount === 1
      ? optimizeExistingSquad({
          squad,
          round:
            normalizedStartRound,
        })
      : optimizeExistingSquadForPeriod({
          squad,
          startRound:
            normalizedStartRound,
          roundCount:
            normalizedRoundCount,
        })

  console.log(
    'Volledig resultaat:',
    optimizerResult,
  )

  if (
    !optimizerResult.valid
  ) {
    optimizerResult.errors.forEach(
      (error) =>
        console.error(
          error,
        ),
    )

    console.groupEnd()

    return optimizerResult
  }

  const lineup =
    optimizerResult.result

  console.log(
    'Beste formatie:',
    lineup.formation,
  )

  console.log(
    'Captain:',
    lineup
      .captain
      ?.player
      ?.name ??
      '—',
  )

  console.log(
    'Vice-captain:',
    lineup
      .viceCaptain
      ?.player
      ?.name ??
      '—',
  )

  console.log(
    'Basispunten:',
    lineup.baseExpectedPoints,
  )

  console.log(
    'Captainbonus:',
    lineup.captainBonus,
  )

  console.log(
    'Totaal xP:',
    lineup.expectedPoints,
  )

    if (
    normalizedRoundCount > 1
  ) {
    console.log(
      'xP per speelronde:',
      lineup.expectedPointsPerRound,
    )
  }

  console.table(
    lineup.starters.map(
      createConsolePlayerRow,
    ),
  )

  console.log(
    'Bank:',
  )

  console.table(
    lineup
      .bench
      .ordered
      .map(
        createConsolePlayerRow,
      ),
  )

  if (
    optimizerResult
      .alternatives
      .length
  ) {
    console.log(
      'Alternatieve formaties:',
    )

    console.table(
      optimizerResult
        .alternatives
        .map(
          (alternative) => ({
            Formatie:
              alternative
                .formation,

            xP:
              alternative
                .expectedPoints,

            Basispunten:
              alternative
                .baseExpectedPoints,

            Captain:
              alternative
                .captain
                ?.player
                ?.name ??
              '—',
          }),
        ),
    )
  }

  optimizerResult
    .warnings
    ?.forEach(
      (warning) =>
        console.warn(
          warning,
        ),
    )

  console.groupEnd()

  return optimizerResult
}