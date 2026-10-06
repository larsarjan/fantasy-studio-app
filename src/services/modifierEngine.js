/*
|--------------------------------------------------------------------------
| Modifier Engine
|--------------------------------------------------------------------------
|
| Centrale standaard voor alle Fantasy-modifiers.
|
| Een modifier beschrijft:
|
| - welke factor wordt beoordeeld;
| - wat de ruwe beoordeling is;
| - hoe zwaar deze factor meetelt;
| - hoeveel deze factor de Fantasy Score verandert;
| - hoe betrouwbaar de berekening is;
| - hoe de uitkomst aan de gebruiker wordt uitgelegd.
|
| Voorbeelden:
|
| - aankomend programma;
| - historische onderbouwing;
| - vorm;
| - speelzekerheid;
| - Fantasy-potentie;
| - prijs-kwaliteit;
| - risico.
|
*/

/*
|--------------------------------------------------------------------------
| Configuratie
|--------------------------------------------------------------------------
*/

const MODIFIER_VERSION = 1

const DEFAULT_WEIGHT = 1
const DEFAULT_CONFIDENCE = 0

const MIN_SCORE = 0
const MAX_SCORE = 10

const MIN_WEIGHT = 0
const MAX_WEIGHT = 1

const MIN_CONFIDENCE = 0
const MAX_CONFIDENCE = 100

const MIN_WEIGHTED_VALUE = -1
const MAX_WEIGHTED_VALUE = 1

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
  minimum,
  maximum,
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
  digits = 2,
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

function normalizeId(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .replace(
      /[^a-z0-9]+/g,
      '-',
    )
    .replace(
      /^-|-$/g,
      '',
    )
}

/*
|--------------------------------------------------------------------------
| Impact
|--------------------------------------------------------------------------
|
| Impact wordt gebruikt om een modifier
| visueel en inhoudelijk te classificeren.
|
| positive:
| verhoogt de Fantasy Score.
|
| negative:
| verlaagt de Fantasy Score.
|
| neutral:
| heeft geen invloed op de Fantasy Score.
|
*/

function resolveImpact(value) {
  const number =
    toNumber(value) ?? 0

  if (number > 0) {
    return 'positive'
  }

  if (number < 0) {
    return 'negative'
  }

  return 'neutral'
}

/*
|--------------------------------------------------------------------------
| Betrouwbaarheid
|--------------------------------------------------------------------------
*/

function getConfidenceLevel(
  confidence,
) {
  const value =
    clamp(
      confidence,
      MIN_CONFIDENCE,
      MAX_CONFIDENCE,
    )

  if (value >= 90) {
    return 'very-high'
  }

  if (value >= 75) {
    return 'high'
  }

  if (value >= 55) {
    return 'medium'
  }

  if (value >= 35) {
    return 'low'
  }

  return 'very-low'
}

function getConfidenceLabel(
  confidence,
) {
  const level =
    getConfidenceLevel(
      confidence,
    )

  const labels = {
    'very-high':
      'Zeer hoog',

    high:
      'Hoog',

    medium:
      'Gemiddeld',

    low:
      'Laag',

    'very-low':
      'Zeer laag',
  }

  return (
    labels[level] ??
    'Zeer laag'
  )
}

/*
|--------------------------------------------------------------------------
| Calculation Steps
|--------------------------------------------------------------------------
|
| De calculation-structuur wordt rechtstreeks
| gebruikt voor de informatieknop in de UI.
|
*/

function normalizeCalculationStep(
  step,
) {
  if (!step) {
    return null
  }

  const value =
    toNumber(
      step.value,
    )

  if (value === null) {
    return null
  }

  return {
    label:
      cleanText(
        step.label,
      ) ||
      'Berekening',

    value:
      round(
        value,
        Number.isFinite(
          Number(step.digits),
        )
          ? Number(step.digits)
          : 2,
      ),

    prefix:
      cleanText(
        step.prefix,
      ),

    suffix:
      cleanText(
        step.suffix,
      ),

    description:
      cleanText(
        step.description,
      ),
  }
}

