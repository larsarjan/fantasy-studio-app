import {
  createFixtureModifier,
} from './fixtureIntelligenceEngine.js'

import {
  createHistoryModifier,
} from './historyModifierEngine.js'

import {
  createFantasyDNA,
} from './modifierEngine.js'

/*
|--------------------------------------------------------------------------
| Fantasy DNA Builder
|--------------------------------------------------------------------------
|
| Centrale verzamelplaats voor alle modifiers van één speler.
|
| Deze service:
|
| - ontvangt één volledig spelersprofiel;
| - vraagt specialistische engines om modifiers;
| - verzamelt geldige modifiers;
| - bouwt daarmee één Fantasy DNA-object;
| - bewaart waarschuwingen wanneer een modifier niet kan worden berekend.
|
| De presentatie rekent niets zelf uit.
|
| Fantasy Outlook, Scout, Vergelijken, Captain Radar en andere onderdelen
| gebruiken uiteindelijk allemaal de uitkomst van deze builder.
|
*/

/*
|--------------------------------------------------------------------------
| Configuratie
|--------------------------------------------------------------------------
*/

const BUILDER_VERSION = 1

const DEFAULT_BASE_SCORE = 5
const DEFAULT_START_ROUND = 1
const DEFAULT_ROUND_COUNT = 5

const MIN_SCORE = 0
const MAX_SCORE = 10

/*
|--------------------------------------------------------------------------
| Getalhelpers
|--------------------------------------------------------------------------
*/

function toNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number =
    Number(value)

  return Number.isFinite(number)
    ? number
    : null
}

function clamp(
  value,
  minimum = MIN_SCORE,
  maximum = MAX_SCORE,
) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return minimum
  }

  return Math.max(
    minimum,
    Math.min(
      maximum,
      number,
    ),
  )
}

function round(
  value,
  digits = 1,
) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return 0
  }

  const factor =
    10 ** digits

  return (
    Math.round(number * factor) /
    factor
  )
}

/*
|--------------------------------------------------------------------------
| Teksthelpers
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  return String(value ?? '')
    .trim()
}

/*
|--------------------------------------------------------------------------
| Fantasy Profiel — configuratie
|--------------------------------------------------------------------------
*/

const MIN_PROFILE_SCORE = 0
const MAX_PROFILE_SCORE = 100

const FANTASY_PROFILE_DEFINITIONS = {
  captain: {
    id: 'captain',
    label: 'Captainwaarde',
    shortLabel: 'Captain',
    icon: '👑',
    accent: 'gold',

    description:
      'Laat zien hoe geschikt deze speler is als captain voor de eerstvolgende speelronde.',

    question:
      'Hoe geschikt is deze speler als captain voor de eerstvolgende speelronde?',

    weights: {
      potential: 40,
      fixtures: 30,
      playingTime: 15,
      form: 15,
    },
  },

  differential: {
    id: 'differential',
    label: 'Differential',
    shortLabel: 'Differential',
    icon: '💎',
    accent: 'purple',

    description:
      'Laat zien hoeveel voordeel deze speler je kan opleveren ten opzichte van andere managers.',

    question:
      'Hoe groot is de kans dat deze speler jou laat stijgen ten opzichte van andere managers?',

    weights: {
      ownership: 60,
      potential: 20,
      fixtures: 15,
      form: 5,
    },
  },

  budget: {
    id: 'budget',
    label: 'Budgetoptie',
    shortLabel: 'Budget',
    icon: '💸',
    accent: 'green',

    description:
      'Laat zien hoe geschikt deze speler is om budget vrij te maken zonder veel kwaliteit te verliezen.',

    question:
      'Hoe geschikt is deze speler om budget vrij te maken zonder veel kwaliteit te verliezen?',

    weights: {
      relativePrice: 40,
      fvtScore: 30,
      playingTime: 20,
      fixtures: 10,
    },
  },

  bonus: {
    id: 'bonus',
    label: 'Bonuskanon',
    shortLabel: 'Bonus',
    icon: '🎯',
    accent: 'orange',

    description:
      'Laat zien hoe groot de kans is dat deze speler de komende wedstrijden structureel OPTA-bonuspunten pakt.',

    question:
      'Hoe groot is de kans dat deze speler de komende wedstrijden structureel OPTA-bonuspunten pakt?',

    weights: {
      bonusPer90: 35,
      bonusFrequency: 25,
      bonusPerMatch: 20,
      potential: 10,
      fixtures: 10,
    },
  },

  longTerm: {
    id: 'longTerm',
    label: 'Langetermijnwaarde',
    shortLabel: 'Lange termijn',
    icon: '📈',
    accent: 'blue',

    description:
      'Laat zien hoe groot de kans is dat je deze speler de komende acht speelrondes met vertrouwen kunt laten staan.',

    question:
      'Hoe groot is de kans dat je deze speler de komende acht speelrondes met vertrouwen kunt laten staan, zonder voortdurend te twijfelen aan een transfer?',

    weights: {
      fixtures: 35,
      playingTime: 30,
      formStability: 20,
      lowRisk: 10,
      historicalStability: 5,
    },
  },

  transfer: {
    id: 'transfer',
    label: 'Transferprioriteit',
    shortLabel: 'Transfer',
    icon: '🔄',
    accent: 'red',

    description:
      'Laat zien hoe aantrekkelijk het is om deze speler nú naar je team te kopen.',

    question:
      'Hoe hoog zou deze speler op jouw transferlijst moeten staan, op basis van zijn huidige kwaliteit, aankomende programma, verwachte speeltijd, waarde en vorm?',

    weights: {
      fvtScore: 35,
      fixtures: 25,
      playingTime: 20,
      value: 10,
      form: 10,
    },
  },
}

