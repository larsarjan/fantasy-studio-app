import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','prominents',...args],{encoding:'utf8',timeout:60000});
const evaluate=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v;};
const pattern='https://rzunbquzffdivlpuomjc.supabase.co/rest/v1/prominent*';
try{
 run('network','route',pattern,'--abort');run('open','http://localhost:5173/ranglijsten');run('wait','#prom-retry');
 assert(evaluate('document.querySelector("#prom-content").innerText').includes('tijdelijk niet bereikbaar'));run('screenshot','test-results/prominent-error-mobile.png');
 run('network','unroute',pattern);run('click','#prom-retry');run('wait','#prom-round');assert(evaluate('document.querySelectorAll(".prom-table tbody tr").length')===104);
 writeFileSync('test-results/prominent-ui-states.json',JSON.stringify({checks:['Upstream database error state','Retry restores real 104-manager standings'],at:new Date().toISOString()},null,2));console.log('2 browser error/recovery checks passed; search-empty state is covered by test-prominent-ui.');
}finally{run('network','unroute',pattern);}
