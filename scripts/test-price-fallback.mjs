import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const session=process.env.PRICE_SESSION||'price-accept',run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:60000})
const click=s=>run('eval',`document.querySelector(${JSON.stringify(s)}).click()`),route='**/rest/v1/price_current*'
// Prime the current module instance after development hot reload, then let its
// real cache TTL expire. Never mutate application state to manufacture fallback.
click('[data-screen="settings"]');click('[data-screen="prices"]');run('wait','[data-pp-player]');console.log('Valid cache primed; waiting for its normal 60-second TTL')
await new Promise(resolve=>setTimeout(resolve,31000));await new Promise(resolve=>setTimeout(resolve,31000))
try{
 run('network','route',route,'--abort');click('[data-screen="settings"]');run('wait','--fn','Boolean(document.querySelector("#settings-status"))');click('[data-screen="prices"]');run('wait','--fn','document.querySelector(".pp-fresh")?.textContent.includes("niet bereikbaar")')
 const count=Number(run('eval','document.querySelectorAll(".pp-table [data-pp-player]").length').trim());assert(count>500);console.log('Last valid predictions remain visible during isolated price-cache failure')
 click('[data-screen="settings"]');run('wait','--fn','Boolean(document.querySelector("#settings-status"))');console.log('Other Studio screen remains usable during predictor failure')
}finally{run('network','unroute',route)}
click('[data-screen="prices"]');run('wait','--fn','document.querySelector(".pp-fresh")?.textContent.includes("Laatste gegevens beschikbaar")');console.log('Predictor recovers after connectivity returns');writeFileSync('test-results/price-fallback.json',JSON.stringify({lastValidCache:true,otherScreen:true,recovered:true},null,2))
