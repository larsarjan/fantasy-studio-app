/*
 * Verwachte clubopstellingen zijn nadrukkelijk geen fantasy-opstellingen.
 * Deze pure resolver gebruikt daarom geen optimizerregels, budget of xP-ranking.
 */

const FORMATIONS = {
  '4-3-3': [
    ['GK', 50, 93], ['LB', 15, 73], ['LCB', 38, 78], ['RCB', 62, 78], ['RB', 85, 73],
    ['LCM', 28, 52], ['CM', 50, 57], ['RCM', 72, 52],
    ['LW', 18, 25], ['ST', 50, 18], ['RW', 82, 25],
  ],
  '4-2-3-1': [
    ['GK', 50, 93], ['LB', 15, 73], ['LCB', 38, 78], ['RCB', 62, 78], ['RB', 85, 73],
    ['LDM', 35, 58], ['RDM', 65, 58], ['LW', 18, 35], ['CAM', 50, 38], ['RW', 82, 35],
    ['ST', 50, 17],
  ],
  '4-4-2': [
    ['GK', 50, 93], ['LB', 15, 73], ['LCB', 38, 78], ['RCB', 62, 78], ['RB', 85, 73],
    ['LM', 16, 48], ['LCM', 39, 54], ['RCM', 61, 54], ['RM', 84, 48],
    ['LST', 38, 20], ['RST', 62, 20],
  ],
    '4-2-4': [
    ['GK', 50, 93], ['LB', 15, 73], ['LCB', 38, 78], ['RCB', 62, 78], ['RB', 85, 73],
    ['LDM', 38, 54], ['RDM', 62, 54],
    ['LW', 15, 27], ['LST', 38, 18], ['RST', 62, 18], ['RW', 85, 27],
  ],
  '3-4-3': [
    ['GK', 50, 93], ['LCB', 25, 76], ['CB', 50, 80], ['RCB', 75, 76],
    ['LWB', 14, 49], ['LCM', 39, 55], ['RCM', 61, 55], ['RWB', 86, 49],
    ['LW', 18, 24], ['ST', 50, 17], ['RW', 82, 24],
  ],
  '3-5-2': [
    ['GK', 50, 93], ['LCB', 25, 76], ['CB', 50, 80], ['RCB', 75, 76],
    ['LWB', 13, 50], ['LCM', 30, 55], ['CM', 50, 49], ['RCM', 70, 55], ['RWB', 87, 50],
    ['LST', 38, 20], ['RST', 62, 20],
  ],
  '5-3-2': [
    ['GK', 50, 93], ['LWB', 11, 62], ['LCB', 29, 76], ['CB', 50, 80], ['RCB', 71, 76], ['RWB', 89, 62],
    ['LCM', 31, 51], ['CM', 50, 56], ['RCM', 69, 51],
    ['LST', 38, 20], ['RST', 62, 20],
  ],
  '5-4-1': [
    ['GK', 50, 93], ['LWB', 11, 64], ['LCB', 29, 77], ['CB', 50, 81], ['RCB', 71, 77], ['RWB', 89, 64],
    ['LM', 17, 45], ['LCM', 39, 52], ['RCM', 61, 52], ['RM', 83, 45],
    ['ST', 50, 18],
  ],
  '4-5-1': [
    ['GK', 50, 93], ['LB', 15, 73], ['LCB', 38, 78], ['RCB', 62, 78], ['RB', 85, 73],
    ['LM', 14, 43], ['LCM', 34, 54], ['CM', 50, 58], ['RCM', 66, 54], ['RM', 86, 43],
    ['ST', 50, 18],
  ],
}

const ROLE_ALIASES = new Map([
  ['kee', 'GK'], ['gk', 'GK'], ['goalkeeper', 'GK'], ['keeper', 'GK'], ['doelman', 'GK'],
  ['ver', 'CB'], ['def', 'CB'], ['defender', 'CB'], ['verdediger', 'CB'],
  ['mid', 'CM'], ['midfielder', 'CM'], ['middenvelder', 'CM'],
  ['spi', 'ST'], ['fwd', 'ST'], ['forward', 'ST'], ['aanvaller', 'ST'], ['spits', 'ST'],
  ['left-back', 'LB'], ['left back', 'LB'], ['rechtsback', 'RB'], ['right-back', 'RB'], ['right back', 'RB'],
  ['linksback', 'LB'], ['centre-back', 'CB'], ['center-back', 'CB'], ['central defender', 'CB'],
  ['left-wing-back', 'LWB'], ['right-wing-back', 'RWB'], ['wing-back', 'WB'], ['wingback', 'WB'],
  ['defensive-midfielder', 'DM'], ['defensive midfielder', 'DM'], ['controlerende middenvelder', 'DM'],
  ['cdm', 'DM'], ['box-to-box', 'B2B'], ['box to box', 'B2B'], ['box2box', 'B2B'], ['b2b', 'B2B'],
  ['central-midfielder', 'CM'], ['central midfielder', 'CM'], ['attacking-midfielder', 'CAM'], ['attacking midfielder', 'CAM'],
  ['left-midfielder', 'LM'], ['right-midfielder', 'RM'], ['left-winger', 'LW'], ['right-winger', 'RW'],
  ['winger', 'W'], ['second-striker', 'SS'], ['second striker', 'SS'], ['centre-forward', 'CF'], ['center-forward', 'CF'],
])

const UNAVAILABLE_STATUS = /(geblesseerd|injured|geschorst|suspended|niet beschikbaar|unavailable)/i

function clean(value) {
  return String(value ?? '').trim()
}

