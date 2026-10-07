import { supabase } from './client.js'
import { configureUserStorage, userStorage, flushUserStorage } from '../services/userStorage.js'

let userId
export let profile = null
export let preferences = {}
let team = null
let teamVersion = 0
let preferencesVersion = 0
let editorialVersion = 0

function check(result) { if (result.error) throw result.error; return result.data }

export async function initializeUser(session) {
  userId = session.user.id
  const results = await Promise.all([
    supabase.from('profiles').select('id,display_name,favorite_club,role,created_at,updated_at').eq('id', userId).single(),
    supabase.from('user_preferences').select('settings,version').eq('user_id', userId).maybeSingle(),
    supabase.from('fantasy_teams').select('*').eq('user_id', userId).eq('slug', 'primary').maybeSingle(),
    supabase.from('transfer_editorial').select('kind,key,payload').eq('user_id', userId),
    supabase.from('editorial_revisions').select('version').eq('user_id',userId).maybeSingle(),
  ])
  profile = check(results[0])
  preferences = check(results[1])?.settings ?? {}
  preferencesVersion = check(results[1])?.version ?? 0
  editorialVersion = check(results[4])?.version ?? 0
  team = check(results[2])
  teamVersion = team?.version ?? 0
  const editorial = { transfers: {}, clubs: {}, localTransfers: [] }
  for (const row of check(results[3])) {
    if (row.kind === 'transfer') editorial.transfers[row.key] = row.payload
    if (row.kind === 'club') editorial.clubs[row.key] = row.payload
    if (row.kind === 'local') editorial.localTransfers.push(row.payload)
  }
  configureUserStorage({ 'fantasy-studio-transfer-deadline-editorial-v1': JSON.stringify(editorial) }, async raw => {
    const data = JSON.parse(raw)
    const records = [
      ...Object.entries(data.transfers ?? {}).map(([key,payload]) => ({kind:'transfer',key,payload})),
      ...Object.entries(data.clubs ?? {}).map(([key,payload]) => ({kind:'club',key,payload})),
      ...(data.localTransfers ?? []).map(payload => ({kind:'local',key:String(payload.id),payload})),
    ]
    editorialVersion = check(await supabase.rpc('save_transfer_editorial', { records, expected_version: editorialVersion }))
  })
  document.body.classList.toggle('compact-view', preferences.compact === true)
  return { profile, preferences, team }
}

export async function savePreferences(settings) {
  const saved = check(await supabase.rpc('save_preferences', { new_settings:settings,expected_version:preferencesVersion }))
  preferencesVersion = saved.version
  preferences = structuredClone(settings)
}

export async function saveTeam(state, settings) {
  const saved = check(await supabase.rpc('save_fantasy_team', {
    team_slug: 'primary', team_name: 'Mijn selectie', team_state: state,
    manager_settings: settings, expected_version: teamVersion,
  }))
  team = saved
  teamVersion = saved.version
  return saved
}

export async function saveProfile({ displayName, favoriteClub }) {
  const saved = check(await supabase.from('profiles').update({ display_name: displayName.trim(), favorite_club: favoriteClub || null }).eq('id', userId).eq('updated_at', profile.updated_at).select('id,display_name,favorite_club,role,created_at,updated_at').maybeSingle())
  if (!saved) throw { code: 'P0001' }
  profile = saved
  window.dispatchEvent(new Event('studio:profile-saved'))
  return saved
}

export async function exportPrivateData() {
  const results = await Promise.all(['fantasy_teams', 'team_versions', 'user_preferences', 'transfer_editorial'].map(table => supabase.from(table).select('*').eq('user_id', userId)))
  results.forEach(check)
  return { format: 'fantasy-studio-export-v1', exportedAt: new Date().toISOString(), teams: results[0].data, versions: results[1].data, preferences: results[2].data, editorial: results[3].data }
}

export async function importLegacyEditorial() {
  const raw = localStorage.getItem('fantasy-studio-transfer-deadline-editorial-v1')
  if (!raw) return 0
  if (raw.length > 2_000_000) throw new Error('Import is te groot')
  const data = JSON.parse(raw)
  const rows = [
    ...Object.entries(data.transfers ?? {}).map(([key, payload]) => ({ kind: 'transfer', key, payload })),
    ...Object.entries(data.clubs ?? {}).map(([key, payload]) => ({ kind: 'club', key, payload })),
    ...(data.localTransfers ?? []).map(payload => ({ kind: 'local', key: String(payload.id), payload })),
  ]
  if (rows.length > 2000 || rows.some(row => !row.key || row.key.length > 200 || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload))) throw new Error('Ongeldige import')
  if (rows.length) {
    const existing=JSON.parse(userStorage.getItem('fantasy-studio-transfer-deadline-editorial-v1'))
    for(const row of rows) {
      if(row.kind==='local') { if(!existing.localTransfers.some(item=>String(item.id)===row.key)) existing.localTransfers.push(row.payload) }
      else { const target=row.kind==='club'?existing.clubs:existing.transfers; if(!Object.hasOwn(target,row.key)) Object.defineProperty(target,row.key,{value:row.payload,enumerable:true,writable:true,configurable:true}) }
    }
    userStorage.setItem('fantasy-studio-transfer-deadline-editorial-v1',JSON.stringify(existing))
    await flushUserStorage()
  }
  return rows.length
}
