import {
  calculatePlayerForm,
} from './formIntelligenceEngine.js'

import {
  calculatePlayerValue,
} from './valueIntelligenceEngine.js'

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

function clamp(value, min = 0, max = 10) {
  return Math.min(
    max,
    Math.max(min, value),
  )
}

function roundToOne(value) {
  return Math.round(value * 10) / 10
}

function getAvailabilityScore(player, source) {
  const manual =
    toNumber(source.availability)

  if (manual !== null) {
    return clamp(manual)
  }

  const chance =
    toNumber(player.chanceOfPlaying)

  const minutes =
    toNumber(player.expectedMinutes)

  if (
    chance !== null ||
    minutes !== null
  ) {
    const chanceScore =
      chance !== null
        ? chance / 10
        : 5

    const minutesScore =
      minutes !== null
        ? (minutes / 90) * 10
        : 5

    return clamp(
      chanceScore * 0.55 +
      minutesScore * 0.45,
    )
  }

  const role =
    getExpectedRole(
      player,
      source,
    )

  const roleScores = {
    'key-player': 9.2,
    starter: 8.4,
    rotation: 6.2,
    prospect: 5.5,
    backup: 3.4,
    unknown: 5,
  }

  let score =
    roleScores[role] ?? 5

  const rotationRisk =
    source.rotationRisk ??
    player.rotationRisk ??
    false

  if (rotationRisk === true) {
    score -= 1
  }

  const injuryRisk =
    source.injuryRisk ??
    player.injuryRisk ??
    false

  if (injuryRisk === true) {
    score -= 0.8
  }

  const suspended =
    source.suspended ??
    player.suspended ??
    false

  if (suspended === true) {
    score -= 3
  }

  const expectedStarter =
    source.expectedStarter ??
    player.expectedStarter

  if (expectedStarter === true) {
    score += 0.4
  }

  if (expectedStarter === false) {
    score -= 0.8
  }

  return clamp(score)
}

function getRiskScore(player, source) {
  const manual =
    toNumber(source.risk)

  if (manual !== null) {
    return clamp(manual)
  }

  const status =
    normalizeText(
      player.status ??
      source.status,
    )

  if (
    [
      'geblesseerd',
      'blessure',
      'injured',
      'geschorst',
      'suspended',
    ].includes(status)
  ) {
    return 9
  }

  if (
    [
      'twijfelachtig',
      'doubt',
      'doubtful',
    ].includes(status)
  ) {
    return 6.5
  }

  const chance =
    toNumber(player.chanceOfPlaying)

  if (chance !== null && chance < 60) {
    return 7
  }

  if (chance !== null && chance < 80) {
    return 4.5
  }

  const role =
    getExpectedRole(
      player,
      source,
    )

  const roleRiskScores = {
    'key-player': 1.5,
    starter: 2,
    rotation: 5,
    prospect: 5.5,
    backup: 6.5,
    unknown: 4.5,
  }

  let score =
    roleRiskScores[role] ?? 4.5

  const rotationRisk =
    source.rotationRisk ??
    player.rotationRisk ??
    false

  if (rotationRisk === true) {
    score += 1.5
  }

  const injuryRisk =
    source.injuryRisk ??
    player.injuryRisk ??
    false

  if (injuryRisk === true) {
    score += 1.5
  }

  const newLeague =
    source.newLeague ??
    player.newLeague ??
    false

  if (newLeague === true) {
    score += 0.7
  }

  const premiumSigning =
    source.premiumSigning ??
    player.premiumSigning ??
    false

  if (
    premiumSigning === true &&
    role !== 'backup'
  ) {
    score -= 0.4
  }

  const expectedStarter =
    source.expectedStarter ??
    player.expectedStarter

  if (expectedStarter === true) {
    score -= 0.5
  }

  if (expectedStarter === false) {
    score += 0.8
  }

  return clamp(score)
}

