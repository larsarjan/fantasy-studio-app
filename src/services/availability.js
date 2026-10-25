import { resolvePlayerPhoto } from './playerPhotos.js'
let records = new Map(), version = 0, ready = true
export const availabilityKey = p => `${String(p.season || '').replace('-', '/')}|${String(p.player_id ?? p.id ?? p.playerId ?? '')}`
export function setAvailabilityRecords(rows = []) { records = new Map(rows.map(r => [availabilityKey(r), r])); ready = true; version++ }
export function setAvailabilityUnavailable() { ready = false; version++ }
export const availabilityReady = () => ready
export const availabilityVersion = () => version
export const availabilityRecords = () => [...records.values()]
export function playerAvailability(player, { namespace = 'studio' } = {}) {
  if (namespace === 'espn') {
    const photo = resolvePlayerPhoto(player, { namespace })
    if (!photo.mapped) return null
    const [, season, id] = photo.key.split(':')
    return records.get(availabilityKey({season,id})) || null
  }
  return records.get(availabilityKey(player)) || player?.availabilityStatus || null
}
export const statusLabels = { available:'Beschikbaar', injury:'Blessure', suspension:'Geschorst', doubt:'Twijfelgeval', unavailable:'Afwezig', unknown:'Onbekend' }
export function availabilityPolicy(player, now = new Date()) {
  const status = playerAvailability(player), pct = status ? status.availability_percentage ?? null : 100
  const unknown = Boolean(status && (status.status_type === 'unknown' || pct === null))
  const suspended = status?.status_type === 'suspension', out = pct === 0
  const recent = status?.returned_date && pct === 100 && status.status_type === 'available' && (now - new Date(status.returned_date)) / 86400000 >= 0 && (now - new Date(status.returned_date)) / 86400000 <= 7
  const factor = suspended || out ? 0 : pct === 25 ? .1 : pct === 50 ? .4 : pct === 75 ? .85 : 1
  const rawReturnDays = status?.expected_return_date ? Math.ceil((new Date(status.expected_return_date) - now) / 86400000) : null
  const returnDays = rawReturnDays !== null && Number.isFinite(rawReturnDays) && rawReturnDays >= 0 ? rawReturnDays : null
  const stale = Boolean(status?.source_mode === 'automatic' && status.observed_at && now-new Date(status.observed_at)>48*3600000)
  const reason = unknown ? 'Inzetbaarheid onbekend; geen bevestiging dat de speler fit is.' : status && (suspended || pct < 100) ? `${statusLabels[status.status_type]} (${out?'OUT':pct+'%'}). ${status.reason || 'Reden nog niet ingevuld.'}${status.expected_return_date ? ' Verwacht terug: '+status.expected_return_date+'.' : ' Terugkeer onbekend.'}` : recent ? 'Recent teruggekeerd; controleer de minutenopbouw.' : ''
  return { status, pct, unknown, stale, suspended, out, recent, factor, returnDays, captainEligible: ready && !suspended && (pct === null || pct > 25), buyEligible: ready && !suspended && !out && pct !== 25, reason: reason+(stale?' Bronstatus is langer dan 48 uur niet opnieuw waargenomen.':''),
    sellPenalty: suspended || (!unknown && pct < 100) ? (returnDays !== null && returnDays <= 7 ? .5 : returnDays !== null && returnDays > 21 ? 5 : 2) * (1-factor) : 0 }
}
// A risk discount is not, by itself, an instruction to sell an owned player.
// Callers supply independent football/transfer context, never the discounted gain.
export function availabilitySaleDecision(player, {hasIndependentReason = false} = {}) {
  const policy = availabilityPolicy(player)
  const affected = policy.suspended || (!policy.unknown && policy.pct < 100)
  const standaloneSell = affected && (policy.out || policy.suspended) && policy.returnDays !== null && policy.returnDays > 21
  return {affected, standaloneSell, sellAllowed: !affected || standaloneSell || hasIndependentReason || player.cautionScore>=72 || player.fixtureCount===0}
}
export function availabilityAdjustedPoints(player) {
  const p = availabilityPolicy(player)
  // A known short absence should not turn a multi-round hold into an automatic sale.
  const factor = p.returnDays !== null && p.returnDays >= 0 && p.returnDays <= 7 ? Math.max(.8,p.factor) : p.factor
  return Number(player.expectedPoints || 0) * factor
}
export function availabilityRound(status, fixtures = [], player = {}) {
  if (!status?.expected_return_date) return ''
  const fixture = fixtures.filter(f => String(f.season) === String(player.season) && [f.homeTeam,f.awayTeam,f.home,f.away,f.homeClub,f.awayClub].includes(player.club) && String(f.date || f.kickoff || '').slice(0,10) >= status.expected_return_date).sort((a,b)=>String(a.date||a.kickoff).localeCompare(String(b.date||b.kickoff)))[0]
  return fixture?.round ? ` · vanaf SR${fixture.round}` : ''
}
export function daysAbsent(status, now = new Date()) {
  if (!status?.start_date) return null
  return Math.max(0, Math.floor(((status.returned_date ? new Date(status.returned_date) : now) - new Date(status.start_date)) / 86400000))
}

// Connectors run on a trusted server. The receiver stores a proposal, never a direct write.
export async function collectAvailabilitySource(source, receiver) {
  const results = []
  for (const item of await source.fetch()) {
    const normalized = await source.normalize(item)
    if (!normalized?.player_id || !normalized?.season || !normalized?.external_id) throw new Error('Expliciete Studio speler-ID, seizoen en bronupdate-ID vereist')
    results.push(await receiver.proposeUpdate(source.key, normalized.external_id, normalized))
  }
  return results
}
