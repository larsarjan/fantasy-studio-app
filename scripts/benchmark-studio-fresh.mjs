import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
const bin='node_modules/agent-browser/bin/agent-browser-win32-x64.exe',session='performance-cold',base='https://fantasyvoetbaltalk.nl',a=JSON.parse(readFileSync('test-results/performance/account.json','utf8'))
const run=(...args)=>{try{return execFileSync(bin,['--session',session,...args],{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']})}catch{throw Error('Browser step failed: '+args[0])}}
const ready=()=>run('wait','--fn',"Boolean(document.querySelector('#page-content')?.textContent.trim())")
run('set','viewport','1440','900');run('fill','#auth-email',a.email);run('fill','#auth-password',a.password)
const rows=[]
for(const mode of ['cold','warm']){const start=performance.now();if(mode==='cold')run('click','#auth-form [type=submit]');else run('open',base+'/studio/dashboard');ready();const raw=JSON.parse(run('eval',"JSON.stringify({title:document.querySelector('#page-title')?.textContent,requests:performance.getEntriesByType('resource').length,supabaseRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('supabase.co')).length,jsDecodedBytes:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).reduce((s,r)=>s+r.decodedBodySize,0)})"));rows.push({mode,ms:performance.now()-start,...JSON.parse(raw)})}
const result={definition:'Fresh browser session, no saved snapshot or Studio assets. Cold starts at login submit, warm starts at full dashboard navigation. Includes CLI overhead.',rows};writeFileSync('test-results/performance/studio-fresh-live.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
