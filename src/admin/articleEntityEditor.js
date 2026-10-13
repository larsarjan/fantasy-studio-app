import {suggestArticleEntities,addPlayerLink,validPlayerLinks,blockText} from '../services/articleEntities.js'
import {newArticleBlock,escapeBlock as esc} from '../services/articleBlocks.js'
import {safeHtml} from '../platform/html.js'
import '../articleEntities.css'

export const matchEditorFields=b=>`<div class="article-match-settings"><p>${b.fixtureId?`${esc(b.season)} · ${esc(b.fixtureId)}`:'Kies een gespeelde wedstrijd.'}</p><button type="button" data-entity="fixture">Wedstrijd kiezen / wijzigen</button>${Object.entries({collapsedByDefault:'Standaard ingeklapt',showTopScorer:'Fantasy-topscorer tonen',showLegend:'Legenda tonen',showSubstitutes:'Invallers tonen',playerLinks:'Spelers klikbaar'}).map(([key,label])=>`<label class="block-check"><input type="checkbox" data-match-option="${key}" ${b[key]!==false?'checked':''}>${label}</label>`).join('')}</div>`
export const playerEditorFields=b=>['paragraph','heading','quote','list'].includes(b.type)?`<div class="article-entity-tools"><button type="button" data-entity="manual">Geselecteerde tekst aan speler koppelen</button></div><div class="article-entity-links">${validPlayerLinks(b).map((e,i)=>`<span>${esc(e.text)} (${esc(e.season)}, ${esc(e.playerId)}) <button type="button" data-entity="change" data-link-index="${i}">Wijzigen</button><button type="button" data-entity="remove" data-link-index="${i}">Ontkoppelen</button></span>`).join('')}</div>`:''

