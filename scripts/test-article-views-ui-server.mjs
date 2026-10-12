// Local-only HTTP fixture: real Vite modules and API handler, explicit in-memory
// RPC test double. No production articles, credentials or database writes.
import {createServer as httpServer} from 'node:http'
import {createServer as viteServer} from 'vite'
import {readFileSync} from 'node:fs'
import {createArticleViewsHandler} from '../server/articleViews.js'
const port=5193,origin='http://localhost:'+port,visitors=new Map();let total=0,unique=0,failed=false
const handler=createArticleViewsHandler({env:{VITE_SUPABASE_URL:'https://fixture.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'server-fixture',ARTICLE_VIEWS_SESSION_SECRET:'fixture-cookie-secret-that-is-long-enough'},logger:{error:()=>{}},clientFactory:()=>({rpc:async(name,args)=>{
 if(failed)return {error:{message:'simulated failure'}}
 if(name==='current_access')return {data:{permissions:[]}}
 if(name==='record_article_view'&&!visitors.has(args.visitor_hash)){visitors.set(args.visitor_hash,true);total++;unique++}
 return {data:total,error:null}
}})})
const vite=await viteServer({server:{middlewareMode:true},appType:'custom'})
httpServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/__stats')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({total_views:total,unique_views:unique,last_view_at:total?new Date().toISOString():null}));return}
  if(req.url.startsWith('/__fail')){failed=req.url.includes('on');res.end('ok');return}
  if(req.url.startsWith('/api/article-views')){const body=[];for await(const chunk of req)body.push(chunk);const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(body)}:{})});const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return}
  if(req.url.startsWith('/fixture')){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/fixture',readFileSync('scripts/fixtures/article-view-counter.html','utf8')));return}
  vite.middlewares(req,res)
 }catch{res.writeHead(500);res.end('Local test server failure')}
}).listen(port,'127.0.0.1',()=>console.log('Local article view test server ready: '+origin+'/fixture'))
