import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const browser = 'node_modules/agent-browser/bin/agent-browser-win32-x64.exe'
const run = (...args) => execFileSync(browser, ['--session', 'captcha-ui', ...args], { encoding: 'utf8', timeout: 65000 })
const ev = code => JSON.parse(run('eval', code))
const checks = [], ok = (value, label) => { assert(value, label); checks.push(label); console.log(label) }
run('open', 'http://127.0.0.1:5182/studio/profile')
run('wait', '#auth-form')
ok(ev('document.querySelector("#auth-captcha")===null'), 'Ordinary login has no CAPTCHA')
run('click', '[data-auth=signup]')
run('wait', '--fn', 'document.querySelector("#captcha-message").textContent.includes("geslaagd")')
for (const [w,h] of [[1366,900],[820,1180],[390,844]]) {
  run('set','viewport',String(w),String(h))
  run('eval','document.querySelector("#auth-captcha").scrollIntoView({block:"center"})')
  ok(ev('document.documentElement.scrollWidth<=innerWidth+1'), `Turnstile registration responsive ${w}px`)
  run('screenshot', `test-results/account-security/captcha-${w}.png`)
}
ok(ev('!document.querySelector("[type=submit]").disabled'), 'Official Cloudflare test widget enables signup after verification')
run('click','[data-auth=login]'); run('click','[data-auth=forgot]')
run('wait','--fn','document.querySelector("#captcha-message").textContent.includes("geslaagd")')
ok(true, 'Password reset also renders and verifies Turnstile')
run('network','route','**/challenges.cloudflare.com/**','--abort')
try {
  run('reload'); run('wait','#auth-form'); run('click','[data-auth=signup]')
  run('wait','--fn','document.querySelector("#captcha-message").textContent.includes("niet bereikbaar")')
  ok(ev('document.querySelector("[type=submit]").disabled'), 'Blocked Cloudflare fails closed with Dutch retry message')
} finally { run('network','unroute','**/challenges.cloudflare.com/**') }
// Disable JavaScript in the actual browser, rather than merely blocking scripts.
const ws = new WebSocket(run('get','cdp-url').trim())
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
let id=0; const pending=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})}))})
const {targetInfos}=await call('Target.getTargets')
const target=targetInfos.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:5182'))
const {sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true})
try {
  await call('Emulation.setScriptExecutionDisabled',{value:true},sessionId)
  await call('Page.reload',{},sessionId)
  await new Promise(r=>setTimeout(r,1000))
  const {result}=await call('Runtime.evaluate',{expression:'document.querySelector("noscript").innerText',returnByValue:true},sessionId)
  ok(result.value?.includes('JavaScript'), 'Actual no-JS browser displays the Dutch security explanation')
  run('screenshot','test-results/account-security/no-js.png')
} finally { await call('Emulation.setScriptExecutionDisabled',{value:false},sessionId);ws.close() }
writeFileSync('test-results/account-security/captcha-ui-results.json',JSON.stringify({checks,scope:'Local official Cloudflare test widget; no auth requests submitted'},null,2))
console.log(`${checks.length} CAPTCHA UI checks passed`)
