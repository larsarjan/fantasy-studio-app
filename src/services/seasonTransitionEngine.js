/*
|--------------------------------------------------------------------------
| Season Transition Engine
|--------------------------------------------------------------------------
|
| Centrale eigenaar van de overgang tussen:
|
| - preseason-informatie uit scouting en spreadsheet;
| - actuele informatie uit het lopende seizoen.
|
| De engine maakt twee afzonderlijke afwegingen:
|
| 1. Rol
|    Gebaseerd op geregistreerde wedstrijden.
|    Ook op de bank blijven is informatie.
|
| 2. Productie
|    Gebaseerd op daadwerkelijke optredens en minuten.
|    Niet spelen zegt niets over goals of assists per 90.
|
| Deze engine:
|
| - berekent geen Fantasy-punten;
| - bepaalt geen spelersrol;
| - berekent geen productie;
| - wijzigt geen scoutingdata;
| - bepaalt uitsluitend de gewichten.
|
*/

/*
|--------------------------------------------------------------------------
| Configuratie
|--------------------------------------------------------------------------
*/

export const SEASON_TRANSITION_CONFIG = {
  /*
   * Na vijf geregistreerde wedstrijden krijgt
   * de actuele informatie over de spelersrol
   * volledig de leiding.
   */
  role: {
    fullCurrentSampleMatches: 5,
  },

  /*
   * Productie wordt beoordeeld op basis van
   * daadwerkelijke optredens én minuten.
   *
   * Vijf volledige wedstrijden is ongeveer
   * 450 minuten.
   */
  production: {
    fullCurrentSampleAppearances: 5,
    fullCurrentSampleMinutes: 450,

    appearanceWeight: 0.40,
    minutesWeight: 0.60,
  },
}

/*
|--------------------------------------------------------------------------
| Algemene helpers
|--------------------------------------------------------------------------
*/

function toNumber(
  value,
  fallback = 0,
) {
  const number =
    Number(value)

  return Number.isFinite(
    number,
  )
    ? number
    : fallback
}

function clamp(
  value,
  minimum = 0,
  maximum = 1,
) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      toNumber(
        value,
        minimum,
      ),
    ),
  )
}

function round(
  value,
  digits = 4,
) {
  const number =
    Number(value)

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return 0
  }

  const factor =
    10 ** digits

  return (
    Math.round(
      (
        number +
        Number.EPSILON
      ) *
      factor,
    ) /
    factor
  )
}

function divide(
  numerator,
  denominator,
) {
  const safeDenominator =
    toNumber(
      denominator,
    )

  if (
    safeDenominator <= 0
  ) {
    return 0
  }

  return (
    toNumber(
      numerator,
    ) /
    safeDenominator
  )
}

/*
|--------------------------------------------------------------------------
| Historische sample uitlezen
|--------------------------------------------------------------------------
*/

function getSample(
  history,
) {
  return (
    history?.sample ??
    {}
  )
}

function getRegisteredMatches(
  history,
) {
  return Math.max(
    0,
    toNumber(
      getSample(
        history,
      ).registeredMatches,
    ),
  )
}

function getAppearances(
  history,
) {
  return Math.max(
    0,
    toNumber(
      getSample(
        history,
      ).appearances,
    ),
  )
}

function getStarts(
  history,
) {
  return Math.max(
    0,
    toNumber(
      getSample(
        history,
      ).starts,
    ),
  )
}

function getSubstituteAppearances(
  history,
) {
  return Math.max(
    0,
    toNumber(
      getSample(
        history,
      ).substituteAppearances,
    ),
  )
}

function getUnusedSubstitutions(
  history,
) {
  return Math.max(
    0,
    toNumber(
      getSample(
        history,
      ).unusedSubstitutions,
    ),
  )
}

function getMinutes(
  history,
) {
  return Math.max(
    0,
    toNumber(
      getSample(
        history,
      ).minutes,
    ),
  )
}

/*
|--------------------------------------------------------------------------
| Fase bepalen
|--------------------------------------------------------------------------
*/

function getTransitionPhase(
  currentWeight,
) {
  if (
    currentWeight <= 0
  ) {
    return 'preseason'
  }

  if (
    currentWeight < 0.40
  ) {
    return 'early-season'
  }

  if (
    currentWeight < 0.80
  ) {
    return 'growing-sample'
  }

  if (
    currentWeight < 1
  ) {
    return 'mostly-current'
  }

  return 'current-season'
}