function normalizeCalculation(
  calculation,
) {
  const steps =
    Array.isArray(
      calculation?.steps,
    )
      ? calculation.steps
          .map(
            normalizeCalculationStep,
          )
          .filter(Boolean)
      : []

  return {
    formula:
      cleanText(
        calculation?.formula,
      ),

    steps,
  }
}

/*
|--------------------------------------------------------------------------
| Details
|--------------------------------------------------------------------------
|
| Details is bewust flexibel.
|
| Iedere modifier mag hier zijn eigen
| aanvullende gegevens bewaren.
|
| Voor programma bijvoorbeeld:
|
| - beste wedstrijd;
| - zwaarste wedstrijd;
| - lege speelrondes;
| - dubbele speelrondes.
|
*/

function normalizeDetails(details) {
  if (
    !details ||
    typeof details !== 'object' ||
    Array.isArray(details)
  ) {
    return {}
  }

  return {
    ...details,
  }
}

/*
|--------------------------------------------------------------------------
| Bron
|--------------------------------------------------------------------------
*/

function normalizeSource(source) {
  if (
    typeof source === 'string'
  ) {
    return {
      id:
        normalizeId(source),

      label:
        cleanText(source),
    }
  }

  if (
    source &&
    typeof source === 'object'
  ) {
    return {
      id:
        normalizeId(
          source.id ??
          source.label,
        ),

      label:
        cleanText(
          source.label ??
          source.id,
        ),

      type:
        cleanText(
          source.type,
        ),

      references:
        Array.isArray(
          source.references,
        )
          ? source.references
          : [],
    }
  }

  return {
    id:
      'unknown',

    label:
      'Onbekende bron',

    type:
      '',

    references:
      [],
  }
}

/*
|--------------------------------------------------------------------------
| Ruwe waarde
|--------------------------------------------------------------------------
|
| Een ruwe modifier gebruikt een neutraal punt van 5.
|
| Voorbeeld:
|
| programmascore 8
|
| 8 - 5 = +3 ruwe invloed
|
| programmascore 3
|
| 3 - 5 = -2 ruwe invloed
|
*/

function calculateRawValue({
  score,
  neutralScore = 5,
}) {
  const normalizedScore =
    clamp(
      score,
      MIN_SCORE,
      MAX_SCORE,
    )

  const normalizedNeutral =
    clamp(
      neutralScore,
      MIN_SCORE,
      MAX_SCORE,
    )

  return (
    normalizedScore -
    normalizedNeutral
  )
}

/*
|--------------------------------------------------------------------------
| Gewogen waarde
|--------------------------------------------------------------------------
|
| rawValue × weight
|
| Daarna wordt de uitkomst begrensd door
| de minimale en maximale invloed.
|
*/

function calculateWeightedValue({
  rawValue,
  weight,
  minimumValue =
    MIN_WEIGHTED_VALUE,
  maximumValue =
    MAX_WEIGHTED_VALUE,
}) {
  const normalizedRawValue =
    toNumber(rawValue) ?? 0

  const normalizedWeight =
    clamp(
      weight,
      MIN_WEIGHT,
      MAX_WEIGHT,
    )

  return clamp(
    normalizedRawValue *
      normalizedWeight,
    minimumValue,
    maximumValue,
  )
}

/*
|--------------------------------------------------------------------------
| Modifier bouwen
|--------------------------------------------------------------------------
|
| Dit is de centrale standaardfunctie.
|
| Alle engines gebruiken straks deze functie
| om hun modifier te maken.
|
*/

