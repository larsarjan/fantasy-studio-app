import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
const run=(...a)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','fixture-windows',...a],{encoding:'utf8',timeout:60000,stdio:a[0]==='open'?['ignore','ignore','ignore']:['ignore','pipe','pipe']})
const ev=c=>{const r=JSON.parse(run('eval',`JSON.stringify(${c})`));return typeof r==='string'?JSON.parse(r):r}
run('open','http://127.0.0.1:5198/__fixtures');run('wait','--fn','!!window.ready')
const count=()=>ev('document.querySelectorAll("#fixture-personal-context .personal-context").length')
assert.equal(count(),1)
ev('(window.originalAdvice=document.querySelector("#fixture-personal-context .personal-context"),true)')
run('select','#fixture-club','PSV');run('select','#fixture-round','9')
const text=()=>ev('document.querySelector("#fixture-content").innerText')
let content=text(),last=-1
for(const name of ['RB Leipzig','ADO','FC Porto','Feyenoord']){const index=content.indexOf(name);assert.ok(index>last,name);last=index}
const schema=ev('document.querySelector(".average-score>strong").textContent')
run('select','#fixture-start-mode','now');assert.ok(!text().includes('RB Leipzig'))
assert.equal(ev('document.querySelector("#fixture-round").disabled'),true)
assert.equal(ev('document.querySelector(".average-score>strong").textContent'),schema)
run('select','#fixture-start-mode','round');assert.equal(ev('document.querySelector("#fixture-round").value'),'9');assert.ok(text().includes('RB Leipzig'))
for(const club of ['Feyenoord','Ajax']){run('select','#fixture-club',club);assert.ok(ev('document.querySelectorAll("[data-europe-context-id]").length')>0,club)}
const requests=()=>ev('performance.getEntriesByType("resource").filter(x=>x.initiatorType==="fetch"||x.initiatorType==="xmlhttprequest").length')
const before=requests()
for(let i=0;i<10;i++)for(const mode of ['round','compare','club']){
 run('click',`.fixture-mode[data-mode="${mode}"]`);assert.equal(count(),1)
 assert.equal(ev('window.originalAdvice===document.querySelector("#fixture-personal-context .personal-context")'),true)
}
assert.equal(requests(),before,'tab changes must not refetch data')
run('click','.fixture-mode[data-mode="compare"]');run('select','#compare-club-group','top3');assert.ok(text().includes('RB Leipzig'))
for(const width of [1920,1366,820,390]){run('set','viewport',String(width),'1000');for(const mode of ['club','round','compare']){run('click',`.fixture-mode[data-mode="${mode}"]`);assert.ok(ev('document.documentElement.scrollWidth<=innerWidth'),`${width} ${mode} overflow`)}}
assert.equal(run('errors').trim(),'')
console.log('PASS: chronology, start modes, round/schema, Ajax/Feyenoord, top3, 30 switches/same node/no refetch, 4 widths x 3 modes, no errors')