/*
|--------------------------------------------------------------------------
| Fantasy Profiel — algemene helpers
|--------------------------------------------------------------------------
*/

function clampProfileScore(value) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
    return 0
  }

  return Math.max(
    MIN_PROFILE_SCORE,
    Math.min(
      MAX_PROFILE_SCORE,
      number,
    ),
  )
}

function normalizeProfileScore(value) {
  const number =
    toNumber(value)

  if (number === null) {
    return null
  }

  return clampProfileScore(
    number <= 10
      ? number * 10
      : number,
  )
}

function normalizePercentage(value) {
  const number =
    toNumber(value)

  if (number === null) {
    return null
  }

  return clampProfileScore(
    number <= 1
      ? number * 100
      : number,
  )
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized =
    cleanText(value)
      .toLowerCase()

  if (
    [
      'true',
      'waar',
      'yes',
      'ja',
      '1',
    ].includes(normalized)
  ) {
    return true
  }

  if (
    [
      'false',
      'onwaar',
      'no',
      'nee',
      '0',
    ].includes(normalized)
  ) {
    return false
  }

  return null
}

function calculateWeightedProfileScore(
  components,
) {
  const availableComponents =
    components
      .map((component) => ({
        ...component,

        score:
          normalizeProfileScore(
            component.score,
          ),

        weight:
          Math.max(
            0,
            Number(
              component.weight,
            ) || 0,
          ),
      }))
      .filter(
        (component) =>
          component.score !== null &&
          component.weight > 0,
      )

  const totalWeight =
    availableComponents
      .reduce(
        (sum, component) =>
          sum +
          component.weight,
        0,
      )

  if (!totalWeight) {
    return {
      score: 0,
      hasData: false,
      usedWeight: 0,

      components:
        components.map(
          (component) => ({
            ...component,

            score:
              normalizeProfileScore(
                component.score,
              ),

            available: false,
            effectiveWeight: 0,
          }),
        ),
    }
  }

  const weightedScore =
    availableComponents
      .reduce(
        (sum, component) =>
          sum +
          (
            component.score *
            component.weight
          ),
        0,
      ) /
    totalWeight

  return {
    score:
      round(
        clampProfileScore(
          weightedScore,
        ),
        0,
      ),

    hasData: true,

    usedWeight:
      round(
        totalWeight,
        1,
      ),

    components:
      components.map(
        (component) => {
          const score =
            normalizeProfileScore(
              component.score,
            )

          const available =
            score !== null &&
            Number(
              component.weight,
            ) > 0

          return {
            ...component,
            score,
            available,

            effectiveWeight:
              available
                ? round(
                    (
                      Number(
                        component.weight,
                      ) /
                      totalWeight
                    ) * 100,
                    1,
                  )
                : 0,
          }
        },
      ),
  }
}

function getFantasyProfileLabel(score) {
  const value =
    clampProfileScore(score)

  if (value >= 90) {
    return 'Uitstekend'
  }

  if (value >= 80) {
    return 'Zeer goed'
  }

  if (value >= 70) {
    return 'Goed'
  }

  if (value >= 60) {
    return 'Interessant'
  }

  if (value >= 50) {
    return 'Gemiddeld'
  }

  if (value >= 35) {
    return 'Matig'
  }

  return 'Laag'
}

function createFantasyProfileResult({
  definition,
  calculation,
}) {
  return {
    ...definition,

    score:
      calculation.score,

    label:
      getFantasyProfileLabel(
        calculation.score,
      ),

    hasData:
      calculation.hasData,

    usedWeight:
      calculation.usedWeight,

    components:
      calculation.components,
  }
}

/*
|--------------------------------------------------------------------------
| Opties
|--------------------------------------------------------------------------
*/

function normalizeBuilderOptions(
  options = {},
) {
  return {
    baseScore:
      toNumber(
        options.baseScore,
      ),

    startRound:
      Math.max(
        1,
        Number(
          options.startRound,
        ) ||
        DEFAULT_START_ROUND,
      ),

    roundCount:
      Math.max(
        1,
        Number(
          options.roundCount,
        ) ||
        DEFAULT_ROUND_COUNT,
      ),

    includeFixtures:
      options.includeFixtures !==
      false,

    fixtures:
      options.fixtures,

    results:
      options.results,

    teamRatings:
      options.teamRatings,

    /*
     * Reeds berekende intelligentie.
     *
     * De Fantasy Profiel Builder rekent deze
     * onderdelen niet opnieuw uit, maar gebruikt
     * de resultaten van de bestaande engines.
     */
    outlook:
      options.outlook ??
      null,

    fvtScore:
      options.fvtScore ??
      null,

      fixtureModifier:
  options.fixtureModifier ??
  null,

  profiler:
  options.profiler ??
  null,

    /*
     * Alle spelers van hetzelfde seizoen.
     *
     * Nodig om de relatieve prijs binnen
     * een positie te kunnen bepalen.
     */
    referencePlayers:
      Array.isArray(
        options.referencePlayers,
      )
        ? options.referencePlayers
        : [],

    /*
     * Eventuele reeds opgebouwde
     * wedstrijdstatistieken en historie.
     */
    playerMatchStats:
      Array.isArray(
        options.playerMatchStats,
      )
        ? options.playerMatchStats
        : [],

    playerHistory:
      options.playerHistory ??
      null,
  }
}

