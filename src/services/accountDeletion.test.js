import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccountDeletionHandler } from './accountDeletion.js'
const actor='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002'
const token='x.'+Buffer.from(JSON.stringify({sub:actor,session_id:sid})).toString('base64url')+'.x'
function setup({stage,begin='started',valid=true}={}) {
 const calls=[],logs=[];let listed=false
 const db={auth:{getUser:async()=>valid?{data:{user:{id:actor}}}:{error:{message:'secret error'}},admin:{signOut:async(t,scope)=>{calls.push(['signout',scope]);return stage==='sessions'?{error:{}}:{}},deleteUser:async id=>{calls.push(['delete',id]);return stage==='auth'?{error:{}}:{}}}},rpc:async(name,args)=>{calls.push([name,args]);if(name==='account_deletion_begin')return{data:{code:begin,job_id:'job'}};if(name==='account_deletion_storage'){if(stage==='inventory')return{error:{}};if(listed)return{data:[]};listed=true;return{data:[{bucket_id:'personal',name:'own/file.webp'}]}}return{}},storage:{from:bucket=>({remove:async names=>{calls.push(['remove',bucket,names]);return stage==='storage'?{error:{}}:{}}})}}
 return{calls,logs,handle:createAccountDeletionHandler({db,origins:['https://studio.example'],log:event=>logs.push(event)})}
}
const request=(body={confirmation:'VERWIJDER'},headers={},method='POST')=>new Request('https://backend.example/delete-account',{method,headers:{'content-type':'application/json',authorization:'Bearer '+token,...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})})
test('self-service deletes only verified bearer user, after Storage cleanup and session revocation',async()=>{
 const s=setup(),r=await s.handle(request());assert.equal(r.status,200)
 assert.deepEqual(s.calls.find(c=>c[0]==='delete'),['delete',actor])
 assert(s.calls.findIndex(c=>c[0]==='remove')<s.calls.findIndex(c=>c[0]==='signout'))
 assert(s.calls.findIndex(c=>c[0]==='signout')<s.calls.findIndex(c=>c[0]==='delete'))
 assert.deepEqual(s.calls.find(c=>c[0]==='account_deletion_begin')[1],{actor,session_id:sid})
 assert(!JSON.stringify(s.logs).includes(actor));assert(!JSON.stringify(s.logs).includes(token))
})
test('confirmation, IDOR, invalid auth, cross-origin and method bypasses do not delete',async()=>{
 for(const [req,status]of[[request({confirmation:'VERWIJDER',user_id:'victim'}),400],[request({confirmation:'ja'}),400],[request({}, {},'GET'),405],[request(undefined,{origin:'https://evil.example'}),403],[request(undefined,{authorization:''}),401]]){const s=setup();assert.equal((await s.handle(req)).status,status);assert(!s.calls.some(c=>c[0]==='delete'))}
 const s=setup({valid:false});assert.equal((await s.handle(request())).status,401);assert.equal(s.calls.length,0)
})
test('failed deletion is logged without secrets and never proceeds past a failing prerequisite',async()=>{
 for(const stage of ['inventory','storage','sessions','auth']){const s=setup({stage});assert.equal((await s.handle(request())).status,503);if(stage!=='auth')assert(!s.calls.some(c=>c[0]==='delete'));assert.equal(s.logs[0].outcome,'failed');assert(s.calls.some(c=>c[0]==='account_deletion_failed'))}
})
test('duplicate request and last administrator protection never start cleanup',async()=>{
 for(const [begin,status]of[['in_progress',409],['last_admin',403],['session_required',403]]){const s=setup({begin});assert.equal((await s.handle(request())).status,status);assert.equal(s.calls.length,1)}
})
