import { normalizeFantasyPosition, validateSquad } from '../fantasyGameRulesEngine.js'

function id(player) {
  return String(player?.id ?? player?.playerId ?? '').trim()
}

export function normalizeScreenshotPrice(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const normalized = String(value).trim().replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN
}

function validOptionalPrice(value) {
  const price = normalizeScreenshotPrice(value)
  return price === null || Number.isFinite(price)
}

function currentPrice(player) {
  for (const value of [player?.currentPrice, player?.endPrice, player?.price, player?.startPrice]) {
    if (value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) {
      return Number(value)
    }
  }
  return null
}

export function validateScreenshotDraft({ slots = [] } = {}) {
  const errors = []
  const players = slots.map((slot) => slot?.matchedPlayer).filter(Boolean)
  const ids = players.map(id).filter(Boolean)
  if (slots.length !== 15 || players.length !== 15) errors.push('Kies exact 15 spelers.')
  if (players.length !== ids.length) errors.push('Iedere gekozen speler moet een geldige ID uit de actuele database hebben.')
  if (new Set(ids).size !== ids.length) errors.push('Dezelfde speler kan niet tweemaal worden gekozen.')
  slots.forEach((slot) => {
    const label = slot?.matchedPlayer?.name ?? `plek ${slot?.slot ?? '?'}`
    if (!validOptionalPrice(slot?.currentPrice)) errors.push(`Vul een geldige HP in voor ${label}.`)
    if (!validOptionalPrice(slot?.sellingPrice)) errors.push(`Vul een geldige VP in voor ${label}.`)
    if (!validOptionalPrice(slot?.purchasePrice)) errors.push(`Vul een geldige AP in voor ${label}.`)
  })

  if (players.length > 0) {
    const validation = validateSquad(players, { unlimitedBudget: true })
    errors.push(...validation.errors)
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

export function createScreenshotImportResult({ slots, warnings = [] } = {}) {
  const validation = validateScreenshotDraft({ slots })
  const players = slots.map((slot) => {
    const player = slot.matchedPlayer
    const fallbackPrice = currentPrice(player)
    return {
      importSource: 'screenshot', status: player ? 'matched' : 'unmatched', player,
      importedName: player?.name ?? slot.rawName ?? '', importedClub: player?.club ?? '',
      importedPosition: normalizeFantasyPosition(player?.fantasyPosition ?? player?.position),
      currentPrice: normalizeScreenshotPrice(slot.currentPrice) ?? fallbackPrice,
      sellingPrice: normalizeScreenshotPrice(slot.sellingPrice),
      purchasePrice: normalizeScreenshotPrice(slot.purchasePrice),
      priceSources: {
        current: String(slot.currentPrice ?? '').trim() === '' ? 'database' : slot.priceSources?.current ?? 'manual',
        selling: String(slot.sellingPrice ?? '').trim() === '' ? 'empty' : slot.priceSources?.selling ?? 'manual',
        purchase: String(slot.purchasePrice ?? '').trim() === '' ? 'empty' : slot.priceSources?.purchase ?? 'manual',
      },
    }
  })
  const counts = { goalkeeper: 0, defender: 0, midfielder: 0, forward: 0 }
  players.forEach((record) => {
    if (counts[record.importedPosition] !== undefined) counts[record.importedPosition] += 1
  })
  return {
    valid: validation.valid,
    errors: validation.errors,
    warnings,
    source: 'screenshot',
    sourceType: 'screenshot',
    players,
    matchedPlayers: players.filter((record) => record.status === 'matched'),
    positionCounts: counts,
    purchasePrices: Object.fromEntries(players.filter((record) => record.player && record.purchasePrice !== null).map((record) => [id(record.player), record.purchasePrice])),
    manualSellingPrices: Object.fromEntries(players.filter((record) => record.player && record.sellingPrice !== null).map((record) => [id(record.player), record.sellingPrice])),
    lineupMetadata: null,
  }
}
