// Uses locally generated, ignored acceptance accounts; never logs credentials.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const [role='a',session='live']=process.argv.slice(2)
const account=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')).find(a=>a.role===role)
if(!account) throw new Error('Missing acceptance account')
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:45000})
try {
 run('fill','input[name="email"]',account.email)
 run('fill','input[name="password"]',account.password)
 run('click','button[type="submit"]')
 console.log(`Submitted ${role} login in isolated browser ${session}`)
} catch { console.error('Browser login failed; inspect the isolated browser state. Credentials omitted.'); process.exitCode=1 }
