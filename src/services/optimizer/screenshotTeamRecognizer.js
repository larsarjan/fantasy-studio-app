import { normalizeFantasyPosition } from '../fantasyGameRulesEngine.js'

export const SCREENSHOT_IMPORT_LIMITS = Object.freeze({
  maximumBytes: 10 * 1024 * 1024,
  minimumWidth: 480,
  minimumHeight: 320,
  acceptedTypes: ['image/png', 'image/jpeg', 'image/webp'],
})

const REFERENCE = Object.freeze({ width: 808, height: 799, left: 75, right: 735 })
const ROWS = [
  [4, 54, 'goalkeeper'], [54, 100, 'goalkeeper'],
  [128, 175, 'defender'], [175, 222, 'defender'], [222, 269, 'defender'], [269, 316, 'defender'], [316, 363, 'defender'],
  [391, 438, 'midfielder'], [438, 485, 'midfielder'], [485, 532, 'midfielder'], [532, 579, 'midfielder'], [579, 626, 'midfielder'],
  [654, 701, 'forward'], [701, 748, 'forward'], [748, 798, 'forward'],
]

const CLUB_CODES = Object.freeze({
  AZ: 'AZ', ADO: 'ADO Den Haag', AJX: 'Ajax', EXC: 'Excelsior', FEY: 'Feyenoord', FOR: 'Fortuna Sittard',
  GAE: 'Go Ahead Eagles', GRO: 'FC Groningen', HEE: 'sc Heerenveen', HER: 'Heracles Almelo', NAC: 'NAC Breda',
  NEC: 'NEC', PEC: 'PEC Zwolle', PSV: 'PSV', SPA: 'Sparta Rotterdam', TEL: 'Telstar', TWE: 'FC Twente', UTR: 'FC Utrecht',
})

function emptySlot(expectedPosition, index) {
  return {
    slot: index + 1, expectedPosition, rawText: '', rawName: '', extractedName: null,
    extractedClub: null, extractedPosition: null,
    extractedPrices: { current: null, selling: null, purchase: null },
    extractedRole: null, matchedPlayerId: null, matchedPlayer: null, confidence: 0,
    status: 'red', alternatives: [], reasons: [], detectedPrice: null,
    detectedRole: null, detectedBenchOrder: null,
  }
}

export function createEmptyScreenshotSlots() {
  return ROWS.map((row, index) => emptySlot(row[2], index))
}

export function validateScreenshotFile(file) {
  const errors = []
  if (!file) errors.push('Kies eerst een screenshot.')
  if (file && !SCREENSHOT_IMPORT_LIMITS.acceptedTypes.includes(String(file.type).toLowerCase())) errors.push('Gebruik een PNG-, JPG-, JPEG- of WEBP-afbeelding.')
  if (file && Number(file.size) > SCREENSHOT_IMPORT_LIMITS.maximumBytes) errors.push('De screenshot is groter dan 10 MB.')
  return { valid: errors.length === 0, errors }
}

async function readImageDimensions(file) {
  if (typeof createImageBitmap !== 'function') throw new Error('Lokale afbeeldingscontrole is in deze omgeving niet beschikbaar.')
  const bitmap = await createImageBitmap(file)
  const result = { width: bitmap.width, height: bitmap.height }
  bitmap.close?.()
  return result
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[ø]/g, 'o').replace(/[ł]/g, 'l').replace(/[đ]/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function ocrNormalize(value) {
  return normalize(value).replace(/0/g, 'o').replace(/[1|]/g, 'l').replace(/rn/g, 'm')
}

function levenshtein(a, b) {
  const left = ocrNormalize(a); const right = ocrNormalize(b)
  if (!left) return right.length
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0]; row[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[right.length]
}

function similarity(a, b) {
  const left = ocrNormalize(a); const right = ocrNormalize(b)
  if (!left || !right) return 0
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length)
  return 1 - (levenshtein(left, right) / Math.max(left.length, right.length))
}

function textEvidenceScore(rawText, playerName) {
  const text = ocrNormalize(rawText)
  const name = ocrNormalize(playerName)
  if (!text || !name) return 0
  if (text.includes(name)) return 1
  const words = text.split(' ')
  const nameWordCount = Math.max(1, name.split(' ').length)
  let best = 0
  for (let length = Math.max(1, nameWordCount - 1); length <= nameWordCount + 1; length += 1) {
    for (let index = 0; index + length <= words.length; index += 1) best = Math.max(best, similarity(words.slice(index, index + length).join(' '), name))
  }
  return best
}