/*
|--------------------------------------------------------------------------
| Basisscore
|--------------------------------------------------------------------------
|
| De expliciet meegegeven baseScore is altijd leidend.
|
| Daarna controleert de builder enkele vaste plekken waar een basisscore
| later vanuit het spelersmodel kan worden opgeslagen.
|
| Zolang die centrale basisscore nog niet aan het spelersmodel is
| gekoppeld, valt de builder veilig terug op 5.
|
*/

function resolveBaseScore(
  player,
  options,
) {
  const candidates = [
    options.baseScore,

    player?.fantasyBaseScore,

    player?.outlook
      ?.baseScore,

    player?.profile
      ?.baseScore,

    player?.calculation
      ?.baseScore,
  ]

  for (
    const candidate
    of candidates
  ) {
    const value =
      toNumber(candidate)

    if (value !== null) {
      return clamp(
        value,
        MIN_SCORE,
        MAX_SCORE,
      )
    }
  }

  return DEFAULT_BASE_SCORE
}

/*
|--------------------------------------------------------------------------
| Context
|--------------------------------------------------------------------------
*/

function buildPlayerContext(
  player,
  options,
) {
  return {
    playerId:
      cleanText(
        player?.id,
      ),

    playerName:
      cleanText(
        player?.name,
      ),

    club:
      cleanText(
        player?.club,
      ),

    season:
      cleanText(
        player?.season,
      ),

    position:
      cleanText(
        player
          ?.fantasyPosition ??
        player?.position,
      ),

    startRound:
      options.startRound,

    roundCount:
      options.roundCount,
  }
}

/*
|--------------------------------------------------------------------------
| Waarschuwingen
|--------------------------------------------------------------------------
*/

function createBuilderWarning({
  id,
  label,
  message,
  error = null,
}) {
  return {
    id:
      cleanText(id) ||
      'unknown',

    label:
      cleanText(label) ||
      'Onbekende modifier',

    message:
      cleanText(message) ||
      'De modifier kon niet worden berekend.',

    error:
      error instanceof Error
        ? error.message
        : cleanText(error),
  }
}

/*
|--------------------------------------------------------------------------
| Modifier verzamelen
|--------------------------------------------------------------------------
|
| Iedere specialistische engine kan zelfstandig mislukken.
|
| Eén ontbrekende modifier mag nooit voorkomen dat het volledige
| Fantasy DNA van een speler wordt opgebouwd.
|
*/

function addModifierSafely({
  modifiers,
  warnings,
  id,
  label,
  create,
}) {
  try {
    const modifier =
      create()

    if (!modifier) {
      warnings.push(
        createBuilderWarning({
          id,
          label,

          message:
            'De engine leverde geen modifier terug.',
        }),
      )

      return
    }

    modifiers.push(
      modifier,
    )
  } catch (error) {
    warnings.push(
      createBuilderWarning({
        id,
        label,

        message:
          'De modifier kon niet worden berekend.',

        error,
      }),
    )
  }
}

/*
|--------------------------------------------------------------------------
| Programma-modifier
|--------------------------------------------------------------------------
*/

function addFixtureModifier({
  player,
  options,
  modifiers,
  warnings,
}) {
  if (!options.includeFixtures) {
    return
  }

  addModifierSafely({
    modifiers,
    warnings,

    id:
      'fixtures',

    label:
      'Aankomend programma',

      create: () => {
  /*
   * Wanneer de programmamodifier al eerder
   * is berekend, gebruiken we exact diezelfde
   * uitkomst opnieuw.
   */
  if (options.fixtureModifier) {
    return options.fixtureModifier
  }

  const fixtureOptions = {
    player,

    startRound:
      options.startRound,

    roundCount:
      options.roundCount,
  }

  if (
    Array.isArray(
      options.fixtures,
    )
  ) {
    fixtureOptions.fixtures =
      options.fixtures
  }

  if (
    Array.isArray(
      options.results,
    )
  ) {
    fixtureOptions.results =
      options.results
  }

  if (
    Array.isArray(
      options.teamRatings,
    )
  ) {
    fixtureOptions.teamRatings =
      options.teamRatings
  }

  return createFixtureModifier(
    fixtureOptions,
  )
},
  })
}

/*
|--------------------------------------------------------------------------
| Toekomstige specialistische modifiers
|--------------------------------------------------------------------------
|
| Deze functies zijn bewust nog niet actief.
|
| Hier sluiten we straks één voor één de bestaande en nieuwe engines aan:
|
| - historische onderbouwing;
| - recente vorm;
| - speelzekerheid;
| - Fantasy-potentie;
| - prijs-kwaliteit;
| - risico.
|
| Iedere functie voegt via addModifierSafely() maximaal één modifier toe.
|
*/

function addHistoryModifier({
  player,
  modifiers,
  warnings,
}) {
  addModifierSafely({
    modifiers,
    warnings,

    id:
      'history',

    label:
      'Historische onderbouwing',

    create: () =>
      createHistoryModifier(
        player,
      ),
  })
}

function addFormModifier() {
  /*
   * Wordt gekoppeld zodra de vorm-engine
   * onderdeel is van versie 1.0.
   */
}

function addAvailabilityModifier() {
  /*
   * Wordt gekoppeld aan de bestaande
   * speelzekerheidsberekening.
   */
}

