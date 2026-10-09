// Real production browser login using explicitly temporary acceptance accounts.
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync} from 'node:fs'
import assert from 'node:assert/strict'
const accounts=JSON.parse(readFileSync('test-results/admin-live/accounts.json','utf8')),session='fvt-production-acceptance-'+process.pid,origin='https://fantasyvoetbaltalk.nl',checks=[]
mkdirSync('test-results/admin-live',{recursive:true})
const run=(...args)=>{const out=openSync('test-results/admin-live/browser-output.txt','w'),err=openSync('test-results/admin-live/browser-error.txt','w');try{execFileSync(process.execPath,['node_modules/agent-browser/bin/agent-browser.js','--session',session,...args],{stdio:['ignore',out,err],timeout:65000});return readFileSync('test-results/admin-live/browser-output.txt','utf8')}catch{throw Error('Production browser command failed: '+args[0])}finally{closeSync(out);closeSync(err)}}
const ev=code=>{const r=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof r==='string'?JSON.parse(r):r},open=path=>run('open',origin+path),wait=sel=>run('wait',sel),check=(value,label)=>{assert(value,label);checks.push(label);console.log('PASS',label)}
open('/admin');wait('#auth-form');check(true,'Production unauthenticated admin shows existing login')
for(const a of accounts){
 run('fill','#auth-email',a.email);run('fill','#auth-password',a.password);run('click','#auth-form button[type=submit]');wait(a.role==='member'?'.admin-denied':'.admin-content h2');check(true,'Production real login '+a.role)
 if(a.role==='member'){check(ev('document.querySelector(".admin-denied").textContent.includes("403")'),'Production member 403');open('/admin/users');wait('.admin-denied');check(true,'Production member direct users denied')}
 else{const sections=ev('Array.from(document.querySelectorAll(".admin-sidebar nav a"),a=>a.textContent)');if(['editor','publisher'].includes(a.role))check(sections.join(',')==='Dashboard,Nieuws','Production '+a.role+' sections');if(a.role==='moderator')check(sections.join(',')==='Dashboard,Community','Production moderator sections');if(a.role==='admin')check(sections.length>=11,'Production admin sections');if(a.role==='super_admin'){open('/admin/system');wait('.admin-content h2');check(ev('document.querySelector(".admin-content").textContent.includes("kritieke systeemrechten")'),'Production super-admin critical rights')}
 if(a.role==='editor'){open('/admin/nieuws?new=1');wait('#article-form');check(ev('Array.from(document.querySelectorAll("[name=status] option"),o=>o.value)').join(',')==='draft,review','Production editor publish UI denied');open('/admin/users');wait('.admin-denied');check(true,'Production editor direct users denied')}
 if(a.role==='moderator'){open('/admin/nieuws');wait('.admin-denied');check(true,'Production moderator news denied')}
 if(a.role==='admin'){
  for(const width of [1920,1366,820,390]){run('set','viewport',String(width),'1000');open('/admin');wait('.admin-content h2');check(!ev('document.documentElement.scrollWidth>innerWidth+1'),'Production dashboard responsive '+width);run('screenshot',`test-results/admin-live/dashboard-${width}.png`)}
  run('set','viewport','1366','900');for(const [path,selector]of [['/admin/nieuws','table'],['/admin/videos','#video-form'],['/admin/community','table'],['/admin/users','table'],['/admin/features','[data-feature]'],['/admin/photos','[data-photo]'],['/admin/sync','table'],['/admin/audit','table']]){open(path);wait(selector);check(!ev('document.querySelector(".admin-content").textContent.includes("konden niet worden geladen")'),'Production renders '+path)}
  run('screenshot','test-results/admin-live/audit-1366.png')
 }
 }
 open('/admin');wait(a.role==='member'?'.admin-denied':'.admin-content h2');run('click','#admin-signout,#denied-signout');run('wait','--fn','location.pathname==="/"');open('/admin');wait('#auth-form')
}
run('close');writeFileSync('test-results/admin-live/browser-results.json',JSON.stringify({origin,checks,count:checks.length,auth:'Real Supabase Auth on live production'},null,2));console.log(`${checks.length} production browser checks passed. Test accounts must now be removed.`)
