/**
 * Gedeelde opslag voor Transfer Deadline Live.
 * Voer setupTransferDeadlineSharedSync() eenmaal uit en deploy dit script daarna
 * als Web App. Zet TRANSFER_DEADLINE_WRITE_TOKEN als Script Property; het token
 * hoort niet in deze broncode.
 */
const TRANSFER_SHARED = {
  editorialSheet: 'TRANSFER_EDITORIAL_2026_27',
  liveSheet: 'TRANSFER_LIVE_2026_27',
  editorialHeaders: ['key','club','speler','richting','windowScore','oordeel','rol','impact','label','concurrenten','notitie','liveNieuw','recordType','transferId','updatedAt','updatedBy','deleted'],
  liveHeaders: ['transferId','club','speler','van','naar','richting','type','status','transferDate','positie','vergoeding','bron','bronUrl','contract','createdAt','updatedAt','updatedBy','deleted'],
}

function setupTransferDeadlineSharedSync() {
  ensureTransferSharedSheet_(TRANSFER_SHARED.editorialSheet, TRANSFER_SHARED.editorialHeaders)
  ensureTransferSharedSheet_(TRANSFER_SHARED.liveSheet, TRANSFER_SHARED.liveHeaders)
}

function ensureTransferSharedSheet_(name, requiredHeaders) {
  const spreadsheet = SpreadsheetApp.getActive(), sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name)
  const width = Math.max(1, sheet.getLastColumn()), existing = sheet.getLastRow() ? sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(String) : []
  const headers = existing.filter(Boolean)
  requiredHeaders.forEach(header => { if (headers.indexOf(header) < 0) headers.push(header) })
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
  sheet.setFrozenRows(1)
  return sheet
}

function transferSharedAuthorize_(token) {
  const rawExpected = PropertiesService.getScriptProperties().getProperty('TRANSFER_DEADLINE_WRITE_TOKEN')
  const expected = String(rawExpected || '').trim(), received = String(token || '').trim()
  const diagnostics = {
    serverTokenConfigured: Boolean(expected),
    clientTokenProvided: Boolean(received),
    clientTokenLength: received.length,
    serverTokenLength: expected.length,
    tokenMatch: Boolean(expected) && received === expected,
  }
  if (!expected) {
    const error = new Error('TRANSFER_DEADLINE_WRITE_TOKEN is niet ingesteld.')
    error.code = 'AUTH'
    error.authDiagnostics = diagnostics
    throw error
  }
  if (received !== expected) {
    const error = new Error('Niet geautoriseerd.')
    error.code = 'AUTH'
    error.authDiagnostics = diagnostics
    throw error
  }
  return diagnostics
}

function transferSharedJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)
}

function doGet(e) {
  try {
    const authDiagnostics = transferSharedAuthorize_(e && e.parameter && e.parameter.token)
    if (!e || e.parameter.action !== 'snapshot') throw new Error('Onbekende actie.')
    return transferSharedJson_({ ok: true, authDiagnostics: authDiagnostics, editorial: readTransferSharedRows_(TRANSFER_SHARED.editorialSheet), liveTransfers: readTransferSharedRows_(TRANSFER_SHARED.liveSheet).map(mapSharedLiveRow_) })
  } catch (error) {
    const message = String(error && error.message || error)
    return transferSharedJson_({ ok: false, error: message, code: error && error.code || (message === 'Nieuwere gedeelde versie bestaat al.' ? 'CONFLICT' : 'ERROR'), authDiagnostics: error && error.authDiagnostics || undefined })
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock()
  try {
    const payload = JSON.parse(e && e.postData && e.postData.contents || '{}')
    const authDiagnostics = transferSharedAuthorize_(payload.token)
    if (payload.action === 'snapshot') return transferSharedJson_({ ok: true, authDiagnostics: authDiagnostics, editorial: readTransferSharedRows_(TRANSFER_SHARED.editorialSheet), liveTransfers: readTransferSharedRows_(TRANSFER_SHARED.liveSheet).map(mapSharedLiveRow_) })
    lock.waitLock(15000)
    let result
    if (payload.action === 'patchEditorial') result = patchTransferSharedEditorial_(payload)
    else if (payload.action === 'upsertLiveTransfer') result = upsertTransferSharedLive_(payload)
    else if (payload.action === 'deleteLiveTransfer') result = deleteTransferSharedLive_(payload)
    else throw new Error('Onbekende of niet toegestane actie.')
    return transferSharedJson_({ ok: true, result: result })
  } catch (error) {
    const message = String(error && error.message || error)
    return transferSharedJson_({ ok: false, error: message, code: error && error.code || (message === 'Nieuwere gedeelde versie bestaat al.' ? 'CONFLICT' : 'ERROR'), authDiagnostics: error && error.authDiagnostics || undefined })
  } finally {
    if (lock.hasLock()) lock.releaseLock()
  }
}

function readTransferSharedRows_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName)
  if (!sheet || sheet.getLastRow() < 2) return []
  const values = sheet.getDataRange().getValues(), headers = values.shift().map(String)
  return values.map(row => headers.reduce((result, header, index) => { result[header] = row[index]; return result }, {})).filter(row => Object.values(row).some(value => value !== ''))
}

function transferSharedDate_(value) {
  const time = new Date(value || 0).getTime()
  return isFinite(time) ? time : 0
}