function addPotentialModifier() {
  /*
   * Wordt gekoppeld aan de bestaande
   * potentieberekening.
   */
}

function addValueModifier() {
  /*
   * Wordt gekoppeld aan prijs en
   * prijs-kwaliteitgegevens.
   */
}

function addRiskModifier() {
  /*
   * Wordt gekoppeld aan blessure-, rotatie-
   * en beschikbaarheidsrisico.
   */
}

/*
|--------------------------------------------------------------------------
| Alle modifiers verzamelen
|--------------------------------------------------------------------------
*/

function collectPlayerModifiers({
  player,
  options,
}) {
  const modifiers = []
  const warnings = []

  addFixtureModifier({
    player,
    options,
    modifiers,
    warnings,
  })

  /*
   * Vaste uitbreidingsvolgorde voor versie 1.0.
   *
   * Deze functies doen nu nog niets en kunnen
   * later zonder wijziging van de publieke API
   * worden ingevuld.
   */

  addHistoryModifier({
    player,
    options,
    modifiers,
    warnings,
  })

  addFormModifier({
    player,
    options,
    modifiers,
    warnings,
  })

  addAvailabilityModifier({
    player,
    options,
    modifiers,
    warnings,
  })

  addPotentialModifier({
    player,
    options,
    modifiers,
    warnings,
  })

  addValueModifier({
    player,
    options,
    modifiers,
    warnings,
  })

  addRiskModifier({
    player,
    options,
    modifiers,
    warnings,
  })

  return {
    modifiers,
    warnings,
  }
}

/*
|--------------------------------------------------------------------------
| Fantasy Profiel — bestaande databronnen uitlezen
|--------------------------------------------------------------------------
|
| Deze functies bouwen geen nieuwe algemene engines.
|
| Ze lezen uitsluitend gegevens uit die al door Fantasy Studio zijn
| berekend of rechtstreeks in het spelersprofiel beschikbaar zijn.
|
*/

function resolveOutlook(
  player,
  options,
) {
  return (
    options.outlook ??
    player?.outlook ??
    null
  )
}

function resolveFvtScore(
  player,
  options,
) {
  const candidates = [
    options.fvtScore?.score,
    options.fvtScore,
    player?.fvtScore?.score,
    player?.fvtScore,
    player?.fantasyScore,
  ]

  for (
    const candidate
    of candidates
  ) {
    const score =
      normalizeProfileScore(
        candidate,
      )

    if (score !== null) {
      return score
    }
  }

  return null
}

function resolveOutlookScore({
  player,
  options,
  key,
}) {
  const outlook =
    resolveOutlook(
      player,
      options,
    )

  const candidates = [
    outlook?.scores?.[key],
    outlook?.[key]?.score,
    player?.outlook?.scores?.[key],
    player?.outlook?.[key],
  ]

  for (
    const candidate
    of candidates
  ) {
    const score =
      normalizeProfileScore(
        candidate,
      )

    if (score !== null) {
      return score
    }
  }

  return null
}

/*
|--------------------------------------------------------------------------
| Verwachte speeltijd
|--------------------------------------------------------------------------
|
| Speelzekerheid is de bestaande basis.
|
| Wanneer verwachte minuten beschikbaar zijn, tellen die mee zodat een
| vaste basisspeler die meestal vroeg wordt gewisseld niet automatisch
| dezelfde score krijgt als een speler die vrijwel altijd 90 minuten maakt.
|
*/

function resolvePlayingTimeScore(
  player,
  options,
) {
  const availability =
    resolveOutlookScore({
      player,
      options,
      key: 'availability',
    })

  const expectedMinutesRaw =
    toNumber(
      player?.expectedMinutes ??
      player?.scoutProfile
        ?.expectedMinutes,
    )

  const expectedMinutes =
    expectedMinutesRaw === null
      ? null
      : clampProfileScore(
          (
            expectedMinutesRaw /
            90
          ) * 100,
        )

  const expectedStarter =
    normalizeBoolean(
      player?.expectedStarter ??
      player?.scoutProfile
        ?.expectedStarter,
    )

  const calculation =
    calculateWeightedProfileScore([
      {
        id: 'availability',
        label: 'Speelzekerheid',
        score: availability,
        weight: 55,
      },

      {
        id: 'expectedMinutes',
        label: 'Verwachte minuten',
        score: expectedMinutes,
        weight: 45,
      },
    ])

  if (!calculation.hasData) {
    return null
  }

  let score =
    calculation.score

  if (
    expectedStarter === true &&
    score < 96
  ) {
    score += 3
  }

  if (
    expectedStarter === false &&
    score > 55
  ) {
    score -= 12
  }

  return clampProfileScore(
    score,
  )
}

/*
|--------------------------------------------------------------------------
| Differential — ownershipcurve
|--------------------------------------------------------------------------
|
| 1% en 4% zijn allebei sterke differentials.
|
| Daarna loopt de score steeds sneller terug. Vanaf 25% ownership is de
| ownershipcomponent nul, omdat de speler dan niet meer onderscheidend is.
|
*/

