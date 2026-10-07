import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const origin=process.env.PROMINENT_TEST_ORIGIN||'http://localhost:5173';
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','prominents',...args],{encoding:'utf8',timeout:60000});
const evaluate=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v;};
const report=[];
for(const [size,width,height]of [['desktop',1440,1000],['mobile',390,844],['narrow',320,800]]){
 run('open',`${origin}/ranglijsten`);run('set','viewport',String(width),String(height));run('wait','#prom-round');
 assert(evaluate('document.querySelectorAll(".prom-table tbody tr").length')===104);
 run('screenshot',`test-results/prominent-final-ranking-${size}.png`);run('scrollintoview','.prom-table');run('screenshot',`test-results/prominent-final-ranking-rows-${size}.png`);
 for(const [tab,selector]of [['team','.prom-pitch'],['history','.prom-history'],['transfers','.prom-transfer-list'],['performance','.prom-chart'],['analysis','.prom-profile-content']]){
  run('open',`${origin}/prominenten/20124?event=7&tab=${tab}`);run('wait',selector);run('scrollintoview',selector);run('screenshot',`test-results/prominent-final-${tab}-${size}.png`);
  assert(!evaluate('document.documentElement.scrollWidth>innerWidth+1'),`${size} ${tab} overflow`);report.push({size,tab,overflow:false});
 }
}
writeFileSync('test-results/prominent-visual-pages.json',JSON.stringify(report,null,2));console.log(`${report.length} complete profile page/viewport checks captured with real SR7 data.`);
