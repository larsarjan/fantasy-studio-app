import { supabase } from './client.js'

export let access = { roles: [], permissions: [] }
export const hasPermission = (user, permission) => user?.permissions?.includes(permission) === true
export async function refreshAccess() {
  if (!supabase) return access = { roles: [], permissions: [] }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return access = { roles: [], permissions: [] }
  const { data, error } = await supabase.rpc('current_access')
  if (error) throw error
  return access = data
}
export const FEATURE_ROUTES = {
  prices: 'price_predictor', captain: 'captain_radar', differentials: 'differentials', dreamteam: 'dream_team',
  ranglijsten: 'rankings', prominenten: 'rankings', community: 'community', nieuws: 'news', videos: 'videos', input: 'internal_data_entry',
}
export async function featureAllowed(key) {
  if (!key) return true
  const { data, error } = await supabase.rpc('feature_access', { feature: key })
  if (error) throw error
  return data === true
}
export const ADMIN_SECTIONS = [
  ['dashboard', 'Dashboard', 'admin.access'], ['nieuws', 'Nieuws', 'articles.read'], ['videos', "Video's", 'videos.read'],
  ['community', 'Community', 'forum.moderate'], ['users', 'Gebruikers', 'users.view'],
  ['features', 'Site & features', 'features.view'], ['studio', 'Studio-beheer', 'features.view'],
  ['input', 'Interne invoer', 'data.correct'], ['data', 'Data', 'data.view'],
  ['photos', "Spelersfoto's", 'player_photos.view'], ['sync', 'Sync & status', 'sync.view'],
  ['audit', 'Auditlog', 'audit.view'], ['system', 'Systeem', 'system.view'],
]
export function canOpenAdmin(user, section = 'dashboard') {
  const entry = ADMIN_SECTIONS.find(([key]) => key === section)
  return !!entry && hasPermission(user, 'admin.access') && hasPermission(user, entry[2])
}
