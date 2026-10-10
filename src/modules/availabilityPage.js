import { getPlayers, getFixtures } from '../services/database.js'
import { availabilityPolicy, statusLabels, daysAbsent, availabilityRound } from '../services/availability.js'
import { refreshAvailability, availabilityRpc } from '../platform/availabilityRepository.js'
import { availabilityBadge, avEsc as esc, avDate, bindAvailabilityDetails } from './availabilityUI.js'
import { renderPlayerAvatar } from '../services/playerPhotos.js'
import { initializePlayerPhotos } from '../services/playerPhotoRuntime.js'
import { supabase } from '../platform/client.js'
import { safeHtml } from '../platform/html.js'
import { hasPermission } from '../platform/access.js'
import { openAvailabilityEditor } from './availabilityEditor.js'
import { positionDisplayLabel } from '../services/positionNormalization.js'
import { canonicalClubName } from '../services/intelligenceHelpers.js'
import '../playerPhotos.css'

const options = (values, selected) => values.map(v => {
  const [id,label] = Array.isArray(v) ? v : [v,v]
  return `<option value="${esc(id)}" ${String(id)===String(selected)?'selected':''}>${esc(label)}</option>`
}).join('')
export const createAvailabilityScreen = () => '<section id="availability-root" class="panel availability-page"><p role="status">Beschikbaarheid laden…</p></section>'
export const mountAvailabilityScreen = () => mountAvailabilityPage(document.querySelector('#availability-root'), { players:getPlayers(), fixtures:getFixtures() })