function finiteNumber(value) {
  if (value === null || value === undefined || clean(value) === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeProbability(value) {
  const number = finiteNumber(value)
  if (number === null || number < 0) return null
  const percentage = number <= 1 ? number * 100 : number
  return percentage <= 100 ? Math.round(percentage) : null
}

function recentMatchRoleEstimate(player) {
  const matches = player?.matchProfile?.recentMatches ?? player?.matchProfile?.recenteWedstrijden ?? []
  if (!Array.isArray(matches) || matches.length < 3) return null

  const recent = matches.slice(-5)
  let totalWeight = 0
  let startWeight = 0
  let appearanceWeight = 0
  let minutesWeight = 0
  let weightedMinutes = 0

  recent.forEach((match, index) => {
    const weight = 1 + (index / Math.max(1, recent.length - 1)) * 0.5
    const minutes = Math.max(0, Math.min(90, finiteNumber(match?.minutes) ?? finiteNumber(match?.statistieken?.minuten) ?? 0))
    const started = match?.started === true || clean(match?.status).toLowerCase() === 'starter' || clean(match?.statusLabel).toLowerCase() === 'basis'
    const appeared = match?.played === true || minutes > 0 || started
    totalWeight += weight
    startWeight += started ? weight : 0
    appearanceWeight += appeared ? weight : 0
    minutesWeight += (minutes / 90) * weight
    weightedMinutes += minutes * weight
  })

  if (!totalWeight) return null
  const startRate = startWeight / totalWeight
  const appearanceRate = appearanceWeight / totalWeight
  const minutesRate = minutesWeight / totalWeight
  const chance = Math.max(5, Math.min(98, Math.round((startRate * 0.72 + minutesRate * 0.18 + appearanceRate * 0.10) * 100)))
  return {
    chance,
    expectedMinutes: Math.round(weightedMinutes / totalWeight),
    matches: recent.length,
    starts: recent.filter((match) => match?.started === true || clean(match?.status).toLowerCase() === 'starter' || clean(match?.statusLabel).toLowerCase() === 'basis').length,
    appearances: recent.filter((match) => match?.played === true || (finiteNumber(match?.minutes) ?? finiteNumber(match?.statistieken?.minuten) ?? 0) > 0).length,
  }
}

export function getRecentStarterEstimate(player) {
  return recentMatchRoleEstimate(player)
}

function normalizeRole(value) {
  const raw = clean(value).toLowerCase().replace(/_/g, '-').replace(/\s+/g, ' ')
  if (!raw) return null
  if (ROLE_ALIASES.has(raw)) return ROLE_ALIASES.get(raw)
  const upper = raw.toUpperCase()
  return /^(GK|LB|LCB|CB|RCB|RB|LWB|RWB|WB|DM|LDM|RDM|B2B|CM|LCM|RCM|AM|CAM|LM|RM|LW|RW|W|SS|CF|LST|ST|RST)$/.test(upper)
    ? upper
    : null
}

function roleValues(value) {
  const values = Array.isArray(value) ? value : [value]
  return values
    .flatMap((item) => clean(item).split(/[,;/|]+/))
    .map(normalizeRole)
    .filter(Boolean)
}

export function parseTacticalRoles(value) {
  return [...new Set(roleValues(value))]
}

function explicitTacticalRoles(player) {
  return [...new Set([
    ...parseTacticalRoles(player?.roles),
    ...parseTacticalRoles(player?.tacticalRole),
  ])]
}

function fallbackRole(player) {
  return normalizeRole(player?.fantasyPosition || player?.position)
}

const COMPATIBILITY_LEVEL_SCORE = {
  exact: 1,
  natural: 0.86,
  limited: 0.64,
}

const NATURAL_COMPATIBILITY = {
  GK: ['GK'],
  LB: ['LWB'],
  LCB: ['CB'],
  CB: ['LCB', 'RCB'],
  RCB: ['CB'],
  RB: ['RWB'],
  LWB: ['LB', 'WB'],
  RWB: ['RB', 'WB'],
  LDM: ['DM'],
  RDM: ['DM'],
  DM: ['LDM', 'RDM'],
  LCM: ['CM', 'B2B'],
  CM: ['LCM', 'RCM', 'DM', 'B2B'],
  RCM: ['CM', 'B2B'],
  CAM: ['AM'],
  LM: ['LW'],
  RM: ['RW'],
  LW: ['LM'],
  RW: ['RM'],
  LST: ['ST', 'CF'],
  RST: ['ST', 'CF'],
  ST: ['CF'],
  CF: ['ST'],
}

const LIMITED_COMPATIBILITY = {
  LB: ['CB'],
  LCB: ['LB'],
  RCB: ['RB'],
  RB: ['CB'],
  LWB: ['LM'],
  RWB: ['RM'],
  LDM: ['CM', 'B2B'],
  RDM: ['CM', 'B2B'],
  DM: ['CM', 'B2B'],
  LCM: ['DM', 'CAM', 'AM'],
  CM: ['CAM', 'AM'],
  RCM: ['DM', 'CAM', 'AM'],
  CAM: ['CM', 'B2B', 'SS'],
  LM: ['LWB'],
  RM: ['RWB'],
  LST: ['SS'],
  RST: ['SS'],
  ST: ['SS'],
  CF: ['SS'],
}

const FALLBACK_COMPATIBILITY = {
  GK: ['GK'],
  CB: ['LB', 'LCB', 'CB', 'RCB', 'RB'],
  CM: ['LDM', 'RDM', 'LCM', 'CM', 'RCM', 'CAM', 'LM', 'RM'],
  ST: ['LW', 'LST', 'ST', 'CF', 'RST', 'RW'],
}

function normalizedSlotRole(slotRole) {
  if (slotRole === 'LST' || slotRole === 'RST') return slotRole
  return normalizeRole(slotRole)
}

function compatibilityForRole(sourceRole, slotRole) {
  if (!sourceRole || !slotRole) return null
  if (sourceRole === slotRole) return { level: 'exact', score: COMPATIBILITY_LEVEL_SCORE.exact }
  if ((slotRole === 'LST' || slotRole === 'RST') && sourceRole === 'ST') {
    return { level: 'exact', score: COMPATIBILITY_LEVEL_SCORE.exact }
  }
  if ((NATURAL_COMPATIBILITY[slotRole] || []).includes(sourceRole)) {
    return { level: 'natural', score: COMPATIBILITY_LEVEL_SCORE.natural }
  }
  if ((LIMITED_COMPATIBILITY[slotRole] || []).includes(sourceRole)) {
    return { level: 'limited', score: COMPATIBILITY_LEVEL_SCORE.limited }
  }
  return null
}

export function getRoleCompatibility({ sourceRoles = [], fallbackPosition = null, slotRole } = {}) {
  const target = normalizedSlotRole(slotRole)
  const explicitRoles = [...new Set(roleValues(sourceRoles))]
  if (explicitRoles.length) {
    const matches = explicitRoles
      .map((sourceRole) => ({ sourceRole, ...compatibilityForRole(sourceRole, target) }))
      .filter((match) => match.score)
      .sort((left, right) => right.score - left.score || left.sourceRole.localeCompare(right.sourceRole))
    return matches[0] || null
  }

  const fallback = normalizeRole(fallbackPosition)
  if (fallback && (FALLBACK_COMPATIBILITY[fallback] || []).includes(target)) {
    return {
      sourceRole: fallback,
      level: target === fallback ? 'exact' : 'limited',
      score: target === fallback ? 1 : 0.52,
      fallback: true,
    }
  }
  return null
}

function isUnavailable(player) {
  const status = clean(player?.status || player?.scoutProfile?.status)
  const chance = normalizeProbability(player?.chanceOfPlaying ?? player?.scoutProfile?.chanceOfPlaying)
  return UNAVAILABLE_STATUS.test(status) || chance === 0 || player?.available === false
}

function candidateFromPlayer(player) {
  const chance =
    normalizeProbability(
      player?.startProbability ??
      player?.startingProbability ??
      player?.basisplaatsKans,
    )

  const appearanceChance =
    normalizeProbability(
      player?.appearanceProbability ??
      player?.chanceOfPlaying ??
      player?.scoutProfile?.chanceOfPlaying,
    )

  const minutesValue =
    finiteNumber(
      player?.expectedMinutes ??
      player?.projectedExpectedMinutes ??
      player?.scoutProfile?.expectedMinutes,
    )

  const expectedMinutes =
    minutesValue === null
      ? null
      : Math.max(
          0,
          Math.min(
            90,
            minutesValue,
          ),
        )

  const hasExplicitStarterOverride = player?.expectedStarter === true || player?.expectedStarter === false || player?.scoutProfile?.expectedStarter === true || player?.scoutProfile?.expectedStarter === false
  const recentRoleEstimate = chance === null && !hasExplicitStarterOverride ? recentMatchRoleEstimate(player) : null
  const dataChance = recentRoleEstimate?.chance ?? null
  const dataExpectedMinutes = recentRoleEstimate?.expectedMinutes ?? null

  /*
  |--------------------------------------------------------------------------
  | Verwachte rol
  |--------------------------------------------------------------------------
  |
  | PLAYER_METADATA gebruikt zowel:
  |
  | - expectedStarter: technische boolean;
  | - expectedRole: Starter, Rotation, Backup of Youth.
  |
  | De tekstuele rol wordt als veilige aanvulling gebruikt. Daardoor wordt
  | een speler met expectedRole "Starter" niet als reservespeler behandeld
  | wanneer het losse booleanveld ontbreekt of niet correct is ingevuld.
  |
  */

  const expectedRole =
    clean(
      player?.expectedRole ??
      player?.scoutProfile?.expectedRole,
    )
      .toLowerCase()

  const roleSaysStarter =
    [
      'starter',
      'basis',
      'basisspeler',
      'starting',
      'starting xi',
    ].includes(
      expectedRole,
    )

  const roleSaysRotation =
    [
      'rotation',
      'rotatie',
      'rotatiespeler',
    ].includes(
      expectedRole,
    )

  const roleSaysBackup =
    [
      'backup',
      'reserve',
      'bank',
      'youth',
      'jeugd',
    ].includes(
      expectedRole,
    )

  const explicitExpectedStarter =
    player?.expectedStarter === true ||
    player?.scoutProfile?.expectedStarter === true

  const expectedStarter =
    explicitExpectedStarter ||
    roleSaysStarter

  const tacticalRoles =
    explicitTacticalRoles(
      player,
    )

  const positionFallback =
    tacticalRoles.length
      ? null
      : fallbackRole(
          player,
        )

  const unavailable =
    isUnavailable(
      player,
    )

  const availability =
    appearanceChance === null
      ? (
          unavailable
            ? 0
            : roleSaysStarter
              ? 0.8
              : roleSaysRotation
                ? 0.5
                : roleSaysBackup
                  ? 0.2
                  : 0.4
        )
      : appearanceChance / 100

  const minutesScore =
    expectedMinutes === null
      ? (
          roleSaysStarter
            ? 0.75
            : roleSaysRotation
              ? 0.4
              : roleSaysBackup
                ? 0.15
                : 0.3
        )
      : expectedMinutes / 90

  /*
   * Wanneer een echte basisplaatskans beschikbaar is, blijft die leidend.
   *
   * Anders:
   * Starter  = 1,00
   * Rotation = 0,45
   * Backup   = 0,15
   * Onbekend = bestaande veilige standaard 0,35
   */
  const starterScore =
    chance !== null
      ? chance / 100
      : dataChance !== null
        ? dataChance / 100
      : expectedStarter
        ? 1
        : roleSaysRotation
          ? 0.45
          : roleSaysBackup
            ? 0.15
            : 0.35

  const candidateScore =
    starterScore * 0.4 +
    minutesScore * 0.35 +
    availability * 0.25

     const estimatedChance =
    chance !== null
      ? chance
        : dataChance !== null
          ? dataChance
      : Math.max(
          5,
          Math.min(
            95,
            Math.round(
              candidateScore * 100,
            ),
          ),
        )

  const chanceSource =
    chance !== null
      ? 'explicit'
      : dataChance !== null
        ? 'recent-match-data'
      : 'model'

  const estimatedChanceLabel =
    estimatedChance >= 85
      ? 'Zeer waarschijnlijk'
      : estimatedChance >= 70
        ? 'Waarschijnlijk'
        : estimatedChance >= 50
          ? 'Twijfel'
          : estimatedChance >= 30
            ? 'Onzeker'
            : 'Onwaarschijnlijk' 

  return {
    id:
      clean(
        player?.id ||
        player?.playerId,
      ),

    name:
      clean(
        player?.name ||
        player?.playerName,
      ),

    club:
      clean(
        player?.club,
      ),

    position:
      clean(
        player?.fantasyPosition ||
        player?.position,
      ),

    roles:
      tacticalRoles.length
        ? tacticalRoles
        : positionFallback
          ? [positionFallback]
          : [],

    tacticalRoles,

    sourceRoles:
      tacticalRoles,

    positionFallback,

    chance,

estimatedChance,

chanceSource,

appearanceChance,

chanceLabel:
  estimatedChanceLabel,

    expectedMinutes: expectedMinutes ?? dataExpectedMinutes,

    expectedRole,

    expectedStarter,

    expectedPoints:
      finiteNumber(
        player?.expectedPointsPerRound ??
        player?.expectedPoints,
      ),

    price:
      finiteNumber(
        player?.endPrice ??
        player?.currentPrice ??
        player?.startPrice,
      ),

    status:
      clean(
        player?.status ||
        player?.scoutProfile?.status,
      ),

    unavailable,

    availabilityScore:
      availability,

    minutesScore,

    starterScore,

    baseScore:
      candidateScore,

    recentRoleEstimate,
  }
}

function compareCanonicalCandidates(left, right) {
  return right.baseScore - left.baseScore ||
    right.tacticalRoles.length - left.tacticalRoles.length ||
    clean(left.name).localeCompare(clean(right.name), 'nl') ||
    left.tacticalRoles.join(',').localeCompare(right.tacticalRoles.join(',')) ||
    clean(left.position).localeCompare(clean(right.position), 'nl')
}

function compareStartingCandidates(left, right) {
  return right.baseScore - left.baseScore ||
    right.starterScore - left.starterScore ||
    right.minutesScore - left.minutesScore ||
    right.availabilityScore - left.availabilityScore ||
    clean(left.name).localeCompare(clean(right.name), 'nl') ||
    clean(left.id).localeCompare(clean(right.id), 'nl')
}

function canPlayGoalkeeper(player) {
  return Boolean(getRoleCompatibility({
    sourceRoles: player.sourceRoles,
    fallbackPosition: player.positionFallback,
    slotRole: 'GK',
  }))
}

function selectStartingCandidates(players) {
  /*
  |--------------------------------------------------------------------------
  | Player-first basiself
  |--------------------------------------------------------------------------
  |
  | De selectie van de elf staat volledig los van formaties.
  |
  | 1. Kies de beschikbare keeper met de hoogste basisverwachting.
  | 2. Kies daarna de tien beschikbare veldspelers met de hoogste baseScore.
  | 3. Deze elf staan vervolgens vast.
  | 4. Formaties en veldcoördinaten mogen deze selectie niet meer wijzigen.
  |
  */

  const available =
    players.filter(
      (player) =>
        !player.unavailable,
    )

  const goalkeepers =
    available
      .filter(
        canPlayGoalkeeper,
      )
      .sort(
        compareStartingCandidates,
      )

  const outfield =
    available
      .filter(
        (player) =>
          !canPlayGoalkeeper(
            player,
          ),
      )
      .sort(
        compareStartingCandidates,
      )

  const selected = [
    goalkeepers[0],
    ...outfield.slice(
      0,
      10,
    ),
  ].filter(Boolean)

  const selectedIds =
    new Set(
      selected.map(
        (player) =>
          player.id,
      ),
    )

  return {
    selected:
      selected.map(
        (
          player,
          index,
        ) => ({
          ...player,

          selectionRank:
            index + 1,

          selectedForStartingXI:
            true,
        }),
      ),

    alternatives:
      available
        .filter(
          (player) =>
            !selectedIds.has(
              player.id,
            ),
        )
        .sort(
          compareStartingCandidates,
        )
        .map(
          (player) => ({
            ...player,

            selectedForStartingXI:
              false,
          }),
        ),
  }
}

function uniqueCandidatesById(players) {
  const candidatesById = new Map()
  for (const player of players) {
    const current = candidatesById.get(player.id)
    if (!current || compareCanonicalCandidates(player, current) < 0) {
      candidatesById.set(player.id, player)
    }
  }
  return [...candidatesById.values()]
}

function compareCandidates(left, right) {
  return right.compatibilityScore - left.compatibilityScore ||
    right.slotScore - left.slotScore ||
    right.baseScore - left.baseScore ||
    clean(left.name).localeCompare(clean(right.name), 'nl') ||
    clean(left.id).localeCompare(clean(right.id), 'nl')
}

function assignmentCandidate(player, role) {
  const compatibility = getRoleCompatibility({
    sourceRoles: player.sourceRoles,
    fallbackPosition: player.positionFallback,
    slotRole: role,
  })
  if (!compatibility || player.unavailable) return null
  const slotScore = compatibility.score * 0.7 +
    player.starterScore * 0.12 +
    player.minutesScore * 0.1 +
    player.availabilityScore * 0.08
  return {
    ...player,
    assignedRole: role,
    compatibilityLevel: compatibility.level,
    compatibilityScore: compatibility.score,
    compatibilitySourceRole: compatibility.sourceRole,
    compatibilityFallback: compatibility.fallback === true,
    fit: compatibility.score,
    slotScore,
  }
}

function assignmentKey(assignments) {
  return assignments.map((assignment) => assignment?.id || '~').join('|')
}

function betterAssignment(left, right) {
  if (!right) return true
  if (Math.abs(left.compatibilityTotal - right.compatibilityTotal) > 1e-9) {
    return left.compatibilityTotal > right.compatibilityTotal
  }
  if (Math.abs(left.qualityTotal - right.qualityTotal) > 1e-9) {
    return left.qualityTotal > right.qualityTotal
  }
  return assignmentKey(left.assignments).localeCompare(assignmentKey(right.assignments)) < 0
}

function bitCount(value) {
  let count = 0
  for (let mask = value; mask; mask >>>= 1) count += mask & 1
  return count
}

function globallyAssignPlayers(players, slotDefinitions) {
  let states = new Map([[0, {
    compatibilityTotal: 0,
    qualityTotal: 0,
    assignments: Array(slotDefinitions.length).fill(null),
  }]])

  const orderedPlayers = [...players]
    .sort((left, right) =>
      clean(left.id).localeCompare(clean(right.id)) || clean(left.name).localeCompare(clean(right.name), 'nl'))
    .map((player) => ({
      player,
      candidates: slotDefinitions.map(([role]) => assignmentCandidate(player, role)),
    }))

  for (const { candidates } of orderedPlayers) {
    const next = new Map(states)
    for (const [mask, state] of states) {
      for (let slotIndex = 0; slotIndex < slotDefinitions.length; slotIndex += 1) {
        if (mask & (1 << slotIndex)) continue
        const candidate = candidates[slotIndex]
        if (!candidate) continue
        const nextMask = mask | (1 << slotIndex)
        const assignments = [...state.assignments]
        assignments[slotIndex] = candidate
        const option = {
          compatibilityTotal: state.compatibilityTotal + candidate.compatibilityScore,
          qualityTotal: state.qualityTotal + candidate.slotScore,
          assignments,
        }
        if (betterAssignment(option, next.get(nextMask))) next.set(nextMask, option)
      }
    }
    states = next
  }

  let bestMask = 0
  let best = states.get(0)
  for (const [mask, state] of states) {
    const count = bitCount(mask)
    const bestCount = bitCount(bestMask)
    if (count > bestCount || (count === bestCount && betterAssignment(state, best))) {
      bestMask = mask
      best = state
    }
  }
  return { ...best, selectedCount: bitCount(bestMask) }
}

function fillFormation(players, formation) {
  const definitions = FORMATIONS[formation]
  const assignment = globallyAssignPlayers(players, definitions)
  const slots = definitions.map(([role, x, y], index) => {
    const candidates = players.map((player) => assignmentCandidate(player, role)).filter(Boolean).sort(compareCandidates)
    const primary = assignment.assignments[index]
    const rejectedCandidates = candidates
      .filter((candidate) => candidate.id !== primary?.id)
      .slice(0, 5)
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        sourceRoles: candidate.sourceRoles,
        compatibilityLevel: candidate.compatibilityLevel,
        compatibilityScore: candidate.compatibilityScore,
        assignmentScore: candidate.slotScore,
        reason: assignment.assignments.some((selected) => selected?.id === candidate.id)
          ? `Globaal toegewezen aan ${assignment.assignments.find((selected) => selected?.id === candidate.id)?.assignedRole}`
          : 'Lagere totale geldige formatiescore',
      }))
    return { role, x, y, index, primary, candidates, rejectedCandidates }
  })

  return {
    formation,
    slots,
    selectedCount: assignment.selectedCount,
    fitScore: assignment.qualityTotal,
    specialistScore: assignment.compatibilityTotal,
    complete: assignment.selectedCount === definitions.length,
  }
}

