import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const session=process.env.PERSONAL_TEST_SESSION||'personal'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:60000})
const evaluate=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v}
const checks=[];const ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
if(process.env.PERSONAL_HISTORY_ONLY!=='1'){
run('set','viewport','1366','900');run('click','[data-screen="selection"]');run('wait','#selection-bank')
const owned=evaluate('Array.from(document.querySelectorAll("[data-selection-player]"),e=>e.dataset.selectionPlayer)')
run('click','[data-screen="dashboard"]');run('wait','[data-plan-out]')
let plan=evaluate('({...document.querySelector("[data-plan-out]").dataset})')
ok(owned.includes(plan.planOut),'Sale recommendation belongs to own selection')
ok(!owned.includes(plan.planIn),'Purchase recommendation excludes owned players')
const text=evaluate('document.querySelector("[data-plan-out]").closest("article").innerText')
ok(text.includes('binnen je opgegeven budget'),'Transfer fits known budget')
ok(text.includes('transferstrafpunten'),'Transfer advice accounts for hit cost')
ok(text.includes('over speelronde'),'Transfer uses upcoming rounds')
run('click','[data-plan-out]');run('wait','.personal-plans')
ok(evaluate('document.querySelector(".personal-plans").innerText').includes('nog niet uitgevoerd'),'Saved plan is clearly not an executed transfer')
const next=evaluate('document.querySelector("[data-plan-out]")?.dataset.planOut ?? null')
ok(next!==plan.planOut,'Next advice excludes already planned outgoing player')
run('wait','--fn','document.querySelector("#account-status").textContent === "Opgeslagen"')
run('click','[data-screen="captain"]');run('click','[data-screen="dashboard"]');run('wait','.personal-plans')
ok(evaluate('document.querySelectorAll(".personal-plans [data-remove-plan]").length')>=1,'Plan preserved across navigation')
run('screenshot','test-results/personal-transfer.png')
run('click','[data-remove-plan]');run('wait','--fn','document.querySelector("#account-status").textContent === "Opgeslagen"')
}
run('eval','document.querySelector("[data-screen=history]").click()');run('eval','document.querySelector("[data-history-tab=results]").click()');run('wait','[data-history-result]')
run('eval','document.querySelector("[data-history-result]").click()');run('wait','.history-match-player')
ok(evaluate('document.querySelectorAll(".history-match-player").length')>20,'Historical played match shows real player rows')
ok(evaluate('Array.from(document.querySelectorAll(".history-match-player-minutes"),e=>e.textContent).every(t=>/\\d+/.test(t))'),'Historical minutes are visible')
ok(evaluate('Array.from(document.querySelectorAll(".history-match-player-points"),e=>e.textContent).every(t=>/pt/.test(t))'),'Historical fantasy points are visible')
ok(evaluate('document.querySelectorAll("[data-history-player]").length')>0,'Historical player profiles are linked')
run('screenshot','test-results/personal-history-desktop.png')
for(const [w,h] of [[1920,1080],[1366,900],[820,1180],[390,844]]){run('set','viewport',String(w),String(h));ok(!evaluate('document.documentElement.scrollWidth>innerWidth+1'),`Historical details responsive ${w}`);run('eval','document.querySelector(".history-match-details").scrollIntoView()');run('screenshot',`test-results/personal-history-${w}.png`)}
run('eval','document.querySelector("[data-history-player]").click()');ok(evaluate('document.querySelectorAll("[data-player-detail-tab]").length')>0,'Historical player link opens existing profile')
run('eval','document.querySelector("[data-history-player-close]").click()')
run('select','#history-season','2012-2013');run('eval','document.querySelector("[data-history-result]").click()')
ok(evaluate('document.querySelector(".history-match-no-data").textContent').includes('geen'),'Historical match without details reports missing source honestly')
const origin=evaluate('location.origin');run('open',`${origin}/studio/profile`);run('wait','#profile-form')
ok(!evaluate('document.documentElement.scrollWidth>innerWidth+1'),'Profile responsive mobile')
run('click','.profile-menu summary');ok(!evaluate('document.documentElement.scrollWidth>innerWidth+1'),'Account menu responsive mobile')
run('screenshot','test-results/personal-profile-mobile.png')
writeFileSync('test-results/personal-details-ui.json',JSON.stringify({checks},null,2));console.log(`${checks.length} details and advice UI checks passed`)