function resolveOwnershipScore(
  player,
) {
  const ownership =
    normalizePercentage(
      player?.selectedPct ??
      player?.ownership ??
      player?.selectedPercentage,
    )

  if (ownership === null) {
    return null
  }

  const anchors = [
    [0, 100],
    [2, 100],
    [5, 96],
    [7, 85],
    [10, 65],
    [12, 45],
    [15, 25],
    [20, 10],
    [25, 0],
  ]

  if (ownership >= 25) {
    return 0
  }

  for (
    let index = 0;
    index < anchors.length - 1;
    index += 1
  ) {
    const [
      leftOwnership,
      leftScore,
    ] = anchors[index]

    const [
      rightOwnership,
      rightScore,
    ] = anchors[index + 1]

    if (
      ownership >= leftOwnership &&
      ownership <= rightOwnership
    ) {
      const progress =
        (
          ownership -
          leftOwnership
        ) /
        (
          rightOwnership -
          leftOwnership
        )

      return clampProfileScore(
        leftScore +
        (
          rightScore -
          leftScore
        ) *
        progress,
      )
    }
  }

  return 100
}

/*
|--------------------------------------------------------------------------
| Budgetoptie — relatieve prijs binnen de positie
|--------------------------------------------------------------------------
*/

function resolveCurrentPrice(
  player,
) {
  const candidates = [
    player?.currentPrice,
    player?.endPrice,
    player?.startPrice,
    player?.price,
  ]

  for (
    const candidate
    of candidates
  ) {
    const price =
      toNumber(candidate)

    if (
      price !== null &&
      price > 0
    ) {
      return price
    }
  }

  return null
}

function resolveRelativePriceScore(
  player,
  options,
) {
  const playerPrice =
    resolveCurrentPrice(
      player,
    )

  if (playerPrice === null) {
    return null
  }

  const playerPosition =
    cleanText(
      player?.fantasyPosition ??
      player?.position,
    )
      .toLowerCase()

  const playerSeason =
    cleanText(
      player?.season,
    )

  /*
  |--------------------------------------------------------------------------
  | Vergelijkbare spelers
  |--------------------------------------------------------------------------
  |
  | Een budgetprijs moet altijd worden beoordeeld ten opzichte van spelers
  | uit dezelfde Fantasy-positie en hetzelfde seizoen.
  |
  | Een goedkope spits heeft immers een andere prijsgrens dan een goedkope
  | doelman of verdediger.
  |
  */

  const comparablePrices =
    options.referencePlayers
      .filter(
        (candidate) => {
          const candidatePosition =
            cleanText(
              candidate
                ?.fantasyPosition ??
              candidate?.position,
            )
              .toLowerCase()

          const candidateSeason =
            cleanText(
              candidate?.season,
            )

          return (
            candidatePosition ===
              playerPosition &&
            (
              !playerSeason ||
              !candidateSeason ||
              candidateSeason ===
                playerSeason
            )
          )
        },
      )
      .map(
        resolveCurrentPrice,
      )
      .filter(
        (price) =>
          Number.isFinite(
            price,
          ) &&
          price > 0,
      )
      .sort(
        (left, right) =>
          left - right,
      )

  if (
    comparablePrices.length < 2
  ) {
    return null
  }

  const lowestPrice =
    comparablePrices[0]

  const highestPrice =
    comparablePrices[
      comparablePrices.length - 1
    ]

  /*
   * Wanneer alle spelers binnen deze positie dezelfde prijs hebben,
   * bestaat er geen betekenisvol budgetverschil.
   */
  if (
    lowestPrice ===
    highestPrice
  ) {
    return 50
  }

  /*
  |--------------------------------------------------------------------------
  | Goedkope prijsrang
  |--------------------------------------------------------------------------
  |
  | We bepalen welk percentage van de vergelijkbare spelers even goedkoop
  | of goedkoper is dan deze speler.
  |
  | Voorbeeld:
  |
  | percentile 0.10 = speler behoort tot goedkoopste 10%
  | percentile 0.50 = speler zit ongeveer in het midden
  | percentile 0.90 = speler behoort tot duurste 10%
  |
  | Spelers met dezelfde prijs krijgen dezelfde score.
  |
  */

  const cheaperCount =
    comparablePrices.filter(
      (price) =>
        price <
        playerPrice,
    ).length

  const equalCount =
    comparablePrices.filter(
      (price) =>
        price ===
        playerPrice,
    ).length

  /*
   * Bij gelijke prijzen gebruiken we het midden van de gedeelde prijsrang.
   * Daardoor krijgen spelers met exact dezelfde prijs exact dezelfde score.
   */
  const percentile =
    (
      cheaperCount +
      Math.max(
        0,
        equalCount - 1,
      ) / 2
    ) /
    Math.max(
      1,
      comparablePrices.length - 1,
    )

  /*
  |--------------------------------------------------------------------------
  | Niet-lineaire budgetcurve
  |--------------------------------------------------------------------------
  |
  | Prijs is hier bewust dominant.
  |
  | De goedkoopste spelers krijgen vrijwel allemaal een zeer hoge score.
  | Vanaf het middensegment daalt de score veel sneller.
  |
  | Hierdoor kan een dure speler niet meer eenvoudig als Budgetparel
  | eindigen doordat zijn algemene FVT Score hoog is.
  |
  | Prijszone binnen positie       Budgetscore
  | ------------------------------------------------
  | goedkoopste 10%                100
  | 10% tot 20%                     98
  | 20% tot 30%                     94
  | 30% tot 40%                     86
  | 40% tot 50%                     74
  | 50% tot 60%                     58
  | 60% tot 70%                     40
  | 70% tot 80%                     24
  | 80% tot 90%                     10
  | duurste 10%                      0
  |
  */

  const priceCurve = [
  [0.00, 100],
  [0.10, 100],
  [0.20, 96],
  [0.30, 88],
  [0.40, 68],
  [0.50, 42],
  [0.60, 18],
  [0.70, 7],
  [0.80, 2],
  [0.90, 0],
  [1.00, 0],
]

  for (
    let index = 0;
    index <
    priceCurve.length - 1;
    index += 1
  ) {
    const [
      leftPercentile,
      leftScore,
    ] =
      priceCurve[index]

    const [
      rightPercentile,
      rightScore,
    ] =
      priceCurve[index + 1]

    if (
      percentile >=
        leftPercentile &&
      percentile <=
        rightPercentile
    ) {
      const range =
        rightPercentile -
        leftPercentile

      const progress =
        range > 0
          ? (
              percentile -
              leftPercentile
            ) /
            range
          : 0

      const score =
        leftScore +
        (
          rightScore -
          leftScore
        ) *
        progress

      return round(
        clampProfileScore(
          score,
        ),
        1,
      )
    }
  }

  return percentile <= 0
    ? 100
    : 0
}

