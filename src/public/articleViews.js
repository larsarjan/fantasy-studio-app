import {appUrl,supabase} from '../platform/client.js'
import {createViewTracker,viewEligible,internalArticleView,viewLabel} from '../services/articleViewModel.js'
const track=createViewTracker()
export function mountArticleViews(root,article,account){
 const target=root.querySelector('[data-article-views]')
 if(!target||!viewEligible(article))return
 const run=async()=>{
  if(!target.isConnected)return
  try{
   const readOnly=internalArticleView(account,location.search)
   const {data:{session}}=await supabase.auth.getSession()
   if(!target.isConnected)return
   const total=await track(appUrl('api/article-views'),article.id,{readOnly,authorization:session?.access_token?'Bearer '+session.access_token:undefined})
   if(total!==null&&target.isConnected){target.textContent=viewLabel(total);target.hidden=false}
  }catch{/* Analytics never replaces or blocks article content. */}
 }
 if(document.visibilityState==='visible')void run()
 else {const visible=()=>{if(document.visibilityState==='visible'||!target.isConnected){document.removeEventListener('visibilitychange',visible);if(target.isConnected)void run()}};document.addEventListener('visibilitychange',visible)}
}
