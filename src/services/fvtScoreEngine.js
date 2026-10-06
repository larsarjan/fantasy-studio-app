import {
  calculateFantasyOutlook,
} from './fantasyOutlookEngine.js'

/*
|==============================================================================
| FVT FANTASY SCORE ENGINE
|==============================================================================
|
| Fase 1:
|
| - officiële score van 0 tot 100;
| - tier;
| - badge;
| - betrouwbaarheid;
| - floor;
| - ceiling;
| - genormaliseerde pijlers;
|
| De onderliggende pijlers worden berekend door:
|
| fantasyOutlookEngine.js
|
| Dit bestand vertaalt die bestaande berekening
| naar het officiële FVT Fantasy Score-model.
|
*/

/*
|------------------------------------------------------------------------------
| Algemene instellingen
|------------------------------------------------------------------------------
*/

const MIN_SCORE = 0
const MAX_SCORE = 100

const MIN_PILLAR_SCORE = 0
const MAX_PILLAR_SCORE = 10

const NEUTRAL_PILLAR_SCORE = 5

/*
 * Officiële weging van de zes pijlers.
 *
 * Deze sluit aan op de huidige
 * Fantasy Outlook Engine.
 */
export const FVT_SCORE_WEIGHTS = {
  potential:
    0.30,

  availability:
    0.25,

  fixtures:
    0.15,

  form:
    0.15,

  value:
    0.10,

  risk:
    0.05,
}

export const FVT_PILLAR_LABELS = {
  potential:
    'Fantasy-potentie',

  availability:
    'Speelzekerheid',

  fixtures:
    'Programma',

  form:
    'Vorm',

  value:
    'Waarde',

  risk:
    'Laag risico',
}

const FVT_PILLAR_ORDER = [
  'potential',
  'availability',
  'fixtures',
  'form',
  'value',
  'risk',
]

/*
|==============================================================================
| HULPFUNCTIES
|==============================================================================
*/

function toNumber(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const normalizedValue =
    typeof value === 'string'
      ? value
          .trim()
          .replace(',', '.')
      : value

  const number =
    Number(
      normalizedValue,
    )

  return Number.isFinite(number)
    ? number
    : null
}

function clamp(
  value,
  minimum,
  maximum,
) {
  const number =
    toNumber(
      value,
    )

  if (number === null) {
    return minimum
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      number,
    ),
  )
}

function clampScore(
  value,
) {
  return clamp(
    value,
    MIN_SCORE,
    MAX_SCORE,
  )
}

function clampPillarScore(
  value,
) {
  return clamp(
    value,
    MIN_PILLAR_SCORE,
    MAX_PILLAR_SCORE,
  )
}

function roundToOne(
  value,
) {
  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
      10,
    ) /
    10
  )
}

function roundToWhole(
  value,
) {
  return Math.round(
    Number(value) || 0,
  )
}

/*
|==============================================================================
| BASISSCORE
|==============================================================================
*/

function normalizeOutlookScore(
  outlook,
) {
  const rawScore =
    toNumber(
      outlook?.score,
    )

  if (rawScore === null) {
    return 50
  }

  /*
   * De bestaande Outlook Engine gebruikt
   * momenteel een schaal van 0 tot 10.
   *
   * Mocht die later al 0 tot 100 teruggeven,
   * dan blijft deze functie correct werken.
   */
  const normalizedScore =
    rawScore <= 10
      ? rawScore * 10
      : rawScore

  return roundToOne(
    clampScore(
      normalizedScore,
    ),
  )
}

/*
|==============================================================================
| PIJLERS
|==============================================================================
*/

function normalizePillars(
  outlook,
) {
  const source =
    outlook?.scores ?? {}

  const rawRisk =
    clampPillarScore(
      toNumber(
        source.risk,
      ) ??
      NEUTRAL_PILLAR_SCORE,
    )

  /*
   * De bestaande risicoscore werkt zo:
   *
   * 0 = nauwelijks risico
   * 10 = zeer hoog risico
   *
   * Voor de presentatie gebruiken we:
   *
   * Laag risico = 10 - risicoscore
   */
  const positiveRisk =
    MAX_PILLAR_SCORE -
    rawRisk

  return {
    potential:
      roundToOne(
        clampPillarScore(
          toNumber(
            source.potential,
          ) ??
          NEUTRAL_PILLAR_SCORE,
        ),
      ),

    availability:
      roundToOne(
        clampPillarScore(
          toNumber(
            source.availability,
          ) ??
          NEUTRAL_PILLAR_SCORE,
        ),
      ),

    fixtures:
      roundToOne(
        clampPillarScore(
          toNumber(
            source.fixtures,
          ) ??
          NEUTRAL_PILLAR_SCORE,
        ),
      ),

    form:
      roundToOne(
        clampPillarScore(
          toNumber(
            source.form,
          ) ??
          NEUTRAL_PILLAR_SCORE,
        ),
      ),

    value:
      roundToOne(
        clampPillarScore(
          toNumber(
            source.value,
          ) ??
          NEUTRAL_PILLAR_SCORE,
        ),
      ),

    risk:
      roundToOne(
        positiveRisk,
      ),

    rawRisk:
      roundToOne(
        rawRisk,
      ),
  }
}