/*
|--------------------------------------------------------------------------
| Bonuskanon — bestaande bonusdata
|--------------------------------------------------------------------------
*/

function resolveBonusScores(
  player,
) {
  const totalBonus =
    toNumber(
      player?.optaBonus,
    )

  const matches =
    toNumber(
      player?.matches,
    )

  const minutes =
    toNumber(
      player?.minutes,
    )

  const bonusPerMatch =
    totalBonus !== null &&
    matches > 0
      ? totalBonus / matches
      : null

  const bonusPer90 =
    totalBonus !== null &&
    minutes > 0
      ? (
          totalBonus /
          minutes
        ) * 90
      : null

  const explicitFrequency =
    normalizePercentage(
      player?.bonusFrequency ??
      player?.optaBonusFrequency,
    )

  return {
    /*
     * Ongeveer 3 bonuspunten per 90
     * vertegenwoordigt voorlopig de bovengrens.
     */
    bonusPer90:
      bonusPer90 === null
        ? null
        : clampProfileScore(
            (
              bonusPer90 /
              3
            ) * 100,
          ),

    /*
     * Ongeveer 2,5 bonuspunten per wedstrijd
     * vertegenwoordigt voorlopig de bovengrens.
     */
    bonusPerMatch:
      bonusPerMatch === null
        ? null
        : clampProfileScore(
            (
              bonusPerMatch /
              2.5
            ) * 100,
          ),

    /*
     * Bonusfrequentie wordt pas volledig
     * beschikbaar wanneer PLAYER_MATCH_STATS
     * voldoende wedstrijdregels bevat.
     */
    bonusFrequency:
      explicitFrequency,
  }
}

/*
|--------------------------------------------------------------------------
| Langetermijnwaarde — stabiliteit
|--------------------------------------------------------------------------
|
| De stabiliteitsmotor wordt later rechtstreeks gekoppeld aan de volledige
| wedstrijdhistorie. Tot die tijd gebruiken we bestaande stabiliteitsvelden
| wanneer die door het spelersmodel worden aangeleverd.
|
*/

function resolveStabilityScores(
  player,
  options,
) {
  const history =
    options.playerHistory ??
    player?.history ??
    null

  const formStability =
    normalizeProfileScore(
      player?.formStability ??
      history?.formStability ??
      history?.stability?.form,
    )

  const historicalStability =
    normalizeProfileScore(
      player?.historicalStability ??
      history?.historicalStability ??
      history?.stability?.overall,
    )

  return {
    formStability,
    historicalStability,
  }
}

function resolveLowRiskScore(
  player,
  options,
) {
  const risk =
    resolveOutlookScore({
      player,
      options,
      key: 'risk',
    })

  if (risk !== null) {
    return clampProfileScore(
      100 - risk,
    )
  }

  let penalty = 0
  let hasData = false

  const rotationRisk =
    normalizeBoolean(
      player?.rotationRisk ??
      player?.scoutProfile
        ?.rotationRisk,
    )

  const injuryRisk =
    normalizeBoolean(
      player?.injuryRisk ??
      player?.scoutProfile
        ?.injuryRisk,
    )

  if (rotationRisk !== null) {
    hasData = true

    if (rotationRisk) {
      penalty += 30
    }
  }

  if (injuryRisk !== null) {
    hasData = true

    if (injuryRisk) {
      penalty += 30
    }
  }

  return hasData
    ? clampProfileScore(
        100 - penalty,
      )
    : null
}

/*
|--------------------------------------------------------------------------
| Eén profielresultaat samenstellen
|--------------------------------------------------------------------------
*/

function buildFantasyProfileResult({
  definition,
  components,
}) {
  const calculation =
    calculateWeightedProfileScore(
      components,
    )

  return createFantasyProfileResult({
    definition,
    calculation,
  })
}

/*
|--------------------------------------------------------------------------
| De zes Fantasy Profiel-scores
|--------------------------------------------------------------------------
*/

