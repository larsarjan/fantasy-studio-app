import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const bin='node_modules/agent-browser/bin/agent-browser-win32-x64.exe',session='performance-live',base='https://fantasyvoetbaltalk.nl'
const run=(...args)=>execFileSync(bin,['--session',session,...args],{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']})
const evaluate=code=>{const x=JSON.parse(run('eval','(async()=>('+code+'))()'));return typeof x==='string'?JSON.parse(x):x}
const ready=()=>run('wait','--fn',"Boolean(document.querySelector('#page-content')?.textContent.trim())")
run('open',base+'/studio/dashboard');ready();run('set','viewport','1440','900')
const readCache=`new Promise((resolve,reject)=>{const r=indexedDB.open('fantasy-studio-storage');r.onsuccess=()=>{const db=r.result,t=db.transaction('cache','readonly'),q=t.objectStore('cache').get('syncStatus');q.onsuccess=()=>{resolve(q.result);db.close()};q.onerror=reject};r.onerror=reject})`
const old=evaluate(`JSON.stringify(await (${readCache}))`)
evaluate("JSON.stringify(await new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase('fantasy-studio-storage');q.onsuccess=()=>resolve(true);q.onerror=reject;q.onblocked=()=>reject(Error('blocked'))}))")
const result={definition:'Cold = empty IndexedDB snapshot cache; authenticated session and HTTP cache retained. Includes browser CLI overhead.',beforeSnapshot:old.snapshotId,measurements:[]}
for(const mode of ['cold','warm']){const start=performance.now();run('open',base+'/studio/dashboard');ready();const metrics=evaluate("JSON.stringify({title:document.querySelector('#page-title')?.textContent,requests:performance.getEntriesByType('resource').length,referenceRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/rest/v1/')&&!r.name.includes('/rpc/')).length,supabaseRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('supabase.co')).length})");result.measurements.push({mode,ms:performance.now()-start,...metrics,cache:evaluate(`JSON.stringify(await (${readCache}))`)})}
assert.equal(result.measurements[0].cache.snapshotId,result.measurements[1].cache.snapshotId)
// A stale metadata ID must force fetching the new centrally published snapshot.
evaluate("JSON.stringify(await new Promise((resolve,reject)=>{const q=indexedDB.open('fantasy-studio-storage');q.onsuccess=()=>{const d=q.result,t=d.transaction('cache','readwrite'),s=t.objectStore('cache'),r=s.get('syncStatus');r.onsuccess=()=>s.put({...r.result,snapshotId:'985eb03d-1757-4a7b-b42a-e0d105fc32cf'},'syncStatus');t.oncomplete=()=>{d.close();resolve(true)};t.onerror=reject}}))")
run('open',base+'/studio/history');ready();const refreshed=evaluate(`JSON.stringify(await (${readCache}))`);assert.equal(refreshed.snapshotId,result.measurements[0].cache.snapshotId);result.newSnapshotAutomaticallyReceived=true
writeFileSync('test-results/performance/studio-cold-warm-live.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
