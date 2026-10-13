import { createClient } from '@supabase/supabase-js'
import { collectReferenceSheets, hashSheets, prepareReferenceSheets, referenceTables, validateReferenceCounts } from './referenceSync.js'

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
export function createReferenceSyncHandler({ env = process.env, clientFactory = createClient, collect = collectReferenceSheets, prepare = prepareReferenceSheets, now = Date.now } = {}) {
  const client = (key, authorization) => clientFactory(env.VITE_SUPABASE_URL.trim(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { ...(authorization ? { headers: { Authorization: authorization } } : {}), fetch: (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(65000) }) },
  })
  return async request => {
    if (request.method !== 'POST') return json({ error: 'Methode niet toegestaan.' }, 405)
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Serverimport is niet geconfigureerd.' }, 503)
    const started = now(), server = client(env.SUPABASE_SERVICE_ROLE_KEY)
    let lease
    const rpc = async (name, args) => {
      const result = await server.rpc(name, args)
      if (result.error) throw Error(`Centrale import ${name} mislukt [${result.error.code || 'RPC'}]${name === 'reference_check_scheduler' ? '.' : ': ' + String(result.error.message || 'Databasefout').slice(0,300)}`)
      return result.data
    }
    try {
      let actor = null, kind = 'scheduled'
      const schedulerToken = request.headers.get('x-sync-token')
      if (schedulerToken) {
        if (schedulerToken.length > 200 || !await rpc('reference_check_scheduler', { supplied_token: schedulerToken })) return json({ error: 'Niet toegestaan.' }, 403)
      } else {
        const authorization = request.headers.get('authorization')
        if (!authorization?.startsWith('Bearer ')) return json({ error: 'Log opnieuw in.' }, 401)
        const userClient = client(env.VITE_SUPABASE_PUBLISHABLE_KEY, authorization)
        const user = await userClient.auth.getUser(authorization.slice(7))
        if (user.error || !user.data?.user) return json({ error: 'Log opnieuw in.' }, 401)
        const access = await userClient.rpc('current_access')
        if (access.error || !['data.correct','sync.run'].every(p => access.data?.permissions?.includes(p))) return json({ error: 'data.correct en sync.run zijn vereist.' }, 403)
        const origin = request.headers.get('origin')
        if (origin && origin !== new URL(request.url).origin) return json({ error: 'Niet toegestaan.' }, 403)
        actor = user.data.user.id
        kind = 'manual'
      }
      // No user-supplied URL, dataset, actor or snapshot can affect publication.
      if (Number(request.headers.get('content-length') || 0) > 100) return json({ error: 'Ongeldig verzoek.' }, 400)
      const body = await request.text()
      if (body.length > 100 || (body.trim() && body.trim() !== '{}')) return json({ error: 'Ongeldig verzoek.' }, 400)
      lease = await rpc('reference_sync_claim', { trigger_kind: kind, actor_id: actor })
      if (!lease) return json({ error: 'Er loopt al een centrale synchronisatie. Probeer het later opnieuw.' }, 409)
      const sheets = await collect(), fingerprint = hashSheets(sheets)
      if (fingerprint === lease.source_hash) {
        const publication = await rpc('reference_sync_finish', { run_id: lease.id, outcome: 'unchanged', fingerprint, elapsed_ms: now() - started })
        return json({ publication, unchanged: true })
      }
      const retainedData = {}
      for (const key of ['transferDeadline','transferClubOverview']) {
        const table = referenceTables[key], rows = []
        for (let offset = 0; offset < (lease.counts?.[table] || 0); offset += 1000) {
          const result = await server.from(table).select('payload').eq('import_id', lease.base_import_id).order('id').range(offset, offset + 999)
          if (result.error) throw Error('Bestaande transferdata kon niet worden gecontroleerd.')
          rows.push(...result.data.map(r => r.payload))
        }
        retainedData[key] = rows
      }
      const database = await prepare(sheets, retainedData)
      const datasets = Object.fromEntries(Object.entries(referenceTables).map(([key, table]) => [table, database[key]]))
      validateReferenceCounts(datasets, lease.counts)
      if (now() - started > 180000) throw Error('Importduur overschreden; vorige snapshot behouden.')
      const publication = await rpc('reference_sync_finish', { run_id: lease.id, outcome: 'success', datasets, fingerprint, elapsed_ms: now() - started })
      if (!publication?.id || Object.entries(datasets).some(([table, rows]) => publication.counts?.[table] !== rows.length)) throw Error('Publicatie kon niet worden bevestigd. Controleer de importstatus.')
      return json({ publication, unchanged: false })
    } catch (error) {
      const message = String(error.message || 'Centrale synchronisatie mislukt.').slice(0, 500)
      if (lease) {
        try { await rpc('reference_sync_finish', { run_id: lease.id, outcome: 'error', failure: message, elapsed_ms: now() - started }) } catch { /* Expired lease is recorded by the next claim; never overwrite a committed run. */ }
      }
      return json({ error: message }, 503)
    }
  }
}
