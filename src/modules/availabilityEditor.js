import { availabilityPolicy, statusLabels } from '../services/availability.js'
import { availabilityRpc } from '../platform/availabilityRepository.js'
import { avEsc as esc } from './availabilityUI.js'
import { safeHtml } from '../platform/html.js'
const options=(values,selected)=>values.map(v=>{const [id,label]=Array.isArray(v)?v:[v,v];return `<option value="${esc(id)}" ${String(id)===String(selected)?'selected':''}>${esc(label)}</option>`}).join('')
export function openAvailabilityEditor({players,player,type,season,onSave}) {
  const current=player&&availabilityPolicy(player).status
  const status={status_type:'injury',availability_percentage:50,start_date:new Date().toISOString().slice(0,10),...current}
  if(type){status.status_type=type;status.availability_percentage=type==='available'?100:type==='suspension'?0:50}
  const dialog=document.createElement('dialog');dialog.className='availability-dialog availability-page'
  const localDateTime=value=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):''
  dialog.innerHTML=safeHtml(`<h2>${type==='available'?'Weer beschikbaar':'Spelerstatus bewerken'}</h2><form class="availability-editor">
    ${!player?'<label class="wide">Speler zoeken<input id="av-player-search" type="search" placeholder="Naam of club"></label>':''}
    <label class="wide">Speler<select name="player_id" required ${player?'disabled':''}>${options(players.map(p=>[p.id,`${p.name} · ${p.club} · ${p.id}`]),player?.id)}</select></label>
    <label>Status<select name="status_type">${options(Object.entries(statusLabels),status.status_type)}</select></label><label>Beschikbaarheid<select name="availability_percentage">${options([0,25,50,75,100],status.availability_percentage)}</select></label>
    <label class="wide">Reden<input name="reason" maxlength="500" value="${esc(status.reason)}"></label>
    ${[['start_date','Startdatum','date'],['expected_return_date','Verwachte terugkeer','date'],['source_name','Bronnaam','text'],['source_url','Bron-URL','url'],['source_updated_at','Datum bronupdate','datetime-local']].map(([key,label,t])=>`<label>${label}<input name="${key}" type="${t}" value="${esc(key==='source_updated_at'?localDateTime(status[key]):status[key])}" ${t==='url'?'pattern="https://.*" maxlength="2048"':key==='source_name'?'maxlength="120"':''}></label>`).join('')}
    <label class="wide">Interne notitie<textarea name="notes" maxlength="4000">${esc(status.notes)}</textarea></label><label class="wide"><span><input name="is_manual_override" type="checkbox" ${status.is_manual_override?'checked':''}> Handmatige override vasthouden</span></label>
    <p class="wide">Status en percentage zijn onafhankelijk. Een verstreken terugkeerdatum maakt een speler niet automatisch beschikbaar.</p><p class="wide" data-save-status role="status"></p><button type="button" data-cancel>Annuleren</button><button type="submit">Status opslaan</button></form>`)
  const opener=document.activeElement
  document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>{dialog.remove();opener?.focus()},{once:true})
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close()
  const form=dialog.querySelector('form'),select=form.elements.player_id
  dialog.querySelector('#av-player-search')?.addEventListener('input',e=>{select.innerHTML=safeHtml(options(players.filter(p=>`${p.name} ${p.club}`.toLowerCase().includes(e.target.value.toLowerCase())).map(p=>[p.id,`${p.name} · ${p.club} · ${p.id}`]),''))})
  let busy=false
  form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;busy=true
    const button=form.querySelector('[type=submit]');button.disabled=true
    try{
      const values=Object.fromEntries(new FormData(form)),id=String(player?.id||select.value)
      if(!player&&availabilityPolicy(players.find(p=>String(p.id)===id)||{}).status)throw Error('Deze speler heeft al een status. Gebruik Status bewerken in het overzicht.')
      await availabilityRpc('availability_save',{data:{...values,player_id:id,season,availability_percentage:Number(values.availability_percentage),is_manual_override:form.elements.is_manual_override.checked,source_updated_at:values.source_updated_at?new Date(values.source_updated_at).toISOString():null},expected_revision:current?.revision||0})
      await onSave();dialog.close()
    }catch(error){form.querySelector('[data-save-status]').textContent=error.message||'Opslaan mislukt.'}
    finally{busy=false;button.disabled=false}
  }
}
