import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const session=process.argv[2]??'live'
const screens=process.argv.slice(3)
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:60000})
const report=[]
for(const screen of screens) {
 run('click',`[data-screen="${screen}"]`)
 const state=run('eval',`JSON.stringify({route:location.pathname,title:document.querySelector('#page-title')?.textContent,headings:[...document.querySelectorAll('#page-content h1,#page-content h2')].map(e=>e.textContent),tables:document.querySelectorAll('#page-content table').length,rows:document.querySelectorAll('#page-content tbody tr').length,overflow:document.documentElement.scrollWidth>innerWidth+1,brokenImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth&&!i.hidden).length})`)
 run('screenshot',`test-results/live-${screen}.png`)
 report.push({screen,state});console.log(screen,state)
}
writeFileSync(`test-results/browser-screens-${screens.join('-')}.json`,JSON.stringify(report,null,2))
