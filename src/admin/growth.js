import {supabase} from '../platform/client.js'
import {safeHtml} from '../platform/html.js'
import {esc} from '../public/contentUI.js'
import {mountArticleStatistics} from './articleStats.js'
import './growth.css'
const number=n=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:1}).format(Number(n)||0)
const labels={activeUsers:'Gebruikers',newUsers:'Nieuwe gebruikers',sessions:'Sessies',screenPageViews:'Views',screenPageViewsPerSession:'Views per sessie',engagement:'Engagementduur per sessie (sec.)',averageEngagement:'Gem. engagement per gebruiker (sec.)',date:'Datum',sessionDefaultChannelGroup:'Kanaal',sessionSource:'Bron',sessionMedium:'Medium',landingPage:'Landingspagina',engagementRate:'Engagementratio',keyEvents:'Key events',pagePath:'Pagina',userEngagementDuration:'Engagement (sec.)',newVsReturning:'Nieuw / terugkerend',deviceCategory:'Apparaat',country:'Land',sessionCampaignName:'Campagne',eventName:'Event',eventCount:'Aantal'}
const table=(data,columns)=>`<div class="admin-table-wrap"><table><thead><tr>${columns.map(c=>`<th>${esc(labels[c]||c)}</th>`).join('')}</tr></thead><tbody>${data.length?data.map(row=>`<tr>${columns.map(c=>`<td>${esc(typeof row[c]==='number'?number(row[c]):row[c]??'—')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}">Geen gegevens in deze periode.</td></tr>`}</tbody></table></div>`
const card=(title,body)=>`<section class="admin-card"><h2>${esc(title)}</h2>${body}</section>`
const state=result=>({not_connected:'Nog niet gekoppeld. Een beheerder moet de server-side Google API-toegang instellen.',permissions:'Google weigert toegang. Controleer de propertyrechten en ingeschakelde API’s.',error:'Google is tijdelijk niet bereikbaar. Probeer het later opnieuw.'})[result?.status]||'Geen gegevens beschikbaar.'
function metrics(current={},previous={},compare=true){return `<div class="growth-metrics">${['activeUsers','newUsers','sessions','screenPageViews','screenPageViewsPerSession','engagement'].map(key=>{
 const value=key==='engagement'?current.userEngagementDuration/(current.sessions||1):current[key]||0
 const old=key==='engagement'?previous.userEngagementDuration/(previous.sessions||1):previous[key]||0
 return `<section class="admin-card"><span>${labels[key]}</span><strong>${number(value)}</strong>${compare?`<small>${number(value-old)} verschil${old?` (${number((value-old)/old*100)}%)`:''} t.o.v. vorige periode</small>`:''}</section>`
 }).join('')}</div>`}
function trend(rows){if(!rows.length)return '<p>Geen verkeer gemeten in deze periode.</p>';const max=Math.max(1,...rows.map(r=>r.sessions));return `<div class="growth-trend" role="img" aria-label="Sessies per dag">${rows.map(r=>`<div title="${esc(r.date)}: ${number(r.sessions)} sessies"><span style="height:${Math.max(1,r.sessions/max*140)}px"></span><small>${esc(r.date.slice(6))}</small></div>`).join('')}</div><details><summary>Grafiekgegevens</summary>${table(rows,['date','activeUsers','sessions','screenPageViews'])}</details>`}
export async function mountGrowth(root,account){
 root.innerHTML=safeHtml(`<div class="growth-page"><p class="admin-muted">GA4 meet bezoekers met toestemming. First-party artikeltellers tellen anders en blijven onafhankelijk. Verkeer van vóór activering wordt niet achteraf gereconstrueerd. Een stijging tijdens een campagne bewijst geen oorzakelijk verband.</p><form class="growth-filters"><label>Periode<select name="preset"><option value="1">Vandaag</option><option value="7">7 dagen</option><option value="28" selected>28 dagen</option><option value="90">90 dagen</option><option value="custom">Aangepast</option></select></label><label>Van<input type="date" name="start" required></label><label>Tot<input type="date" name="end" required></label><label><input type="checkbox" name="compare" checked> Vergelijk vorige periode</label><button type="submit">Toepassen</button></form><div data-growth-results aria-live="polite"></div><div data-first-party></div></div>`)
 const form=root.querySelector('form'),out=root.querySelector('[data-growth-results]');let requestId=0,controller
 const preset=()=>{if(form.elements.preset.value==='custom')return;const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-Number(form.elements.preset.value)+1);form.elements.start.value=start.toISOString().slice(0,10);form.elements.end.value=end.toISOString().slice(0,10)}
 preset();form.elements.preset.onchange=()=>{preset();if(form.elements.preset.value!=='custom')load()};form.elements.compare.onchange=()=>load()
 async function load(){
  controller?.abort();controller=new AbortController();const id=++requestId;out.innerHTML='<p role="status">Rapporten laden…</p>'
  try{
   const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Log opnieuw in.')
   const query=new URLSearchParams({start:form.elements.start.value,end:form.elements.end.value})
   const response=await fetch('/api/growth-analytics?'+query,{headers:{Authorization:'Bearer '+session.access_token},signal:controller.signal})
   const data=await response.json();if(!response.ok)throw Error(data.error||'Rapporten konden niet worden geladen.')
   if(id!==requestId||!out.isConnected)return
   let html='';const ga=data.ga4,seo=data.seo,compare=form.elements.compare.checked; if(ga.status==='ready')ga.pages=ga.pages.map(r=>({...r,averageEngagement:r.userEngagementDuration/(r.activeUsers||1)}))
   if(ga.status==='ready'){
    html+=`<p class="admin-muted">GA4 · laatst opgehaald ${esc(new Date(ga.updatedAt).toLocaleString('nl-NL'))}. Google verwerkt gegevens met vertraging; vandaag is onvolledig.</p>`+metrics(ga.summary[0],ga.previous[0],compare)+card('Verkeerstrend · sessies',trend(ga.trend))
    for(const [key,title,columns] of [['channels','Verkeerskanalen',['sessionDefaultChannelGroup','activeUsers','sessions']],['sources','Bron / medium',['sessionSource','sessionMedium','activeUsers','sessions']],['landings','Landingspagina’s',['landingPage','sessions','activeUsers','engagementRate','keyEvents']],['pages','Top pagina’s',['pagePath','screenPageViews','activeUsers','averageEngagement']],['audience','Nieuwe en terugkerende bezoekers',['newVsReturning','activeUsers']],['devices','Apparaten',['deviceCategory','activeUsers']],['countries','Landen',['country','activeUsers']],['campaigns','Campagnes',['sessionCampaignName','sessionSource','sessionMedium','activeUsers','newUsers','sessions','screenPageViews','engagementRate']],['campaignLandings','Campagnelandingen',['sessionCampaignName','landingPage','sessions']],['campaignEvents','Campagne-events',['sessionCampaignName','eventName','eventCount']]]){
     const values=key.startsWith('campaign')?ga[key].filter(r=>r.sessionCampaignName&&!['(not set)','(direct)','(organic)','(referral)'].includes(r.sessionCampaignName)):ga[key]
     html+=card(title,!values.length&&key.startsWith('campaign')?'<p>Er is in deze periode nog geen campagneverkeer gemeten.</p>':table(values,columns))
    }
   }else html+=card('Google Analytics',`<p>${state(ga)}</p>`)
   if(seo.status==='ready'){
    const current=seo.summary[0]||{},old=seo.previous[0]||{}
    html+=card('Google Zoeken / SEO',`<p>Definitieve Search Console-data kan enkele dagen achterlopen. Laatst opgehaald: ${esc(new Date(seo.updatedAt).toLocaleString('nl-NL'))}.</p><div class="growth-metrics">${[['clicks','Klikken'],['impressions','Vertoningen'],['ctr','CTR (%)'],['position','Gemiddelde positie']].map(([key,label])=>`<div><span>${label}</span><strong>${number((current[key]||0)*(key==='ctr'?100:1))}</strong>${compare?`<small>Verschil: ${number(((current[key]||0)-(old[key]||0))*(key==='ctr'?100:1))}</small>`:''}</div>`).join('')}</div>`)
    for(const [key,title] of [['queries','Top zoekopdrachten'],['pages','Top zoekpagina’s'],['pageQueries','Zoekopdrachten per pagina']])html+=card(title,table(seo[key].map(r=>({...r,keys:r.keys.join(' · '),ctr:r.ctr*100})),['keys','clicks','impressions','ctr','position']))
   }else html+=card('Google Zoeken / SEO',`<p>${state(seo)}</p>`)
   out.innerHTML=safeHtml(html)
  }catch(error){if(error.name!=='AbortError'&&id===requestId)out.innerHTML=safeHtml(card('Rapport niet beschikbaar',`<p>${esc(error.message)}</p>`))}
 }
 form.onsubmit=event=>{event.preventDefault();load()};await load()
 if(account.permissions.includes('articles.read')){
  const result=await supabase.from('news_articles').select('id,title,slug').eq('status','published').order('published_at',{ascending:false}).limit(20)
  if(result.error||!root.isConnected)return
  const target=root.querySelector('[data-first-party]');target.innerHTML=safeHtml(card('First-party artikeltellers · cumulatief',`<p>Los van de gekozen GA4-periode: bestaande totale weergaven en geschatte unieke sessies. Geen optelling of gelijkstelling met GA4.</p>${result.data.map(a=>`<article><h3>${esc(a.title)}</h3><div data-article-statistics="${esc(a.id)}" data-compact="true"></div></article>`).join('')||'<p>Nog geen gepubliceerde artikelen.</p>'}`))
  await mountArticleStatistics(target,result.data.map(a=>a.id))
 }
}
