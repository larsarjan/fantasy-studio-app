/*
|--------------------------------------------------------------------------
| Expected Points — Configuratie
|--------------------------------------------------------------------------
|
| Centrale instellingen voor de Expected Points Engine.
|
| Alle andere Expected Points-bestanden importeren hun
| schalen, standaardwaarden en begrenzingen uit dit bestand.
|
| Door deze waarden centraal te bewaren voorkomen we dat
| dezelfde aannames op verschillende plekken anders worden
| geïmplementeerd.
|
*/

/*
|--------------------------------------------------------------------------
| Algemene projectie-instellingen
|--------------------------------------------------------------------------
*/

export const EXPECTED_POINTS_CONFIG = {
  version:
    '2026-2027-v1',

  /*
   * Een projectie mag standaard maximaal
   * tien speelrondes vooruit rekenen.
   */
  rounds: {
    defaultCount:
      5,

    minimumCount:
      1,

    maximumCount:
      10,
  },

  /*
   * Een volledige wedstrijd bestaat uit
   * negentig minuten.
   */
  minutes: {
    fullMatch:
      90,

    cleanSheetMinimum:
      60,

    twoAppearancePointsMinimum:
      60,
  },

  /*
   * Neutrale waarden worden gebruikt
   * wanneer onvoldoende data beschikbaar is.
   */
  neutral: {
    fixtureScore:
      5,

    formScore:
      5,

    potentialScore:
      5,

    riskScore:
      5,

    availabilityScore:
      5,

    confidence:
      30,
  },

  /*
   * De engine voorkomt extreme projecties
   * wanneer nog weinig betrouwbare data
   * beschikbaar is.
   */
  limits: {
    minimumExpectedPoints:
      -2,

    maximumExpectedPointsPerFixture:
      18,

    maximumExpectedPointsPerRound:
      30,

    minimumExpectedMinutes:
      0,

    maximumExpectedMinutes:
      90,

    minimumConfidence:
      5,

    maximumConfidence:
      95,
  },
}

/*
|--------------------------------------------------------------------------
| Posities
|--------------------------------------------------------------------------
|
| De namen sluiten aan bij de officiële Fantasy-posities.
|
*/

export const EXPECTED_POINTS_POSITIONS = {
  GOALKEEPER:
    'goalkeeper',

  DEFENDER:
    'defender',

  MIDFIELDER:
    'midfielder',

  FORWARD:
    'forward',

  UNKNOWN:
    'unknown',
}

/*
|--------------------------------------------------------------------------
| Officiële Fantasy-punten
|--------------------------------------------------------------------------
|
| Deze waarden zijn gelijk aan de officiële spelregels.
|
| De centrale Fantasy Game Rules Engine blijft uiteindelijk
| de hoofdbron. Deze configuratie bevat de directe waarden
| die de Expected Points-berekening vaak nodig heeft.
|
*/

export const EXPECTED_POINTS_SCORING = {
  appearance: {
    played:
      1,

    sixtyMinutes:
      2,
  },

  goals: {
    goalkeeper:
      10,

    defender:
      6,

    midfielder:
      5,

    forward:
      4,

    unknown:
      4,
  },

  assist:
    3,

  cleanSheet: {
    goalkeeper:
      4,

    defender:
      4,

    midfielder:
      1,

    forward:
      0,

    unknown:
      0,
  },

  goalkeeper: {
    savesPerPoint:
      3,

    pointPerSaveBlock:
      1,

    penaltySaved:
      5,
  },

  penaltiesMissed:
    -2,

  goalsConceded: {
    goalkeeper:
      -1,

    defender:
      -1,

    midfielder:
      0,

    forward:
      0,

    unknown:
      0,

    perGoals:
      2,
  },

  yellowCard:
    -1,

  redCard:
    -3,

  ownGoal:
    -2,

  bonus: {
    maximum:
      3,
  },
}

/*
|--------------------------------------------------------------------------
| Calculation Engine
|--------------------------------------------------------------------------
|
| Directe rekenwaarden voor expectedPointsCalculation.js.
|
| Dit is de neutrale v1-rekenlaag. De officiële,
| positieafhankelijke puntentelling staat al in
| EXPECTED_POINTS_SCORING en wordt na de basistests
| rechtstreeks aan de positie van de speler gekoppeld.
|
*/

