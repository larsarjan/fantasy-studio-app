import DOMPurify from 'dompurify'

export const RICH_TEXT_PREFIX = '<!--fvt-rich-text-v1-->'
const options = { ALLOWED_TAGS: ['p','h2','h3','strong','b','em','i','a','ul','ol','li','blockquote','br'], ALLOWED_ATTR: ['href','title'], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false }
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function safeLink(value) {
  try { const url = new URL(value); return ['https:','http:','mailto:'].includes(url.protocol) ? url.href : null } catch { return null }
}
export function sanitizeArticleHtml(value) {
  const fragment = DOMPurify.sanitize(String(value || ''), { ...options, RETURN_DOM_FRAGMENT: true })
  for (const anchor of fragment.querySelectorAll('a')) {
    const href = safeLink(anchor.getAttribute('href'))
    if (href) anchor.setAttribute('href',href); else anchor.removeAttribute('href')
  }
  const container = document.createElement('div'); container.append(fragment)
  return container.innerHTML
}
export function articleBodyHtml(body) {
  const value = String(body || '')
  return value.startsWith(RICH_TEXT_PREFIX) ? sanitizeArticleHtml(value.slice(RICH_TEXT_PREFIX.length)) : value.split(/\n\s*\n/).map(p=>`<p>${escape(p).replace(/\n/g,'<br>')}</p>`).join('')
}
export function encodeArticleBody(html) {
  const cleaned = sanitizeArticleHtml(html)
  const node = document.createElement('div'); node.innerHTML = cleaned
  if (!node.textContent.trim()) return ''
  const body = RICH_TEXT_PREFIX + cleaned
  if (body.length > 80000) throw Error('De artikeltekst is te lang. Gebruik maximaal 80.000 tekens inclusief opmaak.')
  return body
}
export function articleText(body) { const node = document.createElement('div'); node.innerHTML = articleBodyHtml(body); return node.textContent.trim() }
export function articleSlug(title) {
  return String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,160).replace(/-$/,'') || 'artikel'
}