function buildPillarBreakdown(
  pillars,
) {
  return FVT_PILLAR_ORDER.map(
    (key) => {
      const score =
        pillars[key]

      const weight =
        FVT_SCORE_WEIGHTS[key]

      return {
        key,

        label:
          FVT_PILLAR_LABELS[key],

        score,

        scoreOutOfHundred:
          roundToOne(
            score * 10,
          ),

        weight,

        weightPercentage:
          roundToWhole(
            weight * 100,
          ),

        contribution:
          roundToOne(
            score *
            weight *
            10,
          ),

        maximumContribution:
          roundToOne(
            weight * 100,
          ),
      }
    },
  )
}

/*
|==============================================================================
| TIERS
|==============================================================================
*/

function getFvtTier(
  score,
) {
  if (score >= 90) {
    return {
      id:
        'elite',

      label:
        'Elite keuze',

      shortLabel:
        'Elite',

      className:
        'elite',

      rank:
        6,
    }
  }

  if (score >= 80) {
    return {
      id:
        'strong',

      label:
        'Sterke keuze',

      shortLabel:
        'Sterk',

      className:
        'strong',

      rank:
        5,
    }
  }

  if (score >= 70) {
    return {
      id:
        'interesting',

      label:
        'Interessante keuze',

      shortLabel:
        'Interessant',

      className:
        'interesting',

      rank:
        4,
    }
  }

  if (score >= 60) {
    return {
      id:
        'situational',

      label:
        'Situatieafhankelijk',

      shortLabel:
        'Situationeel',

      className:
        'situational',

      rank:
        3,
    }
  }

  if (score >= 50) {
    return {
      id:
        'caution',

      label:
        'Voorzichtig overwegen',

      shortLabel:
        'Voorzichtig',

      className:
        'caution',

      rank:
        2,
    }
  }

  return {
    id:
      'avoid',

    label:
      'Voorlopig vermijden',

    shortLabel:
      'Vermijden',

    className:
      'avoid',

    rank:
      1,
  }
}

/*
|==============================================================================
| BADGES
|==============================================================================
*/

function getFvtBadge(
  score,
  pillars,
) {
  if (
    score >= 90 &&
    pillars.availability >= 8 &&
    pillars.risk >= 7
  ) {
    return {
      id:
        'must-have',

      label:
        'Must-have',

      className:
        'must-have',
    }
  }

  if (score >= 82) {
    return {
      id:
        'top-choice',

      label:
        'Topkeuze',

      className:
        'top-choice',
    }
  }

  if (
    score >= 72 &&
    pillars.value >= 8
  ) {
    return {
      id:
        'value-pick',

      label:
        'Sterke waarde',

      className:
        'value-pick',
    }
  }

  if (
    score >= 70 &&
    pillars.potential >= 8
  ) {
    return {
      id:
        'high-upside',

      label:
        'Hoge upside',

      className:
        'high-upside',
    }
  }

  if (
    pillars.availability < 6 ||
    pillars.risk < 5
  ) {
    return {
      id:
        'risky',

      label:
        'Risicovolle keuze',

      className:
        'risky',
    }
  }

  if (score >= 60) {
    return {
      id:
        'watchlist',

      label:
        'Op de radar',

      className:
        'watchlist',
    }
  }

  return {
    id:
      'wait',

    label:
      'Voorlopig afwachten',

    className:
      'wait',
  }
}

/*
|==============================================================================
| BETROUWBAARHEID
|==============================================================================
*/

function normalizeConfidence(
  outlook,
) {
  const source =
    outlook?.confidence ?? {}

  const explicitScore =
    toNumber(
      source.score,
    )

  const score =
    roundToWhole(
      clampScore(
        explicitScore ??
        20,
      ),
    )

  let level =
    'low'

  let label =
    'Laag'

  if (score >= 85) {
    level =
      'very-high'

    label =
      'Zeer hoog'
  } else if (score >= 70) {
    level =
      'high'

    label =
      'Hoog'
  } else if (score >= 50) {
    level =
      'medium'

    label =
      'Gemiddeld'
  } else if (score >= 25) {
    level =
      'low'

    label =
      'Laag'
  } else {
    level =
      'very-low'

    label =
      'Zeer laag'
  }

  return {
    score,

    level:
      source.value ??
      source.level ??
      level,

    label:
      source.label ??
      label,

    source:
      source.source ??
      'automatic',

    reasons:
      Array.isArray(
        source.reasons,
      )
        ? source.reasons
        : [],
  }
}

