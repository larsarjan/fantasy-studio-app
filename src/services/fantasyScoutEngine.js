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

function roundToOne(value) {
  return Math.round(value * 10) / 10
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function uniqueItems(items) {
  return [
    ...new Set(
      items.filter(Boolean),
    ),
  ]
}

function getScoutLabel(score) {
  if (score >= 85) {
    return 'Topkeuze'
  }

  if (score >= 75) {
    return 'Sterke keuze'
  }

  if (score >= 65) {
    return 'Interessante optie'
  }

  if (score >= 55) {
    return 'Twijfelgeval'
  }

  return 'Voorlopig vermijden'
}

function getScoutLevel(score) {
  if (score >= 85) {
    return 'elite'
  }

  if (score >= 75) {
    return 'strong'
  }

  if (score >= 65) {
    return 'interesting'
  }

  if (score >= 55) {
    return 'doubt'
  }

  return 'avoid'
}

function getScoutStars(score) {
  if (score >= 85) {
    return 5
  }

  if (score >= 75) {
    return 4
  }

  if (score >= 65) {
    return 3
  }

  if (score >= 55) {
    return 2
  }

  return 1
}

function buildStrengths(
  player,
  outlook,
) {
  const strengths = [
    ...(outlook?.strengths ?? []),
  ]

  const scout =
    player?.profile?.scout ??
    player?.scoutProfile ??
    {}

  const experience =
    player?.profile?.experience ??
    player?.experience ??
    {}

  const confidence =
    player?.profile?.confidence ??
    player?.confidence ??
    {}

  const role =
    normalizeText(
      scout.expectedRole,
    )

  if (role === 'key-player') {
    strengths.push(
      'Verwachte sleutelspeler',
    )
  } else if (
    role === 'starter'
  ) {
    strengths.push(
      'Verwachte basisspeler',
    )
  }

  if (
    scout.expectedStarter === true &&
    Number(
      outlook?.scores?.availability,
    ) >= 8
  ) {
    strengths.push(
      'Hoge zekerheid op speelminuten',
    )
  }

  if (
    Number(
      outlook?.scores?.risk,
    ) <= 2.5
  ) {
    strengths.push(
      'Zeer laag Fantasy-risico',
    )
  }

  if (
    Number(
      outlook?.scores?.potential,
    ) >= 7.5
  ) {
    strengths.push(
      'Hoog Fantasy-plafond',
    )
  }

  if (
    Number(
      outlook?.scores?.fixtures,
    ) >= 7
  ) {
    strengths.push(
      'Gunstig aankomend programma',
    )
  }

  if (
    Number(
      outlook?.scores?.value,
    ) >= 7
  ) {
    strengths.push(
      'Sterke prijs-kwaliteitverhouding',
    )
  }

  if (
    Number(experience.score) >= 70
  ) {
    strengths.push(
      'Veel bewezen Eredivisie-ervaring',
    )
  }

  if (
    Number(confidence.score) >= 80
  ) {
    strengths.push(
      'Voorspelling is sterk onderbouwd',
    )
  }

  if (
    scout.penalties === true
  ) {
    strengths.push(
      'Waarschijnlijke penaltynemer',
    )
  }

  if (
    scout.corners === true ||
    scout.freeKicks === true
  ) {
    strengths.push(
      'Betrokken bij standaardsituaties',
    )
  }

  return uniqueItems(
    strengths,
  ).slice(0, 5)
}

function buildConcerns(
  player,
  outlook,
) {
  const concerns = [
    ...(outlook?.concerns ?? []),
  ]

  const scout =
    player?.profile?.scout ??
    player?.scoutProfile ??
    {}

  const experience =
    player?.profile?.experience ??
    player?.experience ??
    {}

  const confidence =
    player?.profile?.confidence ??
    player?.confidence ??
    {}

  const role =
    normalizeText(
      scout.expectedRole,
    )

  if (role === 'rotation') {
    concerns.push(
      'Verwachte roulatiespeler',
    )
  }

  if (role === 'backup') {
    concerns.push(
      'Waarschijnlijk geen eerste keuze',
    )
  }

  if (role === 'prospect') {
    concerns.push(
      'Rol als talent is nog onzeker',
    )
  }

  if (
    role === 'unknown'
  ) {
    concerns.push(
      'Selectierol is nog niet beoordeeld',
    )
  }

  if (
    scout.rotationRisk === true
  ) {
    concerns.push(
      'Duidelijk rotatierisico',
    )
  }

  if (
    scout.injuryRisk === true
  ) {
    concerns.push(
      'Verhoogd blessurerisico',
    )
  }

  if (
    scout.newLeague === true
  ) {
    concerns.push(
      'Moet zich aanpassen aan de Eredivisie',
    )
  }

  if (
    Number(
      outlook?.scores?.risk,
    ) >= 6
  ) {
    concerns.push(
      'Hoog algemeen Fantasy-risico',
    )
  }

  if (
    Number(
      outlook?.scores?.availability,
    ) < 5.5
  ) {
    concerns.push(
      'Onzekere speelminuten',
    )
  }

  if (
    Number(experience.score) < 25
  ) {
    concerns.push(
      'Nauwelijks bewezen Eredivisie-ervaring',
    )
  }

  if (
    Number(confidence.score) < 55
  ) {
    concerns.push(
      'Voorspelling is nog beperkt onderbouwd',
    )
  }

  return uniqueItems(
    concerns,
  ).slice(0, 5)
}

function getScoutVerdict({
  score,
  risk,
  confidence,
}) {
  if (
    score >= 80 &&
    risk <= 3 &&
    confidence >= 70
  ) {
    return (
      'Een sterke en relatief veilige Fantasy-keuze. ' +
      'Geschikt als vaste bouwsteen van je team.'
    )
  }

  if (
    score >= 75 &&
    confidence < 55
  ) {
    return (
      'Veel Fantasy-potentie, maar de voorspelling ' +
      'is nog onvoldoende bewezen. Interessant met risico.'
    )
  }

  if (
    score >= 70 &&
    risk <= 4.5
  ) {
    return (
      'Een interessante optie met een goede balans ' +
      'tussen potentie, speelzekerheid en risico.'
    )
  }

  if (
    score >= 60
  ) {
    return (
      'Bruikbaar binnen de juiste strategie, maar ' +
      'geen speler die vanzelfsprekend in ieder team hoort.'
    )
  }

  return (
    'Voorlopig zijn er te veel vraagtekens. ' +
    'Afwachten of alleen kiezen als bewuste gok.'
  )
}

export function calculateFantasyScoutReport(
  player,
  outlook,
) {
  const outlookScore =
    clamp(
      Number(outlook?.score) * 10,
    )

  const confidence =
    clamp(
      player?.profile
        ?.confidence
        ?.score ??
      player?.confidence
        ?.score ??
      outlook?.confidence
        ?.score ??
      20,
    )

  const risk =
    clamp(
      Number(
        outlook?.scores?.risk,
      ) * 10,
    )

  /*
   * Het Scout-cijfer is primair de
   * Fantasy Outlook-score.
   *
   * Confidence verandert de verwachting
   * niet, maar geeft wel een kleine
   * correctie aan zeer zwak onderbouwde
   * voorspellingen.
   */
  const confidenceCorrection =
    confidence < 40
      ? -3
      : confidence >= 80
        ? 1
        : 0

  const score =
    roundToOne(
      clamp(
        outlookScore +
        confidenceCorrection,
      ),
    )

  return {
    score,

    stars:
      getScoutStars(score),

    label:
      getScoutLabel(score),

    level:
      getScoutLevel(score),

    confidence,

    risk,

    strengths:
      buildStrengths(
        player,
        outlook,
      ),

    concerns:
      buildConcerns(
        player,
        outlook,
      ),

    verdict:
      getScoutVerdict({
        score,
        risk: risk / 10,
        confidence,
      }),
  }
}