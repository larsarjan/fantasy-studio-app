import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicRankingsHandler} from './publicRankings.js';
test('public endpoint rejects non-GET and invalid group, season and round before database access',async()=>{
 const h=createPublicRankingsHandler({clientFactory:()=>{throw Error('must not query');}});
 assert.equal((await h(new Request('https://test/api',{method:'POST'}))).status,405);
 for(const q of ['group=TOP_1000','event=-1','event=1.2','event=99','season=bad'])assert.equal((await h(new Request(`https://test/api?${q}`))).status,400);
 assert.equal((await h(new Request('https://test/api'))).status,503);
});
test('server public reads cache/coalesce requests; errors are safe and retryable',async()=>{
 let calls=0,fail=false;
 const clientFactory=()=>({from(){calls++;const q={select(){return q},order(){return q},async range(){if(fail)throw Error('private database details');return {data:[]}}};return q;}});
 const h=createPublicRankingsHandler({env:{VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'public'},clientFactory});
 const request=()=>new Request('https://test/api');
 const responses=await Promise.all([h(request()),h(request())]);
 assert.equal(calls,1);assert(responses.every(r=>r.status===200));
 fail=true;
 const r=await h(new Request('https://test/api?group=ESPN'));
 assert.equal(r.status,503);assert(!(await r.text()).includes('private database'));
 fail=false;assert.equal((await h(new Request('https://test/api?group=ESPN'))).status,200);
});
