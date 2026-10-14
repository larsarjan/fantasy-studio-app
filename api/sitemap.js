import {createClient} from '@supabase/supabase-js'
export async function GET(){
 const base='https://fantasyvoetbaltalk.nl',paths=['/','/nieuws','/videos','/ranglijsten','/community','/studio','/about','/privacy','/contact']
 try{
  const db=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  for(let offset=0;offset<10000;offset+=1000){
   const result=await db.from('news_articles').select('slug').eq('status','published').lte('published_at',new Date().toISOString()).order('id').range(offset,offset+999)
   if(result.error)throw Error('sitemap')
   paths.push(...result.data.filter(r=>/^[a-z0-9-]+$/.test(r.slug)).map(r=>'/nieuws/'+r.slug))
   if(result.data.length<1000)break
  }
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(path=>'<url><loc>'+base+path+'</loc></url>').join('')+'</urlset>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, s-maxage=300'}})
 }catch{return new Response('Sitemap tijdelijk niet beschikbaar',{status:503,headers:{'Cache-Control':'no-store'}})}
}
