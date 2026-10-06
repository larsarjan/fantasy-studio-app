import {
  normalizeFantasyPosition,
  validateSquad,
} from '../fantasyGameRulesEngine.js'

function isValidPrice(value) {
  return (
    value !== null &&
    value !== undefined &&
    !(typeof value === 'string' && value.trim() === '') &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
  )
}

function getPlayerId(player) {
  const id = player?.id ?? player?.playerId
  return id === null || id === undefined
    ? ''
    : String(id).trim()
}

function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase('nl-NL')
}

function readEntries(source) {
  if (source instanceof Map) return [...source.entries()]
  return source && typeof source === 'object'
    ? Object.entries(source)
    : []
}

function mergePriceMaps(imported, explicit, allowedIds = null) {
  const result = { ...imported }

  readEntries(explicit).forEach(([id, value]) => {
    const normalizedId = String(id ?? '').trim()
    if (normalizedId && (!allowedIds || allowedIds.has(normalizedId)) && isValidPrice(value)) {
      result[normalizedId] = Number(value)
    }
  })

  return Object.fromEntries(Object.entries(result).filter(([id]) => !allowedIds || allowedIds.has(id)))
}

function resolveImportedPlayer(record, playersById, players) {
  const embeddedPlayer = record?.player ?? null
  const explicitId =
    record?.playerId ??
    record?.id ??
    embeddedPlayer?.id ??
    embeddedPlayer?.playerId
  const normalizedId = String(explicitId ?? '').trim()

  if (normalizedId) {
    return playersById.get(normalizedId) ?? null
  }

  const name = normalizeText(
    record?.importedName ?? embeddedPlayer?.name ?? record?.name,
  )
  const club = normalizeText(
    record?.importedClub ?? embeddedPlayer?.club ?? record?.club,
  )
  const position = normalizeFantasyPosition(
    record?.importedPosition ??
      embeddedPlayer?.fantasyPosition ??
      embeddedPlayer?.position ??
      record?.fantasyPosition ??
      record?.position,
  )

  if (!name || !club || !position) return null

  const matches = players.filter((player) => (
    normalizeText(player?.name) === name &&
    normalizeText(player?.club) === club &&
    normalizeFantasyPosition(
      player?.fantasyPosition ?? player?.position,
    ) === position
  ))

  return matches.length === 1 ? matches[0] : null
}

export function resolveManagerCurrentTeam({
  importResult,
  players = [],
  bank = 0,
  purchasePrices = {},
  manualSellingPrices = {},
  maximumPlayersPerClub = 3,
} = {}) {
  const records = Array.isArray(importResult?.players)
    ? importResult.players
    : []
  const sourcePlayers = Array.isArray(players)
    ? players.filter(Boolean)
    : []
  const errors = []
  const warnings = [...(importResult?.warnings ?? [])]

  if (records.length !== 15) {
    errors.push(
      `De geïmporteerde selectie moet precies 15 spelers bevatten; gevonden: ${records.length}.`,
    )
  }

  const playersById = new Map(
    sourcePlayers
      .map((player) => [getPlayerId(player), player])
      .filter(([id]) => id),
  )
  const resolvedSquad = []
  const importedPurchasePrices = {}
  const importedSellingPrices = {}

  records.forEach((record, index) => {
    const player = resolveImportedPlayer(record, playersById, sourcePlayers)

    if (!player) {
      const label =
        record?.importedName ?? record?.player?.name ?? record?.name ??
        `record ${index + 1}`
      errors.push(
        `Geïmporteerde speler “${label}” kon niet eenduidig in de actuele database worden gevonden.`,
      )
      return
    }

    const id = getPlayerId(player)
    resolvedSquad.push(
      isValidPrice(record?.currentPrice)
        ? { ...player, currentPrice: Number(record.currentPrice) }
        : player,
    )

    if (isValidPrice(record?.purchasePrice)) {
      importedPurchasePrices[id] = Number(record.purchasePrice)
    }

    if (isValidPrice(record?.sellingPrice)) {
      importedSellingPrices[id] = Number(record.sellingPrice)
    }
  })

  const ids = resolvedSquad.map(getPlayerId)
  const duplicateIds = [...new Set(
    ids.filter((id, index) => id && ids.indexOf(id) !== index),
  )]

  if (duplicateIds.length) {
    errors.push(
      `De geïmporteerde selectie bevat dubbele speler-ID's: ${duplicateIds.join(', ')}.`,
    )
  }

  const squadValidation = validateSquad(resolvedSquad, {
    unlimitedBudget: true,
  })
  errors.push(...squadValidation.errors)
  warnings.push(...squadValidation.warnings)

  const clubLimit = Math.max(
    1,
    Math.min(3, Math.floor(Number(maximumPlayersPerClub) || 3)),
  )
  Object.entries(squadValidation.clubCounts ?? {}).forEach(([club, count]) => {
    if (count > clubLimit && clubLimit < 3) {
      errors.push(
        `Er zijn ${count} spelers van ${club} geïmporteerd; volgens de ingestelde limiet zijn maximaal ${clubLimit} toegestaan.`,
      )
    }
  })

  const normalizedBank = Number(bank)
  if (!Number.isFinite(normalizedBank) || normalizedBank < 0) {
    errors.push('Het ingevoerde bankbedrag is ongeldig.')
  }

  const resolvedPurchasePrices = mergePriceMaps(
    importedPurchasePrices,
    purchasePrices,
    new Set(ids),
  )
  const resolvedSellingPrices = mergePriceMaps(
    importedSellingPrices,
    manualSellingPrices,
    new Set(ids),
  )

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    squad: errors.length === 0 ? resolvedSquad : [],
    bank: Number.isFinite(normalizedBank) ? normalizedBank : 0,
    purchasePrices: resolvedPurchasePrices,
    manualSellingPrices: resolvedSellingPrices,
    lineupMetadata: importResult?.lineupMetadata ?? null,
    validation: squadValidation,
  }
}

export default resolveManagerCurrentTeam
