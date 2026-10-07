import { FANTASY_GAME_RULES, normalizeFantasyPosition, validateSquad, validateStartingLineup, getEffectiveSellingPrice } from './fantasyGameRulesEngine.js'
import { createScreenshotImportResult } from './optimizer/screenshotTeamImport.js'

export const playerId = p => String(p?.id ?? p?.playerId ?? '')
export const playerPrice = p => {
  const raw = [p?.currentPrice, p?.endPrice, p?.price, p?.startPrice].find(v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)))
  return raw === undefined ? null : Number(raw)
}
export function selectionPlayers(state, database) {
  const byId = new Map(database.map(p => [playerId(p), p]))
  const records = state?.importResult?.players ?? []
  return records.map(r => byId.get(playerId(r.player ?? r))).filter(Boolean)
}
export function selectionLineup(state, players) {
  const ids = new Set(players.map(playerId))
  const raw = state?.importResult?.lineupMetadata ?? {}
  const starters = [...new Set(raw.starters ?? [])].map(String).filter(id => ids.has(id))
  return { starters, captainId: ids.has(String(raw.captainId)) ? String(raw.captainId) : '', viceCaptainId: ids.has(String(raw.viceCaptainId)) ? String(raw.viceCaptainId) : '' }
}
export function validateSelection(state, database) {
  const players = selectionPlayers(state, database), lineup = selectionLineup(state, players)
  const errors = [...validateSquad(players, { unlimitedBudget: true }).errors, ...validateStartingLineup(players.filter(p => lineup.starters.includes(playerId(p)))).errors]
  if ((state?.importResult?.players?.length ?? 0) !== players.length) errors.push('Een opgeslagen speler staat niet meer in de actuele database. Vervang deze speler.')
  if (new Set(players.map(playerId)).size !== players.length) errors.push('Een speler staat dubbel in je selectie.')
  if (!lineup.starters.includes(lineup.captainId)) errors.push('Kies een captain uit de basis.')
  if (!lineup.starters.includes(lineup.viceCaptainId)) errors.push('Kies een vice-captain uit de basis.')
  if (lineup.captainId && lineup.captainId === lineup.viceCaptainId) errors.push('Captain en vice-captain moeten verschillen.')
  return { valid: !errors.length, errors: [...new Set(errors)], players, lineup }
}
export function updateSelection(state, players, lineup = selectionLineup(state, players)) {
  const previous = new Map((state.importResult?.players ?? []).map(r => [playerId(r.player ?? r), r]))
  const result = createScreenshotImportResult({ slots: players.map(p => ({ matchedPlayer: p, currentPrice: playerPrice(p), purchasePrice: state.purchasePrices?.[playerId(p)] ?? previous.get(playerId(p))?.purchasePrice, sellingPrice: state.manualSellingPrices?.[playerId(p)] ?? previous.get(playerId(p))?.sellingPrice })) })
  result.source = result.sourceType = 'manual'
  result.players.forEach(r => { r.importSource = 'manual' })
  result.lineupMetadata = lineup
  const ownedIds=new Set(players.map(playerId))
  return { ...state, mode: 'current-team', importResult: result, plannedTransfers:(state.plannedTransfers??[]).filter(t=>ownedIds.has(String(t.outId))&&!ownedIds.has(String(t.inId))) }
}
export function canAddPlayer(players, player) {
  if (players.length >= FANTASY_GAME_RULES.squad.totalPlayers) return 'Je selectie bevat al 15 spelers. Verwijder eerst een speler.'
  if (players.some(p => playerId(p) === playerId(player))) return 'Deze speler staat al in je selectie.'
  const position = normalizeFantasyPosition(player.fantasyPosition ?? player.position)
  if (!FANTASY_GAME_RULES.squad.positions[position]) return 'Onbekende fantasypositie.'
  if (players.filter(p => normalizeFantasyPosition(p.fantasyPosition ?? p.position) === position).length >= FANTASY_GAME_RULES.squad.positions[position]) return 'Alle selectieplekken voor deze positie zijn bezet.'
  if (players.filter(p => p.club === player.club).length >= FANTASY_GAME_RULES.squad.maxPlayersPerClub) return 'Maximaal drie spelers per club.'
  return ''
}
export function personalAdvice({ state, players, candidates, horizonCandidates = candidates }) {
  const owned = selectionPlayers(state, players), ids = new Set(owned.map(playerId))
  const own = candidates.filter(p => ids.has(playerId(p)))
  const captains = own.filter(p => p.fixtureCount > 0 && p.expectedMinutes / p.fixtureCount >= 45).sort((a,b) => b.radarScore - a.radarScore)
  const horizon = new Map(horizonCandidates.map(p => [playerId(p), p]))
  const sales = own.slice().sort((a,b) => (horizon.get(playerId(a))?.expectedPoints ?? a.expectedPoints) - (horizon.get(playerId(b))?.expectedPoints ?? b.expectedPoints))
  const bankKnown = state.bankKnown === true
  const transfers = []
  const reserved = new Set((state.plannedTransfers ?? []).map(t => String(t.inId)))
  const plannedOut = new Set((state.plannedTransfers ?? []).map(t => String(t.outId)))
  const plannedIn = players.filter(p => reserved.has(playerId(p)))
  const virtualOwned = [...owned.filter(p=>!plannedOut.has(playerId(p))), ...plannedIn]
  const salePrice = out => {
    const raw=(state.importResult?.players??[]).find(r=>playerId(r.player)===playerId(out))
    return getEffectiveSellingPrice({manualSellingPrice:state.manualSellingPrices?.[playerId(out)]??raw?.sellingPrice,purchasePrice:state.purchasePrices?.[playerId(out)]??raw?.purchasePrice,currentPrice:playerPrice(out)})
  }
  const reservedCost = (state.plannedTransfers??[]).reduce((sum,t)=>{
    const out=owned.find(p=>playerId(p)===String(t.outId)),incoming=players.find(p=>playerId(p)===String(t.inId))
    return sum+(out&&incoming?(playerPrice(incoming)??0)-(salePrice(out)??0):0)
  },0)
  for (const out of sales) {
    if(plannedOut.has(playerId(out)))continue
    const raw = (state.importResult?.players ?? []).find(r => playerId(r.player) === playerId(out))
    const sale = getEffectiveSellingPrice({ manualSellingPrice: state.manualSellingPrices?.[playerId(out)] ?? raw?.sellingPrice, purchasePrice: state.purchasePrices?.[playerId(out)] ?? raw?.purchasePrice, currentPrice: playerPrice(out) })
    for (const incoming of horizonCandidates) {
      const price = playerPrice(incoming)
      if (ids.has(playerId(incoming)) || reserved.has(playerId(incoming)) || normalizeFantasyPosition(incoming.fantasyPosition ?? incoming.position) !== normalizeFantasyPosition(out.fantasyPosition ?? out.position)) continue
      if (virtualOwned.filter(p => playerId(p) !== playerId(out) && p.club === incoming.club).length >= FANTASY_GAME_RULES.squad.maxPlayersPerClub) continue
      if (price === null || sale === null || (bankKnown && price > sale + Number(state.bank) - reservedCost + .0001)) continue
      const pointsCost = (state.plannedTransfers?.length ?? 0) >= Number(state.freeTransfers ?? 1) ? FANTASY_GAME_RULES.transfers.pointsCostPerExtraTransfer : 0
      const grossGain = incoming.expectedPoints - (horizon.get(playerId(out))?.expectedPoints ?? out.expectedPoints)
      const gain = grossGain - pointsCost
      if (gain > 0 && incoming.expectedMinutes > 0) transfers.push({ out, incoming, gain, grossGain, pointsCost, sale, cost: price - sale, budgetConfirmed: bankKnown, priceEstimated: raw?.sellingPrice == null && state.manualSellingPrices?.[playerId(out)] == null && state.purchasePrices?.[playerId(out)] == null && raw?.purchasePrice == null })
    }
  }
  transfers.sort((a,b) => b.gain - a.gain || a.cost - b.cost)
  return { owned, captains, sales, transfers, risk: own.slice().sort((a,b) => a.expectedMinutes - b.expectedMinutes)[0] ?? null }
}
