import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
mkdirSync('test-results/growth',{recursive:true})
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','growth-local',...args],{encoding:'utf8',timeout:60000,stdio:args[0]==='open'?['ignore','ignore','ignore']:['ignore','pipe','pipe']})
const ev=code=>{const r=JSON.parse(run('eval',`JSON.stringify(${code})`));return typeof r==='string'?JSON.parse(r):r}
run('open','http://127.0.0.1:5199/__growth');run('wait','--fn','window.ready===true')
if(ev('!!document.querySelector("[data-preferences]")'))run('click','[data-preferences]');run('click','[data-deny]');assert.equal(ev('JSON.parse(localStorage.getItem("fvt.analytics-consent.v1")).analytics'),false)
run('click','[data-preferences]');run('click','[data-allow]');assert.equal(ev('JSON.parse(localStorage.getItem("fvt.analytics-consent.v1")).analytics'),true);assert.equal(ev('document.querySelectorAll("#fvt-ga4").length'),0)
for(const width of [1920,1366,820,390]){run('set','viewport',String(width),'900');assert(ev('document.documentElement.scrollWidth<=innerWidth'),'overflow '+width);run('screenshot',`test-results/growth/dashboard-${width}.png`)}
run('select','select[name=preset]','7');run('wait','--fn','!document.querySelector("[data-growth-results]").textContent.includes("Rapporten laden")');assert(ev('window.calls.at(-1).includes("start=")'))
for(const scenario of ['empty','not_connected','error']){ev(`window.scenario=${JSON.stringify(scenario)}`);run('click','button[type=submit]');run('wait','--fn','!document.querySelector("[data-growth-results]").textContent.includes("Rapporten laden")');const text=ev('document.querySelector("[data-growth-results]").textContent');assert(text.includes(({empty:'nog geen campagneverkeer',not_connected:'Nog niet gekoppeld',error:'Test: rapport niet beschikbaar'})[scenario]))}
assert.equal(run('errors').trim(),'');console.log('PASS responsive 1920/1366/820/390, consent allow/deny, local tracking blocked, period, empty, disconnected, API error, no browser errors')