export const EXPECTED_POINTS_CALCULATION_CONFIG = {
  appearance: {
    /*
     * Vanaf één verwachte minuut ontvangt een
     * speler één appearancepunt.
     */
    minimumMinutes:
      1,

    minimumMatchPoints:
      EXPECTED_POINTS_SCORING
        .appearance
        .played,

    /*
     * Vanaf zestig verwachte minuten ontvangt
     * een speler twee appearancepunten.
     */
    fullMatchMinutes:
      EXPECTED_POINTS_CONFIG
        .minutes
        .twoAppearancePointsMinimum,

    fullMatchPoints:
      EXPECTED_POINTS_SCORING
        .appearance
        .sixtyMinutes,
  },

  /*
   * Neutrale v1-waarde voor een doelpunt.
   *
   * De huidige testspeler heeft nog geen positie.
   * Na deze basistest koppelen we dit rechtstreeks
   * aan EXPECTED_POINTS_SCORING.goals[position].
   */
  goalPoints:
    EXPECTED_POINTS_SCORING
      .goals
      .forward,

  assistPoints:
    EXPECTED_POINTS_SCORING
      .assist,

  /*
   * Neutrale testwaarde. Ook deze wordt daarna
   * positieafhankelijk gemaakt.
   */
  cleanSheetPoints:
    EXPECTED_POINTS_SCORING
      .cleanSheet
      .defender,

  /*
   * Eén punt per drie reddingen.
   */
  savePoints:
    EXPECTED_POINTS_SCORING
      .goalkeeper
      .pointPerSaveBlock /
    EXPECTED_POINTS_SCORING
      .goalkeeper
      .savesPerPoint,

  penaltySavePoints:
    EXPECTED_POINTS_SCORING
      .goalkeeper
      .penaltySaved,

  yellowCardPenalty:
    EXPECTED_POINTS_SCORING
      .yellowCard,

  redCardPenalty:
    EXPECTED_POINTS_SCORING
      .redCard,

  ownGoalPenalty:
    EXPECTED_POINTS_SCORING
      .ownGoal,

  penaltyMissPenalty:
    EXPECTED_POINTS_SCORING
      .penaltiesMissed,
}

/*
|--------------------------------------------------------------------------
| Historische data
|--------------------------------------------------------------------------
|
| Historische productie wordt betrouwbaarder wanneer
| een speler voldoende minuten en wedstrijden heeft.
|
*/

export const EXPECTED_POINTS_HISTORY_CONFIG = {
  /*
   * Minimaal aantal gespeelde minuten voordat
   * de eigen historische productie zwaar mag meetellen.
   */
  minimumUsefulMinutes:
    180,

  reliableMinutes:
    900,

  highlyReliableMinutes:
    1800,

  minimumUsefulMatches:
    3,

  reliableMatches:
    10,

  highlyReliableMatches:
    20,

  /*
   * De meest recente wedstrijden wegen zwaarder.
   */
  recentMatchCount:
    5,

  /*
   * Gewichten wanneer zowel actuele wedstrijddata
   * als seizoensdata beschikbaar zijn.
   */
  weights: {
    recentMatches:
      0.55,

    currentSeason:
      0.30,

    previousSeason:
      0.15,
  },

  /*
   * Wanneer actuele wedstrijddata ontbreekt,
   * wordt meer gewicht gegeven aan seizoenstotalen.
   */
  fallbackWeights: {
    currentSeason:
      0.65,

    previousSeason:
      0.35,
  },
}

/*
|--------------------------------------------------------------------------
| Verwachte minuten
|--------------------------------------------------------------------------
|
| De verwachte minuten komen primair uit metadata:
|
| - chanceOfPlaying
| - expectedMinutes
| - expectedRole
| - expectedStarter
| - rotationRisk
| - injuryRisk
| - status
|
*/