function extractRow(rawText, expectedPosition) {
  const lines = String(rawText ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const codeMatch = String(rawText).toUpperCase().match(/\b([A-Z]{2,4})\s*[-–]\s*(KEE|VER|MID|SPI)\b/)
  const positionMap = { KEE: 'goalkeeper', VER: 'defender', MID: 'midfielder', SPI: 'forward' }
  const nameLine = lines.find((line) => !/\b(?:HP|VP|AP|VORM|PNT|WED)\b/i.test(line) && !/\b[A-Z]{2,4}\s*[-–]\s*(?:KEE|VER|MID|SPI)\b/i.test(line)) ?? ''
  const priceText = String(rawText).replace(/\ba5\b/gi, '45')
  const numberTokens = priceText.match(/(?:\d{1,2}[.,]\d|\b(?:4[045]|5[05]|6[05]|7[05]|8[05]|9[05]|1[01]0)\b)/g) ?? []
  const prices = numberTokens.slice(0, 3).map((token) => {
    const cleaned = token.replace(',', '.')
    const numeric = Number(cleaned)
    if (!Number.isFinite(numeric)) return null
    return cleaned.includes('.') ? numeric : numeric / 10
  })
  while (prices.length < 3) prices.push(null)
  return {
    name: nameLine.replace(/^[^\p{L}]+/u, '').trim() || null,
    clubCode: codeMatch?.[1] ?? null,
    club: CLUB_CODES[codeMatch?.[1]] ?? null,
    position: positionMap[codeMatch?.[2]] ?? expectedPosition ?? null,
    prices: { current: prices[0], selling: prices[1], purchase: prices[2] },
  }
}

function currentPrice(player) {
  for (const value of [player?.currentPrice, player?.endPrice, player?.price, player?.startPrice]) {
    if (value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value)
  }
  return null
}

function playerId(player) { return String(player?.id ?? player?.playerId ?? '').trim() }

export function matchScreenshotRows(rawRows, playerDatabase = [], activeSeason = '') {
  const activePlayers = playerDatabase.filter((player) => playerId(player) && (!activeSeason || player?.season === activeSeason))
  const used = new Set()
  return createEmptyScreenshotSlots().map((slot, index) => {
    const raw = rawRows[index] ?? {}
    const rawText = typeof raw === 'string' ? raw : raw.text
    const extracted = extractRow(rawText, slot.expectedPosition)
    const candidates = activePlayers.filter((player) => normalizeFantasyPosition(player?.fantasyPosition ?? player?.position) === slot.expectedPosition)
      .map((player) => {
        const playerName = String(player?.name ?? '')
        const lineScore = Math.max(similarity(extracted.name, playerName), textEvidenceScore(rawText, playerName))
        const surname = normalize(playerName).split(' ').at(-1)
        const surnameEvidence = surname && ocrNormalize(rawText).includes(ocrNormalize(surname)) ? 0.88 : 0
        const clubScore = extracted.club ? similarity(extracted.club, player?.club) : 0
        const price = currentPrice(player)
        const priceScore = extracted.prices.current !== null && price !== null && Math.abs(extracted.prices.current - price) <= 0.11 ? 1 : 0
        const score = Math.min(1, Math.max(lineScore, surnameEvidence) * 0.82 + clubScore * 0.11 + priceScore * 0.07)
        return { player, score, nameScore: lineScore, clubScore, priceScore }
      })
      .sort((a, b) => b.score - a.score || b.nameScore - a.nameScore || playerId(a.player).localeCompare(playerId(b.player)))
    const available = candidates.filter((candidate) => !used.has(playerId(candidate.player)))
    const best = available[0]
    const runnerUp = available[1]
    const margin = best ? best.score - (runnerUp?.score ?? 0) : 0
    let status = best?.score >= 0.78 && margin >= 0.08 ? 'green' : best?.score >= 0.58 && margin >= 0.03 ? 'yellow' : 'red'
    if (!extracted.name || (best?.nameScore ?? 0) < 0.55) status = 'red'
    const matched = status === 'red' ? null : best.player
    if (matched) used.add(playerId(matched))
    return {
      ...slot, rawText: String(rawText ?? '').trim(), rawName: extracted.name ?? '', extractedName: extracted.name,
      extractedClub: extracted.club, extractedPosition: extracted.position, extractedPrices: extracted.prices,
      matchedPlayerId: matched ? playerId(matched) : null, matchedPlayer: matched,
      confidence: Number((best?.score ?? 0).toFixed(3)), status,
      alternatives: candidates.slice(0, 3).filter((candidate) => playerId(candidate.player) !== playerId(matched)).map((candidate) => ({
        playerId: playerId(candidate.player), name: candidate.player.name, club: candidate.player.club, confidence: Number(candidate.score.toFixed(3)), player: candidate.player,
      })),
      reasons: [extracted.name ? `OCR-naam: ${extracted.name}` : 'Geen naam gelezen', extracted.club ? `Club: ${extracted.club}` : 'Club niet betrouwbaar gelezen'],
      detectedPrice: extracted.prices.current,
    }
  })
}

function isSupportedLayout(dimensions) {
  const ratio = dimensions.width / dimensions.height
  return ratio >= 0.88 && ratio <= 1.16
}

function rectangleFor(row, dimensions) {
  const scaleX = dimensions.width / REFERENCE.width
  const scaleY = dimensions.height / REFERENCE.height
  return {
    left: Math.max(0, Math.round(REFERENCE.left * scaleX)), top: Math.max(0, Math.round(row[0] * scaleY)),
    width: Math.min(dimensions.width, Math.round((REFERENCE.right - REFERENCE.left) * scaleX)),
    height: Math.max(20, Math.round((row[1] - row[0]) * scaleY)),
  }
}

function localAssetUrl(path) {
  if (typeof document === 'undefined') return path
  return new URL(path, document.baseURI).href.replace(/\/$/, '')
}

async function runLocalOcr({ imageFile, dimensions, onProgress, signal }) {
  const startedAt = performance.now()
  const { createWorker, OEM, PSM } = await import('tesseract.js')
  if (signal?.aborted) throw new DOMException('Herkenning geannuleerd.', 'AbortError')
  let worker
  const abort = () => { worker?.terminate() }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: localAssetUrl('ocr/worker.min.js'), corePath: localAssetUrl('ocr/core'), langPath: localAssetUrl('ocr/lang'),
      cacheMethod: 'none', logger: (message) => onProgress?.({ phase: 'ocr-loading', progress: message.progress ?? 0, status: message.status }),
    })
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1', user_defined_dpi: '150' })
    const rows = []
    for (let index = 0; index < ROWS.length; index += 1) {
      if (signal?.aborted) throw new DOMException('Herkenning geannuleerd.', 'AbortError')
      onProgress?.({ phase: 'ocr', progress: index / ROWS.length, row: index + 1, total: ROWS.length })
      const result = await worker.recognize(imageFile, { rectangle: rectangleFor(ROWS[index], dimensions) })
      rows.push({ text: result.data.text, confidence: result.data.confidence })
    }
    onProgress?.({ phase: 'ocr', progress: 1, row: ROWS.length, total: ROWS.length })
    return { rows, durationMs: performance.now() - startedAt }
  } finally {
    signal?.removeEventListener('abort', abort)
    await worker?.terminate().catch(() => {})
  }
}

