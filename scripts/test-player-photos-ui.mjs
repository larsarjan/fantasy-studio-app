import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const session=process.env.PHOTO_SESSION||'photos',origin=process.env.PHOTO_ORIGIN||'http://127.0.0.1:5180'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:60000})
const ev=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v}
const checks=[],metrics=[]
const ok=(value,label)=>{assert(value,label);checks.push(label);console.log(label)}
run('set','viewport','1366','900')
run('open',origin+'/studio/prices');run('wait','[data-pp-player]')
run('eval','document.querySelector(".pp-table").scrollIntoView({block:"center"})')
run('wait','--fn','document.querySelector(".has-player-photo")!==null')
const first=ev('({avatars:document.querySelectorAll("[data-player-photo]").length,loaded:document.querySelectorAll(".has-player-photo").length,requests:performance.getEntriesByType("resource").filter(r=>r.name.includes("/player-photos/")).map(r=>({url:r.name,bytes:r.transferSize,encoded:r.encodedBodySize}))})')
metrics.push({screen:'prices',...first})
writeFileSync('test-results/player-photos-performance.json',JSON.stringify({origin,...first},null,2))
ok(first.avatars>500,'All real ESPN rows use the central renderer')
ok(first.loaded>0&&first.requests.length<80,'Only visible/nearby photos requested, not hundreds of rows')
ok(first.requests.every(r=>/-thumbnail.webp$|-detail.webp$/.test(r.url)),'Only optimized photo variants are fetched')
const screens=process.env.PHOTO_SCREENS?.split(',') || (process.env.PHOTO_QUICK==='1'?['prices','players','captain']:['prices','players','compare','captain','differentials','optimizer','dreamteam','analysis','selection'])
for(const screen of screens){
 run('eval',`document.querySelector('[data-screen="${screen}"]').click()`)
 run('wait','--fn',`location.pathname.endsWith('/${screen}')&&document.querySelector('#page-content').textContent.length>30`)
 for(const [w,h] of [[1920,1080],[1366,900],[820,1180],[390,844]]){
  run('set','viewport',String(w),String(h))
  run('eval','(document.querySelector("#page-content [data-player-photo]")||document.querySelector("#page-content")).scrollIntoView({block:"center"})')
  const status=ev('({overflow:document.documentElement.scrollWidth>innerWidth+1,avatars:document.querySelectorAll("[data-player-photo]").length,badSizes:Array.from(document.querySelectorAll("[data-player-photo] img")).some(n=>!n.width||!n.height),broken:Array.from(document.querySelectorAll(".has-player-photo img")).some(n=>n.complete&&!n.naturalWidth)})')
  ok(!status.overflow,`${screen}: no viewport overflow at ${w}px`)
  ok(!status.badSizes&&!status.broken,`${screen}: fixed image dimensions and no broken image icons at ${w}px`)
  writeFileSync('test-results/player-photos-ui.json',JSON.stringify({origin,checks,metrics},null,2))
  if(w===390||w===1366)run('screenshot',`test-results/photos-${screen}-${w}.png`)
 }
}
writeFileSync('test-results/player-photos-ui.json',JSON.stringify({origin,checks,metrics},null,2))
console.log(JSON.stringify({checks:checks.length,firstView:metrics[0]},null,2))
