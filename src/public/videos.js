import './polish.css'
import { renderPublic } from './homepage.js'
import { appUrl } from '../platform/client.js'
import { validVideo,channelUrl,fallbackVideo } from './video.js'
import { esc,date,set,empty } from './contentUI.js'
import { VIDEO_CATEGORIES,videoCategory,thumbnailSources } from './videoCatalog.js'
const url = v => `https://www.youtube.com/watch?v=${v.id}`
const image = (v,featured=false) => `<span class="fvt-video-thumb"><img data-video-thumbnail="${v.id}" src="${thumbnailSources(v.id)[0]}" alt="${esc(v.title)}" loading="${featured?'eager':'lazy'}" ${featured?'fetchpriority="high"':''} width="1280" height="720"><span class="fvt-thumbnail-unavailable" hidden>Thumbnail niet beschikbaar · Bekijk op YouTube ↗</span><span class="fvt-video-play" aria-hidden="true">▶</span></span>`
export function mountVideoThumbnails(root) {
 root.querySelectorAll('[data-video-thumbnail]').forEach(img=>{
  const sources=thumbnailSources(img.dataset.videoThumbnail);let index=0;
  const fallback=()=>{if(index+1<sources.length){img.src=sources[++index];img.hidden=false}else{img.hidden=true;img.parentElement.querySelector('.fvt-thumbnail-unavailable').hidden=false}}
  img.onerror=fallback;
  img.onload=()=>{if(img.naturalWidth<320){fallback();return}img.hidden=false;img.classList.toggle('is-letterboxed',img.naturalWidth/img.naturalHeight<1.5)};
  if(img.complete){if(img.naturalWidth)img.onload();else fallback()}
 })
}
export async function renderVideosPage(){
 renderPublic('',{mainMarkup:'<div class="fvt-content" id="videos-page"><span class="fvt-eyebrow">FVT OP YOUTUBE</span><h1>Voetbal kijken. Fantasy bespreken.</h1><p>De recente afleveringen van Fantasy Voetbal Talk Eredivisie.</p><div id="video-library" role="status">Video’s laden…</div></div>',pageTitle:'Video’s'});
 const root=document.querySelector('#video-library');let data;
 try{const response=await fetch(appUrl('api/latest-video'));if(!response.ok)throw new Error();data=await response.json()}catch{data={videos:[fallbackVideo],source:'fallback'}}
 const videos=[...new Map((Array.isArray(data.videos)?data.videos:[data.video]).filter(validVideo).map(v=>[v.id,v])).values()].sort((a,b)=>Date.parse(b.published)-Date.parse(a.published));if(!videos.length){set(root,empty('Video’s zijn tijdelijk niet beschikbaar. Bekijk het FVT-kanaal op YouTube.'));return}
 const featured=videos[0],remaining=videos.slice(1);
 set(root,`${data.source!=='youtube'?'<p class="fvt-notice">De actuele feed is tijdelijk niet beschikbaar. Hieronder staat een eerder gecontroleerde FVT-aflevering.</p>':''}<section class="fvt-featured fvt-video-featured" data-featured-video="${featured.id}"><a href="${url(featured)}" target="_blank" rel="noopener noreferrer" aria-label="Bekijk ${esc(featured.title)}">${image(featured,true)}</a><div><span class="fvt-eyebrow">${data.source==='youtube'?'NIEUWSTE AFLEVERING':'UITGELICHT'}</span><p><span class="fvt-badge">${esc(videoCategory(featured))}</span></p><h2>${esc(featured.title)}</h2><p><time datetime="${esc(featured.published)}">${date(featured.published)}</time></p><a class="fvt-button" href="${url(featured)}" target="_blank" rel="noopener noreferrer">Bekijk op YouTube ↗</a></div></section><div class="fvt-video-library-heading"><span class="fvt-eyebrow">MEER OM TE KIJKEN</span><h2>Ontdek de afleveringen</h2><p>Van vijf rondes vooruit tot de terugblik. Kies jouw rubriek.</p></div><div class="fvt-filters fvt-video-filters" aria-label="Videorubriek"><button data-category="" aria-pressed="true">Alles</button>${VIDEO_CATEGORIES.map(c=>`<button data-category="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div><p id="video-filter-status" class="fvt-muted" role="status"></p><div id="video-grid" class="fvt-grid"></div><p class="fvt-muted">De rubrieken volgen herkenbare titels en gecontroleerde afleveringen. Niet eenduidig? Dan staat de video bij Overige / Specials. Deze feed bevat de 15 recentste uploads.</p><a class="fvt-text-link" href="${channelUrl}" target="_blank" rel="noopener noreferrer">Alle FVT-video’s op YouTube ↗</a>`);
 const draw=category=>{const rows=remaining.filter(v=>!category||videoCategory(v)===category);set(root.querySelector('#video-grid'),rows.map(v=>`<a class="fvt-card fvt-video-card" data-video-id="${v.id}" href="${url(v)}" target="_blank" rel="noopener noreferrer">${image(v)}<div class="fvt-video-card-copy"><span class="fvt-badge">${esc(videoCategory(v))}</span><h3>${esc(v.title)}</h3><div class="fvt-meta"><time datetime="${esc(v.published)}">${date(v.published)}</time><span>Bekijk ↗</span></div></div></a>`).join('')||empty(category===videoCategory(featured)?'De nieuwste aflevering in deze rubriek staat hierboven.':'Geen andere recente afleveringen in deze rubriek. Bekijk het volledige YouTube-kanaal voor het archief.'));root.querySelector('#video-filter-status').textContent=`${rows.length} ${rows.length===1?'aflevering':'afleveringen'}${category?' · '+category:''} · nieuwste aflevering hierboven`;mountVideoThumbnails(root.querySelector('#video-grid'))};
 mountVideoThumbnails(root.querySelector('.fvt-featured'));
 draw('');root.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{root.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));draw(button.dataset.category)});
}
