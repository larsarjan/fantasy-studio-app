import {safeHtml} from '../platform/html.js'
import {escapeBlock as esc} from '../services/articleBlocks.js'
import {renderHistoricalMatchContent} from '../modules/historicalScoreView.js'
import {renderClubLogo} from '../services/clubLogos.js'
import '../articleEntities.css'

const cache=new Map(),photos=new Map()
export function fetchArticleEntity(kind,id='',season='',token){
 const key=[kind,id,season].join(':'),old=cache.get(key)
 if(kind!=='catalog'&&old?.expires>Date.now())return old.promise
 const promise=fetch('/api/article-entities?'+new URLSearchParams({kind,id,season}),{headers:token?{Authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(12000)}).then(async response=>{
  const data=await response.json();if(!response.ok)throw Error(data.error||'Gegevens laden mislukt.');return data
 }).catch(error=>{cache.delete(key);throw error})
 if(kind!=='catalog'){cache.set(key,{promise,expires:Date.now()+30000});while(cache.size>100)cache.delete(cache.keys().next().value)}
 return promise
}
const number=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('nl-NL',{maximumFractionDigits:1}):'Niet beschikbaar'
let activePopup
export async function openArticlePlayer(button){
 if(activePopup)return
 const dialog=document.createElement('dialog');dialog.className='article-player-dialog';dialog.setAttribute('aria-label','Spelerinformatie')
 dialog.innerHTML=safeHtml('<button type="button" class="article-popup-close" aria-label="Sluiten">×</button><div data-player-body role="status">Spelerinformatie laden…</div>')
 document.body.append(dialog);activePopup=dialog;dialog.showModal()
 const marker=crypto.randomUUID();history.pushState({...history.state,articlePlayerPopup:marker},'')
 let closing=false
 const close=(fromHistory=false)=>{if(closing)return;closing=true;window.removeEventListener('popstate',pop);dialog.close();dialog.remove();activePopup=null;if(!fromHistory&&history.state?.articlePlayerPopup===marker)history.back();if(button.isConnected)button.focus()}
 const pop=()=>close(true);window.addEventListener('popstate',pop)
 dialog.querySelector('button').onclick=()=>close();dialog.addEventListener('cancel',event=>{event.preventDefault();close()})
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()}})
 const body=dialog.querySelector('[data-player-body]')
 const load=async()=>{
  body.textContent='Spelerinformatie laden…'
  try{
   const [data,{renderPlayerAvatar,setPlayerPhotoRecords},{initializePlayerPhotos}]=await Promise.all([fetchArticleEntity('player',button.dataset.articlePlayer,button.dataset.season),import('../services/playerPhotos.js'),import('../services/playerPhotoRuntime.js'),import('../playerPhotos.css')])
   if(closing)return
   for(const row of data.photos||[])photos.set(row.player_key,row);while(photos.size>100)photos.delete(photos.keys().next().value)
   setPlayerPhotoRecords([...photos.values()],{merge:true});const p=data.player
   body.innerHTML=safeHtml(`<header class="article-player-heading">${renderPlayerAvatar(p,{size:80})}<div><h2>${esc(p.name)}</h2><p>${esc(p.club)} · ${esc(p.position)}<br><small>${esc(p.season)}</small></p></div></header><dl class="article-player-metrics"><div><dt>Huidige prijs</dt><dd>${p.endPrice==null?'Niet beschikbaar':'€ '+number(p.endPrice)}</dd></div><div><dt>Totaalpunten</dt><dd>${number(data.totalPoints)}</dd></div><div><dt>Gemiddeld per wedstrijd</dt><dd>${number(data.averagePoints)}</dd></div>${p.selectedPct==null?'':`<div><dt>Geselecteerd</dt><dd>${number(p.selectedPct)}%</dd></div>`}</dl><h3>Laatste vijf wedstrijden</h3>${data.recent.length?`<ol class="article-player-recent">${data.recent.map(m=>`<li>SR ${Number(m.round)}<strong>${number(m.points)} pt</strong><small>${Number(m.minutes)} min</small></li>`).join('')}</ol>`:'<p>Nog geen gespeelde wedstrijden beschikbaar.</p>'}<h3>Komende wedstrijden</h3>${data.upcoming.length?`<ul class="article-player-upcoming">${data.upcoming.map(f=>`<li><small>SR ${Number(f.round)}</small>${renderClubLogo(f.home)} ${esc(f.home)} – ${esc(f.away)} ${renderClubLogo(f.away)}</li>`).join('')}</ul>`:'<p>Geen komende wedstrijden beschikbaar.</p>'}<a href="/studio/players?player=${encodeURIComponent(p.id)}">Volledig spelersprofiel in Studio</a>`)
   initializePlayerPhotos()
  }catch(error){if(closing)return;body.innerHTML=safeHtml(`<p>${esc(error.message)}</p><button type="button" data-retry>Opnieuw proberen</button>`);body.querySelector('[data-retry]').onclick=load}
 }
 await load()
}
export function bindArticleEntities(root){
 if(!root.dataset.articleEntitiesBound){root.dataset.articleEntitiesBound='true';root.addEventListener('click',event=>{const button=event.target.closest('[data-article-player]');if(button&&root.contains(button))openArticlePlayer(button)})}
 root.querySelectorAll('[data-article-match]').forEach(section=>{
  if(section.dataset.bound)return;section.dataset.bound='true'
  const toggle=section.querySelector('.article-match-toggle'),body=section.querySelector('[data-match-content]'),heading=section.querySelector('[data-match-heading]'),action=section.querySelector('[data-match-action]')
  const options=JSON.parse(section.dataset.options||'{}');let loaded=false,loading=false
  body.id='article-match-'+crypto.randomUUID();toggle.setAttribute('aria-controls',body.id)
  const summary=data=>{const f=data.fixture,r=data.result;heading.innerHTML=safeHtml(`<span class="article-match-clubs">${renderClubLogo(f.home)}<strong>${esc(f.home)}</strong><b>${r?`${Number(r.homeScore)} – ${Number(r.awayScore)}`:'–'}</b><strong>${esc(f.away)}</strong>${renderClubLogo(f.away)}</span><small>Speelronde ${Number(f.round)} · ${esc(f.season)}${r?'':' · Uitslag nog niet beschikbaar'}</small>`)}
  const expand=async()=>{
   const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));body.hidden=!open;action.textContent=open?'Verberg Fantasy-scores':'Bekijk Fantasy-scores'
   if(!open||loaded||loading)return;loading=true;body.setAttribute('aria-busy','true');body.innerHTML='<p role="status">Wedstrijdscores laden…</p>'
   try{const data=await fetchArticleEntity('match',section.dataset.articleMatch,section.dataset.season);summary(data);body.innerHTML=safeHtml(renderHistoricalMatchContent(data.groups,data.result||data.fixture,{...options,article:true}));loaded=true}
   catch(error){body.innerHTML=safeHtml(`<p role="alert">${esc(error.message)}</p><button type="button" data-retry>Opnieuw proberen</button>`);body.querySelector('[data-retry]').onclick=()=>{toggle.setAttribute('aria-expanded','false');expand()}}
   finally{loading=false;body.removeAttribute('aria-busy')}
  }
  toggle.onclick=expand
  fetchArticleEntity('summary',section.dataset.articleMatch,section.dataset.season).then(summary).catch(()=>{heading.textContent='Wedstrijdgegevens tijdelijk niet beschikbaar'})
  if(options.collapsedByDefault===false)expand()
 })
}