function buildModifier({
  id,
  label,

  score,
  neutralScore = 5,

  rawValue,
  weight =
    DEFAULT_WEIGHT,

  minimumValue =
    MIN_WEIGHTED_VALUE,

  maximumValue =
    MAX_WEIGHTED_VALUE,

  confidence =
    DEFAULT_CONFIDENCE,

  explanation = '',

  calculation = {},

  details = {},

  source = 'automatic',

  category = 'core',

  active = true,

  version =
    MODIFIER_VERSION,
}) {
  const normalizedId =
    normalizeId(
      id ??
      label,
    )

  if (!normalizedId) {
    throw new Error(
      'Een modifier heeft een id of label nodig.',
    )
  }

  const normalizedLabel =
    cleanText(label) ||
    normalizedId

  const normalizedScore =
    score === null ||
    score === undefined
      ? null
      : clamp(
          score,
          MIN_SCORE,
          MAX_SCORE,
        )

  const calculatedRawValue =
    rawValue === null ||
    rawValue === undefined
      ? calculateRawValue({
          score:
            normalizedScore ??
            neutralScore,

          neutralScore,
        })
      : Number(rawValue)

  const normalizedRawValue =
    Number.isFinite(
      calculatedRawValue,
    )
      ? calculatedRawValue
      : 0

  const normalizedWeight =
    clamp(
      weight,
      MIN_WEIGHT,
      MAX_WEIGHT,
    )

  const weightedValue =
    active
      ? calculateWeightedValue({
          rawValue:
            normalizedRawValue,

          weight:
            normalizedWeight,

          minimumValue,

          maximumValue,
        })
      : 0

  const normalizedConfidence =
    clamp(
      confidence,
      MIN_CONFIDENCE,
      MAX_CONFIDENCE,
    )

  return {
    id:
      normalizedId,

    label:
      normalizedLabel,

    category:
      cleanText(category) ||
      'core',

    active:
      Boolean(active),

    score:
      normalizedScore === null
        ? null
        : round(
            normalizedScore,
            2,
          ),

    neutralScore:
      round(
        neutralScore,
        2,
      ),

    rawValue:
      round(
        normalizedRawValue,
        2,
      ),

    weight:
      round(
        normalizedWeight,
        4,
      ),

    weightPercentage:
      round(
        normalizedWeight *
          100,
        1,
      ),

    weightedValue:
      round(
        weightedValue,
        2,
      ),

    minimumValue:
      round(
        minimumValue,
        2,
      ),

    maximumValue:
      round(
        maximumValue,
        2,
      ),

    impact:
      resolveImpact(
        weightedValue,
      ),

    confidence: {
      score:
        round(
          normalizedConfidence,
          0,
        ),

      level:
        getConfidenceLevel(
          normalizedConfidence,
        ),

      label:
        getConfidenceLabel(
          normalizedConfidence,
        ),
    },

    explanation:
      cleanText(
        explanation,
      ),

    calculation:
      normalizeCalculation(
        calculation,
      ),

    details:
      normalizeDetails(
        details,
      ),

    source:
      normalizeSource(
        source,
      ),

    version:
      Number(version) ||
      MODIFIER_VERSION,
  }
}

/*
|--------------------------------------------------------------------------
| Modifier validatie
|--------------------------------------------------------------------------
*/

function isModifier(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.id === 'string'
  )
}

function validateModifier(
  modifier,
) {
  if (!isModifier(modifier)) {
    return false
  }

  return (
    typeof modifier.label ===
      'string' &&
    Number.isFinite(
      Number(
        modifier.weightedValue,
      ),
    )
  )
}

function normalizeModifier(
  modifier,
) {
  if (
    validateModifier(
      modifier,
    )
  ) {
    return modifier
  }

  return buildModifier({
    id:
      modifier?.id ??
      'unknown',

    label:
      modifier?.label ??
      'Onbekende modifier',

    score:
      modifier?.score ?? 5,

    weight:
      modifier?.weight ??
      DEFAULT_WEIGHT,

    confidence:
      modifier?.confidence
        ?.score ??
      DEFAULT_CONFIDENCE,

    explanation:
      modifier?.explanation,

    source:
      modifier?.source ??
      'automatic',
  })
}

/*
|--------------------------------------------------------------------------
| Modifier collectie
|--------------------------------------------------------------------------
*/

