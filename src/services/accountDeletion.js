const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function createAccountDeletionHandler({ db, origins, log = () => {} }) {
  return async request => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    if (origins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status, code) => new Response(JSON.stringify({ code }), { status, headers })
    if (origin && !origins.includes(origin)) return reply(403, 'origin_denied')
    if (request.method === 'OPTIONS') return reply(200, 'ok')
    if (request.method !== 'POST') return reply(405, 'method_not_allowed')
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'json_required')
    let job, stage = 'validate'
    try {
      const text = await request.text()
      if (text.length > 1024) return reply(413, 'request_too_large')
      let body
      try { body = JSON.parse(text) } catch { return reply(400, 'invalid_request') }
      if (!body || Object.keys(body).length !== 1 || body.confirmation !== 'VERWIJDER') return reply(400, 'confirmation_required')
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
      if (!token) return reply(401, 'unauthorized')
      const { data, error } = await db.auth.getUser(token)
      if (error || !data?.user || data.user.is_anonymous) return reply(401, 'unauthorized')
      const actor = data.user.id
      let sessionId
      try { sessionId = JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).session_id } catch { return reply(401, 'session_required') }
      if (!uuid.test(sessionId || '')) return reply(401, 'session_required')
      const begin = await db.rpc('account_deletion_begin', { actor, session_id: sessionId })
      if (begin.error) return reply(503, 'deletion_unavailable')
      if (begin.data.code !== 'started') return reply(begin.data.code === 'in_progress' ? 409 : 403, begin.data.code)
      job = begin.data.job_id
      stage = 'storage'
      // Only publicly retained editorial assets lose ownership. Never SQL-delete Storage objects.
      const release = await db.rpc('account_deletion_retain_editorial', { actor, job_id: job })
      if (release.error) throw new Error('storage_inventory')
      for (let page = 0; page < 100; page++) {
        const inventory = await db.rpc('account_deletion_storage', { actor, job_id: job })
        if (inventory.error) throw new Error('storage_inventory')
        if (!inventory.data.length) break
        const groups = Map.groupBy(inventory.data, object => object.bucket_id)
        for (const [bucket, objects] of groups) {
          const result = await db.storage.from(bucket).remove(objects.map(object => object.name))
          if (result.error) throw new Error('storage_cleanup')
        }
        if (page === 99) throw new Error('storage_limit')
      }
      stage = 'sessions'
      const signout = await db.auth.admin.signOut(token, 'global')
      if (signout.error) throw new Error('session_revocation')
      stage = 'auth'
      const deletion = await db.auth.admin.deleteUser(actor, false)
      if (deletion.error) throw new Error('auth_deletion')
      // Auth deletion and its FK cascades succeeded. Audit completion is also recorded
      // by the database deletion trigger, even if this final network response is lost.
      log({ event: 'account_deletion', job_id: job, outcome: 'completed' })
      return reply(200, 'deleted')
    } catch {
      if (job) {
        try { await db.rpc('account_deletion_failed', { job_id: job, failed_stage: stage }) } catch { /* Keep lease; retry becomes available after expiry. */ }
        log({ event: 'account_deletion', job_id: job, outcome: 'failed', stage })
      }
      return reply(503, 'deletion_failed')
    }
  }
}
