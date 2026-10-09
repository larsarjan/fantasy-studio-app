import { renderPublic } from './homepage.js'
import { supabase, appUrl } from '../platform/client.js'
import { contentAccount, publishedNews, unwrap } from './contentRepository.js'
import { esc,date,set,empty,author,options,bindForm,errorText } from './contentUI.js'
export function newsCard(a) {
 return `<a class="fvt-card" href="${appUrl('nieuws/'+a.slug)}">${a.image_url?`<img src="${esc(a.image_url)}" alt="${esc(a.image_alt||a.title)}" loading="lazy">`:''}<span class="fvt-badge">${esc(a.news_categories?.name||'FVT')}</span><h3>${esc(a.title)}</h3><p>${esc(a.intro)}</p><div class="fvt-meta"><span>${esc(a.author_name)}</span><time>${date(a.published_at)}</time></div></a>`
}
export async function mountHomeNews(node) {
 try {const rows=await publishedNews(3);if(node.isConnected)set(node,rows.length?`<div class="fvt-grid">${rows.map(newsCard).join('')}</div>`:empty('De redactie werkt aan de eerste nieuwsberichten. Bekijk intussen de nieuwste FVT-video.'))}
 catch{if(node.isConnected)set(node,empty('Nieuws is tijdelijk niet beschikbaar. Probeer het later opnieuw.'))}
}
export async function renderNewsPage(route) {
 const account=await contentAccount();const slug=route.split('/')[1];
 renderPublic('',{mainMarkup:'<div class="fvt-content" id="news-page" role="status">Nieuws laden…</div>',pageTitle:'Nieuws'});
 const root=document.querySelector('#news-page');
 try {
 if(slug==='beheer'){location.replace(appUrl('admin/nieuws'+location.search));return}
 if(slug){
 const a=unwrap(await supabase.from('news_articles').select('*,news_categories(name)').eq('slug',slug).maybeSingle());
 if(!a){set(root,empty('Dit artikel bestaat niet of is nog niet gepubliceerd.'));return}
 document.title=`${a.title} | FVT Nieuws`;
 set(root,`<article class="fvt-article"><a class="fvt-text-link" href="${appUrl('nieuws')}">← Alle nieuwsberichten</a><p><span class="fvt-badge">${esc(a.news_categories?.name||'FVT')}</span> ${a.status==='draft'?'<span class="fvt-badge">Concept · alleen redactie</span>':''}</p><h1>${esc(a.title)}</h1><p class="fvt-lead">${esc(a.intro)}</p><div class="fvt-meta">${author(a.author_name)}<time>${date(a.published_at)}</time></div>${a.image_url?`<p><img class="fvt-article-image" src="${esc(a.image_url)}" alt="${esc(a.image_alt||a.title)}"></p>`:''}<div class="fvt-prose">${esc(a.body)}</div><div class="fvt-meta">${a.tags.map(t=>`<span class="fvt-badge">${esc(t)}</span>`).join('')}</div>${a.related_player_ids.length||a.related_fixture_ids.length?`<section class="fvt-card"><h2>Onderzoek dit in Studio</h2><div class="fvt-actions">${a.related_player_ids.map(id=>`<a href="${appUrl('studio/players?player='+encodeURIComponent(id))}">Speler ${esc(id)} →</a>`).join('')}${a.related_fixture_ids.length?`<a href="${appUrl('studio/fixtures')}">Bekijk het speelschema →</a>`:''}</div></section>`:''}${account.editor?`<p><a href="${appUrl('admin/nieuws?edit='+a.id)}">Bewerk artikel →</a></p>`:''}</article>`);return
 }
 const articles=await publishedNews();
 set(root,`<div class="fvt-content-head"><div><span class="fvt-eyebrow">DE FVT-REDACTIE</span><h1>Nieuws met fantasyblik.</h1><p>Ontwikkelingen, speelrondes en keuzes voor jouw Eredivisie-selectie.</p></div>${account.editor?`<a class="fvt-button" href="${appUrl('admin/nieuws')}">Redactiebeheer →</a>`:''}</div>${articles.length?`<section class="fvt-featured fvt-card">${articles[0].image_url?`<img src="${esc(articles[0].image_url)}" alt="${esc(articles[0].image_alt||articles[0].title)}">`:''}<div><span class="fvt-eyebrow">UITGELICHT</span><h2>${esc(articles[0].title)}</h2><p>${esc(articles[0].intro)}</p><div class="fvt-meta">${esc(articles[0].author_name)} · ${date(articles[0].published_at)}</div><p><a class="fvt-button" href="${appUrl('nieuws/'+articles[0].slug)}">Lees artikel →</a></p></div></section><div class="fvt-grid">${articles.slice(1).map(newsCard).join('')}</div>`:empty('Er zijn nog geen gepubliceerde nieuwsberichten. De redactie bereidt de eerste artikelen voor.')}`)
 }catch(e){set(root,empty(errorText(e)))}
}
