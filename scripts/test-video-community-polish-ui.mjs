import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import assert from 'node:assert/strict'
import {VIDEO_CATEGORIES,videoCategory} from '../src/public/videoCatalog.js'
const origin=process.env.FVT_ORIGIN||'http://127.0.0.1:5180',session=process.env.FVT_SESSION||'fvt'
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:65000})
const ev=code=>{const value=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof value==='string'?JSON.parse(value):value}
const click=s=>run('eval',`document.querySelector(${JSON.stringify(s)}).click()`)
const checks=[];const ok=(value,label)=>{assert(value,label);checks.push(label);console.log(label)}
const sizes=[[1920,1080],[1366,900],[820,1180],[390,844]]
const responsive=(name,images=false)=>{for(const [w,h] of sizes){run('set','viewport',String(w),String(h));ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),`${name} no overflow ${w}`);if(images)ok(ev('Array.from(document.querySelectorAll(".fvt-video-thumb"),e=>Math.abs(e.clientWidth/e.clientHeight-16/9)<.02).every(Boolean)'),`Featured/cards 16:9 ${w}`);if(name==='topics')run('eval','document.querySelector(".fvt-topic").scrollIntoView({block:"center"})');run('screenshot',`test-results/polish-${name}-${w}.png`)}run('set','viewport','1366','900')}
// All temporary writes belong to the existing isolated acceptance user. Cleanup
// runs even when a UI assertion fails, and matches both exact unique title and owner.
const env=loadEnv('production',process.cwd(),'');assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co');
const testAccount=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')).find(a=>a.role==='a');
const cleanupClient=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
assert.equal((await cleanupClient.auth.signInWithPassword({email:testAccount.email,password:testAccount.password})).error,null);
const topicTitle='[Acceptatietest] Video-community polish '+Date.now();
try {
run('open',origin+'/videos');run('wait','--fn','document.querySelector("[data-featured-video] img")?.naturalWidth>=320');
const data=await(await fetch(origin+'/api/latest-video')).json(),featured=data.videos[0],rest=data.videos.slice(1);
ok(ev('document.querySelector("[data-featured-video]").dataset.featuredVideo')===featured.id,'Featured uses newest real feed identity');
ok(ev('document.querySelector(".fvt-featured h2").textContent')===featured.title,'Featured title matches feed');
ok(ev('document.querySelector(".fvt-featured time").dateTime')===featured.published,'Featured date matches feed');
ok(ev('Array.from(document.querySelectorAll(".fvt-featured a"),e=>e.href)').every(url=>new URL(url).searchParams.get('v')===featured.id),'Featured image and CTA link to same video');
ok(ev('document.querySelector(".fvt-featured img").src').includes('/'+featured.id+'/maxresdefault.jpg'),'Featured has high-resolution thumbnail for same ID');
ok(!ev('Array.from(document.querySelectorAll("[data-video-id]"),e=>e.dataset.videoId)').includes(featured.id),'Featured is not duplicated in cards');
assert.deepEqual(ev('Array.from(document.querySelectorAll("[data-category]"),e=>e.textContent)'),['Alles',...VIDEO_CATEGORIES]);ok(true,'All seven requested filters, no Teamcheck category');
responsive('videos',true);
for(const category of VIDEO_CATEGORIES){click(`[data-category="${category}"]`);assert.deepEqual(ev('Array.from(document.querySelectorAll("[data-video-id]"),e=>e.dataset.videoId)'),rest.filter(v=>videoCategory(v)===category).map(v=>v.id));ok(true,category+' filters real feed correctly')}
click('[data-category="Terugblik"]');ok(ev('Array.from(document.querySelectorAll("[data-video-id]"),e=>e.dataset.videoId)').includes('THCDnQHsnVo'),'Verified round-five recap appears under Terugblik');
run('eval','document.querySelector(".fvt-featured img").dispatchEvent(new Event("error"))');run('wait','--fn','document.querySelector(".fvt-featured img").complete && document.querySelector(".fvt-featured img").naturalWidth>=320');
ok(ev('document.querySelector(".fvt-featured img").src').endsWith('/'+featured.id+'/hqdefault.jpg'),'Image failure falls back within same episode');ok(!ev('document.querySelector(".fvt-featured img").hidden'),'Fallback stays visible despite global image-error handling');
run('open',origin+'/community');run('wait','.fvt-category-card');
const categories=['Algemeen Fantasy','Selectie & Transfers','Spelers','Clubs','Speelrondes & Captainkeuzes','FVT-video’s & content','Off-topic voetbal'];assert.deepEqual(ev('Array.from(document.querySelectorAll(".fvt-category-card strong"),e=>e.textContent)'),categories);ok(true,'Seven canonical community category cards');responsive('community');
const categoryId=ev('Array.from(document.querySelectorAll("[name=category] option")).find(e=>e.textContent==="Selectie & Transfers").value');
click(`[data-forum-category="${categoryId}"]`);ok(ev('document.querySelector("[name=category]").value')===categoryId,'Category card controls existing topic filter');
run('open',origin+'/community/nieuw');run('wait','#topic-form');run('select','[name=category_id]',categoryId);run('fill','[name=fvt_title]',topicTitle);run('fill','[name=fvt_body]','Tijdelijke gerichte polishcontrole. Dit topic en de reactie worden na de test verwijderd.');click('#topic-form button[type=submit]');run('wait','#reply-form');
const topicUrl=ev('location.href');writeFileSync('test-results/polish-topic.json',JSON.stringify({url:topicUrl,id:topicUrl.split('/').at(-1)}));ok(ev('document.querySelector("#forum-page>.fvt-badge")?.textContent || document.querySelector("#forum-page>p .fvt-badge").textContent')==='Selectie & Transfers','New topic uses merged category');
run('fill','#reply-form textarea','[Acceptatietest] Reactie na de visuele polish.');run('wait','2100');click('#reply-form button[type=submit]');run('wait','--fn','document.querySelector("#forum-replies").textContent.includes("Reactie na de visuele polish")');ok(true,'Posting and replying still work');responsive('topic');
click('[data-edit=post]');run('fill','#forum-replies textarea','[Acceptatietest] Eigen reactie bijgewerkt.');click('#forum-replies button[type=submit]');run('wait','--fn','document.querySelector("#forum-replies").textContent.includes("Eigen reactie bijgewerkt")');ok(true,'Own reply editing still works');
const accounts=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8'));let lastAuthor='';
for(const role of ['b','editor']){const account=accounts.find(a=>a.role===role),client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});assert.equal((await client.auth.signInWithPassword({email:account.email,password:account.password})).error,null);try{if(role==='b'){
 const update=await client.from('forum_topics').update({title:'Forbidden cross-user edit'}).eq('id',topicUrl.split('/').at(-1)).select('id');assert.equal(update.error,null);ok(update.data.length===0,'Cross-user topic editing remains denied');
 const reply=await client.from('forum_posts').insert({topic_id:topicUrl.split('/').at(-1),body:'[Acceptatietest] Tweede auteur voor laatste-reactiecontrole.'}).select('author_name').single();assert.equal(reply.error,null);lastAuthor=reply.data.author_name;
}else{assert.equal((await client.rpc('moderate_forum_topic',{topic:topicUrl.split('/').at(-1),is_pinned:true,is_closed:false})).error,null)}}finally{await client.auth.signOut()}}
run('open',origin+'/community');run('wait','.fvt-topic');
ok(ev('document.querySelector(".fvt-topic-activity").textContent').includes('Laatste reactie'),'Topic list shows actual latest reply author');ok(ev('document.querySelector(".fvt-reply-count strong").textContent')==='2','Actual reply count visible');
ok(ev('document.querySelector(".fvt-topic-activity>div strong").textContent')===lastAuthor,'Latest reply byline belongs to actual latest author');ok(ev('document.querySelector(".fvt-topic").classList.contains("is-pinned")'),'Pinned topic gets explicit visual emphasis');
responsive('topics');
writeFileSync('test-results/video-community-polish-ui.json',JSON.stringify({origin,checks},null,2));console.log(`${checks.length} focused polish UI checks passed`)

} finally {
 const own=await cleanupClient.from('forum_topics').select('id').eq('user_id',testAccount.id).eq('title',topicTitle);assert.equal(own.error,null);
 for(const row of own.data){const removed=await cleanupClient.from('forum_topics').delete().eq('id',row.id).eq('user_id',testAccount.id).select('id');assert.equal(removed.error,null);assert.equal(removed.data.length,1)}
 const remaining=await cleanupClient.from('forum_topics').select('id').eq('user_id',testAccount.id).eq('title',topicTitle);assert.equal(remaining.error,null);assert.equal(remaining.data.length,0);
 console.log('Temporary acceptance topic and cascading replies removed; no test content retained');
 await cleanupClient.auth.signOut();
}
