import { candidatesForKey, setPlayerPhotoRecords } from './playerPhotos.js'

const failed = new Map(), pending = new Map()
let started = false, observer, mutation, configPromise
const FAILURE_TTL = 15 * 60 * 1000

export function initializePlayerPhotos(client) {
  if (typeof document === 'undefined') return
  if (!started) {
    started = true
    const initialize = root => {
      if (root.nodeType !== 1 && root !== document) return
      const nodes = [...(root.matches?.('[data-player-photo]') ? [root] : []), ...root.querySelectorAll('[data-player-photo]')]
      for (const node of nodes) if (!node.dataset.photoReady) {
        node.dataset.photoReady = 'true'
        if (observer) observer.observe(node); else loadPhoto(node)
      }
    }
    if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); loadPhoto(entry.target) }
    }, { rootMargin: '120px' })
    mutation = new MutationObserver(changes => {
      for (const change of changes) for (const node of change.addedNodes) initialize(node)
      // Detached list rows must not be retained by the intersection observer.
      for (const change of changes) for (const node of change.removedNodes) if (node.nodeType === 1) {
        if (node.matches('[data-player-photo]')) observer?.unobserve(node)
        for (const avatar of node.querySelectorAll('[data-player-photo]')) observer?.unobserve(avatar)
      }
    })
    mutation.observe(document.documentElement, { childList: true, subtree: true })
    initialize(document)
  }
  if (client && !configPromise) configPromise = loadRecords(client).then(rows => {
    setPlayerPhotoRecords(rows)
    for (const node of document.querySelectorAll('[data-player-photo]')) {
      node.dataset.photoGeneration = String(Number(node.dataset.photoGeneration || 0) + 1)
      node.replaceChildren(); node.classList.remove('has-player-photo')
      if (observer) observer.observe(node); else loadPhoto(node)
    }
  }).catch(() => { /* Offline: bundled local photos remain available. */ })
  return configPromise
}

async function loadRecords(client) {
  const rows = []
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await client.from('player_photos').select('*').order('player_key').range(from, from + 999).abortSignal(AbortSignal.timeout(8000))
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

async function imageAvailable(url) {
  if ((failed.get(url) || 0) > Date.now()) return false
  if (pending.has(url)) return pending.get(url)
  const promise = new Promise(resolve => {
    const img = new Image()
    const finish = ok => { clearTimeout(timer); img.onload = null; img.onerror = null; if (!ok) { failed.set(url, Date.now() + FAILURE_TTL); img.removeAttribute('src') } resolve(ok) }
    const timer = setTimeout(() => finish(false), 10000)
    img.onload = () => finish(img.naturalWidth > 0)
    img.onerror = () => finish(false)
    img.referrerPolicy = 'no-referrer'; img.decoding = 'async'; img.src = url
  })
  pending.set(url, promise)
  const result = await promise
  pending.delete(url)
  return result
}

async function loadPhoto(node) {
  const generation = node.dataset.photoGeneration || '0'
  for (const candidate of candidatesForKey(node.dataset.playerPhoto, Number(node.dataset.photoSize))) {
    if (!node.isConnected || (node.dataset.photoGeneration || '0') !== generation) return
    if (!await imageAvailable(candidate.url)) continue
    if (!node.isConnected || (node.dataset.photoGeneration || '0') !== generation) return
    const img = document.createElement('img')
    img.alt = ''; img.width = img.height = Number(node.dataset.photoSize)
    img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'
    img.onload = () => node.classList.add('has-player-photo')
    img.onerror = () => { failed.set(candidate.url, Date.now() + FAILURE_TTL); node.classList.remove('has-player-photo'); img.remove(); loadPhoto(node) }
    img.src = candidate.url; node.replaceChildren(img); node.dataset.photoSource = candidate.source
    if (img.complete && img.naturalWidth) node.classList.add('has-player-photo')
    return
  }
  node.dataset.photoSource = 'initials'
}