const DEFENSIVE_ROLES = new Set(['LB', 'LCB', 'CB', 'RCB', 'RB', 'LWB', 'RWB', 'WB'])
const MIDFIELD_ROLES = new Set(['LDM', 'DM', 'RDM', 'B2B', 'LCM', 'CM', 'RCM', 'AM', 'CAM', 'LM', 'RM'])
const ATTACKING_ROLES = new Set(['LW', 'RW', 'W', 'SS', 'CF', 'LST', 'ST', 'RST'])

function preferredDynamicRole(player) {
  return player.sourceRoles[0] || player.positionFallback || null
}

function roleLine(role) {
  if (role === 'GK') return 'goalkeeper'
  if (DEFENSIVE_ROLES.has(role)) return 'defence'
  if (MIDFIELD_ROLES.has(role)) return 'midfield'
  if (ATTACKING_ROLES.has(role)) return 'attack'
  return 'unknown'
}

function preferredHorizontalPosition(role) {
  if (/^(LB|LCB|LWB|LM|LCM|LDM|LW|LST)$/.test(role)) return 0
  if (/^(RB|RCB|RWB|RM|RCM|RDM|RW|RST)$/.test(role)) return 2
  return 1
}

function distributeDynamicLine(players, y) {
  const ordered = [...players].sort((left, right) =>
    preferredHorizontalPosition(left.dynamicRole) - preferredHorizontalPosition(right.dynamicRole) ||
    compareStartingCandidates(left.player, right.player))
  const count = ordered.length
  return ordered.map(({ player, dynamicRole }, index) => {
    const x = count === 1 ? 50 : 10 + (80 * index) / (count - 1)
    const compatibility = getRoleCompatibility({
      sourceRoles: player.sourceRoles,
      fallbackPosition: player.positionFallback,
      slotRole: dynamicRole,
    }) || { sourceRole: dynamicRole, level: 'exact', score: 1 }
    const primary = {
      ...player,
      assignedRole: dynamicRole,
      compatibilityLevel: compatibility.level,
      compatibilityScore: compatibility.score,
      compatibilitySourceRole: compatibility.sourceRole,
      compatibilityFallback: compatibility.fallback === true,
      fit: compatibility.score,
      slotScore: compatibility.score * 0.7 +
        player.starterScore * 0.12 +
        player.minutesScore * 0.1 +
        player.availabilityScore * 0.08,
    }
    return {
      role: dynamicRole,
      x,
      y,
      primary,
      candidates: [primary],
      rejectedCandidates: [],
    }
  })
}

