import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
const session=process.env.PERFORMANCE_SESSION||'performance-baseline',bin='node_modules/agent-browser/bin/agent-browser-win32-x64.exe',base=process.env.PERFORMANCE_URL||'https://fantasyvoetbaltalk.nl',label=process.env.PERFORMANCE_LABEL||'baseline'
function run(...args){try{return execFileSync(bin,['--session',session,...args],{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']})}catch{throw Error('Browser command failed: '+args[0])}}
const evaluate=code=>{const value=JSON.parse(run('eval',`JSON.stringify(${code})`));return typeof value==='string'?JSON.parse(value):value}
async function ready(){const deadline=Date.now()+240000;while(Date.now()<deadline){try{if(evaluate("Boolean(document.querySelector('#page-content')?.textContent.trim())"))return}catch{/* Old synchronous rendering can exceed the browser CLI IPC timeout. */}await new Promise(r=>setTimeout(r,500))}throw Error('Studio did not become ready')}
const account=JSON.parse(readFileSync('test-results/performance/account.json','utf8'))
if(!evaluate("location.origin === '"+base+"' && Boolean(document.querySelector('#page-content')?.textContent.trim())")) run('open',base+'/studio/dashboard')
if(evaluate("Boolean(document.querySelector('#auth-email'))")){
 run('fill','#auth-email',account.email);run('fill','#auth-password',account.password);run('click','#auth-form [type=submit]');await ready()
}
await ready()
const rows=[]
for(const width of [1440,768,390]){
 run('set','viewport',String(width),'900')
 for(const screen of ['dashboard','players','fixtures','history','selection','compare','captain']){
  const started=performance.now();run('open',base+'/studio/'+screen);await ready()
  const measured=evaluate("({title:document.querySelector('#page-title')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth,requests:performance.getEntriesByType('resource').length,supabaseRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('supabase.co')).length,jsBytes:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).reduce((s,r)=>s+r.decodedBodySize,0),scripts:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).map(r=>new URL(r.name).pathname)})")
  rows.push({width,screen,wallReadyMs:performance.now()-started,...measured});writeFileSync(`test-results/performance/studio-${label}.json`,JSON.stringify(rows,null,2))
 }
}
console.log(JSON.stringify(rows.map(({scripts,...row})=>row),null,2))
