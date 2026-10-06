/*
|--------------------------------------------------------------------------
| Fantasy Label Engine
|--------------------------------------------------------------------------
|
| Deze functie berekent uitsluitend automatische Fantasy-labels.
|
| De uiteindelijke keuze tussen handmatige en automatische labels
| wordt in database.js gemaakt via:
|
| - manual
| - auto
| - merge
|
*/

function toNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number)
    ? number
    : null
}

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function hasSetPieces(player) {
  return Boolean(
    player.penalties ||
    player.corners ||
    player.freeKicks,
  )
}

function isRiskStatus(status) {
  return [
    'geblesseerd',
    'blessure',
    'injured',
    'geschorst',
    'suspended',
    'twijfelachtig',
    'doubt',
    'doubtful',
  ].includes(status)
}

function isFitStatus(status) {
  return [
    'fit',
    'beschikbaar',
    'available',
  ].includes(status)
}

export function calculateFantasyLabels(player) {
  const labels = []

  const chanceOfPlaying =
    toNumber(player.chanceOfPlaying)

  const expectedMinutes =
    toNumber(player.expectedMinutes)

  const status =
    normalizeStatus(player.status)

  /*
  |--------------------------------------------------------------------------
  | Standaardsituaties
  |--------------------------------------------------------------------------
  */

  if (hasSetPieces(player)) {
    labels.push('standaardsituaties')
  }

  /*
  |--------------------------------------------------------------------------
  | Risico
  |--------------------------------------------------------------------------
  |
  | Een speler krijgt Risico wanneer:
  |
  | - zijn status op een blessure, schorsing of twijfel wijst;
  | - zijn speelkans lager is dan 60%;
  | - zijn verwachte minuten lager zijn dan 45.
  |
  | Ontbrekende waarden tellen niet automatisch als risico.
  |
  */

  const hasRiskStatus =
    isRiskStatus(status)

  const hasLowPlayingChance =
    chanceOfPlaying !== null &&
    chanceOfPlaying < 60

  const hasLowExpectedMinutes =
    expectedMinutes !== null &&
    expectedMinutes < 45

  const isRisk =
    hasRiskStatus ||
    hasLowPlayingChance ||
    hasLowExpectedMinutes

  if (isRisk) {
    labels.push('risico')
  }

  /*
  |--------------------------------------------------------------------------
  | Stabiel
  |--------------------------------------------------------------------------
  |
  | Een speler krijgt Stabiel wanneer:
  |
  | - hij niet als risico wordt aangemerkt;
  | - zijn speelkans minimaal 85% is;
  | - zijn verwachte minuten minimaal 75 zijn;
  | - zijn status leeg, Fit of Beschikbaar is.
  |
  */

  const hasStableAvailability =
    chanceOfPlaying !== null &&
    chanceOfPlaying >= 85 &&
    expectedMinutes !== null &&
    expectedMinutes >= 75

  const hasAcceptableStatus =
    !status ||
    isFitStatus(status)

  if (
    !isRisk &&
    hasStableAvailability &&
    hasAcceptableStatus
  ) {
    labels.push('stabiel')
  }

  /*
  |--------------------------------------------------------------------------
  | Budget
  |--------------------------------------------------------------------------
  */

  // Volgt zodra prijs en rendement bruikbaar zijn.

  /*
  |--------------------------------------------------------------------------
  | Hoog plafond
  |--------------------------------------------------------------------------
  */

  // Volgt zodra goals, assists, xG, xA en piekscores beschikbaar zijn.

  /*
  |--------------------------------------------------------------------------
  | Differential
  |--------------------------------------------------------------------------
  */

  // Volgt zodra ownership en verwachte output betrouwbaar zijn.

  /*
  |--------------------------------------------------------------------------
  | Premium
  |--------------------------------------------------------------------------
  */

  // Volgt zodra prijs en prestaties uit het seizoen beschikbaar zijn.

  /*
  |--------------------------------------------------------------------------
  | Must-have
  |--------------------------------------------------------------------------
  */

  // Volgt zodra meerdere automatische indicatoren gecombineerd kunnen worden.

  return [...new Set(labels)]
}