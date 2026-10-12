export const VIEW_WINDOW_MS=30*60*1000
export function viewNumber(value){const n=Number(value);return new Intl.NumberFormat('nl-NL',{maximumFractionDigits:0}).format(Number.isFinite(n)&&n>=0?n:0)}
export const viewLabel=value=>`${viewNumber(value)} weergaven`
export const viewsPerSession=(total,unique)=>new Intl.NumberFormat('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(unique)>0?Number(total)/Number(unique):0)
export function viewEligible(article,now=Date.now()){return article?.status==='published'&&Number.isFinite(Date.parse(article.published_at))&&Date.parse(article.published_at)<=now}
export function internalArticleView(account,search=''){return account?.permissions?.includes('articles.read')===true||new URLSearchParams(search).has('preview')}

// One in-flight registration per article, including SPA remounts. The database
// independently enforces the same window across refreshes and browser tabs.
export function createViewTracker({fetcher=fetch,now=Date.now}={}){
 const requests=new Map()
 return async function track(url,article,{authorization,readOnly=false}={}){
  const key=article+':'+readOnly,existing=requests.get(key)
  if(existing&&now()-existing.at<VIEW_WINDOW_MS)return existing.promise
  const promise=(async()=>{
   const options=()=>({method:readOnly?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(6500),...(!readOnly?{headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify({article})}:{})})
   const target=readOnly?url+'?article='+encodeURIComponent(article):url
   let response=await fetcher(target,options())
   if(response.status===202&&!readOnly)response=await fetcher(target,options())
   if(!response.ok||response.status===204)return null
   const value=await response.json();return Number.isFinite(Number(value.total_views))&&Number(value.total_views)>=0?Number(value.total_views):null
  })().catch(()=>null)
  requests.set(key,{at:now(),promise});const value=await promise
  if(value===null)requests.delete(key)
  // Bound memory in long-running SPA sessions without retaining visitor data.
  for(const [id,entry] of requests)if(now()-entry.at>=VIEW_WINDOW_MS)requests.delete(id)
  return value
 }
}
