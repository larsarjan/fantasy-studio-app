import {createClient} from '@supabase/supabase-js'
import {loadEnv} from 'vite'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
const env=loadEnv('production',process.cwd(),''),accounts=JSON.parse(readFileSync('test-results/admin-live/accounts.json','utf8')),clients={},checks=[],paths=[]
const ok=(v,label)=>{assert(v,label);checks.push(label);console.log('PASS',label)},unwrap=r=>{assert.equal(r.error,null);return r.data}
for(const a of accounts){const c=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});unwrap(await c.auth.signInWithPassword({email:a.email,password:a.password}));clients[a.role]=c}
let articleId
try{
 const editor=accounts.find(a=>a.role==='editor'),member=accounts.find(a=>a.role==='member'),png=readFileSync('test-results/cms/upload-fixture.png'),path=editor.id+'/'+randomUUID()+'.png'
 const uploaded=await clients.editor.storage.from('news-images').upload(path,png,{contentType:'image/png',upsert:false});if(uploaded.error)console.error('Storage upload error:',uploaded.error.message);unwrap(uploaded);paths.push(path);ok(true,'Editor actual Storage PNG upload')
 const url=clients.editor.storage.from('news-images').getPublicUrl(path).data.publicUrl;ok((await fetch(url)).status===200,'Uploaded image public read')
 const memberWrite=await clients.member.storage.from('news-images').upload(member.id+'/'+randomUUID()+'.png',png,{contentType:'image/png'});ok(!!memberWrite.error,'Member Storage write denied')
 const badType=await clients.editor.storage.from('news-images').upload(editor.id+'/'+randomUUID()+'.svg',Buffer.from('<svg></svg>'),{contentType:'image/svg+xml'});ok(!!badType.error,'Storage rejects SVG')
 const tooLarge=await clients.editor.storage.from('news-images').upload(editor.id+'/'+randomUUID()+'.png',Buffer.alloc(5*1024*1024+1),{contentType:'image/png'});ok(!!tooLarge.error,'Storage enforces 5 MB maximum')
 const spoof=await clients.editor.storage.from('news-images').upload(member.id+'/'+randomUUID()+'.png',png,{contentType:'image/png'});ok(!!spoof.error,'Storage cannot write another owner prefix')
 const article=unwrap(await clients.editor.from('news_articles').insert({title:'[CMS acceptatie] afbeeldingsbehoud',slug:'cms-storage-'+randomUUID(),intro:'Tijdelijke CMS-controle van opslag en behoud.',body:'Tijdelijke acceptatietekst, automatisch opgeruimd na de test.',image_url:url}).select('*').single());articleId=article.id
 await clients.editor.storage.from('news-images').remove([path]);ok((await fetch(url)).status===200,'Referenced article image protected from deletion')
 unwrap(await clients.editor.from('news_articles').update({title:'[CMS acceptatie] aangepast'}).eq('id',articleId).select('id').single());ok(unwrap(await clients.editor.from('news_articles').select('image_url').eq('id',articleId).single()).image_url===url,'Article edit retains image')
 const publishDenied=await clients.editor.from('news_articles').update({status:'published',published_at:new Date(Date.now()-60000).toISOString()}).eq('id',articleId).select('id').single();ok(!!publishDenied.error,'Editor direct API publish still denied')
 unwrap(await clients.publisher.from('news_articles').update({status:'published',published_at:new Date(Date.now()-60000).toISOString()}).eq('id',articleId).select('id').single());ok(true,'Publisher publication remains allowed')
 unwrap(await clients.publisher.from('news_articles').update({status:'draft'}).eq('id',articleId).select('id').single());ok(true,'Publisher can unpublish')
 mkdirSync('test-results/cms',{recursive:true});writeFileSync('test-results/cms/live-results.json',JSON.stringify({checks,count:checks.length},null,2));console.log(`${checks.length} live CMS Storage/content checks passed.`)
}finally{if(articleId)unwrap(await clients.admin.from('news_articles').delete().eq('id',articleId));if(paths.length)unwrap(await clients.editor.storage.from('news-images').remove(paths));for(const c of Object.values(clients))await c.auth.signOut()}
