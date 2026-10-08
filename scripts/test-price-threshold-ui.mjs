import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const session=process.env.PRICE_SESSION||'price-accept'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:60000})
const ev=code=>{const r=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof r==='string'?JSON.parse(r):r}
const click=s=>run('eval',`document.querySelector(${JSON.stringify(s)}).click()`)
run('wait','[data-pp-player]');click('[data-pp-tab="all"]')
const examples=[]
for(const name of ['Berkhout','Oyen','Binder','Bossin','Flataker','Read','Tengstedt']){
 run('fill','[data-pp-search]',name)
 const ids=ev('Array.from(document.querySelectorAll(".pp-table [data-pp-player]"),n=>n.dataset.ppPlayer)');assert(ids.length>0,`${name} exists in real cache`)
 for(const id of ids){
  click(`.pp-table [data-pp-player="${id}"]`)
  const r=ev('(()=>{const d=document.querySelector(".pp-detail"),p=d.querySelector(".pp-pressure-hero");return {name:d.querySelector("h3").textContent,club:d.querySelector("header p").textContent,className:d.className,primary:p.textContent,remaining:d.querySelector(".pp-remaining-hero").textContent,chance:d.querySelector(".pp-probability").textContent,bar:!!p.querySelector(".pp-bar")}})()')
  assert(r.primary.includes('Threshold-confidence'));assert(r.primary.includes('Netto transferdruk'));assert(r.primary.includes('Signaalsterkte'))
  if(!r.className.includes('pp-quality-valid')){assert(!r.bar);assert(!/\b(?:250|500)%/.test(r.primary));assert(!/Zeer sterke|Sterke (?:stijgings|dalings)druk/.test(r.primary));assert(!r.remaining.includes('grens bereikt'));assert(r.primary.includes('Drempel onzeker'))}
  examples.push({id,...r});console.log(`${name} (${r.club}): quality-qualified rendering verified`)
 }
}
run('fill','[data-pp-search]','');click('[data-pp-tab="near"]')
assert(ev('Array.from(document.querySelectorAll(".pp-table tr[data-pp-direction]")).every(r=>r.classList.contains("pp-quality-valid"))'))
const nearCount=ev('document.querySelectorAll(".pp-table [data-pp-player]").length')
if(!nearCount){assert(ev('document.querySelector(".pp-near-section").textContent.includes("Nog geen voldoende onderbouwde")'));console.log('Honest empty qualified-threshold state verified')}
const kpis=ev('Array.from(document.querySelectorAll(".pp-kpis .pp-metric"),n=>n.textContent)')
assert(kpis.some(s=>s.includes('Materiële druk')));assert(kpis.some(s=>s.includes('Alleen gekwalificeerde drempels')))
click('[data-pp-tab="all"]');writeFileSync('test-results/threshold-live-ui.json',JSON.stringify({url:ev('location.href'),examples,nearCount,kpis},null,2));console.log(`${examples.length} real player variants verified; threshold filter and material KPI wording passed`)
