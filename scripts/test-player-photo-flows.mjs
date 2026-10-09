import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const session=process.env.PHOTO_SESSION||'photos',origin=process.env.PHOTO_ORIGIN||'http://127.0.0.1:5180'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:60000})
const ev=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v}
const checks=[],ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
run('set','viewport','1366','900')
run('eval','document.querySelector("[data-screen=compare]").click()')
for(const [slot,name] of [[0,'Drommel'],[1,'Zechiël']]) {
 run('fill',`.analysis-player-search[data-slot="${slot}"]`,name)
 run('wait',`[data-suggestions="${slot}"] [data-select-player]`)
 run('click',`[data-suggestions="${slot}"] [data-select-player]`)
}
run('eval','document.querySelector(".analysis-player-card").scrollIntoView({block:"center"})')
run('wait','.analysis-avatar.has-player-photo')
ok(ev('document.querySelectorAll(".analysis-avatar[data-player-photo]").length')===2,'Compare selected real players uses two central photos')
for(const [w,h]of [[1920,1080],[1366,900],[820,1180],[390,844]]){
 run('set','viewport',String(w),String(h));run('eval','document.querySelector(".analysis-player-card").scrollIntoView({block:"center"})')
 ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),`Selected comparison photos responsive at ${w}px`)
 run('screenshot',`test-results/photos-compare-selected-${w}.png`)
}
run('set','viewport','1366','900');run('eval','document.querySelector("[data-screen=players]").click()')
run('wait','[data-player-key]');run('eval','document.querySelector("[data-player-key]").click()')
run('wait','.player-detail-photo[data-player-photo]')
run('eval','document.querySelector(".player-detail-photo").scrollIntoView({block:"center"})');run('wait','.player-detail-photo.has-player-photo')
ok(ev('document.querySelector(".player-detail-photo img").src').endsWith('-detail.webp'),'Player detail loads larger optimized variant')
run('screenshot','test-results/photos-player-detail.png')
if(origin.includes('127.0.0.1')) {
 // In-memory browser fixture only. Uses a real identity; never writes backend data.
 run('eval',`(async()=>{const photos=await import('/src/services/playerPhotos.js');photos.setPlayerPhotoRecords([{player_key:'studio:2026/2027:20260001',source_status:'approved',source_enabled:true,source_url:'/player-photos/acceptance-missing.webp'}]);const box=document.createElement('section');box.id='photo-acceptance';const parser=new DOMParser();box.append(parser.parseFromString(photos.renderPlayerAvatar({id:'20260001',name:'Drommel'},{size:64})+photos.renderPlayerAvatar({id:'unmapped',name:'Ontbrekende mapping'},{size:64}),'text/html').body);document.querySelector('#page-content').prepend(box);box.scrollIntoView({block:'center'})})()`)
 run('wait','#photo-acceptance .has-player-photo')
 ok(ev('document.querySelector("#photo-acceptance [data-photo-source=local]")!==null'),'Broken central image falls back to the real local photo in browser')
 ok(ev('document.querySelectorAll("#photo-acceptance img").length')===1,'Unmapped identity renders initials without a broken image')
 ok(ev('document.querySelector("#photo-acceptance img").naturalWidth')>0,'Fallback photo is decoded successfully')
 run('eval',`(async()=>{(await import('/src/services/playerPhotos.js')).setPlayerPhotoRecords([]);document.querySelector('#photo-acceptance').remove()})()`)
}
run('open',origin+'/ranglijsten');run('wait','.prom-person a')
run('eval','document.querySelector(".prom-person a").click()');run('wait','.prom-footballer [data-player-photo]')
run('eval','document.querySelector(".prom-pitch").scrollIntoView({block:"center"})');run('wait','.prom-footballer .has-player-photo')
ok(ev('document.querySelectorAll(".prom-footballer [data-player-photo]").length')===15,'Prominent team resolves all 15 footballers with explicit ESPN IDs')
ok(ev('Array.from(document.querySelectorAll(".prom-footballer [data-player-photo]")).every(n=>n.dataset.playerPhoto.startsWith("espn:"))'),'Manager account IDs are never used for footballer photos')
for(const [w,h]of [[1366,900],[390,844]]){run('set','viewport',String(w),String(h));run('eval','document.querySelector(".prom-pitch").scrollIntoView({block:"center"})');ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),`Prominent team photos responsive at ${w}px`);run('screenshot',`test-results/photos-prominent-${w}.png`)}
writeFileSync('test-results/player-photo-flows.json',JSON.stringify({origin,checks},null,2));console.log(`${checks.length} photo flow checks passed`)
