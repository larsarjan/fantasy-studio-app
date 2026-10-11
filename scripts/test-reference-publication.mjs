import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
const source=fs.readFileSync('src/platform/referenceData.js','utf8').replace(/^import[^\n]*\n/gm,'')
const build=new Function('supabase','refreshAccess','hasPermission',source.replaceAll('export async function','async function')+';return {publishReferenceData}')
function fixture({permissions=['data.correct','sync.run'],rpcError=null,id='new-id',rowError=null,alterRow=r=>r}={}){
 const calls=[];let datasets
 const client={rpc:async(name,args)=>{calls.push(name);datasets=args.datasets;return {data:id,error:rpcError}},from:name=>{calls.push(name);return {select(){return this},eq(){return this},single:async()=>({error:rowError,data:alterRow({id,source:'Google Sheets',created_at:'2026-10-11T12:00:00Z',counts:Object.fromEntries(Object.entries(datasets).map(([k,v])=>[k,v.length]))})})}}}
 return {...build(client,async()=>({permissions}),(a,p)=>a.permissions.includes(p)),calls}
}
test('missing data.correct or sync.run cannot report success or call publication',async()=>{for(const permissions of [[],['data.correct'],['sync.run']]){const f=fixture({permissions});await assert.rejects(()=>f.publishReferenceData({}),/vereist/);assert.deepEqual(f.calls,[])}})
test('RPC failure preserves exact server error and does not verify a fake success',async()=>{const f=fixture({rpcError:{code:'57014',message:'canceling statement due to statement timeout'}});await assert.rejects(()=>f.publishReferenceData({}),/57014.*statement timeout/);assert.deepEqual(f.calls,['publish_reference_data'])})
test('missing import UUID cannot report success',async()=>{await assert.rejects(()=>fixture({id:null}).publishReferenceData({}),/geen import-ID/)})
test('missing persisted import cannot report success',async()=>{await assert.rejects(()=>fixture({rowError:{code:'PGRST116',message:'No rows'}}).publishReferenceData({}),/PGRST116.*No rows/)})
test('count mismatch fails confirmation',async()=>{await assert.rejects(()=>fixture({alterRow:r=>({...r,counts:{players:999}})}).publishReferenceData({players:[{}]}),/niet overeen/)})
test('success returns server import UUID, timestamp and all verified dataset counts',async()=>{const f=fixture(),r=await f.publishReferenceData({players:[{},{}],fixtures:[{}]});assert.equal(r.id,'new-id');assert.equal(r.created_at,'2026-10-11T12:00:00Z');assert.equal(r.counts.players,2);assert.equal(Object.keys(r.counts).length,16);assert.deepEqual(f.calls,['publish_reference_data','reference_imports'])})

const databaseSource=fs.readFileSync('src/services/database.js','utf8')
const syncSource=databaseSource.slice(databaseSource.indexOf('export async function synchronizeDatabase()'),databaseSource.indexOf('export function getPlayerMetadata()')).replace('export async function','async function').replace("await import('../platform/referenceData.js')",'publicationModule')
function synchronization({failure=null,sheetFailure=null}={}) {
 const old={players:[{name:'Old snapshot'}]},cache=[],events=[]
 const sheets={SPELERS:[{name:'New snapshot',season:'2026/2027'}],SPELERS_HISTORIE:[],WEDSTRIJDEN:[{home:'A',away:'B',round:1}],RESULTS:[{season:'2026/2027',date:'2026-10-10',home:'A',away:'B',homeScore:1,awayScore:0}]}
 const identity=r=>r
 const names=['mapPlayer','mapHistoricalPlayer','mapFixture','mapTeamRating','mapResult','mapPlayerMetadata','mapPlayerMatchStat','normalizeElitePlayerStat','normalizeEliteTransfer','normalizeChipUsage','normalizeEliteFormation','normalizeEliteClubExposure','normalizeEuropeanFixture']
 const deps={publicationModule:{publishReferenceData:async()=>{if(failure)throw Error(failure);return{id:'confirmed-id',created_at:'2026-10-11T12:00:00Z'}}},fetchSheet:async name=>{if(name===sheetFailure)throw Error('Sheet unavailable');return sheets[name]||[]},hasPublishedSheet:()=>true,precomputeFantasyScores:async({rawPlayers})=>rawPlayers,window:{dispatchEvent:event=>events.push(event.type)},CustomEvent:class{constructor(type){this.type=type}},...Object.fromEntries(names.map(n=>[n,identity]))}
 const create=new Function(...Object.keys(deps),'old','cache',`let database=old;let syncStatus={state:'success',lastSync:'old-date'};const TRANSFER_DEADLINE_ENABLED=false;const getPlayerProfiles=()=>[];const getDatabaseSummary=()=>({players:database.players.length});const getEuropeanFixtures=()=>[];const saveCache=async()=>cache.push(database);${syncSource};return {run:synchronizeDatabase,getState:()=>({database,syncStatus})}`)
 return {...create(...Object.values(deps),old,cache),old,cache,events}
}
test('synchronizeDatabase rejects publication failure and restores prior snapshot without cache/event',async()=>{const f=synchronization({failure:'RPC exact failure'});await assert.rejects(f.run,/RPC exact failure/);assert.equal(f.getState().database,f.old);assert.equal(f.getState().syncStatus.lastSync,'old-date');assert.equal(f.getState().syncStatus.state,'error');assert.deepEqual(f.cache,[]);assert.deepEqual(f.events,[])})
test('synchronizeDatabase returns publication receipt and caches only confirmed cloud timestamp',async()=>{const f=synchronization(),r=await f.run();assert.equal(r.publication.id,'confirmed-id');assert.equal(f.getState().syncStatus.lastSync,'2026-10-11T12:00:00Z');assert.equal(f.cache.length,1);assert.deepEqual(f.events,['fantasy-database-updated'])})
test('configured optional sheet failure prevents partial publication',async()=>{for(const sheetFailure of ['ELITE_TRANSFERS','EUROPE_2026_27']){const f=synchronization({sheetFailure});await assert.rejects(f.run,/geen gedeeltelijke snapshot/);assert.equal(f.getState().database,f.old);assert.equal(f.cache.length,0)}})