export const EXPECTED_MINUTES_CONFIG = {
  roleDefaults: {
    'key-player':
      86,

    starter:
      80,

    rotation:
      51,

    prospect:
      35,

    backup:
      20,

    unknown:
      55,
  },

  /*
   * Correcties op basis van metadata.
   */
  adjustments: {
    expectedStarter:
      6,

    expectedNotStarter:
      -12,

    rotationRisk:
      -12,

    injuryRisk:
      -10,

    doubtfulStatus:
      -22,

    injuredStatus:
      -90,

    suspendedStatus:
      -90,
  },

  /*
   * De expliciete expectedMinutes blijft leidend.
   * De rolinschatting vult alleen ontbrekende data aan.
   */
  explicitMinutesWeight:
    0.75,

  roleMinutesWeight:
    0.25,

  /*
   * Speelkans wordt als laatste toegepast.
   *
   * Bijvoorbeeld:
   *
   * 80 verwachte minuten
   * × 90% speelkans
   * = 72 effectieve verwachte minuten
   */
  applyPlayingChance:
    true,
}

/*
|--------------------------------------------------------------------------
| Fixture-modifiers
|--------------------------------------------------------------------------
|
| Fixture Intelligence levert een score van 0 tot 10.
|
| 5 is neutraal.
|
| Een gunstige wedstrijd verhoogt vooral de aanvallende,
| clean-sheet- en bonusverwachting. Minuten worden slechts
| zeer beperkt door de tegenstander beïnvloed.
|
*/

export const EXPECTED_POINTS_FIXTURE_CONFIG = {
  neutralScore:
    5,

  /*
   * Minimale en maximale multiplier.
   *
   * Zelfs een extreem gunstige wedstrijd verdubbelt
   * de historische productie dus niet automatisch.
   */
  multiplier: {
    minimum:
      0.72,

    maximum:
      1.32,
  },

  /*
   * Invloed per puntenonderdeel.
   */
  componentSensitivity: {
    appearance:
      0.05,

    goals:
      1,

    assists:
      0.82,

    cleanSheet:
      0.95,

    saves:
      -0.20,

    penaltySaves:
      0,

    bonus:
      0.65,

    cards:
      0.05,

    goalsConceded:
      0.75,

    ownGoals:
      0,

    penaltiesMissed:
      0,
  },

  /*
   * Keepers kunnen in zware wedstrijden
   * juist meer reddingen maken.
   */
  goalkeeperSaveSensitivity:
    -0.35,
}

/*
|--------------------------------------------------------------------------
| Vorm en Fantasy Outlook
|--------------------------------------------------------------------------
|
| Vorm, potentie, beschikbaarheid en risico dienen
| als beperkte correctie, niet als vervanging van
| historische productie en verwachte minuten.
|
*/

export const EXPECTED_POINTS_OUTLOOK_CONFIG = {
  form: {
    maximumPositiveModifier:
      0.10,

    maximumNegativeModifier:
      -0.10,
  },

  potential: {
    maximumPositiveModifier:
      0.08,

    maximumNegativeModifier:
      -0.08,
  },

  availability: {
    maximumPositiveModifier:
      0.04,

    maximumNegativeModifier:
      -0.12,
  },

  risk: {
    /*
     * In Fantasy Outlook is een hogere risicoscore
     * ongunstiger.
     */
    maximumNegativeModifier:
      -0.12,
  },

  /*
   * De gezamenlijke Outlook-correctie wordt begrensd.
   */
  combinedModifier: {
    minimum:
      -0.20,

    maximum:
      0.18,
  },
}

/*
|--------------------------------------------------------------------------
| Confidence
|--------------------------------------------------------------------------
|
| De betrouwbaarheid bepaalt vooral de breedte van
| floor en ceiling. De verwachte waarde zelf wordt
| hierdoor maar beperkt beïnvloed.
|
*/

export const EXPECTED_POINTS_CONFIDENCE_CONFIG = {
  sources: {
    historicalMatches:
      30,

    historicalMinutes:
      20,

    explicitExpectedMinutes:
      15,

    explicitPlayingChance:
      10,

    fixtureIntelligence:
      15,

    outlookConfidence:
      10,
  },

  labels: {
    highThreshold:
      75,

    mediumThreshold:
      50,
  },

  /*
   * Onzekerheidsmarge rond expected points.
   */
  interval: {
    minimumSpread:
      1.5,

    maximumSpread:
      6,

    lowConfidenceExtraSpread:
      2.5,

    volatilityWeight:
      0.45,
  },
}

