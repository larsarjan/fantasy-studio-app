import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
const session=process.argv[2]??'authcheck'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:45000})
const password=randomBytes(24).toString('base64url')
try {
 run('fill','input[name="email"]',`studio-${randomBytes(6).toString('hex')}@example.com`)
 run('fill','input[name="password"]',password)
 run('fill','input[name="confirmation"]',password)
 run('click','button[type="submit"]')
 console.log('Submitted live signup with a reserved example.com test address. No delivery claimed.')
} catch { console.error('Signup browser step failed; credentials omitted.');process.exitCode=1 }
