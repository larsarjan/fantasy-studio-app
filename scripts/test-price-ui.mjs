import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const origin=process.env.PRICE_ORIGIN||'http://127.0.0.1:5180',session=process.env.PRICE_SESSION||'fvt-editor'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:60000})
const ev=code=>{const r=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof r==='string'?JSON.parse(r):r}
const click=selector=>run('eval',`document.querySelector(${JSON.stringify(selector)}).click()`)
const checks=[],timings=[],ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
if(process.env.PRICE_UI_ONLY!=='1'){
if(process.env.PRICE_NO_RELOAD!=='1')run('open',origin+'/studio/dashboard');run('wait','#account-status')
ok(!ev('performance.getEntriesByType("resource").some(r=>/pricePrediction|priceModel|price_snapshots/.test(r.name))'),'Dashboard does not fetch price code or historical snapshots')
for(const screen of ['dashboard','players','compare','fixtures','history','analysis','captain','differentials','optimizer','dreamteam','input','settings']){
 const start=Date.now();click(`[data-screen="${screen}"]`);run('wait','--fn',`location.pathname.endsWith('/${screen}')&&document.querySelector('#page-content').textContent.length>30`)
 const elapsed=Date.now()-start;timings.push({screen,ms:elapsed});ok(!ev('document.querySelector("#page-content").textContent.includes("Deze pagina bestaat niet")'),`Existing screen ${screen} renders`)
}
click('[data-screen="prices"]');}
run('wait','[data-pp-player]');run('wait','--fn','!document.querySelector(".pp-history").textContent.includes("Historie laden")')
ok(ev('document.querySelectorAll(".pp-table [data-pp-player]").length')>500,'Real ESPN player cache renders')
ok(ev('document.querySelector(".pp-fresh").textContent').includes('ESPN'),'Source/predictor/snapshot freshness shown')
ok(!ev('performance.getEntriesByType("resource").some(r=>/price_snapshots|price_model_calibration|price-archive/.test(r.name))'),'Browser never downloads raw snapshots or model state')
for(const tab of ['rise','fall','all','likely','near']){click(`[data-pp-tab="${tab}"]`);ok(ev(`document.querySelector('[data-pp-tab="${tab}"]').getAttribute('aria-pressed')`)==='true',`Prediction filter ${tab}`)}
click('[data-pp-tab="all"]');run('fill','[data-pp-search]','Dest');ok(ev('document.querySelectorAll(".pp-table [data-pp-player]").length')===1,'Search filters real player');click('.pp-table [data-pp-player]');ok(ev('document.querySelector(".pp-detail h3").textContent')==='Dest','Player detail selection')
ok(ev('document.querySelector(".pp-detail").textContent').includes('Ownership referentie'),'Model explanation exposes measurable inputs')
ok(ev('document.querySelector(".pp-detail").textContent').includes('/100'),'Numeric confidence shown independently');ok(ev('document.querySelector(".pp-detail").textContent').includes('Vergelijkbaar profiel'),'Comparable history shown separately')
run('fill','[data-pp-search]','');run('select','[data-pp-sort]','name');const names=ev('Array.from(document.querySelectorAll(".pp-table [data-pp-player]"),e=>e.textContent)');assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,'nl')));ok(true,'Name sort')
for(const period of ['season','previous','current','24h']){run('select','[data-pp-period]',period);run('wait','--fn','!document.querySelector(".pp-history").textContent.includes("Historie laden")');ok(ev('document.querySelector("[data-pp-period]").value')===period,`History period ${period}`);if(period==='season'){run('wait','--fn','document.querySelectorAll(".pp-history > .pp-scroll tbody tr").length>1');ok(ev('document.querySelectorAll(".pp-history > .pp-scroll tbody tr").length')===25,'History paginates actual price changes');ok(ev('document.querySelector(".pp-history").textContent').includes('Walk-forward'),'Historical reconstructions distinguished from live predictions');click('[data-pp-next]');run('wait','--fn','document.querySelector(".pp-pagination span").textContent==="Pagina 2"');ok(true,'History next page')}}
for(const [w,h]of [[1920,1080],[1366,900],[820,1180],[390,844]]){run('set','viewport',String(w),String(h));ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),`Responsive without viewport overflow ${w}`);run('eval','document.querySelector("#price-prediction").scrollIntoView({block:"start"})');run('screenshot',`test-results/prices-${w}.png`)}
run('set','viewport','1366','900');writeFileSync('test-results/price-ui.json',JSON.stringify({origin,checks,timings},null,2));console.log(`${checks.length} UI checks passed`)
