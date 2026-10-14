import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
const session=process.env.FIXTURE_BROWSER_SESSION||'fixture-windows',folder='test-results/fixture-polish';mkdirSync(folder,{recursive:true});
const run=(...a)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...a],{encoding:'utf8',timeout:60000});
const ev=c=>{const r=JSON.parse(run('eval',`JSON.stringify(${c})`));return typeof r==='string'?JSON.parse(r):r};
const mode=m=>{run('eval','document.querySelector(".fixture-toolbar-sentinel").scrollIntoView({block:"center"})');run('wait','--fn','!document.querySelector(".fixture-toolbar").classList.contains("is-floating")');run('click',`.fixture-mode[data-mode="${m}"]`);assert.equal(ev('document.querySelector(".fixture-mode.active").dataset.mode'),m)};
for(const width of [1920,1366,820,390]){
 run('set','viewport',String(width),'700');mode('club');run('select','#fixture-club','Ajax');run('select','#fixture-round','9');
 const values=ev('(()=>{const windows=[...document.querySelectorAll(".fixture-window")];return windows.map(w=>({round:w.querySelector("h3").textContent,top:w.querySelector(".fixture-card").getBoundingClientRect().top,zone:w.querySelector(".fixture-context-zone").getBoundingClientRect().height,context:w.querySelectorAll(".fixture-context-compact").length}))})()');
 assert.deepEqual(values.map(x=>x.context),[1,1,0,1,0]);if(width>=1366)assert.ok(Math.max(...values.map(x=>x.top))-Math.min(...values.map(x=>x.top))<1,JSON.stringify(values));
 assert(ev('[...document.querySelectorAll(".fixture-context-compact>small:first-of-type")].every(x=>/^\\d{2}-\\d{2}-\\d{4} · \\d{2}:\\d{2}$/.test(x.textContent.trim()))'));
 assert.equal(ev('document.querySelectorAll(".fixture-sticky-legend").length'),1);
 ev('(window.originalLegend=document.querySelector(".fixture-sticky-legend"),true)');
 run('eval','document.querySelector(".fixture-toolbar-sentinel").scrollIntoView({block:"center"})');run('wait','--fn','!document.querySelector(".fixture-toolbar").classList.contains("is-floating")');
 const before=ev('document.querySelector(".fixture-controls").getBoundingClientRect().top+scrollY');
 run('screenshot',`${folder}/toolbar-${width}.png`);
 run('eval','scrollTo(0,document.querySelector(".fixture-toolbar-sentinel").getBoundingClientRect().top+scrollY+200)');run('wait','--fn','document.querySelector(".fixture-toolbar").classList.contains("is-floating")');
 assert.equal(ev('window.originalLegend===document.querySelector(".fixture-sticky-legend")'),true);
 assert.ok(Math.abs(ev('document.querySelector(".fixture-controls").getBoundingClientRect().top+scrollY')-before)<1,'no layout jump');
 assert.ok(ev('document.querySelector(".fixture-sticky-legend").getBoundingClientRect().top>=0'));
 run('screenshot',`${folder}/ajax-${width}.png`);
 run('eval','scrollBy(0,150)');assert.ok(ev('document.querySelector(".fixture-sticky-legend").getBoundingClientRect().bottom<innerHeight'));
 mode('compare');run('select','#compare-club-group','top3');
 assert(ev('[...document.querySelectorAll("#fixture-content,#fixture-content *")].filter(x=>/auto|scroll/.test(getComputedStyle(x).overflowY)&&x.scrollHeight>x.clientHeight+1).length===0'),'no internal vertical scroll');
 assert.ok(ev('document.documentElement.scrollWidth<=innerWidth'));
 run('eval','document.querySelector(".compare-round-table").scrollIntoView()');run('screenshot',`${folder}/compare-${width}.png`);
 console.log('PASS polish',width,values.map(x=>x.zone));
}
mode('club');for(const club of ['PSV','Feyenoord','FC Utrecht']){run('select','#fixture-club',club);assert(ev('document.querySelectorAll(".fixture-card").length')>0);console.log('PASS club',club)}
assert.equal(run('errors').trim(),'');console.log('PASS single sticky legend/return/no jump, Ajax alignment/empty zones, Dutch dates, no internal scroll, additional clubs');