function normalizeModifiers(
  modifiers,
) {
  if (
    !Array.isArray(
      modifiers,
    )
  ) {
    return []
  }

  return modifiers
    .map(
      normalizeModifier,
    )
    .filter(
      validateModifier,
    )
}

function removeDuplicateModifiers(
  modifiers,
) {
  const collection =
    new Map()

  normalizeModifiers(
    modifiers,
  ).forEach(
    (modifier) => {
      collection.set(
        modifier.id,
        modifier,
      )
    },
  )

  return [
    ...collection.values(),
  ]
}

/*
|--------------------------------------------------------------------------
| Sorteren
|--------------------------------------------------------------------------
*/

function sortModifiers(
  modifiers,
) {
  return [
    ...removeDuplicateModifiers(
      modifiers,
    ),
  ].sort(
    (left, right) => {
      const difference =
        Math.abs(
          right.weightedValue,
        ) -
        Math.abs(
          left.weightedValue,
        )

      if (difference !== 0) {
        return difference
      }

      return left.label.localeCompare(
        right.label,
        'nl',
      )
    },
  )
}

/*
|--------------------------------------------------------------------------
| Selecteren
|--------------------------------------------------------------------------
*/

function getActiveModifiers(
  modifiers,
) {
  return sortModifiers(
    modifiers,
  ).filter(
    (modifier) =>
      modifier.active,
  )
}

function getPositiveModifiers(
  modifiers,
) {
  return getActiveModifiers(
    modifiers,
  ).filter(
    (modifier) =>
      modifier.impact ===
      'positive',
  )
}

function getNegativeModifiers(
  modifiers,
) {
  return getActiveModifiers(
    modifiers,
  ).filter(
    (modifier) =>
      modifier.impact ===
      'negative',
  )
}

function getNeutralModifiers(
  modifiers,
) {
  return getActiveModifiers(
    modifiers,
  ).filter(
    (modifier) =>
      modifier.impact ===
      'neutral',
  )
}

/*
|--------------------------------------------------------------------------
| Zoeken
|--------------------------------------------------------------------------
*/

function getModifier(
  modifiers,
  id,
) {
  const normalizedId =
    normalizeId(id)

  return (
    normalizeModifiers(
      modifiers,
    ).find(
      (modifier) =>
        modifier.id ===
        normalizedId,
    ) ?? null
  )
}

function hasModifier(
  modifiers,
  id,
) {
  return Boolean(
    getModifier(
      modifiers,
      id,
    ),
  )
}

/*
|--------------------------------------------------------------------------
| Samenvatting
|--------------------------------------------------------------------------
*/

function calculateModifierContribution(
  modifiers,
) {
  return round(
    getActiveModifiers(
      modifiers,
    ).reduce(
      (
        total,
        modifier,
      ) =>
        total +
        modifier.weightedValue,
      0,
    ),
    2,
  )
}

function calculateModifierConfidence(
  modifiers,
) {
  const active =
    getActiveModifiers(
      modifiers,
    )

  if (!active.length) {
    return 0
  }

  return round(
    active.reduce(
      (
        total,
        modifier,
      ) =>
        total +
        modifier.confidence
          .score,
      0,
    ) / active.length,
    0,
  )
}

function getStrongestModifier(
  modifiers,
) {
  return (
    sortModifiers(
      modifiers,
    )[0] ?? null
  )
}

function getWeakestModifier(
  modifiers,
) {
  const sorted =
    sortModifiers(
      modifiers,
    )

  return (
    sorted.at(-1) ??
    null
  )
}

/*
|--------------------------------------------------------------------------
| Belangrijkste positieve en negatieve invloed
|--------------------------------------------------------------------------
*/

function getStrongestPositiveModifier(
  modifiers,
) {
  return (
    getPositiveModifiers(
      modifiers,
    )
      .sort(
        (left, right) =>
          right.weightedValue -
          left.weightedValue,
      )[0] ??
    null
  )
}

