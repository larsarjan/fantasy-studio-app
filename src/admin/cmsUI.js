import { safeHtml } from '../platform/html.js'
import { appUrl, friendlyError } from '../platform/client.js'
import { hasPermission } from '../platform/access.js'
import { esc, date } from '../public/contentUI.js'
import { articleBodyHtml } from '../services/articleContent.js'

export {esc,date}
export const PAGE_SIZE=30
export const STATES={draft:'Concept',review:'Ter review',scheduled:'Gepland',published:'Gepubliceerd',hidden:'Verborgen',archived:'Gearchiveerd'}
export const value=result=>{if(result.error)throw result.error;return result.data}
export const may=(ctx,p)=>hasPermission(ctx.account,p)
export const editable=(ctx,row)=>may(ctx,'articles.edit')&&(!['published','scheduled'].includes(row.status)||may(ctx,'articles.publish'))
export const set=(root,markup)=>{root.innerHTML=safeHtml(markup)}
export const card=(title,body)=>`<section class="admin-card cms-card"><h2>${esc(title)}</h2>${body}</section>`
export const notice='<p class="cms-feedback admin-status" role="status" aria-live="polite"></p>'
export const empty=(title,body)=>`<div class="cms-empty"><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`
export const input=(label,name,v='',extra='')=>`<label>${esc(label)}<input name="${['title','name'].includes(name)?'fvt_'+name:name}" value="${esc(v)}" ${extra}></label>`
export const options=(rows,current)=>rows.map(([id,label])=>`<option value="${esc(id)}" ${id===(current||'')?'selected':''}>${esc(label)}</option>`).join('')
export const choose=(label,name,rows,current='',extra='')=>`<label>${esc(label)}<select name="${name}" ${extra}>${options(rows,current)}</select></label>`
export const yesNo=(label,name,checked,extra='')=>`<label class="cms-checkbox"><input type="checkbox" name="${name}" ${checked?'checked':''} ${extra}>${esc(label)}</label>`
export const chip=state=>`<span class="admin-chip ${esc(state)}">${esc(STATES[state]||state)}</span>`
export const when=stamp=>stamp?date(stamp):'Nog niet gepubliceerd'
export const localDate=stamp=>stamp?new Date(new Date(stamp).getTime()-new Date(stamp).getTimezoneOffset()*60000).toISOString().slice(0,16):''
export const cleanQuery=q=>String(q||'').trim().replace(/[%_\\]/g,'').slice(0,100)
export const page=()=>Math.max(0,Math.min(10000,Number(new URLSearchParams(location.search).get('page'))||0))
export const href=(section,query='')=>appUrl('admin/'+section+query)
export const feedback=(root,message)=>{const el=root.querySelector('.cms-feedback');if(el)el.textContent=message}
export const errorText=error=>error.code==='23505'?'Dit artikeladres of deze video bestaat al. Open de bestaande registratie of kies een ander adres in Geavanceerd.':error.code==='23514'?'Controleer de invoer. Voor publicatie zijn een korte intro van minimaal 10 tekens en een artikeltekst van minimaal 20 tekens nodig.':error.code?friendlyError(error):error.message||'Dit is niet gelukt. Probeer het opnieuw.'
export function lockRow(row){const controls=row?[...row.querySelectorAll('button,select')].map(node=>({node,disabled:node.disabled})):[];controls.forEach(({node})=>node.disabled=true);return()=>controls.forEach(({node,disabled})=>{if(node.isConnected)node.disabled=disabled})}
export async function task(root,button,run){const unlock=lockRow(button.closest('tr'));button.disabled=true;feedback(root,'Even geduld…');try{await run()}catch(error){feedback(root,errorText(error))}finally{unlock();if(button.isConnected)button.disabled=false}}
export function pager(section,current,more,params){const copy=new URLSearchParams(params);copy.delete('page');const base=copy.toString();return `<div class="admin-actions cms-pager">${current?`<a href="${href(section,'?'+base+'&page='+(current-1))}">← Vorige</a>`:''}<span>Pagina ${current+1}</span>${more?`<a href="${href(section,'?'+base+'&page='+(current+1))}">Volgende →</a>`:''}</div>`}
export function preview(article){
 const dialog=document.createElement('dialog');dialog.className='cms-preview-dialog'
 dialog.innerHTML=safeHtml(`<div class="admin-actions cms-preview-header"><span>Artikelvoorbeeld</span><button type="button" data-close>Sluiten</button></div><article class="cms-article"><p class="admin-muted">${esc(article.author_name||'FVT-redactie')} · ${when(article.published_at)}</p><h1>${esc(article.title||'Je artikeltitel')}</h1><p class="cms-intro">${esc(article.intro)}</p>${article.image_url?`<img class="cms-hero-image" src="${esc(article.image_url)}" alt="${esc(article.image_alt||article.title)}">`:''}<div class="cms-prose">${articleBodyHtml(article.body)}</div></article>`)
 document.querySelector('.admin-shell').append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal()
}
