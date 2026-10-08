import { safeHtml } from '../platform/html.js'
import { appUrl } from '../platform/client.js'
export const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export const date = value => value ? new Date(value).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Concept'
export const set = (node,markup) => {node.innerHTML=safeHtml(markup)}
export const empty = message => `<div class="fvt-empty" role="status">${esc(message)}</div>`
export const author = (name,own=false) => `<span class="fvt-author"><span class="fvt-initials" aria-hidden="true">${esc((name||'FVT').split(/\s+/).slice(0,2).map(n=>n[0]).join(''))}</span><span>${esc(name||'FVT-lid')}${own?' · Jij':''}</span></span>`
export const options = (rows,selected='') => rows.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.name)}</option>`).join('')
export const loginLink = '<a class="fvt-button" href="'+appUrl('studio#fvt-account')+'">Log in om mee te praten →</a>'
export function errorText(error) {
 if(error?.code==='23505') return 'Deze naam of URL bestaat al. Kies een andere.'
 if(error?.code==='23503') return 'Dit onderdeel wordt nog gebruikt of bestaat niet meer.'
 if(error?.code==='42501') return 'Je hebt geen toegang tot deze handeling. Controleer of je bent ingelogd.'
 if(error?.code==='P0001') return error.message
 return 'Opslaan of laden is niet gelukt. Controleer je verbinding en probeer opnieuw.'
}
export function bindForm(form,action) {
 form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');button.disabled=true;status.textContent='Bezig…';try{await action(Object.fromEntries([...new FormData(form)].map(([key,value])=>[key.replace(/^fvt_/,''),value])));}catch(e){status.textContent=errorText(e)}finally{if(button.isConnected)button.disabled=false}}
}