export async function recognizeFantasyTeamScreenshot({ imageFile, playerDatabase = [], activeSeason = '', provider = null, onProgress = null, signal = null } = {}) {
  const totalStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const validation = validateScreenshotFile(imageFile)
  if (!validation.valid) return { valid: false, errors: validation.errors, warnings: [], confidence: 0, sourceType: 'screenshot', recognizedPlayers: createEmptyScreenshotSlots() }
  let dimensions
  try { dimensions = await readImageDimensions(imageFile) } catch { return { valid: false, errors: ['De afbeelding is corrupt of kon niet lokaal worden gelezen.'], warnings: [], confidence: 0, sourceType: 'screenshot', recognizedPlayers: createEmptyScreenshotSlots() } }
  if (!isSupportedLayout(dimensions)) return { valid: false, errors: ['Deze screenshotlayout wordt nog niet ondersteund. Gebruik de compacte Fantasy Eredivisie-lijstweergave met alle 15 spelers.'], warnings: [], confidence: 0, sourceType: 'screenshot', dimensions, recognizedPlayers: createEmptyScreenshotSlots() }
  if (typeof provider === 'function') return provider({ imageFile, playerDatabase, activeSeason, dimensions, onProgress, signal })
  try {
    onProgress?.({ phase: 'preparing', progress: 0 })
    const ocr = await runLocalOcr({ imageFile, dimensions, onProgress, signal })
    onProgress?.({ phase: 'matching', progress: 0 })
    const recognizedPlayers = matchScreenshotRows(ocr.rows, playerDatabase, activeSeason)
    const matched = recognizedPlayers.filter((slot) => slot.matchedPlayer)
    if (matched.length < 8) return { valid: false, errors: ['De lijstindeling kon niet betrouwbaar worden herkend. Er zijn geen spelers ingevuld; probeer een volledige, scherpe screenshot van de ondersteunde lijstweergave.'], warnings: [], confidence: 0, sourceType: 'screenshot', dimensions, recognizedPlayers: createEmptyScreenshotSlots() }
    const counts = { green: 0, yellow: 0, red: 0 }
    recognizedPlayers.forEach((slot) => { counts[slot.status] += 1 })
    return {
      valid: true, errors: [], sourceType: 'screenshot', provider: 'tesseract-js-local', dimensions, recognizedPlayers, counts,
      confidence: matched.reduce((sum, slot) => sum + slot.confidence, 0) / matched.length,
      warnings: [],
      timings: { ocrMs: Math.round(ocr.durationMs), totalMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - totalStartedAt) },
      detectedBank: null, detectedFreeTransfers: null, detectedCaptain: null, detectedViceCaptain: null,
    }
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error
    return { valid: false, errors: [`Lokale tekstherkenning is mislukt: ${error?.message ?? 'onbekende fout'}`], warnings: [], confidence: 0, sourceType: 'screenshot', dimensions, recognizedPlayers: createEmptyScreenshotSlots() }
  }
}

export default recognizeFantasyTeamScreenshot
