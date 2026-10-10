import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','availability-local',...args],{encoding:'utf8',timeout:65000})
const source=JSON.parse(readFileSync('test-results/personal-source.json','utf8')),player=source.players[3]
run('click','[data-mode=admin]');run('wait','--fn','document.body.dataset.ready==="admin"')
run('click','[data-add=suspension]');run('fill','#av-player-search',player.name);run('select','dialog [name=player_id]',String(player.id))
run('fill','dialog [name=reason]','Uitsluitend lokale schorsingstest');run('fill','dialog [name=expected_return_date]','2026-12-01')
// Native browser driver does not consistently fill Chromium's segmented date input.
run('eval',`(()=>{const input=document.querySelector('dialog [name=expected_return_date]');input.value='2026-12-01';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
run('fill','dialog [name=source_name]','Lokale officiële bron');run('fill','dialog [name=source_url]','https://example.com/official')
run('fill','dialog [name=notes]','Interne notitie voor lokale acceptatie');run('check','dialog [name=is_manual_override]')
run('click','dialog [type=submit]');run('wait','--fn','!document.querySelector("dialog")')
run('fill','#av-search',String(player.id))
const text=JSON.parse(run('eval','document.querySelector(".availability-card").textContent'))
assert(text.includes('GESCHORST')&&text.includes('Lokale officiële bron')&&text.includes('override: ja'))
run('click',`[data-edit="${player.id}"]`)
const saved=JSON.parse(run('eval','JSON.stringify({notes:document.querySelector("dialog [name=notes]").value,date:document.querySelector("dialog [name=expected_return_date]").value})'))
const values=typeof saved==='string'?JSON.parse(saved):saved
assert.equal(values.notes,'Interne notitie voor lokale acceptatie');assert.equal(values.date,'2026-12-01')
run('click','dialog [data-cancel]')
writeFileSync('test-results/availability/add-ui.json',JSON.stringify({checks:['New suspension created from searched central player','Source and manual override persisted','Internal note and expected return survived reopening']},null,2))
console.log('3 new-status UI checks passed; local database only.')
