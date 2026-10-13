import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','performance-live',...args],{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']})
const evaluate=code=>{const v=JSON.parse(run('eval','JSON.stringify('+code+')'));return typeof v==='string'?JSON.parse(v):v}
const source=JSON.parse(readFileSync('test-results/performance/parity-server.json','utf8'))
const names=['Drommel','Barkas','Hardeveld','Van Rooij','J. Bos','Mauro Jr.','Baas','Godts','Veerman','Trenskow','Til','Zechi\u00ebl','Ueda','Linssen','Parrott']
const players=names.map(name=>{const found=source.players.filter(p=>p.name===name&&(name!=='Baas'||p.id==='20260060'));assert.equal(found.length,1,name);return found[0]})
run('open','https://fantasyvoetbaltalk.nl/studio/selection');run('wait','#selection-search')
assert.equal(evaluate('document.querySelectorAll("[data-selection-player]").length'),0)
const click=selector=>run('eval',`document.querySelector(${JSON.stringify(selector)}).click()`)
for(const p of players){run('fill','#selection-search',p.name);click(`[data-selection-add="${p.id}"]`)}
for(const i of [0,2,3,4,5,7,8,9,10,12,13])click(`[data-selection-start="${players[i].id}"]`)
click(`[data-selection-band="captainId"][data-id="${players[7].id}"]`);click(`[data-selection-band="viceCaptainId"][data-id="${players[8].id}"]`)
run('fill','#selection-bank','2.5');run('press','#selection-bank','Tab');run('wait','--fn','document.querySelector("#account-status").textContent === "Opgeslagen"')
run('open','https://fantasyvoetbaltalk.nl/studio/selection');run('wait','#selection-bank')
assert.equal(evaluate('document.querySelectorAll("[data-selection-player]").length'),15);assert.equal(evaluate('document.querySelectorAll("[data-selection-band][aria-pressed=true]").length'),2);assert.equal(evaluate('document.querySelector("#selection-bank").value'),'2.5')
const rows=[]
for(const screen of ['dashboard','players','captain']){const start=performance.now();run('open','https://fantasyvoetbaltalk.nl/studio/'+screen);run('wait','--fn',"Boolean(document.querySelector('#page-content')?.textContent.trim())");rows.push({screen,ms:performance.now()-start})}
const own=evaluate('document.querySelector("[data-personal-context=captain] .personal-advice-card>strong")?.textContent');assert(players.some(p=>p.name===own),'Captain must belong to selection')
writeFileSync('test-results/performance/selection-live.json',JSON.stringify({players:15,bands:2,persisted:true,ownCaptain:true,rows},null,2));console.log(JSON.stringify(rows))
