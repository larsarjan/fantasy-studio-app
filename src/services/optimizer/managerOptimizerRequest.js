/*
|--------------------------------------------------------------------------
| Fantasy Studio
| Manager → Optimizer Request
|--------------------------------------------------------------------------
|
| Dit bestand vertaalt de instellingen uit de FVT Manager
| naar een generieke aanvraag voor de Optimizer.
|
| De Optimizer weet daardoor niets van:
|
| - HTML
| - schermen
| - knoppen
| - dropdowns
| - de FVT Manager
|
| Hij ontvangt uitsluitend een gestandaardiseerde request.
|
*/

function isMissingValue(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  )
}

function normalizeNumber(value, fallback, { minimum = -Infinity, maximum = Infinity } = {}) {
  if (isMissingValue(value)) return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(minimum, Math.min(maximum, number))
}

function normalizeInteger(value, fallback, minimum, maximum) {
  return Math.floor(
    normalizeNumber(value, fallback, { minimum, maximum }),
  )
}

function normalizePriceMap(source) {
  const entries = source instanceof Map
    ? [...source.entries()]
    : source && typeof source === 'object'
      ? Object.entries(source)
      : []

  return Object.fromEntries(
    entries
      .map(([id, value]) => [String(id ?? '').trim(), value])
      .filter(([id, value]) => (
        id &&
        !isMissingValue(value) &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0
      ))
      .map(([id, value]) => [id, Number(value)]),
  )
}

function normalizeChipRequest(
  managerTeamState,
) {
  const source =
    managerTeamState
      ?.chipStrategy

  const mode =
    [
      'disabled',
      'manual',
      'automatic',
    ].includes(
      source?.mode,
    )
      ? source.mode
      : 'disabled'

  const allowedChips =
    Array.isArray(
      source?.allowedChips,
    )
      ? [
          ...source.allowedChips,
        ]
      : []

  const schedule =
    Array.isArray(
      source?.schedule,
    )
      ? source.schedule.map(
          (entry) => ({
            chipId:
              entry?.chipId,

            round:
              entry?.round,

            ...(
              entry?.periodId
                ? {
                    periodId:
                      entry.periodId,
                  }
                : {}
            ),

            ...(
              entry?.decision
                ? {
                    decision:
                      entry.decision,
                  }
                : {}
            ),
          }),
        )
      : []

  const usedRounds =
    source
      ?.state
      ?.usedRounds &&
    typeof source
      .state
      .usedRounds ===
      'object'
      ? structuredClone(
          source.state.usedRounds,
        )
      : {}

  const rawWildcardPlanning =
    source?.wildcardPlanning

  const wildcardMode =
    [
      'hold',
      'advisory',
      'forced',
    ].includes(
      rawWildcardPlanning?.mode,
    )
      ? rawWildcardPlanning.mode
      : 'advisory'

  const rawWildcardRound =
    Number(
      rawWildcardPlanning?.round,
    )

  const wildcardRound =
    wildcardMode === 'forced' &&
    Number.isInteger(
      rawWildcardRound,
    ) &&
    rawWildcardRound >= 1 &&
    rawWildcardRound <= 34
      ? rawWildcardRound
      : null

  return {
    mode,

    allowedChips,

    schedule,

    wildcardPlanning: {
      mode:
        wildcardMode,

      round:
        wildcardRound,
    },

    state: {
      usedRounds,
    },
  }
}

export function createManagerOptimizerRequest({
  managerSettings,
  managerTeamState,
} = {}) {
  const chipStrategy = normalizeChipRequest(managerTeamState)
  const teamMode =
    managerTeamState?.mode === 'current-team'
      ? 'current-team'
      : 'new-team'

  const requestedSeasonPhase = managerTeamState?.seasonStatus?.phase ??
    managerTeamState?.seasonPhase
  const seasonPhase =
    requestedSeasonPhase === 'preseason' ||
    requestedSeasonPhase === 'in-season'
      ? requestedSeasonPhase
      : teamMode === 'current-team'
        ? 'in-season'
        : 'preseason'

  const strategy = {
    ...(managerSettings?.strategy ?? managerSettings?.philosophy),
  }

  const hardRules = {
    ...(managerSettings?.hardRules ?? managerSettings?.rules),
  }

  return {
    seasonPhase,

    seasonStatus: {
      phase: seasonPhase,
      firstPlayableRound: 1,
    },

    period: {
      startRound:
        seasonPhase === 'preseason'
          ? 1
          : normalizeInteger(
              managerSettings?.planning?.startRound,
              1,
              1,
              34,
            ),

      roundCount:
        normalizeInteger(
          managerSettings?.planning?.roundCount,
          1,
          1,
          34,
        ),
    },

    strategy,

    hardRules,

    // Tijdelijke aliases voor bestaande consumers. De objecten hierboven
    // blijven de enige genormaliseerde bron binnen dit request.
    philosophy: strategy,

    rules: hardRules,

    team: {
      mode:
        teamMode,

      importResult:
        teamMode === 'current-team'
          ? managerTeamState?.importResult ?? null
          : null,

      bank:
        normalizeNumber(
          managerTeamState?.bank,
          0,
          { minimum: 0 },
        ),

      freeTransfers:
        normalizeInteger(
          managerTeamState?.freeTransfers,
          1,
          0,
          5,
        ),

      squad:
        null,

      purchasePrices:
        teamMode === 'current-team'
          ? normalizePriceMap(managerTeamState?.purchasePrices)
          : {},

      manualSellingPrices:
        teamMode === 'current-team'
          ? normalizePriceMap(managerTeamState?.manualSellingPrices)
          : {},

    },

    chips: chipStrategy,
  }
}
