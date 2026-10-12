import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'

export const VIEW_COOKIE='__Host-fvt_article_session'
export const SESSION_SECONDS=24*60*60
export const knownBot=ua=>!ua||/bot\b|crawler|spider|slurp|facebookexternalhit|facebot|twitterbot|linkedinbot|pinterest|whatsapp|telegrambot|discordbot|slackbot|uptimerobot|pingdom|statuscake|preview|lighthouse/i.test(ua.slice(0,1000))
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{...headers,...extra}})
const empty=()=>new Response(null,{status:204,headers})
const sign=(secret,value)=>createHmac('sha256',secret).update(value).digest('hex')
export function readViewSession(cookie,secret,now=Date.now()){
 const raw=String(cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(VIEW_COOKIE+'='))?.slice(VIEW_COOKIE.length+1)
 if(!raw||!/^\d{10,13}\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(raw))return null
 const [issued,id,signature]=raw.split('.'),stamp=Number(issued)
 if(stamp>now||stamp+SESSION_SECONDS*1000<=now)return null
 const expected=sign(secret,`session:${issued}.${id}`)
 if(!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))return null
 return {id,expires:new Date(stamp+SESSION_SECONDS*1000).toISOString()}
}
export function createViewSession(secret,now=Date.now()){
 const value=`${now}.${randomBytes(32).toString('hex')}`
 return `${VIEW_COOKIE}=${value}.${sign(secret,'session:'+value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`
}
export const articleSessionHash=(secret,article,session)=>sign(secret,`article:${article}:${session.id}`)

// Dependency injection keeps endpoint/security tests independent of production.
export function createArticleViewsHandler({env=process.env,clientFactory=createClient,now=Date.now,logger=console}={}){
 const client=(key,authorization)=>clientFactory(env.VITE_SUPABASE_URL.trim(),key.trim(),{auth:{persistSession:false,autoRefreshToken:false},global:{...(authorization?{headers:{Authorization:authorization}}:{}),fetch:(url,init={})=>fetch(url,{...init,signal:AbortSignal.timeout(5000)})}})
 const read=async article=>{
  const r=await client(env.VITE_SUPABASE_PUBLISHABLE_KEY).rpc('article_view_total',{article})
  if(r.error)throw Error('view_read_failed');return r.data
 }
 return async request=>{
  try{
   if(!env.VITE_SUPABASE_URL||!env.VITE_SUPABASE_PUBLISHABLE_KEY)return json({error:'Statistiek tijdelijk niet beschikbaar.'},503)
   const url=new URL(request.url)
   if(request.method==='GET'){
    const article=url.searchParams.get('article');if(!uuid.test(article||''))return json({error:'Ongeldig artikel.'},400)
    const total=await read(article);return total===null?empty():json({total_views:total})
   }
   if(request.method!=='POST')return json({error:'Methode niet toegestaan.'},405,{Allow:'GET, POST'})
   if(request.headers.get('origin')!==url.origin||['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')))return json({error:'Verzoek niet toegestaan.'},403)
   if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Ongeldig verzoek.'},415)
   if(Number(request.headers.get('content-length')||0)>512)return json({error:'Verzoek te groot.'},413)
   const body=await request.text();if(body.length>512)return json({error:'Verzoek te groot.'},413)
   let payload;try{payload=JSON.parse(body)}catch{return json({error:'Ongeldig verzoek.'},400)}
   if(!payload||Object.keys(payload).some(k=>k!=='article')||!uuid.test(payload.article||''))return json({error:'Ongeldig artikel.'},400)
   const article=payload.article,referrer=request.headers.get('referer')
   if(referrer){let ref;try{ref=new URL(referrer)}catch{return empty()};if(ref.origin!==url.origin||ref.pathname.startsWith('/admin')||ref.searchParams.has('preview'))return empty()}
   if(knownBot(request.headers.get('user-agent')||''))return empty()
   const authorization=request.headers.get('authorization')
   if(authorization){
    const access=await client(env.VITE_SUPABASE_PUBLISHABLE_KEY,authorization).rpc('current_access')
    if(access.error)return empty()
    if(access.data?.permissions?.includes('articles.read')){const total=await read(article);return total===null?empty():json({total_views:total})}
   }
   const secret=env.ARTICLE_VIEWS_SESSION_SECRET?.trim()
   if(!secret||secret.length<32||!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:'Statistiek tijdelijk niet beschikbaar.'},503)
   const session=readViewSession(request.headers.get('cookie'),secret,now())
   if(!session){
    const total=await read(article);if(total===null)return empty()
    // Establish a server-issued cookie before counting. Requests without cookie
    // support cannot repeatedly create counted sessions on every POST.
    return json({total_views:total},202,{'Set-Cookie':createViewSession(secret,now())})
   }
   const result=await client(env.SUPABASE_SERVICE_ROLE_KEY).rpc('record_article_view',{article,visitor_hash:articleSessionHash(secret,article,session),session_expires_at:session.expires})
   if(result.error)throw Error('view_write_failed')
   return result.data===null?empty():json({total_views:result.data})
  }catch(error){logger.error('article_views_unavailable',{code:['view_read_failed','view_write_failed'].includes(error.message)?error.message:'request_failed'});return json({error:'Statistiek tijdelijk niet beschikbaar.'},503)}
 }
}
