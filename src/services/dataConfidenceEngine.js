function clamp(
  value,
  minimum = 0,
  maximum = 100,
) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      Number(value) || 0,
    ),
  )
}

function round(value) {
  return Math.round(value * 10) / 10
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function getManualConfidence(value) {
  const confidence =
    normalizeText(value)

  const scores = {
    high: 90,
    hoog: 90,

    medium: 65,
    gemiddeld: 65,

    low: 40,
    laag: 40,
  }

  return scores[confidence] ?? null
}

function getConfidenceLabel(score) {
  if (score >= 80) {
    return 'Hoog'
  }

  if (score >= 55) {
    return 'Gemiddeld'
  }

  return 'Laag'
}

function getConfidenceLevel(score) {
  if (score >= 80) {
    return 'high'
  }

  if (score >= 55) {
    return 'medium'
  }

  return 'low'
}

export function calculateDataConfidence({
  player,
  history,
  experience,
}) {
  const scout =
    player?.scoutProfile ?? {}

  /*
   * Een handmatige beoordeling uit
   * PLAYER_METADATA blijft leidend.
   */
  const manualScore =
    getManualConfidence(
      scout.confidence ??
      player?.dataConfidence,
    )

  if (manualScore !== null) {
    return {
      score: manualScore,
      level:
        getConfidenceLevel(
          manualScore,
        ),
      label:
        getConfidenceLabel(
          manualScore,
        ),
      source: 'manual',
      reasons: [
        'Databetrouwbaarheid is handmatig beoordeeld.',
      ],
    }
  }

  let score = 20
  const reasons = []

  /*
   * Experience telt maximaal voor 45 punten mee.
   * Het verleden bepaalt dus vooral hoeveel
   * bewijs beschikbaar is.
   */
  const experienceScore =
    clamp(
      experience?.score ?? 0,
    )

  score +=
    experienceScore * 0.45

  if (experienceScore >= 70) {
    reasons.push(
      'Veel historische Eredivisie-ervaring beschikbaar.',
    )
  } else if (experienceScore >= 35) {
    reasons.push(
      'Enige bruikbare Eredivisie-ervaring beschikbaar.',
    )
  } else {
    reasons.push(
      'Weinig historische Eredivisie-ervaring beschikbaar.',
    )
  }

  const historicalSeasons =
    history?.seasons?.length ?? 0

  if (historicalSeasons >= 1) {
    score += 10

    reasons.push(
      'Minimaal één eerder seizoen is gekoppeld.',
    )
  }

  const expectedRole =
    normalizeText(
      scout.expectedRole,
    )

  if (
    expectedRole &&
    expectedRole !== 'unknown'
  ) {
    score += 12

    reasons.push(
      'De verwachte selectierol is beoordeeld.',
    )
  } else {
    reasons.push(
      'De verwachte selectierol is nog onbekend.',
    )
  }

  if (
    scout.expectedStarter === true ||
    scout.expectedStarter === false
  ) {
    score += 5

    reasons.push(
      'De verwachte basisstatus is beoordeeld.',
    )
  }

  if (
    Number.isFinite(
      Number(
        scout.chanceOfPlaying,
      ),
    )
  ) {
    score += 4
  }

  if (
    Number.isFinite(
      Number(
        scout.expectedMinutes,
      ),
    )
  ) {
    score += 4
  }

  if (scout.newLeague === true) {
    score -= 10

    reasons.push(
      'De speler moet zich bewijzen in een nieuwe competitie.',
    )
  }

  if (scout.rotationRisk === true) {
    score -= 4

    reasons.push(
      'Rotatierisico maakt de verwachting minder zeker.',
    )
  }

  if (scout.injuryRisk === true) {
    score -= 4

    reasons.push(
      'Blessurerisico maakt de verwachting minder zeker.',
    )
  }

  const finalScore =
    round(
      clamp(score),
    )

  return {
    score: finalScore,

    level:
      getConfidenceLevel(
        finalScore,
      ),

    label:
      getConfidenceLabel(
        finalScore,
      ),

    source: 'automatic',

    reasons,
  }
}