function buildDynamicFormation(players) {
  const grouped = {
    goalkeeper: [],
    defence: [],
    midfield: [],
    attack: [],
    unknown: [],
  }
  players.forEach((player) => {
    const dynamicRole = preferredDynamicRole(player)
    grouped[roleLine(dynamicRole)].push({ player, dynamicRole })
  })
  const slots = [
    ...distributeDynamicLine(grouped.goalkeeper, 93),
    ...distributeDynamicLine(grouped.defence, 75),
    ...distributeDynamicLine(grouped.midfield, 50),
    ...distributeDynamicLine(grouped.attack, 22),
  ].map((slot, index) => ({ ...slot, index }))
  const formation = `${grouped.defence.length}-${grouped.midfield.length}-${grouped.attack.length}`
  return {
    formation,
    slots,
    selectedCount: slots.length,
    fitScore: slots.reduce((sum, slot) => sum + slot.primary.slotScore, 0),
    specialistScore: slots.reduce((sum, slot) => sum + slot.primary.compatibilityScore, 0),
    complete: slots.length === 11 && grouped.goalkeeper.length === 1 && grouped.unknown.length === 0,
    dynamic: true,
    unplacedPlayers: grouped.unknown.map(({ player }) => player),
  }
}

const RECOGNIZED_FORMATIONS = new Set([
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '4-2-4',
  '3-4-3',
  '3-5-2',
  '5-3-2',
  '5-4-1',
  '4-5-1',
  '3-2-4-1'
])

