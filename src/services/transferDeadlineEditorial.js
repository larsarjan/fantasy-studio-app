import { userStorage } from './userStorage.js'
export const TRANSFER_EDITORIAL_STORAGE_KEY = 'fantasy-studio-transfer-deadline-editorial-v1'
export const TRANSFER_SESSION_STORAGE_KEY = 'fantasy-studio-transfer-live-session-v1'
export const TRANSFER_SHARED_CONFIG_KEY = 'fantasy-studio-transfer-shared-config-v1'
export const TRANSFER_SHARED_QUEUE_KEY = 'fantasy-studio-transfer-shared-queue-v1'
export const TRANSFER_SHARED_STATUS_KEY = 'fantasy-studio-transfer-shared-status-v1'

const emptyEditorial = () => ({ transfers: {}, clubs: {}, localTransfers: [] })
const now = () => new Date().toISOString()
const validDate = value => Number.isFinite(Date.parse(value ?? ''))
const parse = (storage, key, fallback) => { try { return JSON.parse(storage.getItem(key)) ?? fallback } catch { return fallback } }
const createClientId = () => globalThis.crypto?.randomUUID?.() ?? `client-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function readTransferSharedConfig(storage = userStorage) {
  const value = parse(storage, TRANSFER_SHARED_CONFIG_KEY, {})
  return { endpoint: String(value.endpoint ?? '').trim().replace(/\/+$/, ''), token: String(value.token ?? '').trim(), clientId: String(value.clientId ?? '') }
}

export function writeTransferSharedConfig(config, storage = userStorage) {
  const current = readTransferSharedConfig(storage)
  const value = {
    endpoint: String(config?.endpoint ?? current.endpoint).trim().replace(/\/+$/, ''),
    token: String(config?.token ?? current.token).trim(),
    clientId: String(config?.clientId ?? current.clientId) || createClientId(),
  }
  storage.setItem(TRANSFER_SHARED_CONFIG_KEY, JSON.stringify(value))
  return value
}

export function readTransferSharedStatus(storage = userStorage) {
  return { state: 'local', lastSync: null, message: 'Lokale cache actief', ...parse(storage, TRANSFER_SHARED_STATUS_KEY, {}) }
}

function writeStatus(status, storage) {
  const value = { ...readTransferSharedStatus(storage), ...status }
  storage.setItem(TRANSFER_SHARED_STATUS_KEY, JSON.stringify(value))
  return value
}

export function readTransferEditorial(storage = userStorage) {
  const data = parse(storage, TRANSFER_EDITORIAL_STORAGE_KEY, emptyEditorial())
  return {
    transfers: data.transfers && typeof data.transfers === 'object' ? data.transfers : {},
    clubs: data.clubs && typeof data.clubs === 'object' ? data.clubs : {},
    localTransfers: Array.isArray(data.localTransfers) ? data.localTransfers : [],
  }
}

export function writeTransferEditorial(data, storage = userStorage) { storage.setItem(TRANSFER_EDITORIAL_STORAGE_KEY, JSON.stringify(data)); return data }

export function readTransferSharedQueue(storage = userStorage) {
  const queue = parse(storage, TRANSFER_SHARED_QUEUE_KEY, [])
  return Array.isArray(queue) ? queue : []
}

function queueOperation(operation, storage) {
  const queue = readTransferSharedQueue(storage)
  const index = queue.findIndex(item => item.entity === operation.entity && item.key === operation.key)
  const merged = index >= 0 ? { ...queue[index], ...operation, patch: { ...(queue[index].patch ?? {}), ...(operation.patch ?? {}) } } : operation
  if (index >= 0) queue[index] = merged
  else queue.push(merged)
  storage.setItem(TRANSFER_SHARED_QUEUE_KEY, JSON.stringify(queue))
  writeStatus({ state: 'pending', message: 'Lokaal opgeslagen — nog niet gesynchroniseerd' }, storage)
}

export function isTransferLiveNew(transfer, editorial, startedAt) {
  if (!startedAt || !validDate(startedAt)) return false
  const createdAt = transfer?.createdAt ?? transfer?.sourceUpdated ?? transfer?.transferDate
  const editorialDate = editorial?.updatedAt ?? createdAt
  return Boolean(editorial?.liveNew && validDate(editorialDate) && Date.parse(editorialDate) >= Date.parse(startedAt))
    || Boolean(validDate(createdAt) && Date.parse(createdAt) >= Date.parse(startedAt))
}

function stampPatch(current, patch, storage) {
  const config = writeTransferSharedConfig({}, storage)
  return { ...current, ...patch, updatedAt: now(), updatedBy: config.clientId, pending: true }
}

export function patchTransferEditorial(id, patch, storage = userStorage, metadata = {}) {
  const data = readTransferEditorial(storage), value = stampPatch(data.transfers[id] ?? {}, patch, storage)
  data.transfers[id] = value
  queueOperation({ action: 'patchEditorial', entity: 'editorial', key: value.sharedKey || `transfer:${id}`, transferId: id, club: metadata.club ?? '', playerName: metadata.playerName ?? '', direction: metadata.direction ?? '', patch, updatedAt: value.updatedAt, updatedBy: value.updatedBy }, storage)
  return writeTransferEditorial(data, storage)
}

export function patchTransferClubEditorial(club, patch, storage = userStorage) {
  const data = readTransferEditorial(storage), value = stampPatch(data.clubs[club] ?? {}, patch, storage)
  data.clubs[club] = value
  queueOperation({ action: 'patchEditorial', entity: 'editorial', key: value.sharedKey || `club:${club}`, club, patch, updatedAt: value.updatedAt, updatedBy: value.updatedBy }, storage)
  return writeTransferEditorial(data, storage)
}

export function upsertLocalTransfer(transfer, storage = userStorage) {
  const data = readTransferEditorial(storage), config = writeTransferSharedConfig({}, storage)
  const value = { ...transfer, updatedAt: now(), updatedBy: config.clientId, pending: true, localTransfer: true }
  const index = data.localTransfers.findIndex(row => row.id === value.id)
  if (index >= 0) data.localTransfers[index] = value
  else data.localTransfers.unshift(value)
  queueOperation({ action: 'upsertLiveTransfer', entity: 'live', key: value.id, transfer: value, updatedAt: value.updatedAt, updatedBy: value.updatedBy }, storage)
  return writeTransferEditorial(data, storage)
}

export function deleteLocalTransfer(id, storage = userStorage) {
  const data = readTransferEditorial(storage), existing = data.localTransfers.find(row => row.id === id)
  data.localTransfers = data.localTransfers.filter(row => row.id !== id)
  delete data.transfers[id]
  const config = writeTransferSharedConfig({}, storage)
  queueOperation({ action: 'deleteLiveTransfer', entity: 'live', key: id, transferId: id, updatedAt: now(), updatedBy: config.clientId, previous: existing ?? null }, storage)
  return writeTransferEditorial(data, storage)
}

export function readTransferLiveSession(storage = userStorage) { return parse(storage, TRANSFER_SESSION_STORAGE_KEY, { startedAt: null }) }
export function writeTransferLiveSession(data, storage = userStorage) { storage.setItem(TRANSFER_SESSION_STORAGE_KEY, JSON.stringify(data)); return data }

function mapSharedEditorialRow(row) {
  const key = String(row.key ?? '').trim()
  if (!key) return null
  const recordType = String(row.recordType ?? '').trim().toLowerCase() || (key.startsWith('club:') || (!row.speler && (row.windowScore !== undefined || row.oordeel !== undefined)) ? 'club' : 'transfer')
  const competition = Array.isArray(row.competition) ? row.competition : String(row.concurrenten ?? '').split('|').map(value => value.trim()).filter(Boolean)
  const rawScore = row.score ?? row.windowScore ?? '', numericScore = rawScore === '' || rawScore === null ? '' : Number(rawScore)
  const value = {
    role: row.role ?? row.rol ?? '', impact: row.impact ?? '', label: row.label ?? '', competition,
    note: row.note ?? row.notitie ?? '', liveNew: row.liveNew === true || String(row.liveNieuw ?? '').toLowerCase() === 'true',
    score: Number.isInteger(numericScore) && numericScore >= 0 && numericScore <= 100 ? numericScore : '', verdict: row.verdict ?? row.oordeel ?? '',
    updatedAt: row.updatedAt ?? '', updatedBy: row.updatedBy ?? '', pending: false, sharedKey: key,
  }
  return { key, recordType, club: row.club || (key.startsWith('club:') ? key.slice(5) : ''), transferId: row.transferId || (key.startsWith('transfer:') ? key.slice(9) : key), value }
}

function shouldUseShared(local, shared) {
  if (!local || !local.pending) return true
  if (!validDate(local.updatedAt)) return true
  if (!validDate(shared.updatedAt)) return false
  return Date.parse(shared.updatedAt) >= Date.parse(local.updatedAt)
}

export function mergeTransferSharedSnapshot(localData, snapshot) {
  const result = { transfers: { ...(localData?.transfers ?? {}) }, clubs: { ...(localData?.clubs ?? {}) }, localTransfers: [...(localData?.localTransfers ?? [])] }
  for (const raw of snapshot?.editorial ?? []) {
    const row = mapSharedEditorialRow(raw)
    if (!row) continue
    const target = row.recordType === 'club' ? result.clubs : result.transfers
    const id = row.recordType === 'club' ? row.club : row.transferId
    if (id && shouldUseShared(target[id], row.value)) {
      if (validDate(row.value.updatedAt)) target[id] = row.value
      else {
        const nonEmpty = Object.fromEntries(Object.entries(row.value).filter(([, value]) => value !== '' && value !== null && value !== undefined && (!Array.isArray(value) || value.length)))
        target[id] = { ...(target[id] ?? {}), ...nonEmpty, pending: false, sharedKey: row.key }
      }
    }
  }
  const liveById = new Map(result.localTransfers.map(row => [String(row.id), row]))
  for (const raw of snapshot?.liveTransfers ?? []) {
    const id = String(raw.transferId ?? raw.id ?? '').trim()
    if (!id) continue
    const shared = { ...raw, id, localTransfer: true, pending: false }
    const local = liveById.get(id)
    if (String(raw.deleted).toLowerCase() === 'true' || raw.deleted === true) {
      if (shouldUseShared(local, shared)) liveById.delete(id)
    } else if (shouldUseShared(local, shared)) liveById.set(id, shared)
  }
  result.localTransfers = [...liveById.values()]
  return result
}

async function requestShared(endpoint, options) {
  const response = await fetch(endpoint, options)
  if (!response.ok) throw new Error(`Gedeelde transfersync mislukt (${response.status}).`)
  const payload = await response.json()
  if (payload?.ok === false) {
    const diagnostics = payload.authDiagnostics
    const diagnosticText = diagnostics
      ? ` [serverTokenConfigured=${Boolean(diagnostics.serverTokenConfigured)}, clientTokenProvided=${Boolean(diagnostics.clientTokenProvided)}, clientTokenLength=${Number(diagnostics.clientTokenLength) || 0}, serverTokenLength=${Number(diagnostics.serverTokenLength) || 0}, tokenMatch=${Boolean(diagnostics.tokenMatch)}]`
      : ''
    const error = new Error(`${payload.error || 'Gedeelde transfersync geweigerd.'}${diagnosticText}`)
    error.code = payload.code
    throw error
  }
  return payload
}

async function flushQueue(config, storage) {
  const queue = readTransferSharedQueue(storage)
  for (let index = 0; index < queue.length; index += 1) {
    try {
      await requestShared(config.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...queue[index], token: config.token }) })
    } catch (error) {
      if (error.code !== 'CONFLICT') throw error
    }
    const current = readTransferSharedQueue(storage)
    storage.setItem(TRANSFER_SHARED_QUEUE_KEY, JSON.stringify(current.filter(item => !(item.entity === queue[index].entity && item.key === queue[index].key && item.updatedAt === queue[index].updatedAt))))
  }
}

function migrateLegacyLocalData(snapshot, storage) {
  const data = readTransferEditorial(storage), config = writeTransferSharedConfig({}, storage)
  const sharedEditorial = (snapshot?.editorial ?? []).map(mapSharedEditorialRow).filter(Boolean)
  const editorialTransfers = new Map(sharedEditorial.filter(row => row.recordType !== 'club').map(row => [String(row.transferId), row]))
  const editorialClubs = new Map(sharedEditorial.filter(row => row.recordType === 'club').map(row => [String(row.club), row]))
  const missingLegacyFields = (local, shared, keys) => Object.fromEntries(keys.filter(key => {
    const localValue = local?.[key], sharedValue = shared?.[key]
    const localHasValue = localValue !== '' && localValue !== null && localValue !== undefined && (!Array.isArray(localValue) || localValue.length)
    const sharedHasValue = sharedValue !== '' && sharedValue !== null && sharedValue !== undefined && (!Array.isArray(sharedValue) || sharedValue.length)
    return localHasValue && !sharedHasValue
  }).map(key => [key, local[key]]))
  const liveIds = new Set((snapshot?.liveTransfers ?? []).map(row => String(row.transferId ?? row.id ?? '')))
  for (const [id, value] of Object.entries(data.transfers)) {
    if (validDate(value.updatedAt)) continue
    const shared = editorialTransfers.get(String(id)), patch = missingLegacyFields(value, shared?.value, ['role','impact','label','competition','note','liveNew'])
    if (!Object.keys(patch).length) continue
    const updatedAt = now()
    data.transfers[id] = { ...value, updatedAt, updatedBy: config.clientId, pending: true }
    queueOperation({ action: 'patchEditorial', entity: 'editorial', key: shared?.key || `transfer:${id}`, transferId: id, patch, updatedAt, updatedBy: config.clientId }, storage)
  }
  for (const [club, value] of Object.entries(data.clubs)) {
    if (validDate(value.updatedAt)) continue
    const shared = editorialClubs.get(String(club)), patch = missingLegacyFields(value, shared?.value, ['score','verdict','note'])
    if (!Object.keys(patch).length) continue
    const updatedAt = now()
    data.clubs[club] = { ...value, updatedAt, updatedBy: config.clientId, pending: true }
    queueOperation({ action: 'patchEditorial', entity: 'editorial', key: shared?.key || `club:${club}`, club, patch, updatedAt, updatedBy: config.clientId }, storage)
  }
  data.localTransfers = data.localTransfers.map(transfer => {
    if (validDate(transfer.updatedAt) || liveIds.has(String(transfer.id))) return transfer
    const value = { ...transfer, updatedAt: now(), updatedBy: config.clientId, pending: true, localTransfer: true }
    queueOperation({ action: 'upsertLiveTransfer', entity: 'live', key: value.id, transfer: value, updatedAt: value.updatedAt, updatedBy: value.updatedBy }, storage)
    return value
  })
  writeTransferEditorial(data, storage)
}

async function fetchSnapshot(config) {
  return requestShared(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'snapshot', token: config.token }),
    cache: 'no-store',
  })
}

export async function synchronizeTransferDeadlineSharedData({ storage = userStorage } = {}) {
  const config = readTransferSharedConfig(storage)
  if (!config.endpoint) return writeStatus({ state: 'local', message: 'Gedeelde sync niet geconfigureerd' }, storage)
  writeStatus({ state: 'loading', message: 'Gedeelde transferdata synchroniseren…' }, storage)
  try {
    const initialSnapshot = await fetchSnapshot(config)
    migrateLegacyLocalData(initialSnapshot, storage)
    writeTransferEditorial(mergeTransferSharedSnapshot(readTransferEditorial(storage), initialSnapshot), storage)
    await flushQueue(config, storage)
    const snapshot = await fetchSnapshot(config)
    writeTransferEditorial(mergeTransferSharedSnapshot(readTransferEditorial(storage), snapshot), storage)
    return writeStatus({ state: 'synced', lastSync: now(), message: 'Gedeelde transferdata bijgewerkt' }, storage)
  } catch (error) {
    return writeStatus({ state: 'offline', message: `${error.message} Lokale cache blijft actief.` }, storage)
  }
}
