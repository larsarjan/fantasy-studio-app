import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const env=loadEnv('production',process.cwd(),'');assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co')
const accounts=JSON.parse(readFileSync('test-results/staging-accounts.json','utf8'));const clients={};const checks=[]
const ok=(r,label)=>{assert.equal(r.error,null,`${label}: ${r.error?.message}`);checks.push(label);return r.data}
for(const role of ['a','b','editor']){const account=accounts.find(a=>a.role===role);const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});ok(await client.auth.signInWithPassword({email:account.email,password:account.password}),role+' login');clients[role]=client}
const anon=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const cat=ok(await anon.from('forum_categories').select('*').order('position'),'Public forum categories');assert.equal(cat.length,7);assert.equal(cat[5].name,'FVT-video’s & content')
const topic=ok(await clients.a.from('forum_topics').insert({category_id:cat[0].id,title:'[Acceptatietest] FVT beveiliging',body:'Tijdelijk controlebericht. Geen echte discussie; wordt na acceptatie verwijderd.'}).select().single(),'Create own topic')
try{
 assert.equal(ok(await clients.b.from('forum_topics').update({title:'Forbidden'}).eq('id',topic.id).select(),'Cross-user topic update').length,0)
 assert.equal(ok(await clients.b.from('forum_topics').delete().eq('id',topic.id).select(),'Cross-user topic delete').length,0)
 assert((await anon.from('forum_posts').insert({topic_id:topic.id,body:'Forbidden'})).error);checks.push('Anonymous posting denied')
 assert((await clients.b.rpc('moderate_forum_topic',{topic:topic.id,is_pinned:true,is_closed:true})).error);checks.push('Viewer moderation denied')
 const reply=ok(await clients.b.from('forum_posts').insert({topic_id:topic.id,body:'[Acceptatietest] Reactie tweede gebruiker.'}).select().single(),'Reply user B')
 assert.equal(ok(await clients.a.from('forum_posts').update({body:'Forbidden'}).eq('id',reply.id).select(),'Cross-user reply update').length,0)
 const publicTopic=ok(await anon.from('forum_topics').select('*,forum_posts(*)').eq('id',topic.id).single(),'Public discussion read');assert(!JSON.stringify(publicTopic).includes('@example.invalid'));checks.push('No email in public discussion')
 assert((await clients.a.from('forum_topics').update({author_name:'Spoof'}).eq('id',topic.id)).error);checks.push('Author spoofing denied')
 ok(await clients.editor.rpc('moderate_forum_topic',{topic:topic.id,is_pinned:true,is_closed:true}),'Editor closes topic')
 assert((await clients.b.from('forum_posts').update({body:'Closed edit'}).eq('id',reply.id)).error);checks.push('Closed topic enforced server-side')
 assert((await clients.a.from('news_articles').insert({title:'Forbidden',slug:'forbidden'})).error);checks.push('Viewer news creation denied')
 const draft=ok(await clients.editor.from('news_articles').insert({title:'[Privéconcept] FVT acceptatietest',slug:'fvt-acceptatie-'+Date.now(),intro:'Uitsluitend een privéconcept voor de functionele acceptatietest.',body:'Dit is een tijdelijk conceptbericht voor de FVT-platformacceptatie. Dit bericht wordt niet gepubliceerd.',image_url:'https://fantasy-studio-app.vercel.app/landing/stadium.jpg',image_alt:'FVT stadionachtergrond',tags:['acceptatie']}).select().single(),'Editor creates private draft')
 for(const [role,client] of [['anonymous',anon],['viewer',clients.a]])assert.equal(ok(await client.from('news_articles').select('*').eq('id',draft.id),role+' draft isolation').length,0)
 assert.equal(ok(await clients.a.from('news_articles').update({status:'published',published_at:new Date().toISOString()}).eq('id',draft.id).select(),'Viewer cannot publish').length,0)
 assert.equal(ok(await clients.a.from('profiles').select('id'),'Private profiles stay isolated').length,1)
 writeFileSync('test-results/fvt-fixtures.json',JSON.stringify({draftId:draft.id,draftSlug:draft.slug,editorId:accounts.find(a=>a.role==='editor').id},null,2));
}finally{ok(await clients.a.from('forum_topics').delete().eq('id',topic.id),'Clean up API test topic')}
writeFileSync('test-results/fvt-live.json',JSON.stringify({checks},null,2));console.log(`${checks.length} live API checks passed; only a private draft remains for UI acceptance`)
