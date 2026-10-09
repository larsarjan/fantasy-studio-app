import { supabase } from '../platform/client.js'
import { refreshAccess, hasPermission } from '../platform/access.js'
export function unwrap(result) { if(result.error) throw result.error; return result.data }
export async function contentAccount() {
  if(!supabase) return {user:null,editor:false}
  const {data:{session}}=await supabase.auth.getSession()
  if(!session) return {user:null,editor:false}
  const profile=unwrap(await supabase.from('profiles').select('display_name,role').eq('id',session.user.id).single())
  const access = await refreshAccess()
  return {user:session.user,profile,...access,editor:hasPermission(access,'articles.edit'),moderator:hasPermission(access,'forum.moderate')}
}
export async function publishedNews(limit=30) {
 return unwrap(await supabase.from('news_articles').select('id,title,slug,intro,image_url,image_alt,author_name,published_at,news_categories(name)').in('status',['published','scheduled']).lte('published_at',new Date().toISOString()).order('featured',{ascending:false}).order('published_at',{ascending:false}).limit(limit))
}
