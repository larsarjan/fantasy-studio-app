import {BLOCK_TYPES,newArticleBlock,isBlockContent,blocksText,escapeBlock as esc,validateArticleBlocks} from '../services/articleBlocks.js'
import {articleBodyHtml,safeLink} from '../services/articleContent.js'
import {safeHtml} from '../platform/html.js'
import {uploadNewsImage,NEWS_IMAGE_BUCKET} from './newsImages.js'
import '../articleBlocks.css'

export async function mountBlockEditor(root,article,{readOnly=false,client,userId}={}){
 const host=root.querySelector('.cms-editor'),legacyBody=article.body||''
 let content=isBlockContent(article.content_blocks)?structuredClone(article.content_blocks):legacyBody?null:{version:1,blocks:[newArticleBlock('paragraph')]},legacy=null,changed=()=>{},busy=false,locked=readOnly,disposed=false
 const pending=new Set(),choices=Object.entries(BLOCK_TYPES).map(([t,label])=>`<option value="${t}">${label}</option>`).join('')
 const select=(label,key,value,options)=>`<label>${label}<select data-key="${key}">${options.map(([v,l])=>`<option value="${v}" ${String(value)===String(v)?'selected':''}>${l}</option>`).join('')}</select></label>`
 const text=(label,key,value,area=false)=>`<label>${label}${area?`<textarea rows="4" data-key="${key}" maxlength="30000">${esc(value)}</textarea>`:`<input data-key="${key}" value="${esc(value)}" maxlength="500">`}</label>`
 const file=(multiple=false)=>`<label>${multiple?'Afbeeldingen toevoegen':'Afbeelding uploaden / vervangen'}<input data-upload type="file" accept="image/jpeg,image/png,image/webp" ${multiple?'multiple':''}></label>`
 const imageFields=i=>`${i.url?`<img src="${esc(i.url)}" alt="${esc(i.alt||'Afbeeldingsvoorbeeld')}" loading="lazy">`:''}${text('Alt-tekst','alt',i.alt)}<label class="block-check"><input type="checkbox" data-key="decorative" ${i.decorative?'checked':''}>Decoratieve afbeelding (lege alt-tekst)</label><p class="block-warning" ${i.alt?.trim()||i.decorative?'hidden':''}>Alt-tekst ontbreekt: nodig voor publicatie, tenzij decoratief.</p>${text('Onderschrift (optioneel)','caption',i.caption)}`
 const redraw=focusId=>{
  if(disposed)return
  host.innerHTML=safeHtml(`<div class="block-editor"><p class="cms-help">Bouw je verhaal met tekst en beelden. Selecteer tekst en kies Vet, Cursief of Link. Bekijk de opmaak via Voorbeeld. Sla je wijzigingen op met de artikelknoppen.</p><div class="block-editor-bar">${Object.entries(BLOCK_TYPES).map(([t,l])=>`<button type="button" data-add="${t}">+ ${l}</button>`).join('')}</div><div class="block-list">${content.blocks.map((b,n)=>`<section class="block-card" data-block="${esc(b.id)}"><header><strong>${n+1}. ${BLOCK_TYPES[b.type]||'Onbekend blok'}</strong><div class="block-actions"><button type="button" data-action="up" ${n===0?'disabled':''} aria-label="Blok ${n+1} omhoog">Omhoog</button><button type="button" data-action="down" ${n===content.blocks.length-1?'disabled':''} aria-label="Blok ${n+1} omlaag">Omlaag</button><button type="button" data-action="delete">Verwijderen</button></div></header>${['paragraph','heading','quote'].includes(b.type)?`${b.type==='heading'?select('Kopniveau','level',b.level,[[2,'H2'],[3,'H3']]):''}${b.type==='paragraph'?'<div class="block-actions" role="group" aria-label="Tekstopmaak"><button type="button" data-inline="bold">Vet</button><button type="button" data-inline="italic">Cursief</button><button type="button" data-inline="link">Link</button></div>':''}${text('Tekst','text',b.text,true)}${b.type==='quote'?text('Bron / naam (optioneel)','source',b.source):''}`:b.type==='list'?`${select('Lijststijl','ordered',b.ordered,[['false','Opsomming'],['true','Genummerd']])}${text('Eén lijstitem per regel','items',(b.items||[]).join('\n'),true)}`:b.type==='image'?`${select('Formaat','size',b.size,[['small','Klein'],['medium','Middel'],['large','Groot'],['full','Volledige contentbreedte']])}${select('Uitlijning','align',b.align,[['left','Links'],['center','Gecentreerd'],['right','Rechts']])}${file()}${imageFields(b)}`:b.type==='imageCarousel'?`${select('Formaat','size',b.size,[['medium','Middel'],['large','Groot'],['full','Volledige contentbreedte']])}<p class="cms-help">Minimaal 2, maximaal 12 afbeeldingen. Geen automatisch afspelen.</p>${file(true)}${b.images.map((i,k)=>`<div class="block-image-item" data-image="${k}"><strong>Afbeelding ${k+1}</strong>${imageFields(i)}${file()}<div class="block-actions"><button type="button" data-action="image-up" ${k===0?'disabled':''}>Beeld omhoog</button><button type="button" data-action="image-down" ${k===b.images.length-1?'disabled':''}>Beeld omlaag</button><button type="button" data-action="image-delete">Beeld verwijderen</button></div></div>`).join('')}`:''}<div class="block-insert"><select data-insert-type aria-label="In te voegen bloktype">${choices}</select><button type="button" data-action="before">Blok boven invoegen</button><button type="button" data-action="after">Blok onder invoegen</button></div></section>`).join('')}</div><p class="block-editor-status" role="status" aria-live="polite"></p></div>`)
  if(locked||busy)host.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true)
  if(focusId){const card=[...host.querySelectorAll('[data-block]')].find(el=>el.dataset.block===focusId);card?.querySelector('textarea,input,select,button:not(:disabled)')?.focus()}
 }
 const notify=()=>{changed();root.dispatchEvent(new Event('block-editor-change'))}
 const status=message=>{const el=host.querySelector('.block-editor-status');if(el)el.textContent=message}
 if(content)redraw();else{
  const {mountArticleEditor}=await import('./articleEditor.js');legacy=mountArticleEditor(root,legacyBody,readOnly);legacy.onChange(()=>notify())
  if(!readOnly){const button=document.createElement('button');button.type='button';button.textContent='Omzetten naar blokken';button.onclick=()=>{
   if(!window.confirm('Omzetten naar tekstblokken? De bestaande tekst blijft in de database bewaard; controleer de opmaak voor opslaan.'))return
   const fragment=document.createElement('div');fragment.innerHTML=articleBodyHtml(legacy.body())
   const blocks=[...fragment.children].map(el=>{
    const type=['H2','H3'].includes(el.tagName)?'heading':el.tagName==='BLOCKQUOTE'?'quote':['UL','OL'].includes(el.tagName)?'list':'paragraph'
    return {...newArticleBlock(type),...(type==='list'?{ordered:el.tagName==='OL',items:[...el.children].map(li=>li.textContent)}:{text:el.textContent}),...(type==='heading'?{level:Number(el.tagName[1])}:{})}
   })
   if(blocks.length>80){window.alert('Dit artikel bevat meer dan 80 onderdelen. Bewerk het voorlopig met de bestaande teksteditor.');return}
   content={version:1,blocks};legacy.destroy();legacy=null;redraw();notify()
  };host.prepend(button)}
 }
 const onInput=e=>{
  if(!content||locked||busy||!e.target.dataset.key)return
  const card=e.target.closest('[data-block]'),b=content.blocks.find(b=>b.id===card?.dataset.block);if(!b)return
  const item=e.target.closest('[data-image]'),target=item?b.images[Number(item.dataset.image)]:b,key=e.target.dataset.key
  target[key]=key==='items'?e.target.value.split('\n'):key==='level'?Number(e.target.value):key==='ordered'?e.target.value==='true':key==='decorative'?e.target.checked:e.target.value
  if(key==='alt'||key==='decorative'){const warning=(item||card).querySelector('.block-warning');if(warning)warning.hidden=!!target.alt?.trim()||target.decorative}
  notify()
 }
 const onClick=e=>{
  if(!content||locked||busy)return
  const button=e.target.closest('button');if(!button)return
  if(button.dataset.add){if(content.blocks.length>=80){status('Maximaal 80 blokken.');return}const b=newArticleBlock(button.dataset.add);content.blocks.push(b);redraw(b.id);notify();return}
  const card=button.closest('[data-block]'),n=content.blocks.findIndex(b=>b.id===card?.dataset.block),b=content.blocks[n],action=button.dataset.action;if(!b)return
  if(button.dataset.inline){
   const field=card.querySelector('[data-key=text]'),start=field.selectionStart,end=field.selectionEnd,label=field.value.slice(start,end)||'tekst',kind=button.dataset.inline
   let replacement
   if(kind==='link'){const url=window.prompt('Linkadres (https://?)');if(url===null)return;const href=safeLink(url);if(!href){status('Gebruik een geldig https-, http- of mailto-adres.');return}replacement='['+label+']('+href+')'}else{const marker=kind==='bold'?'**':'*';replacement=marker+label+marker}
   field.setRangeText(replacement,start,end,'select');b.text=field.value;field.focus();notify();return
  }
  if(!action)return
  if(action==='delete'){if(!window.confirm('Dit blok uit het artikel verwijderen? Het opgeslagen artikel blijft intact tot je opslaat.'))return;content.blocks.splice(n,1)}
  if(action==='up'&&n>0)[content.blocks[n-1],content.blocks[n]]=[b,content.blocks[n-1]]
  if(action==='down'&&n<content.blocks.length-1)[content.blocks[n+1],content.blocks[n]]=[b,content.blocks[n+1]]
  if(['before','after'].includes(action)){if(content.blocks.length>=80){status('Maximaal 80 blokken.');return}content.blocks.splice(n+(action==='after'?1:0),0,newArticleBlock(card.querySelector('[data-insert-type]').value))}
  if(action.startsWith('image-')){const i=Number(button.closest('[data-image]').dataset.image);if(action==='image-delete')b.images.splice(i,1);else{const j=i+(action==='image-up'?-1:1);if(j>=0&&j<b.images.length)[b.images[i],b.images[j]]=[b.images[j],b.images[i]]}}
  redraw(b.id);notify()
 }
 const onUpload=async e=>{
  if(!e.target.matches('[data-upload]')||locked||busy||!content)return
  const files=[...e.target.files];if(!files.length)return
  const card=e.target.closest('[data-block]'),b=content.blocks.find(b=>b.id===card.dataset.block),item=e.target.closest('[data-image]'),index=item?Number(item.dataset.image):null
  if(b.type==='imageCarousel'&&index===null&&b.images.length+files.length>12){status('Een carrousel bevat maximaal 12 beelden.');return}
  busy=true;redraw();notify();status('Afbeeldingen uploaden…')
  try{for(const file of files){const result=await uploadNewsImage(client,userId,file);pending.add(result.path);const image={url:result.url,width:result.width,height:result.height,alt:'',caption:'',decorative:false};if(b.type==='image')Object.assign(b,image);else if(index!==null)b.images[index]={...b.images[index],...image};else b.images.push(image)}}
  catch(error){busy=false;redraw();status(error.message||'Uploaden mislukt. Probeer opnieuw.');notify();return}
  finally{busy=false}
  redraw();status('Afbeeldingen geüpload. Vul alt-tekst in en sla het artikel op.');notify()
 }
 host.addEventListener('input',onInput);host.addEventListener('change',onInput);host.addEventListener('click',onClick);host.addEventListener('change',onUpload)
 return {
  html:()=>content?JSON.stringify(content):legacy.html(),body:()=>content?legacyBody||blocksText(content):legacy.body(),blocks:()=>content?structuredClone(content):null,
  onChange:fn=>{changed=fn},isBusy:()=>busy,validate:options=>{if(content)validateArticleBlocks(content,options)},
  setLocked:value=>{locked=value||readOnly;if(content)redraw()},
  committed:()=>pending.clear(),
  cleanup:async()=>{if(pending.size){const {error}=await client.storage.from(NEWS_IMAGE_BUCKET).remove([...pending]);if(!error)pending.clear()}},
  destroy:()=>{disposed=true;legacy?.destroy();host.removeEventListener('input',onInput);host.removeEventListener('change',onInput);host.removeEventListener('click',onClick);host.removeEventListener('change',onUpload)}
 }
}
