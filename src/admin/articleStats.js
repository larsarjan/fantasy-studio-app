import {supabase} from '../platform/client.js'
import {viewNumber,viewsPerSession} from '../services/articleViewModel.js'
import {safeHtml} from '../platform/html.js'
import {esc,date} from '../public/contentUI.js'
import './articleStats.css'

export function articleStatsMarkup(stats,compact=false){
 if(!stats)return '<span class="admin-muted">Statistieken tijdelijk niet beschikbaar.</span>'
 if(compact)return `<strong>${viewNumber(stats.total_views)}</strong><span class="cms-small">${viewNumber(stats.unique_views)} unieke sessies</span>`
 return `<dl class="article-stats-grid"><div><dt>Totale weergaven</dt><dd>${viewNumber(stats.total_views)}</dd></div><div><dt>Unieke sessies</dt><dd>${viewNumber(stats.unique_views)}</dd></div><div><dt>Weergaven per sessie</dt><dd>${viewsPerSession(stats.total_views,stats.unique_views)}</dd></div><div><dt>Laatste weergave</dt><dd class="article-stats-date">${stats.last_view_at?esc(date(stats.last_view_at)):'Nog geen weergaven'}</dd></div></dl><p class="cms-help">Geschatte unieke sessies, geen individuele personen. Herhaalde bezoeken binnen 30 minuten tellen één keer; een anonieme sessie verloopt na maximaal 24 uur. Preview en redactiebezoeken tellen niet mee.</p>`
}
export async function mountArticleStatistics(root,ids){
 if(!ids.length)return
 let stats=null
 try{const result=await supabase.rpc('article_view_statistics',{articles:ids});if(!result.error)stats=new Map(result.data.map(s=>[s.article_id,s]))}catch{/* Keep the CMS usable when analytics is unavailable. */}
 if(!root.isConnected)return
 root.querySelectorAll('[data-article-statistics]').forEach(node=>{if(!ids.includes(node.dataset.articleStatistics))return;node.innerHTML=safeHtml(articleStatsMarkup(stats?.get(node.dataset.articleStatistics),node.dataset.compact==='true'));node.removeAttribute('aria-busy')})
}
