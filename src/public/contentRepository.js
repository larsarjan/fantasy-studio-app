import { supabase } from '../platform/client.js'
export function unwrap(result) { if(result.error) throw result.error; return result.data }
export async function contentAccount() {
  if(!supabase) return {user:null,editor:false}
  const {data:{session}}=await supabase.auth.getSession()
  if(!session) return {user:null,editor:false}
  const profile=unwrap(await supabase.from('profiles').select('display_name,role').eq('id',session.user.id).single())
  return {user:session.user,profile,editor:['admin','editor'].includes(profile.role)}
}
export async function publishedNews(limit=30) {
 return unwrap(await supabase.from('news_articles').select('id,title,slug,intro,image_url,image_alt,author_name,published_at,news_categories(name)').eq('status','published').lte('published_at',new Date().toISOString()).order('published_at',{ascending:false}).limit(limit))
}