/*
|--------------------------------------------------------------------------
| Fallback-baselines
|--------------------------------------------------------------------------
|
| Voor nieuwe spelers zonder bruikbare historie hebben we
| een behoudende uitgangswaarde per positie en rol nodig.
|
| Dit zijn verwachte Fantasy-punten per 90 minuten in een
| neutrale wedstrijd, vóór fixture- en Outlook-correcties.
|
*/

export const EXPECTED_POINTS_FALLBACK_BASELINES = {
  goalkeeper: {
    'key-player':
      4.4,

    starter:
      4.1,

    rotation:
      3.0,

    prospect:
      2.8,

    backup:
      2.2,

    unknown:
      3.2,
  },

  defender: {
    'key-player':
      4.7,

    starter:
      4.2,

    rotation:
      3.0,

    prospect:
      2.9,

    backup:
      2.2,

    unknown:
      3.3,
  },

  midfielder: {
    'key-player':
      5.3,

    starter:
      4.5,

    rotation:
      3.2,

    prospect:
      3.0,

    backup:
      2.2,

    unknown:
      3.5,
  },

  forward: {
    'key-player':
      5.5,

    starter:
      4.7,

    rotation:
      3.3,

    prospect:
      3.1,

    backup:
      2.3,

    unknown:
      3.6,
  },

  unknown: {
    'key-player':
      4.8,

    starter:
      4.2,

    rotation:
      3.1,

    prospect:
      2.9,

    backup:
      2.2,

    unknown:
      3.3,
  },
}

/*
|--------------------------------------------------------------------------
| Fallback-puntenopbouw
|--------------------------------------------------------------------------
|
| Voor spelers zonder wedstrijdhistorie wordt de fallback
| baseline verdeeld over logische puntenonderdelen.
|
| De percentages tellen per positie op tot 1.
|
*/

export const EXPECTED_POINTS_FALLBACK_BREAKDOWN = {
  goalkeeper: {
    appearance:
      0.43,

    goals:
      0,

    assists:
      0,

    cleanSheet:
      0.25,

    saves:
      0.21,

    penaltySaves:
      0.01,

    bonus:
      0.13,

    cards:
      -0.02,

    goalsConceded:
      -0.01,

    ownGoals:
      0,

    penaltiesMissed:
      0,
  },

  defender: {
    appearance:
      0.43,

    goals:
      0.13,

    assists:
      0.09,

    cleanSheet:
      0.22,

    saves:
      0,

    penaltySaves:
      0,

    bonus:
      0.16,

    cards:
      -0.03,

    goalsConceded:
      0,

    ownGoals:
      0,

    penaltiesMissed:
      0,
  },

  midfielder: {
    appearance:
      0.40,

    goals:
      0.24,

    assists:
      0.18,

    cleanSheet:
      0.04,

    saves:
      0,

    penaltySaves:
      0,

    bonus:
      0.17,

    cards:
      -0.03,

    goalsConceded:
      0,

    ownGoals:
      0,

    penaltiesMissed:
      0,
  },

  forward: {
    appearance:
      0.38,

    goals:
      0.34,

    assists:
      0.17,

    cleanSheet:
      0,

    saves:
      0,

    penaltySaves:
      0,

    bonus:
      0.14,

    cards:
      -0.03,

    goalsConceded:
      0,

    ownGoals:
      0,

    penaltiesMissed:
      0,
  },

  unknown: {
    appearance:
      0.40,

    goals:
      0.23,

    assists:
      0.15,

    cleanSheet:
      0.08,

    saves:
      0,

    penaltySaves:
      0,

    bonus:
      0.17,

    cards:
      -0.03,

    goalsConceded:
      0,

    ownGoals:
      0,

    penaltiesMissed:
      0,
  },
}

/*
|--------------------------------------------------------------------------
| Publieke helpers
|--------------------------------------------------------------------------
*/

export function getExpectedPointsPositionConfig(
  position,
) {
  return (
    EXPECTED_POINTS_FALLBACK_BASELINES[
      position
    ] ??
    EXPECTED_POINTS_FALLBACK_BASELINES
      .unknown
  )
}

export function getExpectedPointsFallbackBreakdown(
  position,
) {
  return (
    EXPECTED_POINTS_FALLBACK_BREAKDOWN[
      position
    ] ??
    EXPECTED_POINTS_FALLBACK_BREAKDOWN
      .unknown
  )
}