function averageY(slots) {
  if (!slots.length) return null
  return slots.reduce((sum, slot) => sum + Number(slot.y), 0) / slots.length
}

function classifyFormationLine(slot, context) {
  const role = slot.primary?.assignedRole || slot.role
  if (role === 'GK') return 'goalkeeper'
  if (['LCB', 'CB', 'RCB', 'LB', 'RB'].includes(role)) return 'defence'
  if (['LWB', 'RWB', 'WB'].includes(role)) {
    return context.centralDefenderY !== null && Number(slot.y) <= context.centralDefenderY - 10
      ? 'midfield'
      : 'defence'
  }
  if (['LW', 'RW', 'W'].includes(role)) {
    return context.strikerY !== null && Number(slot.y) >= context.strikerY + 12
      ? 'midfield'
      : 'attack'
  }
  if (ATTACKING_ROLES.has(role)) return 'attack'
  if (MIDFIELD_ROLES.has(role)) return 'midfield'
  return 'unknown'
}

function recognizeFormation(classifiedSlots) {
  const counts = { defence: 0, midfield: 0, attack: 0, unknown: 0 }
  classifiedSlots.forEach(({ line }) => {
    if (Object.hasOwn(counts, line)) counts[line] += 1
  })
  const rawFormation = `${counts.defence}-${counts.midfield}-${counts.attack}`
  if (rawFormation === '4-5-1') {
    const midfield = classifiedSlots.filter(({ line }) => line === 'midfield')
    const deepMidfielders = midfield.filter(({ slot }) =>
      ['DM', 'LDM', 'RDM'].includes(slot.primary?.assignedRole || slot.role) || Number(slot.y) >= 50)
    const advancedMidfielders = midfield.filter(({ slot }) => Number(slot.y) <= 42)
    if (deepMidfielders.length === 2 && advancedMidfielders.length === 3) {
      return { counts, rawFormation, derivedFormation: '4-2-3-1' }
    }
  }
  return {
    counts,
    rawFormation,
    derivedFormation: RECOGNIZED_FORMATIONS.has(rawFormation) ? rawFormation : null,
  }
}