export function createArticleEntityEditor({host,getContent,isLocked,client,redraw,notify,status}){
 let catalogPromise,dialog,disposed=false
 const catalog=()=>catalogPromise??=(async()=>{
  const {data,error}=await client.auth.getSession();if(error||!data.session)throw Error('Log opnieuw in als redacteur.')
  const response=await fetch('/api/article-entities?kind=catalog',{headers:{Authorization:`Bearer ${data.session.access_token}`},signal:AbortSignal.timeout(12000)})
  const result=await response.json();if(!response.ok)throw Error(result.error||'Spelercatalogus niet beschikbaar.');return result
 })().catch(error=>{catalogPromise=null;throw error})
 const open=(title,trigger)=>{
  dialog?.close();dialog?.remove();const el=document.createElement('dialog');dialog=el;el.className='article-entity-editor-dialog';el.setAttribute('aria-label',title)
  el.innerHTML=safeHtml(`<button type="button" data-close>Sluiten</button><h2>${esc(title)}</h2><div data-panel role="status">Gegevens laden…</div>`);document.body.append(el)
  const close=()=>{el.close();el.remove();if(dialog===el)dialog=null;trigger?.isConnected&&trigger.focus()};el.querySelector('[data-close]').onclick=close;el.addEventListener('cancel',e=>{e.preventDefault();close()});el.showModal();return {el,panel:el.querySelector('[data-panel]'),close}
 }
 const commit=fn=>{if(disposed||isLocked())throw Error('Bewerken is niet toegestaan.');fn();redraw();notify()}
 const choosePlayer=async({block,start,end,candidates,trigger,onDone})=>{
  const view=open('Speler koppelen',trigger)
  try{const data=await catalog();if(!view.el.isConnected)return
   view.panel.innerHTML=safeHtml(`<p>Geselecteerde tekst: <strong>${esc(blockText(block).slice(start,end))}</strong>. Controleer club, seizoen en ID; de tekst blijft ongewijzigd.</p><label>Zoek speler, club of ID<input type="search" data-search autofocus></label><label>Seizoen<select data-season><option value="">Alle seizoenen</option>${[...new Set(data.players.map(p=>p.season))].sort().reverse().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label><div class="article-entity-results"></div>`)
   const query=view.panel.querySelector('[data-search]'),season=view.panel.querySelector('[data-season]'),list=view.panel.querySelector('.article-entity-results')
   const draw=()=>{const term=query.value.toLocaleLowerCase('nl');const source=!term&&candidates?.length?candidates:data.players;const matches=source.filter(p=>(!season.value||p.season===season.value)&&[p.name,p.club,p.id].join(' ').toLocaleLowerCase('nl').includes(term)).slice(0,50)
    list.innerHTML=safeHtml(matches.length?matches.map((p,i)=>`<button type="button" data-pick="${i}">${esc(p.name)} · ${esc(p.club)} · ${esc(p.position)}<br>${esc(p.season)} · ID ${esc(p.id)}</button>`).join(''):'<p>Geen spelers gevonden.</p>')
    list.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{try{commit(()=>addPlayerLink(block,start,end,matches[Number(button.dataset.pick)]));view.close();onDone?.()}catch(error){status(error.message)}})
   };query.oninput=draw;season.onchange=draw;draw();query.focus()
  }catch(error){view.panel.textContent=error.message}
 }
 const chooseFixture=async({block,afterId,candidates,trigger,onDone})=>{
  const view=open('Wedstrijdscores toevoegen',trigger)
  try{const data=await catalog();if(!view.el.isConnected)return;const fixtures=candidates||data.fixtures
   view.panel.innerHTML=safeHtml(`<p>De bestaande artikeltekst blijft behouden. Wedstrijden zonder bruikbare uitslag of statistieken worden niet aangeboden.</p><label>Seizoen<select data-season>${[...new Set(fixtures.map(f=>f.season))].sort().reverse().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label><label>Speelronde<select data-round></select></label><div class="article-entity-results"></div>`)
   const season=view.panel.querySelector('[data-season]'),round=view.panel.querySelector('[data-round]'),list=view.panel.querySelector('.article-entity-results')
   const draw=()=>{const matches=fixtures.filter(f=>f.season===season.value&&String(f.round)===round.value);list.innerHTML=safeHtml(matches.map((f,i)=>`<button type="button" data-pick="${i}">${esc(f.home)} – ${esc(f.away)} · ${f.hasResult?`${Number(f.homeScore)}–${Number(f.awayScore)}`:'uitslag ontbreekt'}<br>${f.statCount} spelers met minuten${f.statCount<22?' · onvolledige spelersdata':''}</button>`).join('')||'<p>Geen bruikbare wedstrijden beschikbaar.</p>');list.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{try{commit(()=>{const content=getContent(),f=matches[Number(button.dataset.pick)],target=block||newArticleBlock('match');if(!block){if(content.blocks.length>=80)throw Error('Maximaal 80 blokken.');const index=content.blocks.findIndex(b=>b.id===afterId);content.blocks.splice(index<0?content.blocks.length:index+1,0,target)}target.fixtureId=f.id;target.season=f.season});view.close();onDone?.()}catch(error){status(error.message)}})}
   const seasons=()=>{round.innerHTML=safeHtml([...new Set(fixtures.filter(f=>f.season===season.value).map(f=>f.round))].sort((a,b)=>a-b).map(n=>`<option>${n}</option>`).join(''));draw()};season.onchange=seasons;round.onchange=draw;seasons()
  }catch(error){view.panel.textContent=error.message}
 }
 const analyze=async trigger=>{
  const view=open('Herkenning controleren',trigger)
  try{const data=await catalog();if(!view.el.isConnected)return;const content=getContent(),suggestions=suggestArticleEntities(content,data)
   view.panel.innerHTML=safeHtml(`<p>Dit zijn alleen voorstellen. Er wordt niets gekoppeld of opgeslagen zonder jouw keuze. Standaard stellen we de eerste vermelding voor.</p>${suggestions.map((s,i)=>`<section class="article-entity-proposal"><strong>${esc(s.text)}</strong><small>${s.kind==='player'?'Speler':'Wedstrijd'} · ${s.confidence==='low'?'Lage zekerheid: kies expliciet uit kandidaten':s.confidence==='medium'?'Middelmatige zekerheid: controleer de speler':'Hoge zekerheid: controleer voor koppelen'}</small><button type="button" data-review="${i}">Controleren / kiezen</button><button type="button" data-ignore="${i}">Negeren</button></section>`).join('')||'<p>Geen nieuwe voorstellen gevonden.</p>'}${content.ignoredEntities?.length?'<button type="button" data-reset-ignored>Genegeerde voorstellen opnieuw beoordelen</button>':''}`)
   view.panel.querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>{const s=suggestions[Number(button.dataset.review)],b=content.blocks.find(b=>b.id===s.blockId);view.close();if(s.kind==='player')choosePlayer({block:b,start:s.start,end:s.end,candidates:s.candidates,trigger});else chooseFixture({afterId:b.id,candidates:s.candidates,trigger})})
   view.panel.querySelectorAll('[data-ignore]').forEach(button=>button.onclick=()=>{try{commit(()=>{const key=suggestions[Number(button.dataset.ignore)].key;content.ignoredEntities=[...new Set([...(content.ignoredEntities||[]),key])]});button.closest('section').remove()}catch(error){status(error.message)}})
   view.panel.querySelector('[data-reset-ignored]')?.addEventListener('click',()=>{commit(()=>delete content.ignoredEntities);view.close();analyze(trigger)})
  }catch(error){view.panel.textContent=error.message}
 }
 const click=event=>{
  const button=event.target.closest('[data-entity]');if(!button||isLocked()||!getContent())return
  const action=button.dataset.entity;if(action==='analyze'){analyze(button);return}
  const card=button.closest('[data-block]'),block=getContent().blocks.find(b=>b.id===card?.dataset.block);if(!block)return
  if(action==='fixture'){chooseFixture({block,trigger:button});return}
  const links=validPlayerLinks(block),link=links[Number(button.dataset.linkIndex)]
  if(action==='remove'){commit(()=>{block.players=(block.players||[]).filter(e=>e!==link)});return}
  const field=card.querySelector('textarea[data-key="text"],textarea[data-key="items"]'),start=action==='change'?link?.start:field?.selectionStart,end=action==='change'?link?.end:field?.selectionEnd
  if(!Number.isInteger(start)||end<=start){status('Selecteer eerst een spelersnaam in het tekstveld.');field?.focus();return}
  choosePlayer({block,start,end,trigger:button})
 }
 const change=event=>{if(!event.target.dataset.matchOption||isLocked())return;const block=getContent()?.blocks.find(b=>b.id===event.target.closest('[data-block]')?.dataset.block);if(block?.type==='match'){block[event.target.dataset.matchOption]=event.target.checked;notify()}}
 host.addEventListener('click',click);host.addEventListener('change',change)
 return {destroy(){disposed=true;dialog?.close();dialog?.remove();host.removeEventListener('click',click);host.removeEventListener('change',change)}}
}
