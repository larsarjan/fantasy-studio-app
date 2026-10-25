import { availabilityPolicy, statusLabels, availabilityRound } from '../services/availability.js'
import { availabilityHistory } from '../platform/availabilityRepository.js'
import { safeHtml } from '../platform/html.js'
import '../availability.css'
export const avEsc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export const avDate = value => value ? String(value).includes('T') ? new Date(value).toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'}) : new Date(value).toLocaleDateString('nl-NL') : 'Onbekend'
export function availabilityBadge(player, {interactive=true,always=false}={}) {
  const p=availabilityPolicy(player)
  if(!p.status||(!always&&!p.suspended&&p.pct===100&&!p.recent))return ''
  const label=p.unknown?'Onbekend':p.suspended?'SCHORSING':p.out?'OUT':p.recent?'Recent terug':p.pct+'%'
  const icon=p.suspended?'■':p.pct===100?'✓':!p.unknown&&p.pct<=50?'✕':'⚠'
  const text=`${statusLabels[p.status.status_type]} · ${p.unknown?'Speelkans onbekend':p.pct+'%'} · ${p.status.reason||'Reden onbekend'} · Verwacht terug: ${avDate(p.status.expected_return_date)} · Bijgewerkt: ${avDate(p.status.updated_at)}${p.stale?' · Bronstatus verouderd':''}`
  const tag=interactive?'button':'span'
  return `<span class="availability-badge-wrap"><${tag} ${interactive?'type="button"':''} class="availability-badge av-${p.suspended||p.out?'out':p.pct===100?'fit':!p.unknown&&p.pct<=50?'risk':'warn'}" data-availability-id="${avEsc(player.id??player.player_id)}" data-availability-season="${avEsc(player.season)}" data-availability-name="${avEsc(player.name)}" aria-label="${avEsc(text)}" title="${avEsc(text)}">${icon} ${label}</${tag}><span class="availability-tooltip" role="tooltip">${avEsc(text)}</span></span>`
}
export function availabilityDetail(player, fixtures=[], {expanded=false}={}) {
  const p=availabilityPolicy(player),s=p.status
  const round=s?availabilityRound(s,fixtures,player).replace(/^.*?vanaf /,'Vanaf '):''
  const date=s?.expected_return_date?new Date(s.expected_return_date).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}):''
  const source=s?.source_url&&/^https:\/\//.test(s.source_url)?`<a href="${avEsc(s.source_url)}" target="_blank" rel="noopener noreferrer">${avEsc(s.source_name||'Bron bekijken')}</a>`:avEsc(s?.source_name||'Niet vermeld')
  return `<section class="availability-detail availability-status-card"><h4>Beschikbaarheid</h4>${s?`<div class="av-status-heading">${availabilityBadge(player,{interactive:!expanded,always:true})}<strong>${avEsc(statusLabels[s.status_type]||'Onbekend')}</strong></div><p class="av-reason">${avEsc(s.reason||'Geen nadere toelichting beschikbaar')}</p><div class="av-return"><span>${date?'Verwacht terug':'Verwachting'}</span><strong>${avEsc(round||date||'Terugkeer nog onbekend')}</strong>${round&&date?`<small>${avEsc(date)}</small>`:''}</div><p class="av-updated">Laatst bijgewerkt ${avEsc(avDate(s.observed_at||s.updated_at))}${p.stale?' · Bronstatus verouderd':''}</p>${expanded?`<dl class="av-source-details"><dt>Speelkans</dt><dd>${p.pct===null?'Onbekend':avEsc(p.pct)+'%'}</dd><dt>Herkomst</dt><dd>${s.source_mode==='automatic'?'Automatisch':'Handmatig'}</dd><dt>Bron</dt><dd>${source}</dd></dl>`:''}`:'<p>Geen afwijkende beschikbaarheid geregistreerd; dit is geen bevestiging van fitheid.</p>'}${expanded?'':`<button class="av-details-action" type="button" data-availability-id="${avEsc(player.id??player.player_id)}" data-availability-season="${avEsc(player.season)}" data-availability-name="${avEsc(player.name)}">Status en historie bekijken <span aria-hidden="true">↗</span></button>`}</section>`
}
export function availabilityHistoryMarkup(rows) {
  return rows.length?`<ol class="availability-history">${rows.map(h=>`<li><strong>${avDate(h.changed_at)} · ${avEsc(statusLabels[h.new_status.status_type])} · ${h.new_status.availability_percentage==null?'Onbekend':avEsc(h.new_status.availability_percentage)+'%'}</strong><p>${h.old_status?`${avEsc(statusLabels[h.old_status.status_type])} ${h.old_status.availability_percentage==null?'Onbekend':avEsc(h.old_status.availability_percentage)+'%'} → `:''}${avEsc(h.new_status.reason||'Geen reden ingevuld')}</p><small>${avEsc(h.new_status.source_name)} · ${h.change_mode==='manual'?'Handmatige redactie':'Bron overgenomen'}${h.new_status.returned_date?' · Terug op '+avDate(h.new_status.returned_date):''}</small></li>`).join('')}</ol>`:'<p>Nog geen beschikbaarheidshistorie.</p>'
}
export function availabilityClubSummary(players,club) {
  const absent=players.filter(p=>p.club===club&&(availabilityPolicy(p).pct<100||availabilityPolicy(p).suspended))
  return `<section class="availability-detail"><h3>Beschikbaarheid</h3><p>${absent.filter(p=>availabilityPolicy(p).status?.status_type==='injury').length} geblesseerd · ${absent.filter(p=>availabilityPolicy(p).suspended).length} geschorst · ${absent.filter(p=>availabilityPolicy(p).status?.status_type==='doubt').length} twijfel</p>${absent.map(p=>`<p>${avEsc(p.name)} ${availabilityBadge(p)}</p>`).join('')||'<p>Geen afwezigheid geregistreerd.</p>'}</section>`
}
let bound=false
export function bindAvailabilityDetails() {
  if(bound)return;bound=true
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-availability-id]');if(!button)return
    event.preventDefault();event.stopImmediatePropagation()
    const player={id:button.dataset.availabilityId,season:button.dataset.availabilitySeason,name:button.dataset.availabilityName}
    const dialog=document.createElement('dialog');dialog.className='availability-dialog'
    dialog.innerHTML=safeHtml(`<button type="button" data-close>Sluiten</button><h3>${avEsc(player.name||'Spelerstatus')}</h3>${availabilityDetail(player,[],{expanded:true})}<h4>Recente historie</h4><div data-history role="status">Historie laden…</div>`)
    dialog.querySelectorAll('[data-availability-id]').forEach(el=>{if(el.classList.contains('availability-badge')){const span=document.createElement('span');span.className=el.className;span.textContent=el.textContent;el.replaceWith(span)}else el.remove()})
    document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close()
    dialog.addEventListener('close',()=>{dialog.remove();button.focus()},{once:true});dialog.showModal()
    try { const rows=await availabilityHistory(player,button.dataset.availabilityAdmin==='true');if(dialog.isConnected)dialog.querySelector('[data-history]').innerHTML=safeHtml(availabilityHistoryMarkup(rows)) }
    catch { if(dialog.isConnected)dialog.querySelector('[data-history]').textContent='Historie kon niet laden. Sluit dit venster en probeer opnieuw.' }
  },true)
}
