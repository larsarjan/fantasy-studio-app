import test from 'node:test'
import assert from 'node:assert/strict'
import {createArticleEntityHandler,presentArticleEntity,fixtureResult} from './articleEntities.js'
import {resolveHistoricalMatch} from '../src/services/historicalMatchDetails.js'
const env={VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'public'},f={id:'f1',season:'2026/2027',home:'PSV',away:'Ajax',round:1,date:'2026-08-01'},p={id:'p1',season:f.season,name:'Test only',position:'Spits',club:'PSV'},s={id:'s1',playerId:p.id,season:f.season,fixtureId:f.id,round:1,matchStatus:true,status:'Basis',minutes:90,goals:1}
test('public endpoint rejects methods, malformed identity and unauthenticated editor catalog',async()=>{
 const handler=createArticleEntityHandler({env,clientFactory:()=>{throw Error('must not reach database')}})
 for(const [path,method,status] of [['?kind=player&id=p1&season=2026%2F2027','POST',405],['?kind=player&id=%22&season=2026%2F2027','GET',400],['?kind=catalog','GET',401]])assert.equal((await handler(new Request('https://local/api'+path,{method}))).status,status)
})
test('member catalog denied by RPC, revoked sessions denied, errors contain no database secrets',async()=>{
 for(const [user,error,status] of [[{id:'member'},{code:'42501',message:'private detail'},403],[null,null,401],[{id:'editor'},{code:'XX000',message:'secret'},503]]){
  const handler=createArticleEntityHandler({env,clientFactory:()=>({auth:{getUser:async()=>({data:{user}})},rpc:async()=>({error})})});const r=await handler(new Request('https://local/api?kind=catalog',{headers:{Authorization:'Bearer test-only'}}));assert.equal(r.status,status);assert(!JSON.stringify(await r.json()).includes('secret'))
 }
})
test('match score endpoint is identical to existing historical score resolver',()=>{
 const data={snapshotId:'s',fixture:f,results:[{...f,homeScore:2,awayScore:0}],players:[p],stats:[s]};const result=presentArticleEntity('match',data)
 assert.deepEqual(result.groups,resolveHistoricalMatch({...f,...data.results[0],fixtureId:f.id},[f],[p],[s]));assert.equal(result.groups.home[0].match.minutes,90)
})
test('ambiguous results are not guessed, summary has no stats, player facts use same engine',()=>{
 assert.equal(fixtureResult(f,[{...f},{...f}]),null)
 const summary=presentArticleEntity('summary',{fixture:f,results:[],stats:[s],players:[p]});assert(!('stats' in summary));assert(!('groups' in summary))
 const player=presentArticleEntity('player',{player:p,stats:[s],fixtures:[f],photos:[]});assert.equal(player.recent.length,1);assert.equal(player.totalPoints,player.recent[0].points)
})
