import { supabase } from './client.js'
import { refreshAccess, hasPermission } from './access.js'

const tables = {
  players: 'players', historicalPlayers: 'historical_players', fixtures: 'fixtures', europeanFixtures: 'european_fixtures',
  teamRatings: 'team_ratings', results: 'results', playerMetadata: 'player_metadata', playerMatchStats: 'player_match_stats',
  elitePlayerStats: 'elite_player_stats', eliteTransfers: 'elite_transfers', eliteSyncControl: 'elite_sync_control', chipUsage: 'chip_usage',
  eliteFormations: 'elite_formations', eliteClubExposure: 'elite_club_exposure', transferDeadline: 'transfer_deadline', transferClubOverview: 'transfer_club_overview',
}

export async function loadReferenceData() {
  if (!supabase) return null
  const latest = await supabase.from('reference_imports').select('id,created_at,counts').eq('source', 'Google Sheets').order('created_at', { ascending: false }).limit(1)
  if (latest.error) throw latest.error
  if (!latest.data.length) return null
  const entries = await Promise.all(Object.entries(tables).map(async ([key, table]) => {
    const rows = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from(table).select('payload').eq('import_id',latest.data[0].id).order('id').range(offset, offset + 999)
      if (error) throw error
      rows.push(...data.map(row => row.payload))
      if (data.length < 1000) break
    }
    if (rows.length !== (latest.data[0].counts[table] ?? 0)) throw new Error('Reference import changed during loading')
    return [key, rows]
  }))
  return { database: Object.fromEntries(entries), syncStatus: { source: 'Studio Cloud', lastSync: latest.data[0].created_at, state: 'success', message: 'Gedeelde voetbaldata geladen' } }
}

export async function publishReferenceData(database) {
  if (!supabase) throw new Error('Studio Cloud is niet geconfigureerd; er is niets gepubliceerd.')
  const access = await refreshAccess()
  if (!hasPermission(access, 'data.correct') || !hasPermission(access, 'sync.run')) throw new Error('Publicatie geweigerd: data.correct en sync.run zijn vereist.')
  const datasets = Object.fromEntries(Object.entries(tables).map(([key, table]) => [table, database[key] ?? []]))
  const { data: id, error } = await supabase.rpc('publish_reference_data', { datasets })
  if (error) throw new Error(`Studio Cloud-publicatie mislukt [${error.code || 'RPC'}]: ${error.message}`)
  if (!id) throw new Error('Studio Cloud gaf geen import-ID terug; publicatie is niet bevestigd.')
  const result = await supabase.from('reference_imports').select('id,source,created_at,counts').eq('id', id).eq('source','Google Sheets').single()
  if (result.error) throw new Error(`Publicatiecontrole mislukt [${result.error.code || 'RPC'}]: ${result.error.message}`)
  const snapshot = result.data
  if (!snapshot?.created_at || Object.entries(datasets).some(([table, rows]) => snapshot.counts?.[table] !== rows.length)) throw new Error('Publicatiecontrole mislukt: de cloudsnapshot komt niet overeen met de import.')
  return snapshot
}
