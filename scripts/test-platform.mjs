import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { readFileSync, readdirSync } from 'node:fs'
import { parse } from 'acorn'

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://studio.test/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
const { safeHtml } = await import('../src/platform/html.js')
let checks = 0
for (const input of ['<img src=x onerror="alert(1)">', '<script>alert(1)</script>', '<a href="javascript:alert(1)">link</a>', '<svg onload="alert(1)"></svg>', '<iframe srcdoc="<script>alert(1)</script>"></iframe>']) {
  const output = safeHtml(input)
  assert.doesNotMatch(output, /onerror|onload|javascript:|<script|<iframe/i)
  checks++
}
assert.match(safeHtml('<button data-screen="players" aria-label="Spelers">Spelers</button>'), /data-screen="players"/); checks++
assert.match(safeHtml('<img src="blob:https://studio.test/123" alt="Screenshot">'), /blob:/); checks++
assert.match(safeHtml('<tr><td>Speler</td></tr>'), /<tr><td>Speler<\/td><\/tr>/); checks++
assert.match(safeHtml('<th scope="col">Naam</th>'), /<th scope="col">Naam<\/th>/); checks++
const files = ['src/main.js', ...['src/modules','src/platform'].flatMap(dir => readdirSync(dir).filter(f => f.endsWith('.js')).map(f => `${dir}/${f}`))]
for (const file of files) {
  const ast = parse(readFileSync(file,'utf8'),{ecmaVersion:'latest',sourceType:'module'})
  function walk(node) {
    if (!node || typeof node !== 'object') return
    let expression
    if (node.type==='AssignmentExpression' && node.left?.property?.name==='innerHTML') expression=node.right
    if (node.type==='CallExpression' && node.callee?.property?.name==='insertAdjacentHTML') expression=node.arguments[1]
    if (expression) { assert.equal(expression.callee?.name,'safeHtml',`${file}: unsafe HTML sink`); checks++ }
    Object.values(node).forEach(value => { if(Array.isArray(value)) value.forEach(walk); else if(value && typeof value==='object') walk(value) })
  }
  walk(ast)
}
const config = JSON.parse(readFileSync('vercel.json','utf8'))
assert(config.headers[0].headers.some(h=>h.key==='Content-Security-Policy' && !h.value.includes("script-src 'self' 'unsafe-inline'"))); checks++
console.log(`${checks} platform/HTML-security checks passed.`)
