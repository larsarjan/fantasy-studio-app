import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const origin=process.env.REGISTRATION_ORIGIN||'http://127.0.0.1:5194',folder='test-results/registration-closed',checks=[]
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','registration-closed',...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']})
const ev=code=>{const r=JSON.parse(run('eval',`JSON.stringify(${code})`));return typeof r==='string'?JSON.parse(r):r},ok=(v,l)=>{assert(v,l);checks.push(l);console.log('PASS',l)}
mkdirSync(folder,{recursive:true});run('open',origin+'/studio/dashboard');run('wait','--fn','!!document.querySelector("#registration-title")')
for(const width of [390,820,1366,1920]){
 run('set','viewport',String(width),'1100');ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),'Login fits '+width)
 ok(!ev('!!document.querySelector("[data-auth=signup]")'),'Signup unavailable '+width)
 ok(ev('document.querySelector("#auth-form [type=submit]").textContent.includes("Inloggen")'),'Login remains primary '+width)
 ok(!ev('document.querySelector("#auth-form [type=submit]").disabled'),'Login enabled '+width)
 run('screenshot',`${folder}/${origin.startsWith('https')?'live':'local'}-${width}.png`)
}
ev('document.querySelector("[data-auth=forgot]").click()');ok(ev('document.querySelector("#auth-form [type=submit]").textContent.includes("herstelmail")'),'Recovery form reachable');ok(!ev('!!document.querySelector("#auth-password")'),'Recovery asks only for email')
ev('document.querySelector("[data-auth=login]").click()');ok(ev('!!document.querySelector("#registration-title")'),'Return to login preserves notice')
run('open',origin+'/admin/nieuws');run('wait','--fn','!!document.querySelector("#auth-form")');ok(ev('document.querySelector("#auth-form [type=submit]").textContent.includes("Inloggen")'),'Admin login route available')
writeFileSync(folder+'/'+(origin.startsWith('https')?'live':'local')+'-browser.json',JSON.stringify({origin,checks,count:checks.length},null,2));console.log(checks.length+' browser checks passed')
