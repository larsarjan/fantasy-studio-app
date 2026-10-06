import assert from 'node:assert/strict'
import { deleteLocalTransfer, isTransferLiveNew, mergeTransferSharedSnapshot, patchTransferClubEditorial, patchTransferEditorial, readTransferEditorial, readTransferLiveSession, readTransferSharedQueue, synchronizeTransferDeadlineSharedData, upsertLocalTransfer, writeTransferLiveSession, writeTransferSharedConfig } from './transferDeadlineEditorial.js'

const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.setItem?values.setItem(key,value):values.set(key,value)}
patchTransferEditorial('t1',{role:'rotatie',competition:['p1','p2']},storage)
patchTransferClubEditorial('Ajax',{score:82,verdict:'sterker'},storage)
assert.deepEqual(readTransferEditorial(storage).transfers.t1.competition,['p1','p2'])
assert.equal(readTransferEditorial(storage).clubs.Ajax.score,82)
patchTransferClubEditorial('Ajax',{score:0},storage)
assert.equal(readTransferEditorial(storage).clubs.Ajax.score,0)
patchTransferClubEditorial('PSV',{score:100},storage)
assert.equal(readTransferEditorial(storage).clubs.PSV.score,100)
assert.equal(readTransferSharedQueue(storage).filter(item=>item.key==='club:Ajax').length,1)
writeTransferLiveSession({startedAt:'2026-08-29T10:00:00Z'},storage)
assert.equal(readTransferLiveSession(storage).startedAt,'2026-08-29T10:00:00Z')
upsertLocalTransfer({id:'local-1',playerName:'Test'},storage)
assert.equal(readTransferEditorial(storage).localTransfers.length,1)
upsertLocalTransfer({id:'local-1',playerName:'Gewijzigd'},storage)
assert.equal(readTransferEditorial(storage).localTransfers[0].playerName,'Gewijzigd')
deleteLocalTransfer('local-1',storage)
assert.equal(readTransferEditorial(storage).localTransfers.length,0)

assert.equal(readTransferSharedQueue(storage).some(item=>item.action==='deleteLiveTransfer'),true)
const shared=mergeTransferSharedSnapshot({transfers:{t1:{role:'lokaal',updatedAt:'2026-08-29T12:00:00Z',pending:true}},clubs:{},localTransfers:[]},{editorial:[{key:'transfer:t1',transferId:'t1',rol:'gedeeld oud',updatedAt:'2026-08-29T11:00:00Z'},{key:'club:Ajax',club:'Ajax',recordType:'club',windowScore:91,updatedAt:'2026-08-29T11:00:00Z'}],liveTransfers:[{transferId:'shared-1',playerName:'Gedeeld',updatedAt:'2026-08-29T11:00:00Z'}]})
assert.equal(shared.transfers.t1.role,'lokaal')
assert.equal(shared.clubs.Ajax.score,91)
assert.equal(shared.localTransfers[0].id,'shared-1')
const newerShared=mergeTransferSharedSnapshot(shared,{editorial:[{key:'transfer:t1',transferId:'t1',rol:'gedeeld nieuw',updatedAt:'2026-08-29T13:00:00Z'}]})
assert.equal(newerShared.transfers.t1.role,'gedeeld nieuw')
const legacyKeyShared=mergeTransferSharedSnapshot({transfers:{},clubs:{},localTransfers:[]},{editorial:[{key:'legacy-transfer-id',speler:'Legacy',rol:'basis'},{key:'Ajax',club:'Ajax',windowScore:84,oordeel:'sterker'}]})
assert.equal(legacyKeyShared.transfers['legacy-transfer-id'].role,'basis')
assert.equal(legacyKeyShared.clubs.Ajax.score,84)
const invalidShared=mergeTransferSharedSnapshot({transfers:{},clubs:{},localTransfers:[]},{editorial:[{key:'club:PSV',club:'PSV',recordType:'club',windowScore:101}]})
assert.equal(invalidShared.clubs.PSV.score,undefined)
assert.equal(isTransferLiveNew({createdAt:'2026-08-29T20:12:00Z'},{},'2026-08-29T19:55:00Z'),true)
assert.equal(isTransferLiveNew({createdAt:'2026-08-29T19:30:00Z'},{},'2026-08-29T19:55:00Z'),false)