function upsertTransferSharedRow_(sheetName, headers, keyHeader, key, values, updatedAt) {
  if (!key) throw new Error('Record-key ontbreekt.')
  const sheet = ensureTransferSharedSheet_(sheetName, headers), data = sheet.getDataRange().getValues(), actualHeaders = data[0].map(String)
  const keyIndex = actualHeaders.indexOf(keyHeader), updatedIndex = actualHeaders.indexOf('updatedAt')
  let rowNumber = 0
  for (let row = 1; row < data.length; row += 1) if (String(data[row][keyIndex]) === String(key)) { rowNumber = row + 1; break }
  const existing = rowNumber ? data[rowNumber - 1] : new Array(actualHeaders.length).fill('')
  if (rowNumber && transferSharedDate_(existing[updatedIndex]) > transferSharedDate_(updatedAt)) throw new Error('Nieuwere gedeelde versie bestaat al.')
  const next = actualHeaders.map((header, index) => Object.prototype.hasOwnProperty.call(values, header) ? values[header] : existing[index])
  if (rowNumber) sheet.getRange(rowNumber, 1, 1, next.length).setValues([next])
  else sheet.appendRow(next)
  return { key: key, updatedAt: updatedAt }
}

function patchTransferSharedEditorial_(payload) {
  const patch = payload.patch || {}, allowed = ['role','impact','label','competition','note','liveNew','score','verdict']
  if (!String(payload.key || '').trim() || String(payload.key).length > 500 || (!payload.club && !payload.transferId)) throw new Error('Ongeldige editorial key.')
  if (!isFinite(new Date(payload.updatedAt || '').getTime())) throw new Error('Ongeldige updatedAt.')
  Object.keys(patch).forEach(key => { if (allowed.indexOf(key) < 0) throw new Error('Niet toegestaan redactioneel veld: ' + key) })
  if ('score' in patch && patch.score !== '' && patch.score !== null && (!Number.isInteger(Number(patch.score)) || Number(patch.score) < 0 || Number(patch.score) > 100)) throw new Error('Window-score moet een integer van 0 t/m 100 zijn.')
  if ('competition' in patch && (!Array.isArray(patch.competition) || patch.competition.some(id => !String(id).trim()))) throw new Error('Concurrenten moeten geldige playerIds zijn.')
  if ('verdict' in patch && ['sterker','gelijk','zwakker'].indexOf(String(patch.verdict)) < 0) throw new Error('Ongeldig window-oordeel.')
  const isClub = String(payload.key).indexOf('club:') === 0 || (!payload.transferId && Boolean(payload.club))
  const mapped = {
    key: String(payload.key), club: String(payload.club || ''), speler: String(payload.playerName || ''), richting: String(payload.direction || ''), recordType: isClub ? 'club' : 'transfer', transferId: String(payload.transferId || ''),
    updatedAt: payload.updatedAt, updatedBy: String(payload.updatedBy || ''), deleted: false,
  }
  if ('role' in patch) mapped.rol = patch.role
  if ('impact' in patch) mapped.impact = patch.impact
  if ('label' in patch) mapped.label = patch.label
  if ('competition' in patch) mapped.concurrenten = Array.isArray(patch.competition) ? patch.competition.join('|') : ''
  if ('note' in patch) mapped.notitie = patch.note
  if ('liveNew' in patch) mapped.liveNieuw = Boolean(patch.liveNew)
  if ('score' in patch) mapped.windowScore = patch.score
  if ('verdict' in patch) mapped.oordeel = patch.verdict
  return upsertTransferSharedRow_(TRANSFER_SHARED.editorialSheet, TRANSFER_SHARED.editorialHeaders, 'key', payload.key, mapped, payload.updatedAt)
}

function mapLiveTransferForSheet_(payload, deleted) {
  const transfer = payload.transfer || payload.previous || {}
  return {
    transferId: String(payload.transferId || transfer.id || payload.key || ''), club: transfer.club || '', speler: transfer.playerName || '',
    van: transfer.from || '', naar: transfer.to || '', richting: transfer.direction || '', type: transfer.type || '', status: transfer.status || '',
    transferDate: transfer.transferDate || '', positie: transfer.position || '', vergoeding: transfer.fee || '', bron: transfer.source || '',
    bronUrl: transfer.sourceUrl || '', contract: transfer.contract || '', createdAt: transfer.createdAt || payload.updatedAt,
    updatedAt: payload.updatedAt, updatedBy: String(payload.updatedBy || ''), deleted: Boolean(deleted),
  }
}

function upsertTransferSharedLive_(payload) {
  const values = mapLiveTransferForSheet_(payload, false)
  if (!values.transferId || !values.speler || !values.club) throw new Error('Live-transfer mist transferId, speler of club.')
  if (!isFinite(new Date(values.updatedAt || '').getTime())) throw new Error('Ongeldige updatedAt.')
  return upsertTransferSharedRow_(TRANSFER_SHARED.liveSheet, TRANSFER_SHARED.liveHeaders, 'transferId', values.transferId, values, payload.updatedAt)
}

function deleteTransferSharedLive_(payload) {
  const values = mapLiveTransferForSheet_(payload, true)
  if (!values.transferId || !isFinite(new Date(values.updatedAt || '').getTime())) throw new Error('Ongeldige delete-opdracht.')
  return upsertTransferSharedRow_(TRANSFER_SHARED.liveSheet, TRANSFER_SHARED.liveHeaders, 'transferId', values.transferId, values, payload.updatedAt)
}

function mapSharedLiveRow_(row) {
  return {
    transferId: row.transferId, id: row.transferId, club: row.club, playerName: row.speler, from: row.van, to: row.naar,
    direction: row.richting, type: row.type, status: row.status, transferDate: row.transferDate, position: row.positie,
    fee: row.vergoeding, source: row.bron, sourceUrl: row.bronUrl, contract: row.contract, createdAt: row.createdAt,
    updatedAt: row.updatedAt, updatedBy: row.updatedBy, deleted: row.deleted,
  }
}
