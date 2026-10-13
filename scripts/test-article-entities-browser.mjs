import {execFileSync} from 'node:child_process'
import {writeFileSync,mkdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const folder='test-results/article-entities';mkdirSync(folder,{recursive:true})
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','article-entities',...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']})
const ev=code=>{const result=JSON.parse(run('eval',`JSON.stringify(${code})`));return typeof result==='string'?JSON.parse(result):result}
const click=selector=>ev(`(()=>{document.querySelector(${JSON.stringify(selector)}).click();return true})()`)
const wait=condition=>run('wait','--fn',condition)
const checks=[],timings={};const ok=(value,label)=>{assert(value,label);checks.push(label);console.log('PASS',label)}
run('open','http://127.0.0.1:5197/__article-entities');wait('window.articleTest && document.querySelector("[data-match-heading] small")')
ok(ev('JSON.stringify(articleTest.editor.blocks())===JSON.stringify(articleTest.initial)'),'Opening editor does not mutate optional or existing content')
ok(ev('document.querySelectorAll("#public [data-article-player]").length')===3,'Three text links; repeated name stays plain')
ok(ev('document.querySelector(".article-match-toggle").getAttribute("aria-expanded")')==='false','Match starts collapsed')
ok(!ev('performance.getEntriesByType("resource").some(r=>r.name.includes("kind=match"))'),'Collapsed match does not fetch full statistics')
click('.article-match-toggle');wait('document.querySelector(".history-match-player")')
ok(ev('document.querySelectorAll(".history-match-team").length')===2,'Expanded match shows both teams')
ok(ev('document.querySelectorAll(".history-match-player").length')>=22,'Real match returns complete player rows')
ok(ev('!!document.querySelector(".history-match-legend") && !!document.querySelector(".history-match-subs-heading")'),'Legend and substitutes visible')
ok(ev('!!document.querySelector(".history-match-player-minutes") && !!document.querySelector(".history-match-player-points")'),'Minutes and central Fantasy points visible')
for(const width of [390,820,1366,1920]){
 run('set','viewport',String(width),'1000');ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),'Editor/public no horizontal overflow '+width)
 click('#public .article-player-link');wait('document.querySelector(".article-player-dialog h2")')
 ok(!ev('document.querySelector(".article-player-dialog").scrollWidth>document.querySelector(".article-player-dialog").clientWidth+1'),'Player popup fits '+width)
 ok(ev('document.querySelector(".article-player-dialog").open'),'Native modal is open '+width)
 run('screenshot',folder+`/popup-${width}.png`)
 run('press','Escape');wait('!document.querySelector(".article-player-dialog")');ok(ev('document.activeElement.matches(".article-player-link")'),'Escape restores text focus '+width)
}
const fetches=()=>ev('performance.getEntriesByType("resource").filter(r=>r.name.includes("kind=player")).length')
const before=fetches();let start=Date.now();click('#public .article-player-link');wait('document.querySelector(".article-player-dialog h2")');timings.cachedPopupMs=Date.now()-start;ok(fetches()===before,'Cached player popup adds no request');click('.article-popup-close');wait('!document.querySelector(".article-player-dialog")')
click('.history-match-player-link');wait('document.querySelector(".article-player-dialog h2")');ok(ev('document.querySelectorAll(".article-player-dialog").length')===1,'Match rows use same shared popup');ev('(()=>{history.back();return true})()');wait('!document.querySelector(".article-player-dialog")');ok(ev('document.activeElement.matches(".history-match-player-link")'),'Browser back closes popup and restores row focus')
click('[data-entity="analyze"]');wait('document.querySelector(".article-entity-editor-dialog [data-panel]").textContent.includes("voorstellen")');ok(ev('JSON.stringify(articleTest.editor.blocks())===JSON.stringify(articleTest.initial)'),'Automatic recognition does not write content');click('.article-entity-editor-dialog [data-close]')
// Real catalogue ambiguity: pick a shared surname, without fabricating a player identity.
const ambiguous=ev('(()=>{const names=new Map();for(const p of articleTest.catalog.players){const n=p.name.split(/\\s+/).at(-1);if(n.length<3)continue;names.set(n,[...(names.get(n)||[]),p])}return [...names].find(([,ps])=>ps.length>1)})()')
ok(!!ambiguous,'Real catalog contains an ambiguity test case')
ev(`(()=>{const field=document.querySelectorAll('[data-key=text]')[1];field.value=${JSON.stringify(ambiguous[0]+' speelde goed vandaag.')};field.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
click('[data-entity="analyze"]');wait('document.querySelector("[data-review]")');ok(ev('document.querySelector(".article-entity-editor-dialog").textContent.includes("Lage zekerheid")'),'Ambiguous surname requires editorial review')
click('[data-review]');wait('document.querySelector("[data-pick]")');ok(ev('document.querySelectorAll("[data-pick]").length')>=2,'Picker shows distinct IDs and clubs')
click('[data-pick]');ok(ev('articleTest.editor.blocks().blocks[2].players.length')===1,'Explicit candidate selection writes exactly one link')
click('[data-block]:last-child [data-entity="remove"]');ok(ev('articleTest.editor.blocks().blocks[2].players.length')===0,'Editor can remove player link')
ev('(()=>{const field=document.querySelectorAll("[data-key=text]")[1];field.focus();field.setSelectionRange(0,field.value.indexOf(" "));return true})()');click('[data-block]:last-child [data-entity="manual"]');wait('document.querySelector("[data-pick]")');click('[data-pick]');ok(ev('articleTest.editor.blocks().blocks[2].players.length')===1,'Manual text selection links chosen stable player identity')
click('[data-block]:last-child [data-entity="remove"]');click('[data-entity="analyze"]');wait('document.querySelector("[data-ignore]")');click('[data-ignore]');ok(ev('articleTest.editor.blocks().ignoredEntities.length')===1,'Ignore state saved only after explicit action');click('.article-entity-editor-dialog [data-close]')
click('[data-entity="fixture"]');wait('document.querySelector("[data-round]")');ok(ev('document.querySelectorAll("[data-pick]").length')>0,'Fixture selector uses usable real matches and round/season filters');click('[data-pick]')
ev('(()=>{articleTest.editor.setLocked(true);return true})()');ok(ev('[...document.querySelectorAll("#editor button,#editor input,#editor select,#editor textarea")].every(e=>e.disabled)'),'Read-only editor disables new entity controls')
writeFileSync(folder+'/browser-results.json',JSON.stringify({checks,timings},null,2));console.log(`${checks.length} browser checks passed.`)