export function deriveFormationPresentation(slots = [], { dynamic = false } = {}) {
  const centralDefenders = slots.filter((slot) =>
    ['LCB', 'CB', 'RCB'].includes(slot.primary?.assignedRole || slot.role))
  const strikers = slots.filter((slot) =>
    ['LST', 'ST', 'RST', 'CF', 'SS'].includes(slot.primary?.assignedRole || slot.role))
  const context = {
    centralDefenderY: averageY(centralDefenders),
    strikerY: averageY(strikers),
  }
  const classifiedSlots = slots.map((slot) => ({
    slot,
    line: classifyFormationLine(slot, context),
  }))
  const recognition = recognizeFormation(classifiedSlots)
  const outfield = classifiedSlots.filter(({ line }) => line !== 'goalkeeper')
  const explicitRoleCount = outfield.filter(({ slot }) => slot.primary?.sourceRoles?.length).length
  const roleCoverage = outfield.length ? explicitRoleCount / outfield.length : 0
  const complete = slots.length === 11 &&
    classifiedSlots.filter(({ line }) => line === 'goalkeeper').length === 1 &&
    recognition.counts.unknown === 0
  const recognized = Boolean(recognition.derivedFormation)
  const formationConfidence = complete && recognized && roleCoverage >= 0.75
    ? 'high'
    : complete && recognized && roleCoverage >= 0.45
      ? 'medium'
      : complete && !recognized && roleCoverage >= 0.75
        ? 'medium'
        : 'low'
  const visibleFormation = recognized && formationConfidence !== 'low'
    ? recognition.derivedFormation
    : null
  const formationLabel = visibleFormation
    ? visibleFormation
    : formationConfidence === 'medium' && dynamic
      ? 'Dynamische opstelling'
      : 'Formatie onzeker'
  const formationReason = visibleFormation
    ? `Veldlijnen passen bij ${visibleFormation}; ${Math.round(roleCoverage * 100)}% van de veldspelers heeft expliciete tactical roles.`
    : recognized
      ? `De veldlijnen lijken op ${recognition.derivedFormation}, maar slechts ${Math.round(roleCoverage * 100)}% van de veldspelers heeft expliciete tactical roles.`
      : `De veldlijnen vormen ${recognition.rawFormation}, waarvoor geen betrouwbaar standaardlabel is afgeleid.`
  return {
    formation: visibleFormation,
    formationLabel,
    formationConfidence,
    formationReason,
    rawLineCount: recognition.counts,
    derivedFormation: recognition.derivedFormation || recognition.rawFormation,
    roleCoverage,
  }
}

