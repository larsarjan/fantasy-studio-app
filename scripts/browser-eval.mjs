import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const [session, source] = process.argv.slice(2)
const code = source.endsWith('.js') ? readFileSync(source,'utf8') : source
process.stdout.write(execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,'eval',code],{encoding:'utf8',timeout:60000}))
