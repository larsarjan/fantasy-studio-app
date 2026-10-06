import { parse } from 'acorn'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const files = ['src/main.js', ...['src/modules', 'src/platform'].flatMap(dir => readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'html.js').map(f => `${dir}/${f}`))]
let changed = 0
for (const file of files) {
  let source = readFileSync(file, 'utf8')
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
  const edits = []
  function walk(node) {
    if (!node || typeof node !== 'object') return
    let expression
    if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression' && node.left.property?.name === 'innerHTML') expression = node.right
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && node.callee.property?.name === 'insertAdjacentHTML') expression = node.arguments[1]
    if (expression && !(expression.type === 'CallExpression' && expression.callee.name === 'safeHtml')) {
      edits.push({ index: expression.start, value: 'safeHtml(' }, { index: expression.end, value: ')' })
    }
    for (const value of Object.values(node)) { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value) }
  }
  walk(ast)
  if (!edits.length) continue
  for (const edit of edits.sort((a,b) => b.index-a.index)) source = source.slice(0, edit.index)+edit.value+source.slice(edit.index)
  const relative = path.relative(path.dirname(file), 'src/platform/html.js').replaceAll('\\','/')
  source = `import { safeHtml } from '${relative.startsWith('.') ? relative : `./${relative}`}'\n`+source
  writeFileSync(file,source)
  changed++
}
console.log(`Secured HTML sinks in ${changed} files`)