function getTier(score) {
  if (score >= 9) {
    return 'Elite keuze'
  }

  if (score >= 8) {
    return 'Sterke keuze'
  }

  if (score >= 7) {
    return 'Interessante keuze'
  }

  if (score >= 6) {
    return 'Twijfelgeval'
  }

  return 'Voorzichtig mee zijn'
}

function getAdvice(score, risk) {
  if (score >= 8.5 && risk <= 3) {
    return 'Sterke aankoop'
  }

  if (score >= 7.5) {
    return 'Serieuze optie'
  }

  if (score >= 6.5) {
    return 'Alleen passend bij je strategie'
  }

  return 'Voorlopig afwachten'
}

function buildStrengths(scores) {
  const strengths = []

  if (scores.availability >= 8.5) {
    strengths.push(
      'Zeer hoge speelzekerheid',
    )
  }

  if (scores.potential >= 8) {
  strengths.push(
    'Hoge Fantasy-potentie',
  )
}

  if (scores.fixtures >= 8) {
    strengths.push(
      'Gunstig aankomend programma',
    )
  }

  if (
  scores.form !== null &&
  scores.form >= 8) {
  strengths.push(
    'Sterke recente vorm',
  )
}

  if (
    scores.value !== null &&
    scores.value >= 8) {
    strengths.push(
      'Sterke prijs-kwaliteitverhouding',
    )
  }

  if (scores.risk <= 3) {
    strengths.push(
      'Laag risicoprofiel',
    )
  }

  return strengths
}