function compareFormations(left, right) {
  return right.selectedCount - left.selectedCount ||
    right.specialistScore - left.specialistScore ||
    right.fitScore - left.fitScore ||
    left.formation.localeCompare(right.formation)
}

function attachCompetition(result, allPlayers) {
  const starters = new Set(result.slots.map((slot) => slot.primary?.id).filter(Boolean))
  const shownCompetitors = new Set()
  const uncertainties = []

  const slots = result.slots.map((slot) => {
    if (!slot.primary) return { ...slot, competitor: null, additionalAlternatives: 0 }
    const alternatives = allPlayers
      .filter((player) => !starters.has(player.id) && !player.unavailable)
      .map((player) => assignmentCandidate(player, slot.role))
      .filter(Boolean)
      // Een concurrent moet voor dezelfde tactische plek passen;
      // alleen dezelfde brede linie is hiervoor niet specifiek genoeg.
      .filter((player) => player.compatibilityLevel !== 'limited')
      .sort(compareCandidates)

    const relevant = alternatives.filter((candidate) => {
      if (shownCompetitors.has(candidate.id)) return false
      if (candidate.chance !== null) return candidate.chance >= 10
      return candidate.slotScore >= slot.primary.slotScore * 0.72
    })
    const competitor = relevant[0] || null
    if (competitor) {
      shownCompetitors.add(competitor.id)
      uncertainties.push({ role: slot.role, primary: slot.primary, competitor })
    }
    return { ...slot, competitor, additionalAlternatives: Math.max(0, relevant.length - 1) }
  })

  return { ...result, slots, uncertainties }
}

function calculateCoverage(players, lineup) {
  const possibleInputs = players.length * 4
  const usedInputs = players.reduce((total, player) => total + [
    player.tacticalRoles.length > 0,
    player.expectedMinutes !== null,
    player.chance !== null || player.appearanceChance !== null,
    Boolean(player.status),
  ].filter(Boolean).length, 0)
  const ratio = possibleInputs ? usedInputs / possibleInputs : 0
  const percentage = Math.round(ratio * 100)
  const missingCriticalInputs = []
  if (!players.some((player) => player.sourceRoles.includes('GK') || player.positionFallback === 'GK')) missingCriticalInputs.push('keeperrol')
  if (players.filter((player) => player.tacticalRoles.length > 0).length < 7) missingCriticalInputs.push('tactische rollen')
  if (lineup.selectedCount < 11) missingCriticalInputs.push('volledige basiself')
  if (!players.some((player) => player.chance !== null)) missingCriticalInputs.push('numerieke basisplaatskansen')
  if (!players.some((player) => player.expectedMinutes !== null)) missingCriticalInputs.push('verwachte minuten')
  const level = percentage >= 75 && missingCriticalInputs.length === 0
    ? 'hoog'
    : percentage >= 45 && lineup.selectedCount >= 8
      ? 'redelijk'
      : 'beperkt'
  return { usedInputs, possibleInputs, ratio, percentage, level, missingCriticalInputs }
}

