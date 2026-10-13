import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {matchesReferenceSnapshot} from '../src/services/referenceCache.js'
import {referenceTables} from '../src/services/referenceSchema.js'
const source=fs.readFileSync('src/platform/referenceData.js','utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export async function','async function')
const build=new Function('supabase','matchesReferenceSnapshot','tables',source+';return {loadReferenceData}')
function fixture({rows=1001,fail=false,change=false}={}){
 const calls=[],counts=Object.fromEntries(Object.values(referenceTables).map(t=>[t,['players','fixtures'].includes(t)?rows:0]))
 const snapshot={id:'snapshot-a',created_at:'2026-10-13T00:00:00Z',counts}
 const client={from(table){calls.push(table);return {select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[snapshot]}),range:async(a,b)=>fail?{error:Error('Read failed')}:{data:Array.from({length:Math.max(0,Math.min(b+1,counts[table]-(change?1:0))-a)},()=>({payload:{id:'test'}}))}}}}
 const cache={database:Object.fromEntries(Object.entries(referenceTables).map(([key,table])=>[key,Array.from({length:counts[table]},()=>({id:'test'}))])),syncStatus:{source:'Studio Cloud',snapshotId:snapshot.id}}
 return {...build(client,matchesReferenceSnapshot,referenceTables),calls,cache}
}
test('unchanged snapshot uses one metadata query and no dataset requests',async()=>{
 const f=fixture(),r=await f.loadReferenceData(f.cache);assert.equal(r.database,f.cache.database);assert.equal(r.cacheHit,true);assert.deepEqual(f.calls,['reference_imports'])
})
test('cold load pages datasets and skips known empty datasets',async()=>{
 const f=fixture(),r=await f.loadReferenceData();assert.equal(r.database.players.length,1001);assert.equal(r.syncStatus.snapshotId,'snapshot-a');assert.equal(f.calls.length,5)
})
test('exact page boundaries do not trigger an extra empty request',async()=>{
 const f=fixture({rows:1000});await f.loadReferenceData();assert.equal(f.calls.length,3)
})
test('new snapshot ID refreshes cached rows',async()=>{
 const f=fixture();f.cache.syncStatus.snapshotId='old';const r=await f.loadReferenceData(f.cache);assert.notEqual(r.database,f.cache.database);assert.equal(f.calls.length,5)
})
test('read errors and concurrent snapshot changes cannot be returned as a valid import',async()=>{
 for(const options of [{fail:true},{change:true}]){const f=fixture(options);await assert.rejects(()=>f.loadReferenceData());assert.equal(f.cache.database.players.length,1001)}
})
test('browser synchronization uses the central API before refreshing and has no visitor-triggered import',()=>{
 const s=fs.readFileSync('src/services/database.js','utf8'),startup=s.slice(s.indexOf('export async function initializeDatabase'),s.indexOf('export function getPlayers'))
 assert.doesNotMatch(startup,/synchronizeDatabase\(|fetchSheet/)
 const browser=s.slice(s.indexOf('export async function synchronizeDatabase'),s.indexOf('  const previousDatabase = database'))
 assert.match(browser,/await runReferenceSync\(\)/);assert.match(browser,/await initializeDatabase\(\)/);assert.match(browser,/throw error/)
 assert.doesNotMatch(browser,/fetchSheet|publish_reference_data/)
})
