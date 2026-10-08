import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import assert from 'node:assert/strict'
const origin=process.env.FVT_ORIGIN||'http://127.0.0.1:5180',session=process.env.FVT_SESSION||'fvt-editor',pinnedOnly=process.env.FVT_PINNED_ONLY==='1'
const run=(...a)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...a],{encoding:'utf8',timeout:65000})
const ev=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v}
const click=s=>run('eval',`document.querySelector(${JSON.stringify(s)}).click()`)
const checks=[],ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
const env=loadEnv('production',process.cwd(),'');assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co')
const account=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')).find(a=>a.role==='editor')
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
assert.equal((await client.auth.signInWithPassword({email:account.email,password:account.password})).error,null)
const title='[Acceptatietest] Pinned release '+Date.now()
try{
 if(!pinnedOnly){
  run('open',origin+'/videos');run('wait','--fn','document.querySelector(".fvt-featured img")?.naturalWidth>=320');
  const feed=await(await fetch(origin+'/api/latest-video')).json(),v=feed.videos[0];
  ok(ev('document.querySelector(".fvt-featured h2").textContent')===v.title&&ev('document.querySelector(".fvt-featured img").src').includes('/'+v.id+'/'),'Live featured image/title match real feed');
  assert.deepEqual(ev('Array.from(document.querySelectorAll("[data-category]"),e=>e.textContent)'),['Alles','5 Vooruit','De Picks','Terugblik','Samenwerkingen','Live','Overige / Specials']);ok(true,'Seven live video filters');
  click('[data-category="Terugblik"]');ok(ev('document.querySelectorAll("[data-video-id]").length')>0,'Live recap filter works');
 }
 run('open',origin+'/community');run('wait','.fvt-category-card');
 assert.deepEqual(ev('Array.from(document.querySelectorAll(".fvt-category-card strong"),e=>e.textContent)'),['Algemeen Fantasy','Selectie & Transfers','Spelers','Clubs','Speelrondes & Captainkeuzes','FVT-video’s & content','Off-topic voetbal']);ok(true,'Seven live community categories');
 let id;
 if(pinnedOnly){const cat=await client.from('forum_categories').select('id').eq('name','Algemeen Fantasy').single();assert.equal(cat.error,null);const t=await client.from('forum_topics').insert({category_id:cat.data.id,title,body:'Tijdelijke pinned-controle; automatische opruiming na de test.'}).select('id').single();assert.equal(t.error,null);id=t.data.id;run('open',origin+'/community/'+id)}
 else{run('open',origin+'/community/nieuw');run('wait','#topic-form');run('fill','[name=fvt_title]',title);run('fill','[name=fvt_body]','Tijdelijke releasecontrole; automatische opruiming na de test.');click('#topic-form button[type=submit]');run('wait','#reply-form');id=ev('location.pathname.split("/").at(-1)');ok(true,'Live topic creation works')}
 run('wait','#moderate-pin');click('#moderate-pin');run('wait','--fn','document.querySelector("#moderate-pin")?.textContent==="Losmaken"');
 run('open',origin+'/community');run('wait','.fvt-topic.is-pinned');
 const pinnedSelector=`.fvt-topic:has(a[href$="/${id}"])`;
 ok(ev(`document.querySelector(${JSON.stringify(pinnedSelector)}).classList.contains('is-pinned')`),'Pinned topic visibly marked');
 ok(ev(`document.querySelector(${JSON.stringify(pinnedSelector)}).textContent.includes('Vastgezet')`),'Pinned label visible');
 ok(ev(`getComputedStyle(document.querySelector(${JSON.stringify(pinnedSelector)})).borderLeftWidth`)==='3px','Pinned topic has cyan visual accent');
 ok(ev(`document.querySelector('#forum-topics .fvt-topic').classList.contains('is-pinned')`),'Pinned topics sort first');
 for(const [w,h] of [[1366,900],[390,844]]){run('set','viewport',String(w),String(h));run('eval',`document.querySelector(${JSON.stringify(pinnedSelector)}).scrollIntoView({block:'center'})`);ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),`Pinned card no overflow ${w}`);run('screenshot',`test-results/pinned-release-${w}.png`)}
 run('open',origin+'/community/'+id);run('wait','#moderate-pin');click('#moderate-pin');run('wait','--fn','document.querySelector("#moderate-pin")?.textContent==="Vastzetten"');ok(true,'UI unpin persists');
 if(!pinnedOnly){run('fill','#reply-form textarea','[Acceptatietest] Live reactie.');click('#reply-form button[type=submit]');run('wait','--fn','document.querySelector("#forum-replies").textContent.includes("Live reactie")');ok(true,'Live replying works');click('[data-edit=post]');run('fill','#forum-replies textarea','[Acceptatietest] Live reactie bijgewerkt.');click('#forum-replies button[type=submit]');run('wait','--fn','document.querySelector("#forum-replies").textContent.includes("bijgewerkt")');ok(true,'Live own-reply editing works')}
 writeFileSync('test-results/polish-release-smoke.json',JSON.stringify({origin,checks},null,2));console.log(`${checks.length} targeted release checks passed`)
}finally{
 const rows=await client.from('forum_topics').select('id').eq('user_id',account.id).eq('title',title);assert.equal(rows.error,null);
 for(const row of rows.data){const result=await client.from('forum_topics').delete().eq('id',row.id).eq('user_id',account.id).select('id');assert.equal(result.error,null);assert.equal(result.data.length,1)}
 console.log('Temporary topic and replies removed');await client.auth.signOut()
}
