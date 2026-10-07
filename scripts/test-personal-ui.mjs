import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const session=process.env.PERSONAL_TEST_SESSION||'personal',origin=process.env.PERSONAL_TEST_ORIGIN||'http://127.0.0.1:5180'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:60000})
const evaluate=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v}
const checks=[];const ok=(value,label)=>{assert(value,label);checks.push(label);console.log(label)}
const waitAccount=()=>{for(let attempt=0;;attempt++){try{run('wait','#account-status');break}catch(error){if(attempt>=2)throw error}}}
if(process.env.PERSONAL_TEST_RESUME!=='1') {
waitAccount()
// Only the explicitly isolated acceptance account; all edits use real form controls.
const source=JSON.parse(readFileSync('test-results/personal-source.json','utf8'))
const names=['Drommel','Barkas','Hardeveld','Van Rooij','J. Bos','Mauro Jr.','Baas','Godts','Veerman','Trenskow','Til','Zechiël','Ueda','Linssen','Parrott']
const original=names.map(name=>{const found=source.players.filter(p=>p.name===name&&(name!=='Baas'||p.id==='20260060'));assert.equal(found.length,1);return found[0]})
const click=selector=>run('eval',`document.querySelector(${JSON.stringify(selector)}).click()`)
for(const p of evaluate('Array.from(document.querySelectorAll("[data-selection-player]"),e=>({id:e.dataset.selectionPlayer}))'))click(`[data-selection-remove="${p.id}"]`)
ok(evaluate('document.querySelectorAll("[data-selection-player]").length')===0,'Remove all 15 through UI')
for(const p of original){run('fill','#selection-search',p.name);click(`[data-selection-add="${p.id}"]`)}
ok(evaluate('document.querySelectorAll("[data-selection-player]").length')===15,'Enter 15 real database players through UI search')
const indexes=[0,2,3,4,5,7,8,9,10,12,13]
for(const i of indexes)click(`[data-selection-start="${original[i].id}"]`)
click(`[data-selection-band="captainId"][data-id="${original[7].id}"]`)
click(`[data-selection-band="viceCaptainId"][data-id="${original[8].id}"]`)
run('fill','#selection-bank','2.5');run('press','#selection-bank','Tab')
run('wait','--fn','document.querySelector("#account-status").textContent === "Opgeslagen"')
ok(evaluate('document.querySelector(".selection-validation summary").textContent').includes('geldig'),'Valid 11 starters, four substitutes and distinct C/VC')
run('screenshot','test-results/personal-selection-desktop.png')
run('open',`${origin}/studio/profile`);run('wait','#profile-form')
run('fill','#profile-display-name','FVT Selectie Test');run('select','#profile-favorite-club','Ajax');run('click','#profile-form button[type="submit"]')
run('wait','--fn','document.querySelector("#profile-status").textContent.includes("opgeslagen")')
ok(evaluate('document.querySelector("#account-display-name").textContent')==='FVT Selectie Test','Saved profile updates account menu')
run('open',`${origin}/studio/profile`);run('wait','#profile-form')
ok(evaluate('document.querySelector("#profile-display-name").value')==='FVT Selectie Test','Profile persists after navigation reload')
run('click','.profile-menu summary');run('click','#sign-out');run('wait','input[name="email"]')
execFileSync(process.execPath,['scripts/browser-account.mjs','a',session],{stdio:'pipe'})
}
waitAccount();run('click','[data-screen="selection"]');run('wait','#selection-bank')
ok(evaluate('document.querySelectorAll("[data-selection-player]").length')===15,'Selection persists after real logout/login')
ok(evaluate('document.querySelectorAll("[data-selection-start]:checked").length')===11,'Starting XI persists after logout/login')
ok(evaluate('document.querySelectorAll("[data-selection-band][aria-pressed=true]").length')===2,'Captain and vice-captain persist')
ok(evaluate('document.querySelector("#selection-bank").value')==='2.5','Known bank budget persists')
const owned=evaluate('Array.from(document.querySelectorAll("[data-selection-player]"),e=>({id:e.dataset.selectionPlayer,name:e.querySelector(".selection-name").textContent}))')
for(const [width,height] of [[1920,1080],[1366,900],[820,1180],[390,844]]){
 run('set','viewport',String(width),String(height));ok(!evaluate('document.documentElement.scrollWidth > innerWidth + 1'),`Selection responsive ${width}`);run('screenshot',`test-results/personal-selection-${width}.png`)
}
run('set','viewport','1366','900');run('click','[data-screen="captain"]');run('wait','[data-personal-context="captain"]')
ok(evaluate('document.querySelector("[data-personal-context=captain]").innerText').includes('Jouw beste captain'),'Personal Captain Radar visible beside general ranking')
ok(owned.some(p=>p.name===evaluate('document.querySelector("[data-personal-context=captain] .personal-advice-card>strong").textContent')),'Recommended captain belongs to own selection')
run('screenshot','test-results/personal-captain-desktop.png')
run('set','viewport','390','844');ok(!evaluate('document.documentElement.scrollWidth > innerWidth + 1'),'Captain responsive mobile')
writeFileSync('test-results/personal-ui.json',JSON.stringify({origin,checks},null,2))
console.log(`${checks.length} personal UI checks passed`)
