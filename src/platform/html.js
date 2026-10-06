import DOMPurify from 'dompurify'

DOMPurify.addHook?.('uponSanitizeAttribute', (node, data) => {
  if (node.tagName === 'IMG' && data.attrName === 'src' && data.attrValue.startsWith(`blob:${window.location.origin}/`)) data.forceKeepAttr = true
})

// All application HTML sinks use this helper, including rerenders and modals.
// DOMPurify removes scripts, event handlers and unsafe URLs; data/ARIA attributes
// and ordinary SVG markup used by existing charts remain supported.
export function safeHtml(value) {
  const text = String(value ?? '')
  const tag = text.trimStart().match(/^<(tr|td|th|thead|tbody|tfoot|colgroup|col)\b/i)?.[1]?.toLowerCase()
  // HTML parsers discard orphan table fragments. Preserve their parsing context
  // when existing screens update tbody/thead rather than replacing a whole table.
  const wrappers = {
    tr: ['<table><tbody>', '</tbody></table>', 'tbody'],
    td: ['<table><tbody><tr>', '</tr></tbody></table>', 'tr'],
    th: ['<table><tbody><tr>', '</tr></tbody></table>', 'tr'],
    col: ['<table><colgroup>', '</colgroup></table>', 'colgroup'],
  }
  const wrapper = tag ? wrappers[tag] ?? ['<table>', '</table>', 'table'] : null
  const clean = DOMPurify.sanitize(wrapper ? wrapper[0] + text + wrapper[1] : text, { USE_PROFILES: { html: true, svg: true }, FORBID_TAGS: ['style', 'iframe', 'object', 'embed'], FORBID_ATTR: ['srcdoc'] })
  return wrapper ? new window.DOMParser().parseFromString(clean, 'text/html').querySelector(wrapper[2]).innerHTML : clean
}