function createPlayerFantasyProfile(
  player,
  options,
) {
  const potential =
    resolveOutlookScore({
      player,
      options,
      key: 'potential',
    })

  const fixtures =
    resolveOutlookScore({
      player,
      options,
      key: 'fixtures',
    })

  const form =
    resolveOutlookScore({
      player,
      options,
      key: 'form',
    })

  const value =
    resolveOutlookScore({
      player,
      options,
      key: 'value',
    })

  const playingTime =
    resolvePlayingTimeScore(
      player,
      options,
    )

  const fvtScore =
    resolveFvtScore(
      player,
      options,
    )

  const ownership =
    resolveOwnershipScore(
      player,
    )

  const relativePrice =
    resolveRelativePriceScore(
      player,
      options,
    )

  const bonus =
    resolveBonusScores(
      player,
    )

  const stability =
    resolveStabilityScores(
      player,
      options,
    )

  const lowRisk =
    resolveLowRiskScore(
      player,
      options,
    )

  const captain =
    buildFantasyProfileResult({
      definition:
        FANTASY_PROFILE_DEFINITIONS
          .captain,

      components: [
        {
          id: 'potential',
          label: 'Fantasy-potentie',
          score: potential,
          weight: 40,
        },

        {
          id: 'fixtures',
          label: 'Programma',
          score: fixtures,
          weight: 30,
        },

        {
          id: 'playingTime',
          label: 'Verwachte speeltijd',
          score: playingTime,
          weight: 15,
        },

        {
          id: 'form',
          label: 'Vorm',
          score: form,
          weight: 15,
        },
      ],
    })

  const differential =
    buildFantasyProfileResult({
      definition:
        FANTASY_PROFILE_DEFINITIONS
          .differential,

      components: [
        {
          id: 'ownership',
          label: 'Ownership',
          score: ownership,
          weight: 60,
        },

        {
          id: 'potential',
          label: 'Fantasy-potentie',
          score: potential,
          weight: 20,
        },

        {
          id: 'fixtures',
          label: 'Programma',
          score: fixtures,
          weight: 15,
        },

        {
          id: 'form',
          label: 'Vorm',
          score: form,
          weight: 5,
        },
      ],
    })

  const rawBudget =
  buildFantasyProfileResult({
    definition:
      FANTASY_PROFILE_DEFINITIONS
        .budget,

    components: [
      {
        id: 'relativePrice',
        label:
          'Relatieve prijs binnen positie',
        score: relativePrice,
        weight: 60,
      },

      {
        id: 'playingTime',
        label:
          'Verwachte speeltijd',
        score: playingTime,
        weight: 25,
      },

      {
        id: 'fvtScore',
        label:
          'Fantasykwaliteit',
        score: fvtScore,
        weight: 15,
      },
    ],
  })

/*
|--------------------------------------------------------------------------
| Budgettoelating
|--------------------------------------------------------------------------
|
| De prijsrang binnen de eigen positie bepaalt hoe hoog een speler
| maximaal als Budgetoptie mag eindigen.
|
| Een dure speler kan daardoor nooit door een hoge FVT Score alsnog
| bovenaan de Budgetranglijst verschijnen.
|
| relativePrice:
| 100 = goedkoopste binnen positie
|   0 = duurste binnen positie
|
*/

function getBudgetScoreCap(
  relativePriceScore,
) {
  const priceScore =
    Number(
      relativePriceScore,
    )

  if (
    !Number.isFinite(
      priceScore,
    )
  ) {
    return 100
  }

  /*
   * Goedkoopste ongeveer 30%:
   * volledige Budgetscore mogelijk.
   */
  if (priceScore >= 88) {
    return 100
  }

  /*
   * Nog duidelijk goedkoop:
   * maximaal een sterke Budgetscore.
   */
  if (priceScore >= 68) {
    return 85
  }

  /*
   * Middensegment:
   * hooguit een redelijke budgetoptie.
   */
  if (priceScore >= 42) {
    return 70
  }

  /*
   * Relatief duur:
   * geen echte Budgetparel.
   */
  if (priceScore >= 18) {
    return 55
  }

  /*
   * Duurste spelers binnen hun positie.
   */
  return 40
}

const budgetCap =
  getBudgetScoreCap(
    relativePrice,
  )

const budget = {
  ...rawBudget,

  score:
    Math.min(
      rawBudget.score,
      budgetCap,
    ),

  label:
    getFantasyProfileLabel(
      Math.min(
        rawBudget.score,
        budgetCap,
      ),
    ),

  budgetCap,

  priceEligible:
    Number(
      relativePrice,
    ) >= 68,
}

  const bonusCannon =
    buildFantasyProfileResult({
      definition:
        FANTASY_PROFILE_DEFINITIONS
          .bonus,

      components: [
        {
          id: 'bonusPer90',
          label: 'OPTA-bonus per 90',
          score: bonus.bonusPer90,
          weight: 35,
        },

        {
          id: 'bonusFrequency',
          label: 'Bonusfrequentie',
          score:
            bonus.bonusFrequency,
          weight: 25,
        },

        {
          id: 'bonusPerMatch',
          label:
            'OPTA-bonus per wedstrijd',
          score:
            bonus.bonusPerMatch,
          weight: 20,
        },

        {
          id: 'potential',
          label: 'Fantasy-potentie',
          score: potential,
          weight: 10,
        },

        {
          id: 'fixtures',
          label: 'Programma',
          score: fixtures,
          weight: 10,
        },
      ],
    })

  const longTerm =
    buildFantasyProfileResult({
      definition:
        FANTASY_PROFILE_DEFINITIONS
          .longTerm,

      components: [
        {
          id: 'fixtures',
          label:
            'Programma komende periode',
          score: fixtures,
          weight: 35,
        },

        {
          id: 'playingTime',
          label: 'Verwachte speeltijd',
          score: playingTime,
          weight: 30,
        },

        {
          id: 'formStability',
          label:
            'Stabiliteit van de vorm',
          score:
            stability.formStability,
          weight: 20,
        },

        {
          id: 'lowRisk',
          label: 'Laag risico',
          score: lowRisk,
          weight: 10,
        },

        {
          id: 'historicalStability',
          label:
            'Historische stabiliteit',
          score:
            stability
              .historicalStability,
          weight: 5,
        },
      ],
    })

  const transfer =
    buildFantasyProfileResult({
      definition:
        FANTASY_PROFILE_DEFINITIONS
          .transfer,

      components: [
        {
          id: 'fvtScore',
          label: 'FVT Score',
          score: fvtScore,
          weight: 35,
        },

        {
          id: 'fixtures',
          label: 'Programma',
          score: fixtures,
          weight: 25,
        },

        {
          id: 'playingTime',
          label: 'Verwachte speeltijd',
          score: playingTime,
          weight: 20,
        },

        {
          id: 'value',
          label: 'Waarde',
          score: value,
          weight: 10,
        },

        {
          id: 'form',
          label: 'Vorm',
          score: form,
          weight: 10,
        },
      ],
    })

  const items = [
    captain,
    differential,
    budget,
    bonusCannon,
    longTerm,
    transfer,
  ]

  const availableItems =
    items.filter(
      (item) =>
        item.hasData,
    )

  const overallScore =
    availableItems.length
      ? round(
          availableItems.reduce(
            (sum, item) =>
              sum + item.score,
            0,
          ) /
          availableItems.length,
          0,
        )
      : 0

  return {
    score:
      overallScore,

    label:
      getFantasyProfileLabel(
        overallScore,
      ),

    items,

    captain,
    differential,
    budget,

    bonus:
      bonusCannon,

    longTerm,
    transfer,

    calculatedAt:
      new Date()
        .toISOString(),
  }
}

