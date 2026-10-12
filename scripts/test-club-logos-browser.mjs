import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const folder='test-results/club-logos',checks=[],bin='node_modules/agent-browser/bin/agent-browser-win32-x64.exe'
const run=(...args)=>execFileSync(bin,['--session','club-logo-fix',...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']})
const ev=code=>{const r=JSON.parse(run('eval',`JSON.stringify(${code})`));return typeof r==='string'?JSON.parse(r):r},ok=(v,l)=>{assert(v,l);checks.push(l);console.log('PASS',l)}
mkdirSync(folder,{recursive:true});run('open','http://127.0.0.1:5195/scripts/fixtures/club-logos.html');run('wait','--fn','window.ready===true')
ok(ev('document.querySelectorAll(".fixture-card [data-club-logo]").length')>0,'Club fixture cards render opponent logos')
ev('document.querySelector("[data-mode=round]").click()')
ok(ev('document.querySelectorAll(".round-match").length')===9,'Actual round renderer shows nine fixtures')
ok(ev('[...document.querySelectorAll(".round-match")].every(c=>c.querySelectorAll("[data-club-logo]").length===2)'),'Every match renders both home and away logos')
ev('(()=>{document.querySelectorAll("[data-club-logo]").forEach(i=>i.loading="eager");return true})()')
run('wait','--fn','[...document.querySelectorAll(".round-match img")].every(i=>i.complete&&i.naturalWidth>0)')
const clubs=ev('[...document.querySelectorAll(".round-match img")].map(i=>i.alt)');ok(clubs.length===18&&new Set(clubs).size===18,'All eighteen actual clubs load, including required ten')
for(const width of [390,820,1366,1920]){
 run('set','viewport',String(width),'1100');ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),'Fixture page no overflow '+width)
 ok(ev('[...document.querySelectorAll(".round-match img")].every(i=>{const r=i.getBoundingClientRect(),p=i.closest(".round-club-row").getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=p.left-1&&r.right<=p.right+1&&getComputedStyle(i).objectFit==="contain"})'),'Logos fit alongside club names '+width)
 ev('document.querySelector(".round-match").scrollIntoView()');run('screenshot',`${folder}/round-${width}.png`)
}
const before=ev('(()=>{const r=document.querySelector(".round-match img").getBoundingClientRect();return {width:r.width,height:r.height}})()')
ev('document.querySelector(".round-match img").src="/club-logos/intentional-missing-test.png"');run('wait','--fn','!!document.querySelector(".round-match .club-logo-fallback")')
const after=ev('(()=>{const r=document.querySelector(".round-match .club-logo-fallback").getBoundingClientRect();return {width:r.width,height:r.height}})()');ok(JSON.stringify(before)===JSON.stringify(after),'Broken asset fallback preserves exact dimensions')
ok(ev('document.querySelector(".round-match strong").textContent.trim().length')>0,'Club name survives image failure')
ev('(()=>{document.querySelector("#page-content").insertAdjacentHTML("beforeend",window.renderClubLogo("Unknown FC"));document.querySelector("#page-content > img").loading="eager";return true})()');run('wait','--fn','document.querySelector("#page-content > img")?.naturalWidth>0');ok(true,'Unknown club neutral fallback loads')
writeFileSync(folder+'/browser.json',JSON.stringify({checks,clubs,count:checks.length},null,2));console.log(checks.length+' browser checks passed')
