import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'

function harness() {
 let now=Date.parse('2026-10-25T12:00:00Z'),calls=0,sourceCalls=0,fail='',rows=[],written=0
 const logs=[],properties={AVAILABILITY_BACKEND_TOKEN:'test-secret'}
 const context=vm.createContext({
  Date:class extends Date {static now(){return now}},console:{log:s=>logs.push(s)},
  LockService:{getDocumentLock:()=>({tryLock:()=>true,releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>properties[k]=v})},
  SpreadsheetApp:{getActive:()=>({getSheetByName:()=>({})})},
  UrlFetchApp:{fetch:(url,options)=>{
   calls++;assert.equal(url,'https://fantasyvoetbaltalk.nl/api/availability-sync')
   assert.equal(options.headers['x-sync-token'],'test-secret')
   const input=JSON.parse(options.payload)
   assert.equal(input.expectedMatched,1)
   if(fail==='timeout')throw Error('test-secret')
   return {getResponseCode:()=>fail==='backend'?503:200,getContentText:()=>JSON.stringify({read:1,written,unchanged:1-written,skipped:1,errors:0,observedAt:input.expectedObservedAt,observedMatched:fail==='mismatch'?0:1})}
  }}
 })
 vm.runInContext(readFileSync(new URL('./PlayerAvailabilitySync.gs',import.meta.url),'utf8'),context)
 context.syncPlayerAvailability=()=>{
  sourceCalls++;if(fail==='source')throw Error('test-secret')
  const at=new Date(now).toISOString()
  rows=[{Active:'true',Last_Seen_At:at},{Active:'true',Last_Seen_At:at}]
  properties.AVAILABILITY_LAST_SUCCESS=JSON.stringify({at,count:2,matches:{exact:1,unmatched:1},changed:0})
  return {exact:1,unmatched:1}
 }
 context.avReadSheet_=()=>{if(fail==='sheet')throw Error('sheet unavailable');return fail==='partial'?rows.slice(1):rows}
 return {context,properties,logs,get calls(){return calls},get sourceCalls(){return sourceCalls},advance(){now+=3600001},fail(v){fail=v},written(v){written=v}}
}
test('full route validates source/Sheet/backend and same-hour retry performs no calls',()=>{
 const h=harness(),r=h.context.testPlayerAvailabilityFullChain()
 assert.equal(r.status,'PASS');assert.equal(r.matched,1);assert.equal(r.unmatched,1);assert.equal(r.written,0);assert.equal(r.unchanged,1)
 for(const prefix of ['AV_FULL_SOURCE','AV_FULL_MATCH','AV_FULL_SHEET','AV_FULL_BACKEND','AV_FULL_PASS'])assert(h.logs.some(l=>l.startsWith(prefix)))
 assert.equal(h.context.testPlayerAvailabilityFullChain().status,'WAIT');assert.equal(h.calls,1);assert.equal(h.sourceCalls,1)
 h.advance();assert.equal(h.context.testPlayerAvailabilityFullChain().written,0);assert.equal(h.calls,2)
 assert(!h.logs.join().includes('test-secret'))
})
for(const failure of ['source','sheet','partial','backend','timeout','mismatch'])test(`full route ${failure} aborts, throttles retries and next hourly success recovers`,()=>{
 const h=harness();h.fail(failure)
 assert.throws(()=>h.context.testPlayerAvailabilityFullChain(),/niet voltooid/)
 assert.equal(h.properties.AVAILABILITY_FULL_LAST_SUCCESS,undefined)
 const calls=h.calls;assert.equal(h.context.testPlayerAvailabilityFullChain().status,'WAIT');assert.equal(h.calls,calls)
 if(['source','sheet','partial'].includes(failure))assert.equal(calls,0)
 h.advance();h.fail('');assert.equal(h.context.testPlayerAvailabilityFullChain().status,'PASS')
 assert(!h.logs.join().includes('test-secret'))
})
test('missing token never fetches source or backend',()=>{
 const h=harness();delete h.properties.AVAILABILITY_BACKEND_TOKEN
 assert.throws(()=>h.context.testPlayerAvailabilityFullChain());assert.equal(h.calls,0);assert.equal(h.sourceCalls,0)
})
test('delayed publication retries the SAME snapshot next hour without refetching source',()=>{
 const h=harness();h.fail('backend');assert.throws(()=>h.context.testPlayerAvailabilityFullChain())
 const pending=h.properties.AVAILABILITY_FULL_PENDING_AT
 assert(pending);h.advance();h.fail('')
 const result=h.context.testPlayerAvailabilityFullChain()
 assert.equal(result.status,'PASS');assert.equal(result.observedAt,pending)
 assert.equal(h.sourceCalls,1);assert.equal(h.calls,2);assert.equal(h.properties.AVAILABILITY_FULL_PENDING_AT,'')
 h.advance();assert.equal(h.context.testPlayerAvailabilityFullChain().status,'PASS');assert.equal(h.sourceCalls,2)
})