const syncValues=new Map(),syncStorage={getItem:key=>syncValues.get(key)??null,setItem:(key,value)=>syncValues.set(key,value)}
writeTransferSharedConfig({endpoint:'https://example.test/exec',token:'  test\n'},syncStorage)
assert.equal(writeTransferSharedConfig({},syncStorage).token,'test')
patchTransferEditorial('t2',{label:'Must watch'},syncStorage)
const requests=[]
const originalFetch=globalThis.fetch
globalThis.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):{}
  requests.push({url:String(url),method:options.method??'GET',body})
  if(body.action==='snapshot')return {ok:true,json:async()=>({ok:true,editorial:[{key:'transfer:t2',transferId:'t2',label:'Must watch',updatedAt:new Date(Date.now()+1000).toISOString()}],liveTransfers:[]})}
  return {ok:true,json:async()=>({ok:true})}
}
const syncStatus=await synchronizeTransferDeadlineSharedData({storage:syncStorage})
globalThis.fetch=originalFetch
assert.equal(syncStatus.state,'synced')
assert.equal(requests.filter(request=>request.method==='POST').length,3)
assert.equal(requests.filter(request=>request.body.action==='patchEditorial').length,1)
assert.equal(requests.filter(request=>request.body.action==='snapshot').length,2)
assert.equal(requests.every(request=>request.body.token==='test'),true)
assert.equal(requests.every(request=>!request.url.includes('token=')),true)
assert.equal(readTransferSharedQueue(syncStorage).length,0)
assert.equal(readTransferEditorial(syncStorage).transfers.t2.pending,false)

const offlineValues=new Map(),offlineStorage={getItem:key=>offlineValues.get(key)??null,setItem:(key,value)=>offlineValues.set(key,value)}
writeTransferSharedConfig({endpoint:'https://offline.test/exec',token:'test'},offlineStorage)
upsertLocalTransfer({id:'offline-1',playerName:'Offline speler',club:'Ajax',from:'Arsenal',to:'Ajax'},offlineStorage)
globalThis.fetch=async()=>{throw new Error('netwerk uit')}
const offlineStatus=await synchronizeTransferDeadlineSharedData({storage:offlineStorage})
globalThis.fetch=originalFetch
assert.equal(offlineStatus.state,'offline')
assert.equal(readTransferSharedQueue(offlineStorage).length,1)
assert.equal(readTransferEditorial(offlineStorage).localTransfers[0].playerName,'Offline speler')

const authValues=new Map(),authStorage={getItem:key=>authValues.get(key)??null,setItem:(key,value)=>authValues.set(key,value)}
writeTransferSharedConfig({endpoint:'https://auth.test/exec',token:'never-log-this'},authStorage)
globalThis.fetch=async()=>({ok:true,json:async()=>({ok:false,error:'Niet geautoriseerd.',code:'AUTH',authDiagnostics:{serverTokenConfigured:true,clientTokenProvided:true,clientTokenLength:14,serverTokenLength:15,tokenMatch:false}})})
const authStatus=await synchronizeTransferDeadlineSharedData({storage:authStorage})
assert.equal(authStatus.state,'offline')
assert.equal(authStatus.message.includes('clientTokenLength=14'),true)
assert.equal(authStatus.message.includes('never-log-this'),false)

const server={editorial:[],liveTransfers:[]}
globalThis.fetch=async(_url,options={})=>{
  const operation=JSON.parse(options.body)
  if(operation.action==='snapshot')return {ok:true,json:async()=>({ok:true,...server})}
  if(operation.action==='patchEditorial'){
    const existing=server.editorial.find(row=>row.key===operation.key)??{}
    const next={...existing,key:operation.key,recordType:operation.key.startsWith('club:')?'club':'transfer',club:operation.club,transferId:operation.transferId,updatedAt:operation.updatedAt,...operation.patch}
    server.editorial=server.editorial.filter(row=>row.key!==operation.key).concat(next)
  }
  if(operation.action==='upsertLiveTransfer')server.liveTransfers=server.liveTransfers.filter(row=>row.transferId!==operation.key).concat({...operation.transfer,transferId:operation.key})
  return {ok:true,json:async()=>({ok:true})}
}
const createStorage=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)}}
const computerA=createStorage(),computerB=createStorage()
writeTransferSharedConfig({endpoint:'https://shared.test/exec',token:'test',clientId:'computer-a'},computerA)
writeTransferSharedConfig({endpoint:'https://shared.test/exec',token:'test',clientId:'computer-b'},computerB)
patchTransferClubEditorial('Ajax',{score:88,note:'Gedeeld vanaf A'},computerA)
upsertLocalTransfer({id:'live-a',playerName:'Live vanaf A',club:'Ajax',from:'Arsenal',to:'Ajax'},computerA)
await synchronizeTransferDeadlineSharedData({storage:computerA})
await synchronizeTransferDeadlineSharedData({storage:computerB})
assert.equal(readTransferEditorial(computerB).clubs.Ajax.score,88)
assert.equal(readTransferEditorial(computerB).localTransfers[0].playerName,'Live vanaf A')
await new Promise(resolve=>setTimeout(resolve,2))
patchTransferClubEditorial('Ajax',{score:90,note:'Nieuwere wijziging vanaf B'},computerB)
await synchronizeTransferDeadlineSharedData({storage:computerB})
await synchronizeTransferDeadlineSharedData({storage:computerA})
assert.equal(readTransferEditorial(computerA).clubs.Ajax.score,90)
assert.equal(readTransferEditorial(computerA).clubs.Ajax.note,'Nieuwere wijziging vanaf B')
globalThis.fetch=originalFetch
console.log('Transfer Deadline Editorial-tests geslaagd.')
