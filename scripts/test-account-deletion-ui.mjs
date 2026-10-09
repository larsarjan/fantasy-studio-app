import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const {accounts}=JSON.parse(readFileSync('test-results/account-security/accounts.json','utf8')),account=accounts.find(a=>a.purpose==='ui')
const origin=process.env.SECURITY_ORIGIN||'http://127.0.0.1:5180',session='account-security-ui',checks=[]
const run=(...args)=>{try{return execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:65000})}catch{throw Error('Browser action failed: '+args[0])}}
const ev=code=>{const r=JSON.parse(run('eval',`JSON.stringify(${code})`));return typeof r==='string'?JSON.parse(r):r},ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
run('open',origin+'/studio/profile');run('wait','#auth-email');run('fill','#auth-email',account.email);run('fill','#auth-password',account.password);run('click','#auth-form button[type=submit]');run('wait','#profile-form')
run('eval','document.querySelector(".account-danger details").open=true')
ok(ev('document.querySelector(".account-delete-button").disabled'),'Destructive button starts disabled')
run('fill','#delete-account-confirmation','verwijder');ok(ev('document.querySelector(".account-delete-button").disabled'),'Confirmation is explicit and case-sensitive')
for(const [w,h]of [[1366,900],[820,1180],[390,844]]){run('set','viewport',String(w),String(h));run('eval','document.querySelector(".account-danger").scrollIntoView({block:"center"})');ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),`Account deletion responsive ${w}px`);run('screenshot',`test-results/account-security/deletion-${w}.png`)}
run('fill','#delete-account-confirmation','VERWIJDER');ok(!ev('document.querySelector(".account-delete-button").disabled'),'Exact confirmation enables destructive action')
run('network','route','**/functions/v1/delete-account','--abort')
try{run('click','.account-delete-button');run('wait','--fn','!document.querySelector(".account-delete-button").disabled');ok(ev('document.querySelector("#delete-account-status").textContent').includes('niet afgerond'),'Network failure keeps account UI retryable with Dutch error')}finally{run('network','unroute','**/functions/v1/delete-account')}
run('click','.account-delete-button');run('wait','--fn','location.pathname==="/"');ok(true,'Successful deletion logs out and redirects to public home')
run('open',origin+'/studio/profile');run('wait','#auth-form');ok(true,'Deleted account no longer has a local authenticated session')
writeFileSync('test-results/account-security/ui-results.json',JSON.stringify({origin,checks},null,2));console.log(`${checks.length} account deletion UI checks passed`)
