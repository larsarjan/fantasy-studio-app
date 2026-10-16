import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { readFileSync, readdirSync } from 'node:fs'
import { parse } from 'acorn'

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://studio.test/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
const { safeHtml } = await import('../src/platform/html.js')
const { articleBodyHtml, RICH_TEXT_PREFIX } = await import('../src/services/articleContent.js')
let checks = 0
for (const input of ['<img src=x onerror="alert(1)">', '<script>alert(1)</script>', '<a href="javascript:alert(1)">link</a>', '<svg onload="alert(1)"></svg>', '<iframe srcdoc="<script>alert(1)</script>"></iframe>']) {
  const output = safeHtml(input)
  assert.doesNotMatch(output, /onerror|onload|javascript:|<script|<iframe/i)
  assert.doesNotMatch(articleBodyHtml(RICH_TEXT_PREFIX + input), /onerror|onload|javascript:|<script|<iframe/i)
  checks++
}
assert.match(safeHtml('<button data-screen="players" aria-label="Spelers">Spelers</button>'), /data-screen="players"/); checks++
assert.match(safeHtml('<img src="blob:https://studio.test/123" alt="Screenshot">'), /blob:/); checks++
assert.match(safeHtml('<tr><td>Speler</td></tr>'), /<tr><td>Speler<\/td><\/tr>/); checks++
assert.match(safeHtml('<th scope="col">Naam</th>'), /<th scope="col">Naam<\/th>/); checks++
const files = ['src/main.js', ...['src/modules','src/platform','src/public','src/admin'].flatMap(dir => readdirSync(dir).filter(f => f.endsWith('.js')).map(f => `${dir}/${f}`))]
// Static, authored markup has no interpolation/user input. Still require that
// sanitization would preserve it; never exempt an entire file or dynamic sink.
function safeStaticMarkup(expression) {
  if(expression?.type==='ConditionalExpression')return safeStaticMarkup(expression.consequent)&&safeStaticMarkup(expression.alternate)
  const value=expression?.type==='Literal'&&typeof expression.value==='string'?expression.value:expression?.type==='TemplateLiteral'&&!expression.expressions.length?expression.quasis[0].value.cooked:null
  if(value===null)return false
  const template=document.createElement('template');template.innerHTML=value
  return safeHtml(template.innerHTML)===template.innerHTML
}
assert.equal(safeStaticMarkup({type:'Literal',value:'<button>Test</button>'}),true)
assert.equal(safeStaticMarkup({type:'Literal',value:'<img src=x onerror="alert(1)">'}),false)
assert.equal(safeStaticMarkup({type:'Identifier',name:'userInput'}),false)
for (const file of files) {
  const ast = parse(readFileSync(file,'utf8'),{ecmaVersion:'latest',sourceType:'module'})
  function walk(node) {
    if (!node || typeof node !== 'object') return
    let expression
    if (node.type==='AssignmentExpression' && node.left?.property?.name==='innerHTML') expression=node.right
    if (node.type==='CallExpression' && node.callee?.property?.name==='insertAdjacentHTML') expression=node.arguments[1]
    if (expression) {
      const articleSanitizer = expression.callee?.name === 'articleBodyHtml' && ast.body.some(n => n.type === 'ImportDeclaration' && n.source.value === '../services/articleContent.js' && n.specifiers.some(i => i.imported?.name === 'articleBodyHtml' && i.local.name === 'articleBodyHtml'))
      assert.ok(expression.callee?.name === 'safeHtml' || articleSanitizer || safeStaticMarkup(expression), `${file}: unsafe HTML sink`); checks++
    }
    Object.values(node).forEach(value => { if(Array.isArray(value)) value.forEach(walk); else if(value && typeof value==='object') walk(value) })
  }
  walk(ast)
}
const config = JSON.parse(readFileSync('vercel.json','utf8'))
assert(config.headers[0].headers.some(h=>h.key==='Content-Security-Policy' && !h.value.includes("script-src 'self' 'unsafe-inline'"))); checks++
console.log(`${checks} platform/HTML-security checks passed.`)