/*
|==============================================================================
| FLOOR EN CEILING
|==============================================================================
*/

function calculateUncertainty(
  pillars,
  confidence,
) {
  /*
   * Lage betrouwbaarheid vergroot
   * de verwachte bandbreedte.
   */
  const confidenceUncertainty =
    (
      100 -
      confidence.score
    ) *
    0.045

  /*
   * Een lage speelzekerheid vergroot
   * de onzekerheid extra.
   */
  const availabilityUncertainty =
    Math.max(
      0,
      7 -
      pillars.availability,
    ) *
    1.4

  /*
   * Een laag positief risicocijfer
   * betekent veel werkelijk risico.
   */
  const riskUncertainty =
    Math.max(
      0,
      7 -
      pillars.risk,
    ) *
    1.1

  return roundToOne(
    Math.min(
      18,
      Math.max(
        4,
        confidenceUncertainty +
        availabilityUncertainty +
        riskUncertainty,
      ),
    ),
  )
}

function calculateFloor({
  score,
  pillars,
  uncertainty,
}) {
  /*
   * Speelzekerheid en laag risico
   * ondersteunen de ondergrens.
   */
  const stabilityBonus =
    (
      pillars.availability -
      NEUTRAL_PILLAR_SCORE
    ) *
    0.8 +
    (
      pillars.risk -
      NEUTRAL_PILLAR_SCORE
    ) *
    0.5

  return roundToOne(
    clampScore(
      score -
      uncertainty +
      stabilityBonus,
    ),
  )
}

function calculateCeiling({
  score,
  pillars,
  uncertainty,
}) {
  /*
   * Potentie en vorm ondersteunen
   * het realistische plafond.
   */
  const upsideBonus =
    (
      pillars.potential -
      NEUTRAL_PILLAR_SCORE
    ) *
    0.9 +
    (
      pillars.form -
      NEUTRAL_PILLAR_SCORE
    ) *
    0.4

  return roundToOne(
    clampScore(
      score +
      uncertainty +
      upsideBonus,
    ),
  )
}

/*
|==============================================================================
| PUBLIEKE FUNCTIE
|==============================================================================
*/

export function calculateFvtScore(
  player,
  options = {},
) {
  /*
   * Een scherm kan een reeds berekende
   * Fantasy Outlook meegeven.
   *
   * Daardoor gebruiken de zichtbare pijlers,
   * de FVT Score en de Insights altijd exact
   * dezelfde onderliggende cijfers.
   */
  const outlook =
    options.outlook ??
    calculateFantasyOutlook(
      player,
      options.outlookOptions ?? {},
    )

  const score =
    normalizeOutlookScore(
      outlook,
    )

  const pillars =
    normalizePillars(
      outlook,
    )

  const pillarBreakdown =
    buildPillarBreakdown(
      pillars,
    )

  const confidence =
    normalizeConfidence(
      outlook,
    )

  const uncertainty =
    calculateUncertainty(
      pillars,
      confidence,
    )

  const floor =
    calculateFloor({
      score,
      pillars,
      uncertainty,
    })

  const ceiling =
    calculateCeiling({
      score,
      pillars,
      uncertainty,
    })

  const tier =
    getFvtTier(
      score,
    )

  const badge =
    getFvtBadge(
      score,
      pillars,
    )

  return {
    /*
     * Officiële FVT Fantasy Score.
     */
    score,

    scoreOutOfTen:
      roundToOne(
        score / 10,
      ),

    /*
     * Voor presentatie en styling.
     */
    tier,

    badge,

    /*
     * Verwachte realistische bandbreedte.
     */
    range: {
      floor,

      expected:
        score,

      ceiling,

      uncertainty,
    },

    /*
     * Betrouwbaarheid van de berekening.
     */
    confidence,

    /*
     * Genormaliseerde pijlers.
     *
     * Voor risk geldt:
     * hoger = gunstiger / lager risico.
     */
    pillars,

    /*
     * Volledige transparante bijdrage
     * van iedere pijler.
     */
    pillarBreakdown,

    /*
     * Bestaande informatie uit de
     * Fantasy Outlook Engine blijft
     * voorlopig beschikbaar.
     */
    strengths:
      Array.isArray(
        outlook?.strengths,
      )
        ? outlook.strengths
        : [],

    concerns:
      Array.isArray(
        outlook?.concerns,
      )
        ? outlook.concerns
        : [],

    calculation: {
      source:
        'fantasy-outlook-engine',

      weights: {
        ...FVT_SCORE_WEIGHTS,
      },

      outlookScore:
        outlook?.score ?? null,

      outlookCalculation:
        outlook?.calculation ?? null,
    },

    /*
     * Tijdelijke referentie voor ontwikkeling.
     * Later kunnen we deze eventueel verwijderen.
     */
    rawOutlook:
      outlook,
  }
}