function getStrongestNegativeModifier(
  modifiers,
) {
  return (
    getNegativeModifiers(
      modifiers,
    )
      .sort(
        (left, right) =>
          left.weightedValue -
          right.weightedValue,
      )[0] ??
    null
  )
}

/*
|--------------------------------------------------------------------------
| Fantasy Score
|--------------------------------------------------------------------------
*/

function calculateFantasyScore({
  baseScore,
  modifiers,
  minimumScore =
    MIN_SCORE,
  maximumScore =
    MAX_SCORE,
}) {
  const normalizedBaseScore =
    clamp(
      baseScore,
      minimumScore,
      maximumScore,
    )

  const contribution =
    calculateModifierContribution(
      modifiers,
    )

  const rawScore =
    normalizedBaseScore +
    contribution

  const score =
    clamp(
      rawScore,
      minimumScore,
      maximumScore,
    )

  return {
    baseScore:
      round(
        normalizedBaseScore,
        2,
      ),

    contribution:
      round(
        contribution,
        2,
      ),

    rawScore:
      round(
        rawScore,
        2,
      ),

    score:
      round(
        score,
        1,
      ),

    minimumScore:
      round(
        minimumScore,
        1,
      ),

    maximumScore:
      round(
        maximumScore,
        1,
      ),

    wasClamped:
      rawScore !== score,
  }
}

/*
|--------------------------------------------------------------------------
| Berekeningsregel per modifier
|--------------------------------------------------------------------------
*/

function buildModifierCalculationRow(
  modifier,
) {
  return {
    id:
      modifier.id,

    label:
      modifier.label,

    type:
      'modifier',

    impact:
      modifier.impact,

    value:
      modifier.weightedValue,

    prefix:
      modifier.weightedValue > 0
        ? '+'
        : '',

    suffix:
      '',

    confidence:
      modifier.confidence.score,

    explanation:
      modifier.explanation,

    calculation:
      modifier.calculation,
  }
}

/*
|--------------------------------------------------------------------------
| Transparante scoreberekening
|--------------------------------------------------------------------------
*/

function buildFantasyCalculation({
  baseScore,
  modifiers,
  contribution,
  rawScore,
  score,
  wasClamped,
}) {
  const activeModifiers =
    getActiveModifiers(
      modifiers,
    )

  const rows = [
    {
      id:
        'base-score',

      label:
        'Basisscore',

      type:
        'base',

      impact:
        'neutral',

      value:
        round(
          baseScore,
          2,
        ),

      prefix:
        '',

      suffix:
        '',

      confidence:
        null,

      explanation:
        'De score voordat aanvullende modifiers worden toegepast.',
    },

    ...activeModifiers.map(
      buildModifierCalculationRow,
    ),

    {
      id:
        'total-contribution',

      label:
        'Totale invloed modifiers',

      type:
        'subtotal',

      impact:
        resolveImpact(
          contribution,
        ),

      value:
        round(
          contribution,
          2,
        ),

      prefix:
        contribution > 0
          ? '+'
          : '',

      suffix:
        '',

      confidence:
        null,

      explanation:
        'De gezamenlijke invloed van alle actieve modifiers.',
    },

    {
      id:
        'fantasy-score',

      label:
        'Fantasy Score',

      type:
        'total',

      impact:
        'neutral',

      value:
        round(
          score,
          1,
        ),

      prefix:
        '',

      suffix:
        ' / 10',

      confidence:
        null,

      explanation:
        wasClamped
          ? (
              'De berekende score is begrensd ' +
              'op de schaal van 0 tot 10.'
            )
          : (
              'Basisscore plus de gezamenlijke ' +
              'invloed van alle modifiers.'
            ),
    },
  ]

  return {
    formula:
      'Basisscore + modifiers = Fantasy Score',

    baseScore:
      round(
        baseScore,
        2,
      ),

    contribution:
      round(
        contribution,
        2,
      ),

    rawScore:
      round(
        rawScore,
        2,
      ),

    finalScore:
      round(
        score,
        1,
      ),

    wasClamped:
      Boolean(
        wasClamped,
      ),

    rows,
  }
}