function getTransitionLabel(
  phase,
) {
  const labels = {
    preseason:
      'Voorbereiding leidend',

    'early-season':
      'Eerste actuele signalen',

    'growing-sample':
      'Actuele data groeit',

    'mostly-current':
      'Actuele data grotendeels leidend',

    'current-season':
      'Actuele data leidend',
  }

  return (
    labels[phase] ??
    'Onbekende fase'
  )
}

/*
|--------------------------------------------------------------------------
| Rolovergang
|--------------------------------------------------------------------------
|
| Iedere geregistreerde wedstrijd telt mee.
|
| Daardoor geeft bijvoorbeeld viermaal op de bank
| sterke actuele informatie over de huidige rol,
| ook wanneer de speler nul minuten maakte.
|
*/

function calculateRoleTransition(
  history,
) {
  const registeredMatches =
    getRegisteredMatches(
      history,
    )

  const fullSample =
    SEASON_TRANSITION_CONFIG
      .role
      .fullCurrentSampleMatches

  const currentSeasonWeight =
    clamp(
      divide(
        registeredMatches,
        fullSample,
      ),
    )

  const preseasonWeight =
    1 -
    currentSeasonWeight

  const phase =
    getTransitionPhase(
      currentSeasonWeight,
    )

  return {
    registeredMatches,

    fullSampleMatches:
      fullSample,

    preseasonWeight:
      round(
        preseasonWeight,
      ),

    currentSeasonWeight:
      round(
        currentSeasonWeight,
      ),

    preseasonPercentage:
      round(
        preseasonWeight *
        100,
        0,
      ),

    currentSeasonPercentage:
      round(
        currentSeasonWeight *
        100,
        0,
      ),

    phase,

    label:
      getTransitionLabel(
        phase,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Productieovergang
|--------------------------------------------------------------------------
|
| Productie wordt alleen actueel wanneer een speler
| ook werkelijk heeft gespeeld.
|
| Twee signalen worden gecombineerd:
|
| - aantal optredens;
| - aantal gespeelde minuten.
|
| Een speler die vijfmaal op de bank bleef krijgt
| daardoor wel 100% actuele rolweging, maar nog
| 0% actuele productieweging.
|
*/

function calculateProductionTransition(
  history,
) {
  const appearances =
    getAppearances(
      history,
    )

  const minutes =
    getMinutes(
      history,
    )

  const config =
    SEASON_TRANSITION_CONFIG
      .production

  const appearanceProgress =
    clamp(
      divide(
        appearances,
        config
          .fullCurrentSampleAppearances,
      ),
    )

  const minutesProgress =
    clamp(
      divide(
        minutes,
        config
          .fullCurrentSampleMinutes,
      ),
    )

  const currentSeasonWeight =
    clamp(
      appearanceProgress *
        config.appearanceWeight +
      minutesProgress *
        config.minutesWeight,
    )

  const preseasonWeight =
    1 -
    currentSeasonWeight

  const phase =
    getTransitionPhase(
      currentSeasonWeight,
    )

  return {
    appearances,

    minutes,

    fullSampleAppearances:
      config
        .fullCurrentSampleAppearances,

    fullSampleMinutes:
      config
        .fullCurrentSampleMinutes,

    appearanceProgress:
      round(
        appearanceProgress,
      ),

    minutesProgress:
      round(
        minutesProgress,
      ),

    preseasonWeight:
      round(
        preseasonWeight,
      ),

    currentSeasonWeight:
      round(
        currentSeasonWeight,
      ),

    preseasonPercentage:
      round(
        preseasonWeight *
        100,
        0,
      ),

    currentSeasonPercentage:
      round(
        currentSeasonWeight *
        100,
        0,
      ),

    phase,

    label:
      getTransitionLabel(
        phase,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Uitleg
|--------------------------------------------------------------------------
*/

function buildExplanation({
  role,
  production,
  starts,
  substituteAppearances,
  unusedSubstitutions,
}) {
  const explanation = []

  if (
    role.registeredMatches === 0
  ) {
    explanation.push(
      'Er zijn nog geen officiële wedstrijden geregistreerd; de preseason-inschatting blijft volledig leidend voor de rol.',
    )
  } else {
    explanation.push(
      `${role.registeredMatches} geregistreerde wedstrijd(en) bepalen inmiddels ${role.currentSeasonPercentage}% van de actuele rolweging.`,
    )
  }

  if (
    unusedSubstitutions > 0
  ) {
    explanation.push(
      `${unusedSubstitutions} keer op de bank gebleven zonder in te vallen telt wel mee als actuele rolinformatie.`,
    )
  }

  if (
    starts > 0
  ) {
    explanation.push(
      `${starts} basisplaats(en) geven directe informatie over de huidige selectierol.`,
    )
  }

  if (
    substituteAppearances > 0
  ) {
    explanation.push(
      `${substituteAppearances} invalbeurt(en) zijn meegenomen in de actuele rol- en productiedata.`,
    )
  }

  if (
    production.appearances === 0
  ) {
    explanation.push(
      'Zonder gespeelde minuten blijft de preseason-informatie volledig leidend voor productie per 90 minuten.',
    )
  } else {
    explanation.push(
      `${production.appearances} optreden(s) en ${production.minutes} minuten bepalen inmiddels ${production.currentSeasonPercentage}% van de productieweging.`,
    )
  }

  return explanation
}

/*
|--------------------------------------------------------------------------
| Publieke API
|--------------------------------------------------------------------------
*/

/**
 * Bepaalt de overgang tussen preseason-kennis
 * en actuele seizoensdata voor één speler.
 */
export function calculateSeasonTransition(
  history,
) {
  const role =
    calculateRoleTransition(
      history,
    )

  const production =
    calculateProductionTransition(
      history,
    )

  const starts =
    getStarts(
      history,
    )

  const substituteAppearances =
    getSubstituteAppearances(
      history,
    )

  const unusedSubstitutions =
    getUnusedSubstitutions(
      history,
    )

  /*
   * De algemene overgang is alleen informatief.
   *
   * Specialistische engines horen waar mogelijk
   * role of production afzonderlijk te gebruiken.
   */
  const overallCurrentWeight =
    (
      role.currentSeasonWeight +
      production.currentSeasonWeight
    ) /
    2

  const overallPreseasonWeight =
    1 -
    overallCurrentWeight

  const overallPhase =
    getTransitionPhase(
      overallCurrentWeight,
    )

  const result = {
    role,

    production,

    overall: {
      preseasonWeight:
        round(
          overallPreseasonWeight,
        ),

      currentSeasonWeight:
        round(
          overallCurrentWeight,
        ),

      preseasonPercentage:
        round(
          overallPreseasonWeight *
          100,
          0,
        ),

      currentSeasonPercentage:
        round(
          overallCurrentWeight *
          100,
          0,
        ),

      phase:
        overallPhase,

      label:
        getTransitionLabel(
          overallPhase,
        ),
    },

    sample: {
      registeredMatches:
        role.registeredMatches,

      appearances:
        production.appearances,

      starts,

      substituteAppearances,

      unusedSubstitutions,

      minutes:
        production.minutes,
    },
  }

  return {
    ...result,

    explanation:
      buildExplanation({
        role,
        production,
        starts,
        substituteAppearances,
        unusedSubstitutions,
      }),

    source: {
      id:
        'season-transition-engine',

      label:
        'Season Transition Engine',

      type:
        'automatic',
    },
  }
}

/*
|--------------------------------------------------------------------------
| Generieke blendhelper
|--------------------------------------------------------------------------
|
| Deze helper combineert twee reeds berekende
| waarden met een transition-profiel.
|
| Hij bepaalt zelf geen preseason- of actuele waarde.
|
*/

export function blendSeasonTransitionValue({
  preseasonValue,
  currentSeasonValue,
  transition,
  type = 'production',
}) {
  const profile =
    transition?.[type]

  if (
    !profile
  ) {
    return toNumber(
      preseasonValue,
    )
  }

  return round(
    toNumber(
      preseasonValue,
    ) *
      toNumber(
        profile.preseasonWeight,
        1,
      ) +
    toNumber(
      currentSeasonValue,
    ) *
      toNumber(
        profile.currentSeasonWeight,
      ),
  )
}

/*
|--------------------------------------------------------------------------
| Batch
|--------------------------------------------------------------------------
*/

export function calculateSeasonTransitionBatch(
  histories,
) {
  if (
    !Array.isArray(
      histories,
    )
  ) {
    return []
  }

  return histories
    .map(
      (
        history,
      ) =>
        calculateSeasonTransition(
          history,
        ),
    )
    .filter(Boolean)
}

/*
|--------------------------------------------------------------------------
| Engine-informatie
|--------------------------------------------------------------------------
*/

export function getSeasonTransitionEngineInfo() {
  return {
    id:
      'season-transition-engine',

    label:
      'Season Transition Engine',

    version:
      '1.0.0',

    description:
      'Bepaalt de overgang tussen preseason-intelligence en actuele seizoensdata.',

    supports: {
      roleTransition:
        true,

      productionTransition:
        true,

      unusedSubstitutions:
        true,

      blending:
        true,

      batch:
        true,
    },
  }
}