function buildConcerns(scores) {
  const concerns = []

  if (scores.availability < 6) {
    concerns.push(
      'Onzekere speelminuten',
    )
  }

  if (scores.potential < 5.5) {
  concerns.push(
    'Beperkte Fantasy-potentie',
  )
}

  if (scores.fixtures < 5.5) {
    concerns.push(
      'Ongunstig aankomend programma',
    )
  }

  if (scores.form < 5.5) {
  concerns.push(
    'Matige recente vorm',
  )
}

  if (scores.value < 5.5) {
    concerns.push(
      'Prijs lijkt relatief hoog',
    )
  }

  if (scores.risk >= 7) {
    concerns.push(
      'Duidelijk inzetbaarheidsrisico',
    )
  }

  return concerns
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function getHistoricalModifier(
  player,
) {
  const experience =
    player.profile?.experience ??
    player.experience ??
    {}

  const confidence =
    player.profile?.confidence ??
    player.confidence ??
    {}

  const experienceScore =
    Number(
      experience.score,
    ) || 0

  const confidenceScore =
    Number(
      confidence.score,
    ) || 0

  /*
  |--------------------------------------------------
  | Historie ondersteunt de voorspelling.
  |
  | Historie bepaalt nooit zelfstandig
  | de Fantasy Score.
  |
  | Maximale bonus:
  | +0.20
  |--------------------------------------------------
  */

  let modifier = 0

  if (experienceScore >= 80) {
    modifier += 0.10
  } else if (experienceScore >= 60) {
    modifier += 0.05
  }

  if (confidenceScore >= 85) {
    modifier += 0.10
  } else if (confidenceScore >= 70) {
    modifier += 0.05
  }

  return Math.min(
    modifier,
    0.20,
  )
}

function getConfidenceModifier(
  player,
) {
  const confidence =
    player.profile?.confidence ??
    player.confidence ??
    {}

  const score =
    Number(
      confidence.score,
    ) || 0

  /*
  |--------------------------------------------------------------------------
  | Databetrouwbaarheid
  |--------------------------------------------------------------------------
  |
  | Een hoge betrouwbaarheid geeft
  | iets meer vertrouwen in de
  | voorspelling.
  |
  | Maximaal:
  | +0.10
  |
  */

  if (score >= 90) {
    return 0.10
  }

  if (score >= 75) {
    return 0.05
  }

  return 0
}

function getManualPotential(source) {
  const manual =
    toNumber(source.potential)

  if (manual === null) {
    return null
  }

  return clamp(manual)
}

function getHistoricalPotential(player) {
  const fantasyPoints =
    toNumber(
      player.previousSeasonPoints ??
      player.lastSeasonPoints ??
      player.fantasyPointsPreviousSeason,
    )

  const minutes =
    toNumber(
      player.previousSeasonMinutes ??
      player.lastSeasonMinutes ??
      player.minutesPreviousSeason,
    )

  if (
    fantasyPoints === null ||
    minutes === null ||
    minutes < 450
  ) {
    return null
  }

  const pointsPer90 =
    fantasyPoints / minutes * 90

  /*
   * Voorlopige schaal:
   *
   * 2 punten per 90  -> ongeveer 3,0
   * 4 punten per 90  -> ongeveer 5,0
   * 6 punten per 90  -> ongeveer 7,0
   * 8 punten per 90  -> ongeveer 9,0
   */

  return clamp(
    1 + pointsPer90,
  )
}

function getClubLevel(player, source) {
  const manualLevel =
    normalizeText(
      source.clubLevel ??
      player.clubLevel,
    )

  if (manualLevel) {
    return manualLevel
  }

  const club =
    normalizeText(
      player.club ??
      player.team ??
      player.clubName,
    )

  const topClubs = [
    'ajax',
    'psv',
    'feyenoord',
  ]

  const subtopClubs = [
    'az',
    'fc utrecht',
    'utrecht',
    'fc twente',
    'twente',
  ]

  if (
    topClubs.some(
      name => club.includes(name),
    )
  ) {
    return 'top'
  }

  if (
    subtopClubs.some(
      name => club.includes(name),
    )
  ) {
    return 'subtop'
  }

  return 'regular'
}

function getExpectedRole(player, source) {
  const role =
    normalizeText(
      source.expectedRole ??
      player.expectedRole ??
      player.squadRole ??
      'unknown',
    )

  const roleMap = {
    basis: 'starter',
    basisspeler: 'starter',
    starter: 'starter',
    'first-choice': 'starter',
    'eerste keus': 'starter',

    sterkhouder: 'key-player',
    sleutelspeler: 'key-player',
    sterspeler: 'key-player',
    star: 'key-player',
    'key-player': 'key-player',

    roulatie: 'rotation',
    rotatie: 'rotation',
    rotation: 'rotation',

    reserve: 'backup',
    bankspeler: 'backup',
    backup: 'backup',

    talent: 'prospect',
    prospect: 'prospect',

    onbekend: 'unknown',
    unknown: 'unknown',
  }

  return roleMap[role] ?? role
}

function getPositionGroup(player) {
  const position =
    normalizeText(
      player.position ??
      player.positionName ??
      player.positionGroup,
    )

  if (
    position.includes('keeper') ||
    position === 'gk' ||
    position.includes('doelman')
  ) {
    return 'goalkeeper'
  }

  if (
    position.includes('verded') ||
    position === 'def' ||
    position.includes('back') ||
    position.includes('centre-back') ||
    position.includes('center-back')
  ) {
    return 'defender'
  }

  if (
    position.includes('midden') ||
    position === 'mid' ||
    position.includes('midfielder')
  ) {
    return 'midfielder'
  }

  if (
    position.includes('aanval') ||
    position === 'att' ||
    position.includes('spits') ||
    position.includes('winger') ||
    position.includes('forward') ||
    position.includes('striker')
  ) {
    return 'attacker'
  }

  return 'unknown'
}

function getRoleBasedPotential(
  player,
  source,
) {
  const clubLevel =
    getClubLevel(player, source)

  const role =
    getExpectedRole(player, source)

  const position =
    getPositionGroup(player)

  const roleBaseScores = {
    top: {
      goalkeeper: 6.8,
      defender: 7.2,
      midfielder: 7.6,
      attacker: 8.0,
      unknown: 7.0,
    },

    subtop: {
      goalkeeper: 6.2,
      defender: 6.6,
      midfielder: 7.0,
      attacker: 7.3,
      unknown: 6.5,
    },

    regular: {
      goalkeeper: 5.5,
      defender: 5.8,
      midfielder: 6.2,
      attacker: 6.5,
      unknown: 5.8,
    },
  }

  const levelScores =
    roleBaseScores[clubLevel] ??
    roleBaseScores.regular

  let score =
    levelScores[position] ??
    levelScores.unknown

  if (role === 'starter') {
  score += 0.4
}

  if (role === 'key-player') {
  score += 0.7
}

  if (role === 'rotation') {
  score -= 0.8
}

  if (role === 'backup') {
  score -= 1.8
}

if (role === 'prospect') {
  score -= 0.5
}

  const takesPenalties =
    source.penalties ??
    player.penalties ??
    player.takesPenalties

  if (takesPenalties === true) {
    score += 0.5
  }

  const takesSetPieces =
    source.setPieces ??
    player.setPieces ??
    player.takesSetPieces

  if (takesSetPieces === true) {
    score += 0.3
  }

  const premiumSigning =
    source.premiumSigning ??
    player.premiumSigning ??
    false

  if (premiumSigning === true) {
    score += 0.3
  }

  const newLeague =
    source.newLeague ??
    player.newLeague ??
    false

  if (newLeague === true) {
    score -= 0.2
  }

  return clamp(score)
}

function getPotentialScore(
  player,
  source,
) {
  const manual =
    getManualPotential(source)

  if (manual !== null) {
    return {
      score: manual,
      source: 'manual',
    }
  }

  const historical =
    getHistoricalPotential(player)

  if (historical !== null) {
    return {
      score: historical,
      source: 'historical',
    }
  }

  return {
    score:
      getRoleBasedPotential(
        player,
        source,
      ),

    source: 'role',
  }
}

function getDataConfidence(
  player,
  source,
  potentialSource,
) {
  const manualConfidence =
    normalizeText(
      source.confidence,
    )

  if (
    [
      'high',
      'medium',
      'low',
    ].includes(manualConfidence)
  ) {
    return manualConfidence
  }

  const minutes =
    toNumber(
      player.previousSeasonMinutes ??
      player.lastSeasonMinutes ??
      player.minutesPreviousSeason,
    )

  const appearances =
    toNumber(
      player.previousSeasonAppearances ??
      player.lastSeasonAppearances ??
      player.appearancesPreviousSeason,
    )

  if (
    potentialSource === 'historical' &&
    (
      minutes >= 1800 ||
      appearances >= 25
    )
  ) {
    return 'high'
  }

  if (
    potentialSource === 'historical' &&
    (
      minutes >= 900 ||
      appearances >= 12
    )
  ) {
    return 'medium'
  }

  if (
    potentialSource === 'manual'
  ) {
    return 'medium'
  }

  return 'low'
}

function getConfidenceLabel(
  confidence,
) {
  const labels = {
    high: 'Hoog',
    medium: 'Gemiddeld',
    low: 'Laag',
  }

  return labels[confidence] ?? 'Laag'
}

export function calculateFantasyOutlook(
  player,
  context = {},
) {
  const scout =
  player.scoutProfile || {}

const source = {
  ...scout,

  potential:
    scout.overrides?.potential ??
    player.outlook?.potential,

  availability:
    scout.overrides?.availability ??
    player.outlook?.availability,

  risk:
    scout.overrides?.risk ??
    player.outlook?.risk,

  form:
    player.outlook?.form,

  fixtures:
  context.fixtureScore ??
  player.outlook?.fixtures,

  value:
    player.outlook?.value,
}

const potentialResult =
  getPotentialScore(
    player,
    source,
  )

const formResult =
  calculatePlayerForm({
    player,

    manualScore:
      source.form,

    roundCount:
      5,
  })

  const valueResult =
  calculatePlayerValue({
    player,

    manualScore:
      source.value,
  })

const profileConfidence =
  player.profile?.confidence ??
  player.confidence ??
  null

const confidence =
  profileConfidence
    ? {
        value:
          profileConfidence.level ??
          'low',

        label:
          profileConfidence.label ??
          'Laag',

        score:
          Number(
            profileConfidence.score,
          ) || 0,

        source:
          profileConfidence.source ??
          'automatic',

        reasons:
          profileConfidence.reasons ??
          [],
      }
    : {
        value: 'low',
        label: 'Laag',
        score: 20,
        source: 'fallback',
        reasons: [],
      }

  const scores = {
    availability:
      getAvailabilityScore(
        player,
        source,
      ),

    potential:
  potentialResult.score,

    fixtures:
  clamp(
    toNumber(source.fixtures) ?? 5,
  ),

form:
  formResult.score,

value:
  valueResult.score,

    risk:
      getRiskScore(
        player,
        source,
      ),
  }

  const positiveRiskScore =
  10 - scores.risk

/*
|--------------------------------------------------------------------------
| Dynamische weging
|--------------------------------------------------------------------------
|
| Wanneer Vorm of Waarde nog geen data
| heeft, worden de beschikbare gewichten
| automatisch opnieuw verdeeld.
|
*/

const weightedScores = [
  {
    key: 'potential',
    score:
      scores.potential,
    weight: 0.30,
    available: true,
  },

  {
    key: 'availability',
    score:
      scores.availability,
    weight: 0.25,
    available: true,
  },

  {
    key: 'fixtures',
    score:
      scores.fixtures,
    weight: 0.15,
    available: true,
  },

  {
    key: 'form',
    score:
      scores.form,
    weight: 0.15,
    available:
      formResult.hasData,
  },

  {
    key: 'value',
    score:
      scores.value,
    weight: 0.10,
    available:
      valueResult.hasData,
  },

  {
    key: 'risk',
    score:
      positiveRiskScore,
    weight: 0.05,
    available: true,
  },
]

const availableWeight =
  weightedScores
    .filter(
      item =>
        item.available,
    )
    .reduce(
      (
        total,
        item,
      ) =>
        total +
        item.weight,
      0,
    )

const baseScore =
  roundToOne(
    weightedScores
      .filter(
        item =>
          item.available,
      )
      .reduce(
        (
          total,
          item,
        ) =>
          total +
          item.score *
            (
              item.weight /
              availableWeight
            ),
        0,
      ),
  )

/*
|--------------------------------------------------------------------------
| Intelligence-modifiers
|--------------------------------------------------------------------------
*/

const historyModifier =
  getHistoricalModifier(
    player,
  )

  const confidenceModifier =
  getConfidenceModifier(
    player,
  )

/*
|--------------------------------------------------------------------------
| Eindscore
|--------------------------------------------------------------------------
*/

const totalScore =
  roundToOne(
    baseScore +
    historyModifier +
    confidenceModifier,
  )

  const roundedScores = {
  availability:
    roundToOne(
      scores.availability,
    ),

  potential:
    roundToOne(
      scores.potential,
    ),

  fixtures:
    roundToOne(
      scores.fixtures,
    ),

  form:
    formResult.displayScore,

  value:
    valueResult.displayScore,

  risk:
    roundToOne(
      scores.risk,
    ),
}

  return {
  score: totalScore,

  tier:
    getTier(totalScore),

  advice:
    getAdvice(
      totalScore,
      roundedScores.risk,
    ),

  confidence,

form:
  formResult,

value:
  valueResult,

  calculation: {
  potentialSource:
    potentialResult.source,

  expectedRole:
    getExpectedRole(
      player,
      source,
    ),

  baseScore:
    roundToOne(
      baseScore,
    ),

  modifiers: {
  history: {
    value: historyModifier,
    label: 'Historische onderbouwing',
  },

  confidence: {
    value: confidenceModifier,
    label: 'Zekerheid van de voorspelling',
  },
},
},

scores:
  roundedScores,

pillarData: {
  availability: {
    hasData: true,
  },

  potential: {
    hasData: true,
  },

  fixtures: {
    hasData: true,
  },

  form: {
    hasData:
      formResult.hasData,
  },

  value: {
    hasData:
      valueResult.hasData,
  },

  risk: {
    hasData: true,
  },
},

  strengths:
    buildStrengths(
      roundedScores,
    ),

  concerns:
    buildConcerns(
      roundedScores,
    ),
}
}