/*
|--------------------------------------------------------------------------
| Samenvatting Fantasy DNA
|--------------------------------------------------------------------------
*/

function buildFantasySummary(
  modifiers,
) {
  const positive =
    getPositiveModifiers(
      modifiers,
    )

  const negative =
    getNegativeModifiers(
      modifiers,
    )

  const neutral =
    getNeutralModifiers(
      modifiers,
    )

  return {
    active:
      getActiveModifiers(
        modifiers,
      ).length,

    positive: {
      count:
        positive.length,

      total:
        round(
          positive.reduce(
            (
              total,
              modifier,
            ) =>
              total +
              modifier.weightedValue,
            0,
          ),
          2,
        ),

      modifiers:
        positive,
    },

    negative: {
      count:
        negative.length,

      total:
        round(
          negative.reduce(
            (
              total,
              modifier,
            ) =>
              total +
              modifier.weightedValue,
            0,
          ),
          2,
        ),

      modifiers:
        negative,
    },

    neutral: {
      count:
        neutral.length,

      modifiers:
        neutral,
    },
  }
}

/*
|--------------------------------------------------------------------------
| Fantasy DNA betrouwbaarheid
|--------------------------------------------------------------------------
*/

function buildFantasyConfidence(
  modifiers,
) {
  const score =
    calculateModifierConfidence(
      modifiers,
    )

  return {
    score,

    level:
      getConfidenceLevel(
        score,
      ),

    label:
      getConfidenceLabel(
        score,
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Fantasy DNA bouwen
|--------------------------------------------------------------------------
|
| Dit object wordt straks gebruikt door:
|
| - Fantasy Outlook;
| - Scout;
| - Vergelijken;
| - Captain Radar;
| - Dream Team;
| - Differentials.
|
*/

function buildFantasyDNA({
  baseScore = 5,
  modifiers = [],
  minimumScore =
    MIN_SCORE,
  maximumScore =
    MAX_SCORE,
  version =
    MODIFIER_VERSION,
}) {
  const normalizedModifiers =
    sortModifiers(
      modifiers,
    )

  const scoreResult =
    calculateFantasyScore({
      baseScore,
      modifiers:
        normalizedModifiers,
      minimumScore,
      maximumScore,
    })

  const confidence =
    buildFantasyConfidence(
      normalizedModifiers,
    )

  const summary =
    buildFantasySummary(
      normalizedModifiers,
    )

  const strongestModifier =
    getStrongestModifier(
      normalizedModifiers,
    )

  const weakestModifier =
    getWeakestModifier(
      normalizedModifiers,
    )

  const strongestPositiveModifier =
    getStrongestPositiveModifier(
      normalizedModifiers,
    )

  const strongestNegativeModifier =
    getStrongestNegativeModifier(
      normalizedModifiers,
    )

  const calculation =
    buildFantasyCalculation({
      baseScore:
        scoreResult.baseScore,

      modifiers:
        normalizedModifiers,

      contribution:
        scoreResult.contribution,

      rawScore:
        scoreResult.rawScore,

      score:
        scoreResult.score,

      wasClamped:
        scoreResult.wasClamped,
    })

  return {
    score:
      scoreResult.score,

    rawScore:
      scoreResult.rawScore,

    baseScore:
      scoreResult.baseScore,

    contribution:
      scoreResult.contribution,

    confidence,

    modifiers:
      normalizedModifiers,

    activeModifiers:
      getActiveModifiers(
        normalizedModifiers,
      ),

    positiveModifiers:
      summary
        .positive
        .modifiers,

    negativeModifiers:
      summary
        .negative
        .modifiers,

    neutralModifiers:
      summary
        .neutral
        .modifiers,

    summary,

    strongestModifier,

    weakestModifier,

    strongestPositiveModifier,

    strongestNegativeModifier,

    calculation,

    limits: {
      minimumScore:
        scoreResult.minimumScore,

      maximumScore:
        scoreResult.maximumScore,

      wasClamped:
        scoreResult.wasClamped,
    },

    version:
      Number(version) ||
      MODIFIER_VERSION,
  }
}

/*
|--------------------------------------------------------------------------
| Publieke wrappers
|--------------------------------------------------------------------------
*/

function createModifier(
  options,
) {
  return buildModifier(
    options,
  )
}

function createFantasyDNA(
  options,
) {
  return buildFantasyDNA(
    options,
  )
}

function getFantasyModifier(
  modifiers,
  id,
) {
  return getModifier(
    modifiers,
    id,
  )
}

function getFantasyStrengths(
  modifiers,
) {
  return getPositiveModifiers(
    modifiers,
  )
}

function getFantasyConcerns(
  modifiers,
) {
  return getNegativeModifiers(
    modifiers,
  )
}

/*
|--------------------------------------------------------------------------
| Ontwikkeltest
|--------------------------------------------------------------------------
|
| Tijdelijke testfunctie om de Modifier Engine
| los van Fantasy Outlook te controleren.
|
| Deze functie kan later blijven staan,
| maar hoeft niet door de UI gebruikt te worden.
|
*/

function testModifierEngine() {
  const program =
    createModifier({
      id:
        'fixtures',

      label:
        'Aankomend programma',

      score:
        7.4,

      neutralScore:
        5,

      weight:
        0.10,

      confidence:
        86,

      explanation:
        'Drie van de komende vijf speelrondes zijn gunstig.',

      calculation: {
        formula:
          '(Programmascore - neutraal) × weging',

        steps: [
          {
            label:
              'Programmascore',

            value:
              7.4,

            digits:
              1,
          },

          {
            label:
              'Neutrale score',

            value:
              5,

            digits:
              1,
          },

          {
            label:
              'Weging',

            value:
              10,

            digits:
              0,

            suffix:
              '%',
          },
        ],
      },

      details: {
        bestFixture:
          'NAC thuis',

        worstFixture:
          'PSV uit',

        blankRounds:
          0,

        doubleRounds:
          0,
      },

      source: {
        id:
          'fixture-intelligence',

        label:
          'Fixture Intelligence',

        type:
          'automatic',
      },
    })

  const history =
    createModifier({
      id:
        'history',

      label:
        'Historische onderbouwing',

      score:
        6,

      neutralScore:
        5,

      weight:
        0.05,

      confidence:
        91,

      explanation:
        'De speler heeft relevante Eredivisie-historie.',

      source: {
        id:
          'player-history',

        label:
          'Spelerhistorie',

        type:
          'automatic',
      },
    })

  const risk =
    createModifier({
      id:
        'risk',

      label:
        'Risico',

      rawValue:
        -1.2,

      weight:
        0.10,

      minimumValue:
        -0.25,

      maximumValue:
        0,

      confidence:
        78,

      explanation:
        'Er is sprake van beperkt rotatierisico.',

      source: {
        id:
          'player-metadata',

        label:
          'Spelermetadata',

        type:
          'manual',
      },
    })

  return createFantasyDNA({
    baseScore:
      6.5,

    modifiers: [
      program,
      history,
      risk,
    ],
  })
}

/*
|--------------------------------------------------------------------------
| Public API
|--------------------------------------------------------------------------
*/

export {
  buildModifier,
  buildFantasyDNA,

  createModifier,
  createFantasyDNA,

  validateModifier,
  normalizeModifier,
  normalizeModifiers,

  removeDuplicateModifiers,
  sortModifiers,

  getModifier,
  hasModifier,

  getActiveModifiers,
  getPositiveModifiers,
  getNegativeModifiers,
  getNeutralModifiers,

  getFantasyModifier,
  getFantasyStrengths,
  getFantasyConcerns,

  calculateModifierContribution,
  calculateModifierConfidence,
  calculateFantasyScore,

  getStrongestModifier,
  getWeakestModifier,
  getStrongestPositiveModifier,
  getStrongestNegativeModifier,

  testModifierEngine,
}