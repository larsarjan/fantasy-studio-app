import{execFileSync}from'node:child_process';import{writeFileSync,mkdirSync}from'node:fs';import assert from'node:assert/strict';
mkdirSync('test-results/public-rankings',{recursive:true});
const base=process.argv[2]||'http://127.0.0.1:5185';
const run=(...a)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','rankings-acceptance',...a],{encoding:'utf8',timeout:120000,stdio:a[0]==='open'?['ignore','ignore','ignore']:['ignore','pipe','pipe']});
const ev=c=>{let v=JSON.parse(run('eval',`JSON.stringify(${c})`));return typeof v==='string'?JSON.parse(v):v};
run('open',base+'/ranglijsten?season=2026-2027&event=8');run('wait','--fn',"document.querySelector('#prom-ranking tbody tr')!==null");
ev("document.querySelector('[data-deny]')?.click()");const results=[];
for(const [group,count] of [['TOP_100',100],['CONTENT_CREATOR',6],['ESPN',18],['FVT_SUBLEAGUE',86],['',203]]){
 ev(`document.querySelector('[data-group="${group}"]').click()`);run('wait','--fn',`!document.querySelector('#prom-content').hasAttribute('aria-busy') && document.querySelectorAll('#prom-ranking tbody tr').length===${count}`);
 for(const width of[1920,1366,820,390]){run('set','viewport',String(width),'1100');const value=ev(`({group:'${group}',width:${width},rows:document.querySelectorAll('#prom-ranking tbody tr').length,overflow:document.documentElement.scrollWidth>innerWidth})`);assert(!value.overflow,JSON.stringify(value));results.push(value);run('screenshot',`test-results/public-rankings/${base.startsWith('https')?'live':'local'}-${group||'all'}-${width}.png`);}
 if(group){run('fill','#prom-search','no-such-manager-test');assert.equal(ev("document.querySelectorAll('#prom-ranking tbody tr').length"),0);run('fill','#prom-search','');assert.equal(ev("document.querySelectorAll('#prom-ranking tbody tr').length"),count);}
}
for(const round of[2,5,8]){run('select','#prom-round',String(round));run('wait','--fn',`!document.querySelector('#prom-content').hasAttribute('aria-busy') && new URLSearchParams(location.search).get('event')==='${round}'`);results.push(ev(`({round:${round},rows:document.querySelectorAll('#prom-ranking tbody tr').length,first:document.querySelector('#prom-ranking tbody tr').innerText})`));}
for(const entry of[25181,20124,260]){
 run('open',base+`/prominenten/${entry}?season=2026-2027&event=8`);run('wait','--fn',"document.querySelector('[data-tab=team]')!==null");
 for(const tab of['team','history','transfers','performance','analysis']){ev(`document.querySelector('[data-tab="${tab}"]').click()`);run('wait','--fn',`document.querySelector('[data-tab="${tab}"]').getAttribute('aria-pressed')==='true'`);assert(ev("document.querySelector('.prom-profile-content').innerText.length")>30);}
 ev("document.querySelector('[data-tab=team]').click()");run('wait','--fn',"document.querySelector('.prom-pitch')!==null");assert.equal(ev("document.querySelectorAll('.prom-pitch .prom-footballer').length"),11);assert.equal(ev("document.querySelectorAll('.prom-bench .prom-footballer').length"),4);
 for(const width of[1920,1366,820,390]){run('set','viewport',String(width),'1100');assert(!ev('document.documentElement.scrollWidth>innerWidth'));}
 run('select','#prom-round','3');run('wait','--fn',"document.querySelector('.prom-pitch')!==null && !document.querySelector('#prom-content').hasAttribute('aria-busy') && document.querySelector('.prom-team-layout h2').textContent.includes('SR3')");results.push({entry,detail:'all tabs and SR3 checked'});
}
const errors=run('errors').trim();assert.equal(errors,'');writeFileSync(`test-results/public-rankings/${base.startsWith('https')?'live':'local'}-browser.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({checks:results.length,errors}));run('close');
