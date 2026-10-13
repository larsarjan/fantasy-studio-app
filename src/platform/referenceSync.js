import { supabase, basePath } from './client.js'

export async function runReferenceSync() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw Error('Log opnieuw in om te synchroniseren.')
  const response = await fetch(`${basePath}api/reference-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: '{}',
    signal: AbortSignal.timeout(250000),
  })
  let result
  try { result = await response.json() } catch { throw Error('De importserver gaf geen geldig antwoord. Controleer de importstatus voordat je opnieuw probeert.') }
  if (!response.ok) throw Error(result.error || 'Centrale synchronisatie mislukt.')
  if (!result.publication?.id || !result.publication?.created_at) throw Error('Er is geen bevestigde cloudsnapshot ontvangen.')
  return result
}
