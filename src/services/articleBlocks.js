import {dreamDefaults,validateDream} from './dreamTeamArticle.js'
import {renderDreamArticle} from './dreamTeamArticlePresentation.js'
import {adviceDefaults,validateAdvice} from './playerAdviceModel.js'
import {renderPlayerAdvice} from './playerAdvicePresentation.js'
import {renderFiveAhead,bindFiveAhead,validateFiveAhead} from './fiveAheadPresentation.js'
import {articleBodyHtml, safeLink} from './articleContent.js'
import {validPlayerLinks,validateEntityContent,entityId,entitySeason} from './articleEntities.js'
import {MEDIA_LAYOUTS,mediaLayout,matchHeading,articleSections} from './articlePresentation.js'
import {renderClubLogo} from './clubLogos.js'
import {logoSlug} from './clubIdentity.js'

export const BLOCK_TYPES={dreamTeam:'Dreamteam',playerAdvice:'Speleradvies',fiveAhead:'5 Vooruit clubschema�s',paragraph:'Tekst',heading:'Tussenkop',image:'Afbeelding',imageCarousel:'Afbeeldingscarrousel',quote:'Quote',list:'Lijst',match:'Wedstrijdscores',divider:'Scheiding'}
export const escapeBlock=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export const isBlockContent=value=>value?.version===1&&Array.isArray(value.blocks)
export function newsImageUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
export function newArticleBlock(type){return {id:crypto.randomUUID(),type,...(type==='dreamTeam'?dreamDefaults():type==='playerAdvice'?adviceDefaults():type==='fiveAhead'?{season:'2026/2027',startRound:9,category:'top3',snapshot:null,analyses:{}}:type==='match'?{fixtureId:'',season:'',collapsedByDefault:true,showTopScorer:true,showLegend:true,showSubstitutes:true,playerLinks:true}:type==='imageCarousel'?{images:[],size:'large'}:type==='image'?{url:'',alt:'',caption:'',size:'large',align:'center'}:type==='list'?{items:[],ordered:false}:type==='heading'?{text:'',level:2}:{text:''})}}
// A deliberately small inline syntax; raw HTML is always escaped.
export function inlineText(text){
 const plain=value=>escapeBlock(value).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/\n/g,'<br>')
 const source=String(text??'');let html='',offset=0
 for(const match of source.matchAll(/\[([^\]\n]+)\]\(([^\s)]+)\)/g)){
  html+=plain(source.slice(offset,match.index));const href=safeLink(match[2]);html+=href?`<a href="${escapeBlock(href)}" rel="noopener noreferrer">${plain(match[1])}</a>`:plain(match[1]);offset=match.index+match[0].length
 }
 return html+plain(source.slice(offset))
}
export function blocksText(content){return isBlockContent(content)?content.blocks.map(b=>b.type==='list'?(b.items||[]).join('\n'):['paragraph','heading','quote'].includes(b.type)?b.text||'':'').join('\n\n'):''}
export function linkedText(block,text,format=escapeBlock,offset=0){
 const links=validPlayerLinks(block).filter(e=>e.start>=offset&&e.end<=offset+text.length)
 if(!links.length)return format(text)
 let prefix='\uE000';while(text.includes(prefix))prefix+='\uE000'
 let source=text;const replacements=[]
 for(const [i,e] of [...links].reverse().entries()){
  const token=prefix+i+'\uE001';source=source.slice(0,e.start-offset)+token+source.slice(e.end-offset)
  replacements.push([token,`<button type="button" class="article-player-link" data-article-player="${escapeBlock(e.playerId)}" data-season="${escapeBlock(e.season)}" aria-label="Spelerinformatie: ${escapeBlock(e.text)}">${escapeBlock(e.text)}</button>`])
 }
 let html=format(source);for(const [token,button] of replacements)html=html.replace(token,button);return html
}
export function validateArticleBlocks(content,{publish=false}={}){
 if(!isBlockContent(content)||content.blocks.length>80||JSON.stringify(content).length>200000)throw Error('Ongeldige blokinhoud of artikel te groot (maximaal 80 blokken).')
 const ids=new Set()
 if(content.toc!==undefined&&typeof content.toc!=='boolean')throw Error('Ongeldige inhoudsopgave-instelling.')
 for(const b of content.blocks){
  if(!b||!BLOCK_TYPES[b.type]||typeof b.id!=='string'||ids.has(b.id))throw Error('Ongeldig of dubbel blok.');ids.add(b.id)
  if(['paragraph','heading','quote'].includes(b.type)&&typeof b.text!=='string')throw Error('Een tekstblok bevat ongeldige tekst.')
  if(b.type==='dreamTeam')validateDream(b,{publish})
  if(b.type==='playerAdvice')validateAdvice(b,{publish})
  if(b.type==='fiveAhead')validateFiveAhead(b,{publish})
  if(b.type==='heading'&&![2,3].includes(b.level))throw Error('Gebruik H2 of H3.')
  if(b.type==='list'&&(!Array.isArray(b.items)||b.items.some(i=>typeof i!=='string')))throw Error('Ongeldige lijst.')
  if(['image','imageCarousel'].includes(b.type)){
   if(b.layout!==undefined&&!MEDIA_LAYOUTS[b.layout])throw Error('Kies een geldige beeldlayout.')
   if(!['small','medium','large','full'].includes(b.size)||b.type==='imageCarousel'&&b.size==='small')throw Error('Kies een geldig beeldformaat.')
   const images=b.type==='image'?[b]:b.images
   if(!Array.isArray(images)||images.length>12)throw Error('Een carrousel bevat maximaal 12 beelden.')
   if(publish&&b.type==='imageCarousel'&&images.length<2)throw Error('Een carrousel heeft minimaal twee afbeeldingen nodig.')
   for(const i of images){if(i.url&&!newsImageUrl(i.url)||publish&&!i.url)throw Error('Kies een geldige afbeelding.');if(publish&&!i.decorative&&!String(i.alt||'').trim())throw Error('Vul alt-tekst in of markeer de afbeelding expliciet als decoratief.')}
  }
 }
 validateEntityContent(content)
 if(publish&&blocksText(content).trim().length<20)throw Error('Vul minimaal 20 tekens artikeltekst in.')
 return content
}
function figure(i){const url=newsImageUrl(i?.url);if(!url)return '<p class="article-image-missing">Nog geen afbeelding gekozen.</p>';const dimensions=Number.isInteger(i.width)&&Number.isInteger(i.height)&&i.width>0&&i.height>0?` width="${i.width}" height="${i.height}"`:'';return `<figure><img src="${escapeBlock(url)}" alt="${escapeBlock(i.decorative?'':i.alt)}" loading="lazy" decoding="async"${dimensions}>${i.caption?`<figcaption>${escapeBlock(i.caption)}</figcaption>`:''}</figure>`}
export function renderArticleContent(article){
 if(!isBlockContent(article.content_blocks))return `<div class="article-content article-legacy">${articleBodyHtml(article.body)}</div>`
 const sections=articleSections(article.content_blocks),toc=article.content_blocks.toc!==false&&sections.length>=4
 return `<div class="article-content">${toc?`<nav class="article-toc" aria-label="In dit artikel"><details><summary>In dit artikel <span>${sections.length} onderdelen</span></summary><ol>${sections.map(s=>`<li><a href="#${s.id}">${escapeBlock(s.text)}</a></li>`).join('')}</ol></details></nav>`:''}${article.content_blocks.blocks.slice(0,80).map(b=>{
  if(!b)return ''
  const size=['small','medium','large','full'].includes(b.size)?b.size:'large',align=['left','center','right'].includes(b.align)?b.align:'center'
  switch(b.type){
   case 'dreamTeam':return renderDreamArticle(b)
   case 'playerAdvice':return renderPlayerAdvice(b)
   case 'fiveAhead':return renderFiveAhead(b)
   case 'paragraph':return `<p>${linkedText(b,b.text,inlineText)}</p>`
   case 'heading':{const section=sections.find(s=>s.blockId===b.id),match=matchHeading(b.text),tag=b.level===3?'h3':'h2';return `<${tag}${section?` id="${section.id}"`:''}${match?` class="article-match-section" data-match-section data-home="${logoSlug(match.home)}" data-away="${logoSlug(match.away)}" data-home-score="${match.homeScore}" data-away-score="${match.awayScore}"`:''}>${match?`${renderClubLogo(match.home)}<span>${linkedText(b,b.text)}<small data-section-round hidden></small></span>${renderClubLogo(match.away)}`:linkedText(b,b.text)}</${tag}>`}
   case 'quote':return `<blockquote><p>${linkedText(b,b.text)}</p>${b.source?`<cite>${escapeBlock(b.source)}</cite>`:''}</blockquote>`
   case 'list':{const tag=b.ordered?'ol':'ul';let offset=0;return `<${tag}>${(Array.isArray(b.items)?b.items:[]).map(i=>{const html=linkedText(b,i,escapeBlock,offset);offset+=i.length+1;return `<li>${html}</li>`}).join('')}</${tag}>`}
   case 'match':return entityId(b.fixtureId)&&entitySeason(b.season)?`<section class="article-match" data-article-match="${escapeBlock(b.fixtureId)}" data-season="${escapeBlock(b.season)}" data-options="${escapeBlock(JSON.stringify(Object.fromEntries(['collapsedByDefault','showTopScorer','showLegend','showSubstitutes','playerLinks'].map(k=>[k,b[k]!==false]))))}"><button type="button" class="article-match-toggle" aria-expanded="false"><span data-match-heading>Wedstrijdscores · ${escapeBlock(b.season)}</span><span data-match-action>Bekijk Fantasy-scores</span></button><div data-match-content hidden></div><noscript>Schakel JavaScript in om de wedstrijdscores te bekijken.</noscript></section>`:'<p>Er is nog geen wedstrijd gekozen.</p>'
   case 'divider':return '<hr class="article-divider">'
   case 'image':return `<div class="article-visual article-size-${size} article-align-${align} article-layout-${mediaLayout(b)}">${figure(b)}</div>`
   case 'imageCarousel':{const items=(Array.isArray(b.images)?b.images:[]).slice(0,12);if(!items.length)return '';return `<section class="article-visual article-size-${size} article-align-center article-carousel" data-article-carousel tabindex="0" role="region" aria-roledescription="carrousel" aria-label="Afbeeldingen bij het artikel"><div class="article-slides">${items.map((i,n)=>`<div data-slide ${n?'hidden':''} role="group" aria-roledescription="dia" aria-label="${n+1} van ${items.length}">${figure(i)}</div>`).join('')}</div>${items.length>1?`<div class="article-carousel-controls"><button type="button" data-previous aria-label="Vorige afbeelding">←</button><div class="article-dots">${items.map((_,n)=>`<button type="button" data-dot="${n}" aria-label="Afbeelding ${n+1}" aria-pressed="${n===0}">●</button>`).join('')}</div><button type="button" data-next aria-label="Volgende afbeelding">→</button></div><p class="article-slide-status" aria-live="polite" aria-atomic="true">Afbeelding 1 van ${items.length}</p>`:''}</section>`}
   default:return ''
  }
 }).join('')}</div>`
}
export function bindArticleContent(root){
 bindFiveAhead(root)
 if(root.querySelector('[data-match-section]'))import('../public/articlePresentation.js').then(({bindArticlePresentation})=>bindArticlePresentation(root))
 if(root.querySelector('[data-article-player],[data-article-match]'))import('../public/articleEntities.js').then(({bindArticleEntities})=>bindArticleEntities(root)).catch(()=>{root.querySelectorAll('[data-match-action]').forEach(el=>el.textContent='Scores laden mislukt. Herlaad de pagina.')})
 root.querySelectorAll('[data-article-carousel]').forEach(el=>{
  if(el.dataset.bound)return;el.dataset.bound='true'
  const slides=[...el.querySelectorAll('[data-slide]')],dots=[...el.querySelectorAll('[data-dot]')];let index=0,start=null
  const show=n=>{index=(n+slides.length)%slides.length;slides.forEach((s,i)=>s.hidden=i!==index);dots.forEach((d,i)=>d.setAttribute('aria-pressed',String(i===index)));const status=el.querySelector('.article-slide-status');if(status)status.textContent=`Afbeelding ${index+1} van ${slides.length}`}
  el.querySelector('[data-previous]')?.addEventListener('click',()=>show(index-1));el.querySelector('[data-next]')?.addEventListener('click',()=>show(index+1));dots.forEach((d,i)=>d.addEventListener('click',()=>show(i)))
  el.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();show(e.key==='Home'?0:e.key==='End'?slides.length-1:index+(e.key==='ArrowRight'?1:-1))}})
  el.addEventListener('touchstart',e=>{start={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});el.addEventListener('touchend',e=>{if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))show(index+(dx<0?1:-1));start=null},{passive:true})
 })
 root.querySelectorAll('.article-content img').forEach(img=>img.addEventListener('error',()=>{const message=document.createElement('p');message.className='article-image-missing';message.textContent='Afbeelding niet beschikbaar'+(img.alt?`: ${img.alt}`:'.');img.replaceWith(message)},{once:true}))
}