export async function mountAvailabilityPage(root, { players, fixtures=[], admin=false, access={} }={}) {
  bindAvailabilityDetails(); initializePlayerPhotos(supabase)
  const manage = admin && hasPermission(access,'availability.manage')
  let sources=[], proposals=[], limit=60, busy=false
  const filters = {search:'',club:'',position:'',status:'',percentage:'',sort:'updated'}
  if (!players) {
    players=[]
    for(let offset=0;;offset+=1000){
      const result=await supabase.from('players').select('payload').order('id').range(offset,offset+999)
      if(result.error)throw result.error
      players.push(...result.data.map(r=>r.payload));if(result.data.length<1000)break
    }
    const result=await supabase.from('fixtures').select('payload').order('id').limit(1000)
    if(!result.error)fixtures=result.data.map(r=>r.payload)
  }
  players=players.map(p=>({...p,club:canonicalClubName(p.club)||'Onbekend',position:positionDisplayLabel(p.position)}))
  const seasons=[...new Set(players.map(p=>p.season))].sort().reverse()
  let season=seasons[0]
  const reload=async()=>{
    await refreshAvailability(admin)
    if(admin)[sources,proposals]=await Promise.all([availabilityRpc('availability_sources'),availabilityRpc('availability_proposals')])
  }
  async function act(fn) {
    if(busy)return;busy=true
    try{await fn();await reload();render();root.querySelector('#av-status').textContent='Opgeslagen.'}
    catch(error){root.querySelector('#av-status').textContent=error.message||'Opslaan mislukt. Probeer opnieuw.'}
    finally{busy=false}
  }
  function card(player) {
    const a=availabilityPolicy(player),s=a.status
    return `<article class="availability-card" data-av-player="${esc(player.id)}"><header>${renderPlayerAvatar(player,{size:44})}<div><strong>${esc(player.name)}</strong><small>${esc(player.club)} · ${esc(player.position)}</small></div></header>
      <p>${availabilityBadge(player)} ${s?`${esc(statusLabels[s.status_type])} · ${a.pct}%`:'Geen afwijking geregistreerd'}</p>
      ${s?`<p>${esc(s.reason||'Reden nog niet ingevuld')}</p><small>Verwacht terug: ${avDate(s.expected_return_date)}${esc(availabilityRound(s,fixtures,player))} · ${daysAbsent(s)??'–'} dagen afwezig</small><small>Bijgewerkt: ${avDate(s.updated_at)} · ${s.source_url?`<a href="${esc(s.source_url)}" target="_blank" rel="noopener noreferrer">${esc(s.source_name)}</a>`:esc(s.source_name)}</small>${s.returned_date?`<small>Terug sinds ${avDate(s.returned_date)}</small>`:''}${admin?`<small>Handmatige override: ${s.is_manual_override?'ja':'nee'}</small>`:''}`:''}
      <div class="av-actions"><button data-availability-id="${esc(player.id)}" data-availability-season="${esc(player.season)}" data-availability-name="${esc(player.name)}" ${admin?'data-availability-admin="true"':''}>Details / historie</button>${manage?`<button data-edit="${esc(player.id)}">Status bewerken</button>${s&&(a.pct<100||a.suspended)?`<button data-return="${esc(player.id)}">Weer beschikbaar</button>`:''}`:''}</div></article>`
  }
  function sourceSection() {
    if(!admin)return ''
    return `<details class="availability-sources"><summary>Bronnen en voorstellen (${proposals.length})</summary><p>Automatische updates worden eerst ter beoordeling aangeboden. Een handmatige override blijft staan tot je expliciet voor overnemen kiest.</p>
      ${proposals.map(proposal=>{
        const player=players.find(p=>String(p.id)===proposal.player_id&&p.season===proposal.season),current=player&&availabilityPolicy(player).status
        return `<article class="availability-conflict"><h3>${esc(player?.name||proposal.player_id)}</h3><p>Bron zegt: ${esc(statusLabels[proposal.proposed.status_type])} · ${proposal.proposed.availability_percentage}% · ${esc(proposal.proposed.reason)}</p><p>FVT ${current?.is_manual_override?'override':'status'}: ${current?`${esc(statusLabels[current.status_type])} · ${current.availability_percentage}% · ${esc(current.reason)}`:'Nog geen registratie'}</p><p>Bron: ${esc(proposal.proposed.source_name)} · verwacht terug ${avDate(proposal.proposed.expected_return_date)} · FVT verwacht terug ${avDate(current?.expected_return_date)}</p>${manage?`<button data-proposal="${proposal.id}" data-decision="keep">FVT-status behouden</button> <button data-proposal="${proposal.id}" data-decision="accept">Bron overnemen, override opheffen</button>`:''}</article>`
      }).join('')||'<p>Geen bronvoorstellen.</p>'}
      <h3>Bronconnectors</h3>${sources.map(s=>`<p>${esc(s.name)} (${esc(s.key)}) · ${s.approved?'Goedgekeurd':'Uitgeschakeld'} ${manage?`<button data-source-toggle="${esc(s.key)}">${s.approved?'Uitschakelen':'Goedkeuren'}</button>`:''}</p>`).join('')||'<p>Nog geen externe bron aangesloten.</p>'}
      ${manage?'<form id="av-source-form" class="availability-editor"><label>Broncode<input name="key" required pattern="[a-z0-9_-]{2,60}" placeholder="officiele-club"></label><label>Bronnaam<input name="source_name" required maxlength="120"></label><label class="wide">Bron-URL<input name="url" type="url" pattern="https://.*" maxlength="2048"></label><label><span><input name="approved" type="checkbox"> Connector goedgekeurd / toegestaan</span></label><button type="submit">Bron opslaan</button></form>':''}</details>`
  }
  function render() {
    if(!root.isConnected)return
    const all=players.filter(p=>p.season===season)
    const rows=all.filter(p=>{
      const a=availabilityPolicy(p),s=a.status
      return (!filters.search||`${p.name} ${p.club} ${p.id}`.toLowerCase().includes(filters.search.toLowerCase()))&&(!filters.club||p.club===filters.club)&&(!filters.position||p.position===filters.position)&&(!filters.percentage||String(a.pct)===filters.percentage)&&(!filters.status||(filters.status==='out'&&a.out)||(filters.status==='returned'&&a.recent)||s?.status_type===filters.status)
    }).sort((a,b)=>{
      const x=availabilityPolicy(a),y=availabilityPolicy(b)
      if(filters.sort==='name'||filters.sort==='club')return String(a[filters.sort]).localeCompare(String(b[filters.sort]),'nl')
      if(filters.sort==='percentage')return x.pct-y.pct
      if(filters.sort==='days')return (daysAbsent(y.status)??-1)-(daysAbsent(x.status)??-1)
      if(filters.sort==='return')return (x.status?.expected_return_date||'9999').localeCompare(y.status?.expected_return_date||'9999')
      return (y.status?.updated_at||'').localeCompare(x.status?.updated_at||'')||String(a.name).localeCompare(String(b.name))
    })
    root.innerHTML=safeHtml(`<span class="eyebrow">FVT / SPELERSBESCHIKBAARHEID</span><h2>Beschikbaarheid</h2><p>Eigen FVT-redactiegegevens. Geen waarschuwing betekent geen geregistreerde afwijking; het is geen garantie op speelminuten.</p>
      <div class="availability-summary">${[['OUT',p=>availabilityPolicy(p).out],['Twijfel',p=>availabilityPolicy(p).status?.status_type==='doubt'],['Geschorst',p=>availabilityPolicy(p).suspended],['Recent terug',p=>availabilityPolicy(p).recent]].map(([label,test])=>`<span><strong>${all.filter(test).length}</strong> ${label}</span>`).join('')}</div>
      <div class="availability-filters"><label>Seizoen<select id="av-season">${options(seasons,season)}</select></label><label>Zoek speler<input id="av-search" type="search" value="${esc(filters.search)}" placeholder="Naam, club of ID"></label>
      ${[['club','Club',[...new Set(all.map(p=>p.club))].sort()],['position','Positie',[...new Set(all.map(p=>p.position))].sort()],['status','Status',[...Object.entries(statusLabels),['out','OUT'],['returned','Weer beschikbaar (7 dagen)']]],['percentage','Percentage',[0,25,50,75,100]],['sort','Sorteren',[['updated','Laatste wijziging'],['return','Verwachte terugkeer'],['name','Speler'],['club','Club'],['percentage','Percentage'],['days','Dagen afwezig']]]].map(([key,label,values])=>`<label>${label}<select data-av-filter="${key}">${key!=='sort'?'<option value="">Alles</option>':''}${options(values,filters[key])}</select></label>`).join('')}</div>
      ${manage?'<div class="av-actions"><button data-add="injury">Blessure toevoegen</button> <button data-add="suspension">Schorsing toevoegen</button> <button data-add="doubt">Twijfel toevoegen</button> <button data-add="unavailable">Andere afwezigheid</button></div>':''}
      <p role="status" id="av-status">${rows.length} spelers · ${all.filter(p=>availabilityPolicy(p).status).length} redactionele registraties</p><div class="availability-grid">${rows.slice(0,limit).map(card).join('')||'<p>Geen spelers gevonden met deze filters.</p>'}</div>${rows.length>limit?'<button id="av-more">Meer spelers</button>':''}${sourceSection()}`)
    root.querySelector('#av-search').oninput=e=>{const cursor=e.target.selectionStart;filters.search=e.target.value;limit=60;render();const input=root.querySelector('#av-search');input.focus();input.setSelectionRange(cursor,cursor)}
    root.querySelector('#av-season').onchange=e=>{season=e.target.value;limit=60;render()}
    root.querySelectorAll('[data-av-filter]').forEach(el=>el.onchange=()=>{filters[el.dataset.avFilter]=el.value;limit=60;render()})
    root.querySelector('#av-more')?.addEventListener('click',()=>{limit+=60;render()})
    const edit=(player,type)=>openAvailabilityEditor({players:all,player,type,season,onSave:async()=>{await reload();render()}})
    root.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>edit(null,el.dataset.add))
    root.querySelectorAll('[data-edit],[data-return]').forEach(el=>el.onclick=()=>edit(all.find(p=>String(p.id)===(el.dataset.edit||el.dataset.return)),el.dataset.return?'available':null))
    root.querySelectorAll('[data-proposal]').forEach(el=>el.onclick=()=>act(async()=>{
      const proposal=proposals.find(p=>p.id===el.dataset.proposal),player=players.find(p=>String(p.id)===proposal.player_id&&p.season===proposal.season)
      await availabilityRpc('availability_proposals',{proposal:proposal.id,decision:el.dataset.decision,expected_revision:availabilityPolicy(player||{}).status?.revision||0})
    }))
    root.querySelectorAll('[data-source-toggle]').forEach(el=>el.onclick=()=>act(()=>{const s=sources.find(s=>s.key===el.dataset.sourceToggle);return availabilityRpc('availability_sources',{data:{...s,approved:!s.approved}})}))
    const form=root.querySelector('#av-source-form')
    if(form)form.onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form));act(()=>availabilityRpc('availability_sources',{data:{...data,name:data.source_name,approved:form.elements.approved.checked}}))}
  }
  try{await reload();render()}catch{root.innerHTML=safeHtml('<p role="alert">Beschikbaarheid kon niet worden geladen. Herlaad de pagina om opnieuw te proberen.</p>')}
}
