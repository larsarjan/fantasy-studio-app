import {execFileSync} from 'node:child_process';import {mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
mkdirSync('test-results/fixture-premium',{recursive:true});
const run=(...a)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','fixture-windows',...a],{encoding:'utf8',timeout:60000});
const ev=c=>{const r=JSON.parse(run('eval',`JSON.stringify(${c})`));return typeof r==='string'?JSON.parse(r):r};
run('click','.fixture-mode[data-mode="club"]');run('select','#fixture-club','PSV');run('select','#fixture-round','9');
for(const w of [1920,1366,820,390]){
 run('set','viewport',String(w),'1000');
 for(const mode of ['club','round','compare']){
  run('eval',`document.querySelector('.fixture-mode[data-mode="${mode}"]').scrollIntoView({block:"center"})`);run('click',`.fixture-mode[data-mode="${mode}"]`);assert.equal(ev('document.querySelector(".fixture-mode.active").dataset.mode'),mode);
  if(mode==='compare')run('select','#compare-club-group','top3');
  run('eval','document.querySelector("#fixture-content").scrollIntoView()');
  const sizes=ev('(()=>{const primary=document.querySelector("#fixture-content .fixture-card,#fixture-content .round-match"),secondary=document.querySelector("#fixture-content .fixture-context-compact");return {primary:primary.getBoundingClientRect().height,secondary:secondary.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth,ratings:secondary.querySelectorAll(".difficulty-label,.round-difficulty-dynamic").length}})()');
  assert(!sizes.overflow);assert.equal(sizes.ratings,0);assert(sizes.secondary<sizes.primary*.55,JSON.stringify({w,mode,...sizes}));
  console.log(w,mode,sizes);run('screenshot',`test-results/fixture-premium/${mode}-${w}.png`);
 }
}
