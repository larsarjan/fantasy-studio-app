import { supabase, appUrl } from '../platform/client.js'
export async function fetchVideoFeed(signal) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const response = await fetch(appUrl('api/latest-video'), { signal, headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} })
  if (!response.ok) throw new Error('Video feed unavailable')
  return response.json()
}
