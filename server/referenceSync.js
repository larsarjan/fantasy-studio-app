import { createHash } from 'node:crypto'
import { fetchSheet, hasPublishedSheet } from '../src/services/googleSheets.js'
import { synchronizeDatabase } from '../src/services/database.js'
import { TRANSFER_DEADLINE_ENABLED } from '../src/constants/featureFlags.js'

import { referenceTables } from '../src/services/referenceSchema.js'
export { referenceTables } from '../src/services/referenceSchema.js'
export const referenceSheets = ['SPELERS','SPELERS_HISTORIE','WEDSTRIJDEN','TEAM_RATINGS','RESULTS','PLAYER_METADATA','PLAYER_MATCH_STATS','ELITE_PLAYER_STATS','ELITE_TRANSFERS','ELITE_SYNC_CONTROLE','CHIP_GEBRUIK','ELITE_FORMATIONS','ELITE_CLUB_EXPOSURE','EUROPE_2026_27', ...(hasPublishedSheet('KNVB_FIXTURES')?['KNVB_FIXTURES']:[]), ...(TRANSFER_DEADLINE_ENABLED ? ['TRANSFERS_2026_27','TRANSFER_CLUB_OVERVIEW'] : [])]

export function validateReferenceCounts(datasets, previous = {}) {
  for (const table of Object.values(referenceTables)) {
    const rows = datasets[table]
    if (!Array.isArray(rows)) throw Error(`Dataset ${table} ontbreekt; niets gepubliceerd.`)
    if (['players','fixtures','results','team_ratings'].includes(table) && !rows.length) throw Error(`Dataset ${table} is leeg; niets gepubliceerd.`)
    if (previous[table] > 0 && (rows.length === 0 || rows.length < previous[table] * 0.8)) throw Error(`Dataset ${table} is verdacht gekrompen (${previous[table]} → ${rows.length}); niets gepubliceerd.`)
  }
}

export const hashSheets = sheets => createHash('sha256').update('reference-model-v1\n').update(JSON.stringify(sheets)).digest('hex')

// The database model uses module state. Also serialize inside a warm server
// process; the database lease is the authoritative cross-instance lock.
let processing = false
export async function prepareReferenceSheets(sheets, retainedData = {}) {
  if (processing) throw Error('Er wordt al een bronimport verwerkt.')
  processing = true
  try { return await synchronizeDatabase({ sheets, retainedData, prepareOnly: true }) }
  finally { processing = false }
}

export async function collectReferenceSheets(fetchSource = fetchSheet) {
  // Stable property order makes the fingerprint independent of fetch timing.
  const entries = await Promise.all(referenceSheets.map(async name => {
    const rows = await fetchSource(name)
    if (!Array.isArray(rows)) throw Error(`Tabblad ${name} ontbreekt.`)
    return [name, rows]
  }))
  return Object.fromEntries(entries)
}