/*
|--------------------------------------------------------------------------
| Leeg Fantasy DNA
|--------------------------------------------------------------------------
|
| Ook bij ontbrekende spelersdata leveren we een voorspelbaar object terug.
|
*/

function createEmptyFantasyDNA({
  player,
  options,
  warning,
}) {
  const baseScore =
    resolveBaseScore(
      player,
      options,
    )

    const fantasyDNA =
    createFantasyDNA({
      baseScore,
      modifiers: [],
    })

  const fantasyProfile =
    createPlayerFantasyProfile(
      player ?? {},
      options,
    )

  return {
    ...fantasyDNA,

    fantasyProfile,

    context:
      buildPlayerContext(
        player,
        options,
      ),

    warnings: [
      createBuilderWarning(
        warning,
      ),
    ],

    builder: {
      version:
        BUILDER_VERSION,

      status:
        'incomplete',

      modifierCount:
        0,

      warningCount:
        1,
    },
  }
}

/*
|--------------------------------------------------------------------------
| Fantasy DNA van één speler bouwen
|--------------------------------------------------------------------------
*/

function calculatePlayerFantasyDNA(
  player,
  builderOptions = {},
) {
  const options =
    normalizeBuilderOptions(
      builderOptions,
    )

  if (
    !player ||
    typeof player !== 'object'
  ) {
    return createEmptyFantasyDNA({
      player,
      options,

      warning: {
        id:
          'player',

        label:
          'Spelersprofiel',

        message:
          'Er is geen geldig spelersprofiel aangeleverd.',
      },
    })
  }

  if (!player.club) {
    return createEmptyFantasyDNA({
      player,
      options,

      warning: {
        id:
          'club',

        label:
          'Clubgegevens',

        message:
          'De speler heeft geen gekoppelde club.',
      },
    })
  }

  const baseScore =
    resolveBaseScore(
      player,
      options,
    )

  const modifiersStartedAt =
  performance.now()

const {
  modifiers,
  warnings,
} =
  collectPlayerModifiers({
    player,
    options,
  })

if (options.profiler) {
  options.profiler.dnaModifiers +=
    performance.now() -
    modifiersStartedAt
}

const fantasyDNA =
  createFantasyDNA({
    baseScore,
    modifiers,
  })

const profileStartedAt =
  performance.now()

const fantasyProfile =
  createPlayerFantasyProfile(
    player,
    options,
  )

if (options.profiler) {
  options.profiler.dnaProfile +=
    performance.now() -
    profileStartedAt
}

  return {
    ...fantasyDNA,

    fantasyProfile,

    context:
      buildPlayerContext(
        player,
        options,
      ),

    warnings,

    builder: {
      version:
        BUILDER_VERSION,

      status:
        warnings.length
          ? 'partial'
          : 'success',

      modifierCount:
        modifiers.length,

      warningCount:
        warnings.length,

      calculatedAt:
        new Date()
          .toISOString(),
    },
  }
}

/*
|--------------------------------------------------------------------------
| Meerdere spelers
|--------------------------------------------------------------------------
*/

function calculatePlayersFantasyDNA(
  players,
  options = {},
) {
  if (!Array.isArray(players)) {
    return []
  }

  return players.map(
    (player) => ({
      player,

      fantasyDNA:
        calculatePlayerFantasyDNA(
          player,
          options,
        ),
    }),
  )
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

export {
  FANTASY_PROFILE_DEFINITIONS,
  createPlayerFantasyProfile,
  calculatePlayerFantasyDNA,
  calculatePlayersFantasyDNA,
}