export function getLineupCoordinates({ formation, tacticalRole, slotIndex = 0 } = {}) {
  const slots = FORMATIONS[formation] || []
  const exact = slots.find(([role], index) => role === tacticalRole && index === slotIndex) ||
    slots.find(([role]) => role === tacticalRole)
  return exact ? { x: exact[1], y: exact[2] } : null
}

export function resolveExpectedClubLineup({ club, players = [] } = {}) {
  const normalizedClub = clean(club).toLocaleLowerCase('nl-NL')
  const candidates = uniqueCandidatesById(players
    .filter((player) => clean(player?.club).toLocaleLowerCase('nl-NL') === normalizedClub)
    .map(candidateFromPlayer)
    .filter((player) => player.id && player.name))

  if (!normalizedClub || !candidates.length) {
    return {
      valid: false,
      status: 'unavailable',
      club: clean(club),
      formation: null,
      starters: [],
      slots: [],
      uncertainties: [],
      warnings: ['Voor deze club is nog geen betrouwbare verwachte opstelling beschikbaar.'],
      coverage: calculateCoverage(candidates, { selectedCount: 0 }),
    }
  }

  const startingSelection = selectStartingCandidates(candidates)
  const selectedCandidates = startingSelection.selected

  if (
  normalizedClub === 'fc groningen' ||
  normalizedClub === 'sparta rotterdam'
) {
  console.table(
    candidates
      .map(
        (player) => ({
          id:
            player.id,

          name:
            player.name,

          roles:
            player.sourceRoles.join(', '),

          status:
            player.status,

          unavailable:
            player.unavailable,

          chance:
            player.chance,

          appearanceChance:
            player.appearanceChance,

          expectedMinutes:
            player.expectedMinutes,

          expectedStarter:
            player.expectedStarter,

          starterScore:
            Number(
              player.starterScore.toFixed(3),
            ),

          minutesScore:
            Number(
              player.minutesScore.toFixed(3),
            ),

          availabilityScore:
            Number(
              player.availabilityScore.toFixed(3),
            ),

          baseScore:
            Number(
              player.baseScore.toFixed(3),
            ),

          selected:
            selectedCandidates.some(
              (selected) =>
                selected.id === player.id,
            ),
        }),
      )
      .sort(
        (left, right) =>
          right.baseScore -
          left.baseScore,
      ),
  )
}

  const tacticalRoleCount = candidates.filter((player) => player.tacticalRoles.length > 0).length
  const evaluatedFormations = tacticalRoleCount >= 7
    ? Object.keys(FORMATIONS).map((formation) => fillFormation(selectedCandidates, formation)).sort(compareFormations)
    : [fillFormation(selectedCandidates, '4-3-3')]
  const bestTemplate = evaluatedFormations[0]
  const best = bestTemplate?.complete
    ? bestTemplate
    : buildDynamicFormation(selectedCandidates)
  const layoutTemplate = best.dynamic ? null : best.formation
  const formationPresentation = deriveFormationPresentation(best.slots, {
    dynamic: best.dynamic === true,
  })
  best.formation = formationPresentation.formation
  const formationSource = best.dynamic
    ? 'player-derived-dynamic'
    : tacticalRoleCount >= 7
      ? 'player-derived-template'
      : 'player-derived-neutral-template'
  const completed = attachCompetition(best, candidates)
  const coverage = calculateCoverage(candidates, completed)
  const status = completed.selectedCount === 11 && coverage.level !== 'beperkt'
    ? (completed.uncertainties.length <= 3 && coverage.level === 'hoog' && formationSource !== 'player-derived-neutral-template' ? 'expected' : 'provisional')
    : completed.selectedCount >= 8
      ? 'provisional'
      : 'unavailable'
  const warnings = []
  if (completed.selectedCount < 11) {
    const missing = 11 - completed.selectedCount
    warnings.push(`${missing} positie${missing === 1 ? '' : 's'} ${missing === 1 ? 'heeft' : 'hebben'} onvoldoende data.`)
  }
  if (coverage.missingCriticalInputs.includes('numerieke basisplaatskansen')) warnings.push('Exacte basisplaatskansen ontbreken; kwalitatieve zekerheid wordt getoond.')
  if (formationSource === 'player-derived-neutral-template') warnings.push('Tactische rollen ontbreken grotendeels; 4-3-3 wordt uitsluitend als neutrale veldindeling gebruikt.')
  if (formationSource === 'player-derived-dynamic') warnings.push('De gekozen basisspelers zijn in een dynamische, eventueel asymmetrische veldindeling geplaatst.')
  if (status === 'provisional') warnings.push('De formatieschatting of één of meer posities zijn onzeker.')

  return {
    valid: completed.selectedCount === 11,
    status,
    club: clean(club),
    formation: completed.formation,
    formationLabel: formationPresentation.formationLabel,
    formationConfidence: formationPresentation.formationConfidence,
    formationReason: formationPresentation.formationReason,
    rawLineCount: formationPresentation.rawLineCount,
    derivedFormation: formationPresentation.derivedFormation,
    layoutTemplate,
    formationSource,
    starters: completed.slots.map((slot) => slot.primary).filter(Boolean),
    slots: completed.slots,
    uncertainties: completed.uncertainties,
    selection: {
      method: 'player-first',
      selectedPlayerIds: selectedCandidates.map((player) => player.id),
      alternatives: startingSelection.alternatives,
    },
    warnings,
    coverage,
  }
}

export function getSupportedClubFormations() {
  return Object.keys(FORMATIONS)
}
