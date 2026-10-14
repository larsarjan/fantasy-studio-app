import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','article-entities',...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']})
const ev=code=>{const r=JSON.parse(run('eval',`JSON.stringify(${code})`));return typeof r==='string'?JSON.parse(r):r}
run('open','http://127.0.0.1:5197/__article-entities');run('wait','--fn','!!window.articleTest')
run('click','#modal-preview');run('wait','--fn','document.querySelector(".cms-preview-dialog")?.dataset.articleEntitiesBound==="true"')
run('click','.cms-preview-dialog .article-player-link');run('wait','--fn','!!document.querySelector(".article-player-dialog h2")')
run('press','Escape');run('wait','--fn','!document.querySelector(".article-player-dialog")')
assert.equal(ev('!!document.querySelector(".cms-preview-dialog[open]")'),true)
assert.equal(ev('document.activeElement.matches(".cms-preview-dialog .article-player-link")'),true)
console.log('PASS Nested popup Escape preserves CMS preview and restores focus')
