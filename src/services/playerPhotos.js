import manifest from '../data/playerPhotos.generated.json' with { type: 'json' }
import { photoKey, photoSeason } from './playerPhotoIdentity.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
let records = new Map()
export function setPlayerPhotoRecords(rows = []) { records = new Map(rows.map(row => [row.player_key, row])) }

export function safePhotoUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null
  if (/^\/player-photos\/[a-zA-Z0-9-]+\.webp$/.test(value)) return value
  try {
    const u = new URL(value)
    // No proxy, credentials, private hosts, SVG/data URLs or runtime guessed endpoints.
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname.includes('.') || /(^|\.)(localhost|local|internal)$/.test(u.hostname) || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || /\.svg$/i.test(u.pathname)) return null
    return u.href
  } catch { return null }
}

export function resolvePlayerPhoto(player = {}, { namespace = 'studio', season = player.season, size = 40 } = {}) {
  const id = namespace === 'espn' ? player.player_id ?? player.element_id ?? player.id : player.id ?? player.playerId
  // Studio IDs are season-coded; only this known local catalogue may infer its season.
  const resolvedSeason = photoSeason(season) || (namespace === 'studio' && /^2026\d{4}$/.test(String(id)) ? '2026/2027' : '')
  const originalKey = photoKey(namespace, resolvedSeason, id)
  const key = namespace === 'espn' ? manifest.aliases[originalKey] ?? originalKey : originalKey
  const row = records.get(key), local = manifest.local[key], detail = size > 64
  const candidates = []
  const add = (url, source) => { const safe = safePhotoUrl(url); if (safe && !candidates.some(c => c.url === safe)) candidates.push({ url: safe, source }) }
  if (row?.source_enabled && row?.source_status === 'approved') add(detail ? row.source_url : row.source_thumbnail_url || row.source_url, row.source_name || 'central')
  if (row?.override_enabled !== false) add(detail ? row?.override_url : row?.override_thumbnail_url || row?.override_url, 'override')
  add(detail ? local?.detail : local?.thumbnail, 'local')
  const name = String(player.name ?? player.player_name ?? player.web_name ?? '').trim()
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toLocaleUpperCase('nl-NL') || '?'
  return { key, originalKey, candidates, initials, name, mapped: namespace === 'studio' || Boolean(manifest.aliases[originalKey]) }
}

export function renderPlayerAvatar(player, options = {}) {
  const size = Math.max(24, Math.min(240, Number(options.size) || 40)), p = resolvePlayerPhoto(player, { ...options, size })
  return `<span class="fvt-player-photo ${escape(options.className || '')}" data-player-photo="${escape(p.originalKey)}" data-photo-size="${size}" data-initials="${escape(p.initials)}" role="img" aria-label="${escape(p.name || 'Speler')}" style="--player-photo-size:${size}px"></span>`
}

export function candidatesForKey(key, size) {
  const [namespace, season, id] = key.split(':')
  return resolvePlayerPhoto({ id, season }, { namespace, size }).candidates
}
export const playerPhotoCoverage = manifest.stats
