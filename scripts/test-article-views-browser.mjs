// Local-only browser acceptance; start test-article-views-ui-server.mjs first.
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const bin='node_modules/agent-browser/bin/agent-browser-win32-x64.exe',folder='test-results/article-views',checks=[]
let session='article-views-ui'
const run=(...args)=>execFileSync(bin,['--session',session,...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']})
const ev=code=>{const r=JSON.parse(run('eval',`(async()=>JSON.stringify(await (${code})))()`));return typeof r==='string'?JSON.parse(r):r}
const ok=(value,label)=>{assert(value,label);checks.push(label);console.log('PASS',label)}
const open=path=>{run('open','http://localhost:5193/fixture'+path);run('wait','--fn','window.ready===true');run('wait','500')}
const stats=()=>ev('(async()=>await(await fetch("/__stats")).json())()')
mkdirSync(folder,{recursive:true})
open('');ok(ev('document.querySelector("[data-article-views]").textContent')==='1 weergaven','First browser visit counted')
open('');ok(stats().total_views===1,'Refresh deduplicated')
ev('(()=>{for(let i=0;i<5;i++)window.remount();return true})()');run('wait','300');ok(stats().total_views===1,'SPA remount deduplicated')
ev('document.querySelector("#preview").click()');ok(ev('!!document.querySelector("dialog[open]")'),'Existing CMS preview opens');ok(stats().total_views===1,'CMS preview does not count');ev('document.querySelector("dialog [data-close]").click()')
for(const width of [390,820,1366,1920]){
 run('set','viewport',String(width),'1000');ev('(async()=>{await refreshStats();return true})()')
 ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),'Metadata and CMS statistics fit '+width)
 ok(ev('document.querySelector("#stats").textContent.includes("Unieke sessies")'),'CMS unique sessions shown '+width)
 run('screenshot',`${folder}/views-${width}.png`)
}
session='article-views-second';open('');ok(stats().total_views===2&&stats().unique_views===2,'Separate browser session counted once')
session='article-views-ui';open('?editor=1');ok(stats().total_views===2,'Editorial view is read-only')
ev('(async()=>{await fetch("/__fail?on");return true})()');open('')
ok(ev('document.querySelector("[data-article-views]").hidden'),'Unavailable statistics do not fabricate zero')
ok(ev('document.querySelector("#article-body").textContent.includes("leesbaar")'),'Article remains readable after failure')
ev('(async()=>{await fetch("/__fail?off");return true})()')
writeFileSync(folder+'/browser-results.json',JSON.stringify({checks,count:checks.length},null,2));console.log(checks.length+' browser checks passed.')
