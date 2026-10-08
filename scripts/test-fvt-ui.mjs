import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const session=process.env.FVT_SESSION||'fvt',origin=process.env.FVT_ORIGIN||'http://127.0.0.1:5180'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:65000})
const evaluate=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v}
const checks=[];const ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
const click=selector=>run('eval',`document.querySelector(${JSON.stringify(selector)}).click()`)
const ready=selector=>{for(let i=0;;i++)try{run('wait',selector);return}catch(e){if(i>=2)throw e}}
const responsive=label=>{for(const [w,h] of [[1920,1080],[1366,900],[820,1180],[390,844]]){run('set','viewport',String(w),String(h));ok(!evaluate('document.documentElement.scrollWidth>innerWidth+1'),`${label} no overflow ${w}`);if(w===390&&evaluate('!!document.querySelector(".fvt-menu-toggle")')){click('.fvt-menu-toggle');ok(evaluate('document.querySelector(".fvt-menu-toggle").getAttribute("aria-expanded")')==='true',label+' mobile menu opens');ok(!evaluate('document.documentElement.scrollWidth>innerWidth+1'),label+' expanded menu has no overflow');click('.fvt-menu-toggle')}run('screenshot',`test-results/fvt-${label}-${w}.png`)}run('set','viewport','1366','900')}
if(process.env.FVT_FORUM_ONLY!=='1') {
for(const [path,selector] of [['','h1'],['studio','.fvt-studio-benefits'],['videos','#video-grid .fvt-card'],['nieuws','#news-page h1'],['community','#forum-search'],['ranglijsten','.prom-main']]){
 run('open',origin+'/'+path);ready(selector);
 ok(evaluate('document.querySelectorAll("nav[aria-label=Hoofdnavigatie] a").length')===7,`${path||'home'} has seven public routes`)
 if(path===''){ok(evaluate('document.querySelector(".prom-home")===null'),'Home has no large ranking section');ok(evaluate('document.querySelector("#home-news")!==null'),'Home has latest-news area')}
 if(path==='studio')ok(evaluate('document.querySelector(".fvt-hero h1").textContent').includes('PERSOONLIJK ADVIES'),'Studio product differs from Home')
 if(path==='videos'){const count=evaluate('document.querySelectorAll("#video-grid .fvt-card").length');ok(count>1,'Multiple real FVT videos');click('[data-category="Live"]');ok(evaluate('Array.from(document.querySelectorAll("#video-grid h3"),x=>x.textContent).every(x=>/live/i.test(x))'),'Video category filter follows real titles')}
 responsive(path||'home')
}
if(process.env.FVT_PUBLIC_ONLY!=='1'){
run('open',origin+'/studio/profile');ready('#profile-form');
const clubs=evaluate('Array.from(document.querySelectorAll("#profile-favorite-club option"),x=>x.textContent).filter(x=>x!=="Geen voorkeur")');ok(clubs.length===18&&new Set(clubs).size===18,'Exactly 18 unique current clubs');ok(clubs.includes('AZ')&&!clubs.includes('AZ Alkmaar')&&clubs.filter(x=>/ado/i.test(x)).length===1&&clubs.filter(x=>/n.e.c/i.test(x)).length===1,'AZ, ADO and NEC aliases deduplicated');
run('select','#profile-favorite-club','AZ');click('#profile-form button[type=submit]');run('wait','--fn','document.querySelector("#profile-status").textContent.includes("opgeslagen")');run('open',origin+'/studio/profile');ready('#profile-form');ok(evaluate('document.querySelector("#profile-favorite-club").value')==='AZ','Canonical favorite persists');responsive('profile');
run('select','#profile-favorite-club','Ajax');click('#profile-form button[type=submit]');run('wait','--fn','document.querySelector("#profile-status").textContent.includes("opgeslagen")');
ok(evaluate('Array.from(document.querySelectorAll(".navigation .menu"),x=>x.dataset.screen).slice(0,2).join(",")')==='dashboard,selection','My selection directly below Dashboard');ok(evaluate('document.querySelectorAll(".fvt-studio-nav a").length')===7,'Internal Studio has public navigation');
click('[data-screen=selection]');ready('#selection-bank');ok(evaluate('document.querySelectorAll("[data-selection-player]").length')===15,'Existing 15-player selection preserved');ok(evaluate('document.querySelectorAll("[data-selection-start]:checked").length')===11,'Starting XI preserved');ok(evaluate('document.querySelectorAll("[data-selection-band][aria-pressed=true]").length')===2,'Captain and vice-captain preserved');responsive('selection');
}
}
if(process.env.FVT_PUBLIC_ONLY!=='1'){
run('open',origin+'/community/nieuw');ready('#topic-form');run('fill','[name=fvt_title]','[Acceptatietest] UI selectiegesprek');run('fill','[name=fvt_body]','Tijdelijke UI-acceptatie met echte formulierbediening. Dit testtopic wordt opgeruimd.');click('#topic-form button[type=submit]');ready('#reply-form');ok(evaluate('document.querySelector("h1").textContent').includes('UI selectiegesprek'),'Topic created through UI');
run('fill','#reply-form textarea','[Acceptatietest] Reactie via de browser. <script>alert(1)</script>');run('wait','2100');click('#reply-form button[type=submit]');run('wait','--fn','document.querySelector("#forum-replies").textContent.includes("Reactie via de browser")');ok(evaluate('document.querySelector("#forum-replies script")===null'),'Reply renders safely as plain text');ok(!evaluate('document.querySelector("#forum-page").textContent').includes('@example.invalid'),'Forum does not expose account email');responsive('topic');
click('[data-edit=post]');run('fill','#forum-replies textarea','[Acceptatietest] Bijgewerkte eigen reactie.');click('#forum-replies button[type=submit]');run('wait','--fn','document.querySelector("#forum-replies").textContent.includes("Bijgewerkte eigen reactie")');ok(true,'Own reply editing persists');
run('open',origin+'/community');ready('#forum-search');run('fill','[name=query]','UI selectiegesprek');click('#forum-search button[type=submit]');run('wait','--fn','document.querySelector("#forum-topics").textContent.includes("UI selectiegesprek")');ok(evaluate('Array.from(document.querySelectorAll("#forum-topics h2"),x=>x.textContent).every(x=>x.includes("UI selectiegesprek"))'),'Forum title search filters topics');

}
writeFileSync('test-results/fvt-ui'+(process.env.FVT_PUBLIC_ONLY==='1'?'-public':'')+'.json',JSON.stringify({origin,checks},null,2));console.log(`${checks.length} FVT browser checks passed`)
