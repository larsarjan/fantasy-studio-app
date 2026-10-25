import test from 'node:test'
import assert from 'node:assert/strict'
import {collectAvailabilitySheet} from './availabilitySheet.js'
import {createAvailabilitySyncHandler} from './availabilitySyncHandler.js'
const row={Active:'true',Season:'2026/2027',Fantasy_Player_ID:'p1',Fantasy_Club:'Ajax',Match_Status:'exact',Last_Seen_At:'2026-10-23T10:00:00Z',Source_URL:'https://www.blessuresenschorsingen.nl/test-1',Source_Hash:'a'.repeat(64),Availability_Percentage:'0',Status_Type:'injury',Expected_Return:'',Reason:'Enkel'}
const collect=rows=>collectAvailabilitySheet({fetchRows:async()=>rows,now:Date.parse('2026-10-23T11:00:00Z')})
test('only current matched rows are selected; null and zero stay distinct',async()=>{
 const r=await collect([row,{...row,Active:'false'},{...row,Match_Status:'unmatched'}]);assert.equal(r.length,1);assert.equal(r[0].availability_percentage,0)
 assert.equal((await collect([{...row,Availability_Percentage:'',Status_Type:'unknown'}]))[0].availability_percentage,null)
})
test('empty, duplicate, invalid, timeout and HTTP errors never return a clearing batch',async()=>{
 for(const rows of [[],[row,row],[{...row,Source_URL:'javascript:alert(1)'}],[{...row,Last_Seen_At:'bad'}],[{...row,Availability_Percentage:'42'}]])await assert.rejects(()=>collect(rows))
 for(const message of ['Timeout','HTTP 503'])await assert.rejects(()=>collectAvailabilitySheet({fetchRows:async()=>{throw Error(message)}}))
})
test('sync is disabled by default, authenticated server only, and rejects user datasets',async()=>{
 let writes=0,reads=0
 const clientFactory=()=>({rpc:async(name)=>name==='reference_check_scheduler'?{data:true}:{data:++writes}})
 const env={AVAILABILITY_SHEET_ENABLED:'true',VITE_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-test'}
 const h=createAvailabilitySyncHandler({env,clientFactory,collect:async()=>{reads++;return [row]}})
 const request=(headers={},body='{}')=>new Request('https://studio.test/api/availability-sync',{method:'POST',headers,body})
 assert.equal((await h(request())).status,403);assert.equal(reads,0)
 assert.equal((await h(request({'x-sync-token':'test'},'{"items":[]}'))).status,400);assert.equal(writes,0)
 assert.equal((await h(request({'x-sync-token':'test'}))).status,200);assert.equal(writes,1)
 assert.equal((await createAvailabilitySyncHandler({env:{},clientFactory})(request())).status,503)
})
