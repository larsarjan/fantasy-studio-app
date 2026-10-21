import {renderEuropeanCompetitionLogo,competitionLabel} from './europeanFixtureContext.js'
import {compareClubGroupLabels,resolveCompareClubGroup} from './clubGroups.js'
import {renderClubLogo} from './clubLogos.js'
import {kickoffTime} from './fixtureWindows.js'
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export const fiveCategories=Object.entries(compareClubGroupLabels).filter(([k])=>k!=='manual')
export function validateFiveAhead(b,{publish=false}={}){
 if(!fiveCategories.some(([k])=>k===b.category)||!Number.isInteger(b.startRound)||b.startRound<1||b.startRound>38)throw Error('Kies een geldige categorie en startspeelronde.')
 if(typeof b.season!=='string'||!/^\d{4}\/\d{4}$/.test(b.season))throw Error('Kies een geldig seizoen.')
 if(!b.snapshot){if(publish)throw Error('Bereid eerst de 5 Vooruit-data voor.');return}
 const s=b.snapshot;if(s.horizon!==5||s.season!==b.season||s.startRound!==b.startRound||!s.clubs||typeof s.clubs!=='object'||Object.keys(s.clubs).length>18)throw Error('Bereid de data opnieuw voor na wijziging van seizoen of speelronde.')
 if(resolveCompareClubGroup(b.category,Object.keys(s.clubs)).filter(Boolean).length!==3)throw Error('Deze categorie heeft geen drie beschikbare clubs.')
 for(const c of Object.values(s.clubs)){
  if(!c||typeof c!=='object')throw Error('Ongeldig clubschema.')
  if(typeof c.club!=='string'||!Array.isArray(c.matches)||c.matches.length>5||!Array.isArray(c.context)||c.context.length>30)throw Error('Ongeldig clubschema.')
  if(c.context.some(f=>!f||typeof f!=='object'))throw Error('Ongeldige contextwedstrijd.')
  if(publish&&c.matches.length!==5)throw Error('Voor publicatie zijn vijf Eredivisiewedstrijden per club nodig.')
  if(c.matches.some(f=>!f||typeof f!=='object'||!Number.isFinite(f.difficulty)||f.difficulty<1||f.difficulty>5))throw Error('Ongeldige schemawaarde.')
 }
 if(b.analyses&&Object.values(b.analyses).some(t=>typeof t!=='string'||t.length>10000))throw Error('Clubtekst is te lang.')
}
const date=f=>typeof f.date==='string'&&f.date?`${f.date.split('-').reverse().join('-')}${f.time?' · '+f.time:''}`:'Datum volgt'
function clubCard(c,analysis){
 const rows=[...c.matches.map(f=>({...f,league:true})),...c.context].sort((a,b)=>(kickoffTime(a)??Infinity)-(kickoffTime(b)??Infinity))
 return `<article class="five-club"><header>${renderClubLogo(c.club)}<div><h3>${esc(c.club)}</h3><span>Schemawaarde <strong>${esc(c.schemaValue)}/5</strong></span></div></header><p class="five-facts">${esc(c.home)} thuis · ${esc(c.away)} uit · ${esc(c.context.length)} contextduels</p><ol class="five-fixtures">${rows.map(f=>f.league?`<li class="five-fixture five-level-${Math.round(f.difficulty)}"><span class="five-round">SR ${esc(f.round)}<small>${esc(f.venue)}</small></span>${renderClubLogo(f.opponent)}<span><strong>${esc(f.opponent)}</strong><small>${esc(date(f))}</small></span><b title="${esc(f.label)}">${esc(f.difficulty)}/5</b></li>`:`<li class="five-context"><span>${renderEuropeanCompetitionLogo(f.competition)}${esc(competitionLabel(f.competition))}</span><span>${esc(f.opponent||([f.home,f.away].find(x=>x&&x!==c.club))||'Tegenstander volgt')}<small>${esc(date(f))}</small></span></li>`).join('')}</ol><div class="five-analysis"><h4>Analyse ${esc(c.club)}</h4>${analysis?`<p>${esc(analysis).replace(/\n/g,'<br>')}</p>`:'<p class="five-muted">Voor deze club is nog geen redactionele duiding toegevoegd.</p>'}</div></article>`
}
export function renderFiveAhead(b){
 try{validateFiveAhead(b)}catch{return '<p>Dit clubschema is niet beschikbaar. Controleer het artikel in de editor.</p>'}
 if(!b.snapshot)return '<section class="five-ahead"><p>Bereid de clubschema’s voor in de editor.</p></section>'
 const clubs=b.snapshot.clubs,groups=fiveCategories.filter(([k])=>resolveCompareClubGroup(k,Object.keys(clubs)).filter(Boolean).length===3),selected=groups.some(([k])=>k===b.category)?b.category:groups[0]?.[0]
 return `<section class="five-ahead" data-five-ahead><header><span class="five-label">5 VOORUIT · ${esc(b.season)}</span><h2>Vijf duels, drie clubs</h2><p>Vanaf speelronde ${esc(b.startRound)} · vijf Eredivisiewedstrijden per club. Europese en bekerduels staan als context tussen de competitiewedstrijden.</p><label>Clubcategorie<select data-five-category>${groups.map(([k,l])=>`<option value="${k}" ${k===selected?'selected':''}>${esc(l)}</option>`).join('')}</select></label></header>${groups.map(([k,l])=>`<div class="five-grid" data-five-group="${k}" ${k===selected?'':'hidden'} aria-label="${esc(l)}">${resolveCompareClubGroup(k,Object.keys(clubs)).map(c=>clubCard(clubs[c],b.analyses?.[c])).join('')}</div>`).join('')}<p class="five-caption">Redactionele momentopname · voorbereid ${esc(b.snapshot.preparedAt?.slice(0,10))}. Schemawaarde: lager is gunstiger; contextduels tellen niet mee.</p></section>`
}
export function bindFiveAhead(root){
 for(const content of root.querySelectorAll('.article-content')){
  if(!content.querySelector('[data-five-ahead]')||content.dataset.fiveEditorialBound)continue
  content.dataset.fiveEditorialBound='true'
  for(const heading of [...content.children].filter(el=>/^H[23]$/.test(el.tagName))){
   const label=heading.textContent.trim().toLowerCase(),summary=label==='kort samengevat',video=label==='bekijk ook de 5 vooruit-video'
   if(!summary&&!video)continue
   const section=content.ownerDocument.createElement('section');section.className=summary?'five-conclusion':'five-video';heading.before(section);section.append(heading)
   while(section.nextElementSibling&&!/^H[23]$/.test(section.nextElementSibling.tagName))section.append(section.nextElementSibling)
   if(video){const link=[...section.querySelectorAll('a')].find(a=>{try{return ['youtube.com','www.youtube.com','youtu.be'].includes(new URL(a.href).hostname)}catch{return false}});if(link){link.classList.add('five-video-button');link.textContent='Bekijk 5 Vooruit op YouTube'}else section.classList.add('five-video-empty')}
  }
 }
root.querySelectorAll('[data-five-ahead]').forEach(el=>{if(el.dataset.bound)return;el.dataset.bound='true';el.querySelector('[data-five-category]')?.addEventListener('change',e=>{el.querySelectorAll('[data-five-group]').forEach(g=>g.hidden=g.dataset.fiveGroup!==e.target.value)})})}
