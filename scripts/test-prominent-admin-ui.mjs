import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const origin=process.env.PROMINENT_TEST_ORIGIN || 'http://localhost:5173';
const run=(...args)=>{try{return execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','prominent-admin',...args],{encoding:'utf8',timeout:60000});}catch{throw Error(`Browseractie mislukt: ${args[0]}`);}};
const evaluate=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v;};
const admin=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')).find(a=>a.role==='admin');
if(process.env.PROMINENT_TEST_SIGNED_IN!=='1'){
 run('open',origin);run('set','viewport','1440','1000');run('wait','#auth-form');
 run('fill','#auth-email',admin.email);run('fill','#auth-password',admin.password);run('click','#auth-form button[type="submit"]');run('wait','.platform-toolbar');
}
run('open',`${origin}/ranglijsten`);run('wait','#prom-sync');
run('click','.prom-admin>summary');
assert(evaluate('document.querySelector(".prom-admin").innerText').includes('18/18 bijgewerkt'));
run('screenshot','test-results/prominent-admin-desktop.png','--full');
run('click','#prom-sync');run('wait','--fn','document.querySelector("#prom-admin-notice")?.textContent.includes("Laatste batch: complete") && !document.querySelector("#prom-sync")?.disabled');
assert(evaluate('document.querySelector("#prom-admin-notice").textContent').includes('complete'));
run('set','viewport','390','844');run('click','.prom-admin>summary');run('scrollintoview','.prom-admin');assert(!evaluate('document.documentElement.scrollWidth>innerWidth+1'));run('screenshot','test-results/prominent-admin-mobile.png');
// Cleanup the controlled browser session through the same application auth client.
run('eval','(async()=>{const {supabase}=await import("/src/platform/client.js");const {error}=await supabase.auth.signOut();if(error)throw Error("Test logout failed");return true;})()');
writeFileSync('test-results/prominent-admin-ui.json',JSON.stringify({at:new Date().toISOString(),origin,checks:['Existing admin login/status','Admin group coverage and ESPN 18/18','Manual sync runs same collector','Mobile admin no overflow']},null,2));
console.log('4 real-browser admin sync/status checks passed.');
