import { renderPublic } from './homepage.js'
import { appUrl } from '../platform/client.js'
import { validVideo,channelUrl,fallbackVideo } from './video.js'
import { esc,date,set,empty } from './contentUI.js'
// Only explicit words in the actual title establish a series; never infer content.
export function videoCategory(title) {
 for(const [pattern,label] of [[/terugblik/i,'Terugblik'],[/5\s*vooruit/i,'5 Vooruit'],[/de\s+picks/i,'De Picks'],[/\blive\b/i,'Live'],[/\bspecial\b/i,'Special'],[/teamcheck/i,'Teamcheck']])if(pattern.test(title))return label
 return 'Overige video’s'
}
const url = v => `https://www.youtube.com/watch?v=${v.id}`
const image = v => `<img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="${esc(v.title)}" loading="lazy" width="480" height="270">`
export async function renderVideosPage(){
 renderPublic('',{mainMarkup:'<div class="fvt-content" id="videos-page"><span class="fvt-eyebrow">FVT OP YOUTUBE</span><h1>Voetbal kijken. Fantasy bespreken.</h1><p>De recente afleveringen van Fantasy Voetbal Talk Eredivisie.</p><div id="video-library" role="status">Video’s laden…</div></div>',pageTitle:'Video’s'});
 const root=document.querySelector('#video-library');let data;
 try{const response=await fetch(appUrl('api/latest-video'));if(!response.ok)throw new Error();data=await response.json()}catch{data={videos:[fallbackVideo],source:'fallback'}}
 const videos=(data.videos||[data.video]).filter(validVideo);if(!videos.length){set(root,empty('Video’s zijn tijdelijk niet beschikbaar. Bekijk het FVT-kanaal op YouTube.'));return}
 const featured=videos[0],categories=[...new Set(videos.map(v=>videoCategory(v.title)))];
 set(root,`${data.source!=='youtube'?'<p class="fvt-notice">De actuele feed is tijdelijk niet beschikbaar. Hieronder staat een eerder gecontroleerde FVT-aflevering.</p>':''}<section class="fvt-featured"><a href="${url(featured)}" target="_blank" rel="noopener noreferrer">${image(featured)}</a><div><span class="fvt-eyebrow">${data.source==='youtube'?'NIEUWSTE AFLEVERING':'UITGELICHT'}</span><h2>${esc(featured.title)}</h2><p>${date(featured.published)}</p><a class="fvt-button" href="${url(featured)}" target="_blank" rel="noopener noreferrer">Bekijk op YouTube ↗</a></div></section><h2>Recente video’s</h2><div class="fvt-filters" aria-label="Videorubriek"><button data-category="" aria-pressed="true">Alles</button>${categories.map(c=>`<button data-category="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div><div id="video-grid" class="fvt-grid"></div><p class="fvt-muted">De rubriek volgt de titel van de aflevering. YouTube levert in deze feed geen videoduur.</p><a class="fvt-text-link" href="${channelUrl}" target="_blank" rel="noopener noreferrer">Alle FVT-video’s op YouTube ↗</a>`);
 const draw=category=>set(root.querySelector('#video-grid'),videos.filter(v=>!category||videoCategory(v.title)===category).map(v=>`<a class="fvt-card" href="${url(v)}" target="_blank" rel="noopener noreferrer">${image(v)}<h3>${esc(v.title)}</h3><div class="fvt-meta"><span class="fvt-badge">${esc(videoCategory(v.title))}</span><time>${date(v.published)}</time></div></a>`).join(''));
 draw('');root.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{root.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));draw(button.dataset.category)});
}
