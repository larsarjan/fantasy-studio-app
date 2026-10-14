import {inlineText,linkedText,newArticleBlock,escapeBlock as esc} from '../services/articleBlocks.js'
import {blockText,entityId,entitySeason} from '../services/articleEntities.js'
import {mediaLayout} from '../services/articlePresentation.js'
import {safeLink} from '../services/articleContent.js'
import {safeHtml} from '../platform/html.js'
import './articleDocumentEditor.css'

// Serialize only a block the author has edited. Opening/redrawing never calls
// this against persisted content; untouched JSON retains its original bytes.
export function readDocumentText(root){
 let text='';const players=[],positions=new Map()
 const walk=node=>{
  if(node.nodeType===3){positions.set(node,{start:text.length,end:text.length+node.data.length});text+=node.data;return}
  if(node.nodeType!==1&&node.nodeType!==11)return
  const tag=node.nodeName,start=text.length,marker=['STRONG','B'].includes(tag)?'**':['EM','I'].includes(tag)?'*':'',href=tag==='A'?safeLink(node.getAttribute('href')):null
  if(tag==='BR'){text+='\n';positions.set(node,{start,end:text.length});return}
  text+=marker+(href?'[':'');const contentStart=text.length,children=[]
  for(const child of node.childNodes){children.push(text.length);walk(child)}
  const contentEnd=text.length;text+=marker+(href?`](${href})`:'')
  positions.set(node,{start,end:text.length,contentStart,contentEnd,children})
  if(node.dataset?.editorPlayer&&entityId(node.dataset.editorPlayer)&&entitySeason(node.dataset.season)&&node.textContent===node.dataset.linkLabel){const label=node.dataset.linkLabel,at=text.indexOf(label,contentStart);if(at>=contentStart&&at+label.length<=contentEnd)players.push({start:at,end:at+label.length,text:label,playerId:node.dataset.editorPlayer,season:node.dataset.season})}
 }
 walk(root)
 const offset=(node,index)=>{const p=positions.get(node);if(!p)return null;return node.nodeType===3?p.start+index:p.children?.[index]??p.contentEnd??p.end}
 return {text,players,offset}
}
export const documentMenu=()=>`<details class="doc-add-menu"><summary aria-label="Element toevoegen">+</summary><div role="group" aria-label="Element toevoegen">${[['image','Afbeelding','normal'],['image','Afbeelding links','left'],['image','Afbeelding rechts','right'],['imageCarousel','Carousel','wide'],['match','Wedstrijd',''],['quote','Quote',''],['image','Data visual','data'],['divider','Scheiding','']].map(([type,label,layout])=>`<button type="button" data-doc-add="${type}" data-layout="${layout}">${label}</button>`).join('')}</div></details>`
const toolbar=()=>`<div class="doc-toolbar" role="toolbar" aria-label="Geselecteerde tekst opmaken" hidden><button type="button" data-doc-format="bold" aria-label="Vet">B</button><button type="button" data-doc-format="italic" aria-label="Cursief"><em>I</em></button><button type="button" data-doc-format="heading">Kop</button><button type="button" data-doc-format="link">Link</button><button type="button" data-entity="manual">Speler koppelen</button><button type="button" data-doc-format="quote">Quote</button></div>`

export function createDocumentEditor({host,getContent,isLocked,redraw,notify,status}){
 let selection,disposed=false
 const find=id=>getContent()?.blocks.find(b=>b.id===id)
 const focused=()=>document.getSelection()?.anchorNode?.parentElement?.closest('[data-document-text]')
 const remember=()=>{
  const s=document.getSelection(),field=focused();if(!field||!host.contains(field)||!s.rangeCount)return
  const range=s.getRangeAt(0);if(!field.contains(range.endContainer))return
  selection={field,range:range.cloneRange()}
  host.querySelectorAll('.doc-toolbar').forEach(t=>t.hidden=t.closest('[data-block]')!==field.closest('[data-block]')||range.collapsed)
 }
 const focus=(id,at=0)=>{
  const card=[...host.querySelectorAll('[data-block]')].find(c=>c.dataset.block===id),field=card?.querySelector('[data-document-text]');if(!field){card?.focus();return}
  field.focus();const walker=document.createTreeWalker(field,NodeFilter.SHOW_TEXT);let node,left=at
  while(node=walker.nextNode()){if(left<=node.length){const r=document.createRange();r.setStart(node,left);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);remember();return}left-=node.length}
  const r=document.createRange();r.selectNodeContents(field);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);remember()
 }
 const refresh=()=>{
  if(disposed)return;selection=null
  const container=host.querySelector('.block-editor');if(!container)return;container.classList.add('document-editor')
  for(const card of host.querySelectorAll('[data-block]')){
   const b=find(card.dataset.block);if(!b)continue;card.dataset.type=b.type;card.dataset.layout=['image','imageCarousel'].includes(b.type)?mediaLayout(b):''
   const source=card.querySelector('textarea[data-key=text],textarea[data-key=items]')
   if(source){
    source.closest('label').classList.add('doc-source');source.tabIndex=-1
    const field=document.createElement('div');field.dataset.documentText='';field.contentEditable=String(!isLocked());field.setAttribute('role','textbox');field.setAttribute('aria-multiline','true');field.setAttribute('aria-label',b.type==='heading'?'Tussenkop':b.type==='quote'?'Citaat':b.type==='list'?'Lijst':'Alinea');field.setAttribute('aria-readonly',String(isLocked()));field.dataset.placeholder=b.type==='heading'?'Tussenkop':'Schrijf hier, of typ / voor een element…'
    const text=blockText(b);field.innerHTML=safeHtml(linkedText(b,text,b.type==='paragraph'?inlineText:value=>esc(value).replace(/\n/g,'<br>')))
    for(const button of field.querySelectorAll('[data-article-player]')){const span=document.createElement('span');span.dataset.editorPlayer=button.dataset.articlePlayer;span.dataset.season=button.dataset.season;span.dataset.linkLabel=button.textContent;span.className='doc-player-word';span.textContent=button.textContent;button.replaceWith(span)}
    source.closest('label').after(field);field.insertAdjacentHTML('beforebegin',safeHtml(toolbar()))
   }else{card.tabIndex=0;if(b.type==='divider')card.insertAdjacentHTML('beforeend','<hr class="doc-divider">')}
   card.insertAdjacentHTML('beforeend',safeHtml(documentMenu()))
  }
  if(isLocked())host.querySelectorAll('.doc-toolbar button,.doc-add-menu button').forEach(b=>b.disabled=true)
 }
 const update=field=>{
  const card=field.closest('[data-block]'),b=find(card.dataset.block),source=card.querySelector('textarea[data-key=text],textarea[data-key=items]');if(!b||!source)return
  const result=readDocumentText(field);if(result.text.length>30000){status('Deze alinea is te lang. Verdeel de tekst over meerdere alinea’s.');return}
  source.value=result.text;source.dispatchEvent(new Event('input',{bubbles:true}))
  if(b.players!==undefined||result.players.length)b.players=result.players
  notify()
 }
 const insertText=value=>{
  const s=getSelection();if(!s.rangeCount)return;const r=s.getRangeAt(0);r.deleteContents();const fragment=document.createDocumentFragment(),lines=value.split('\n');let last
  lines.forEach((line,i)=>{if(i){last=document.createElement('br');fragment.append(last)}if(line){last=document.createTextNode(line);fragment.append(last)}})
  if(!last)last=document.createTextNode('');if(!last.parentNode)fragment.append(last);r.insertNode(fragment);r.setStartAfter(last);r.collapse(true);s.removeAllRanges();s.addRange(r)
 }
 const split=field=>{
  const content=getContent(),b=find(field.closest('[data-block]').dataset.block),s=getSelection();if(!s.rangeCount||content.blocks.length>=80){status('Maximaal 80 blokken.');return}
  const r=s.getRangeAt(0),left=document.createRange(),right=document.createRange();left.selectNodeContents(field);left.setEnd(r.startContainer,r.startOffset);right.selectNodeContents(field);right.setStart(r.endContainer,r.endOffset)
  const a=readDocumentText(left.cloneContents()),z=readDocumentText(right.cloneContents()),next={...newArticleBlock('paragraph'),text:z.text}
  b.text=a.text;if(b.players!==undefined||a.players.length)b.players=a.players;if(z.players.length)next.players=z.players
  content.blocks.splice(content.blocks.indexOf(b)+1,0,next);redraw();notify();focus(next.id)
 }
 const format=async kind=>{
  if(!selection||isLocked())return;const {field,range}=selection,b=find(field.closest('[data-block]').dataset.block);if(!field.isConnected||!b)return
  if(kind==='heading'||kind==='quote'){if(b.type==='list'){status('Kies een gewone alinea om er een kop of quote van te maken.');return}b.type=kind==='heading'?'heading':'quote';if(kind==='heading')b.level=2;redraw();notify();focus(b.id);return}
  let href;if(kind==='link'){const value=window.prompt('Linkadres (https://…)');if(value===null)return;href=safeLink(value);if(!href){status('Gebruik een geldig https-, http- of mailto-adres.');return}}
  if(b.type!=='paragraph'){status('Vet, cursief en links zijn beschikbaar in gewone alinea’s.');return}
  const node=document.createElement(kind==='bold'?'strong':kind==='italic'?'em':'a');if(href)node.setAttribute('href',href)
  node.append(range.extractContents());range.insertNode(node);range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);update(field);remember()
 }
 const input=event=>{if(isLocked())return;const field=event.target.closest('[data-document-text]');if(field)update(field)}
 const beforeInput=event=>{
  const field=event.target.closest('[data-document-text]');if(!field||isLocked()||event.isComposing)return
  if(event.inputType==='insertParagraph'){event.preventDefault();if(find(field.closest('[data-block]').dataset.block)?.type==='list'){insertText('\n');update(field)}else split(field)}
  if(event.inputType==='insertLineBreak'){event.preventDefault();insertText('\n');update(field)}
  if(event.inputType==='insertText'&&event.data==='/'&&!field.textContent.trim()){event.preventDefault();const menu=field.closest('[data-block]').querySelector('.doc-add-menu');menu.open=true;menu.querySelector('button')?.focus()}
 }
 const paste=event=>{const field=event.target.closest('[data-document-text]');if(!field||isLocked())return;event.preventDefault();insertText(event.clipboardData.getData('text/plain'));update(field)}
 const key=event=>{
  const field=event.target.closest('[data-document-text]');if(!field||isLocked())return
  if((event.ctrlKey||event.metaKey)&&['b','i','k'].includes(event.key.toLowerCase())){event.preventDefault();remember();format({b:'bold',i:'italic',k:'link'}[event.key.toLowerCase()]);return}
  if(event.key==='Backspace'&&getSelection()?.isCollapsed){const result=readDocumentText(field),s=getSelection();if(result.offset(s.anchorNode,s.anchorOffset)!==0)return;const blocks=getContent().blocks,b=find(field.closest('[data-block]').dataset.block),index=blocks.indexOf(b),prev=blocks[index-1];if(b.type!=='paragraph'||prev?.type!=='paragraph')return;event.preventDefault();const offset=prev.text.length;prev.text+=b.text;const links=[...(prev.players||[]),...(b.players||[]).map(e=>({...e,start:e.start+offset,end:e.end+offset}))];if(prev.players!==undefined||links.length)prev.players=links;blocks.splice(index,1);redraw();notify();focus(prev.id,offset)}
 }
 const click=event=>{
  const button=event.target.closest('button');if(!button||isLocked())return
  if(button.dataset.docFormat){event.preventDefault();event.stopImmediatePropagation();format(button.dataset.docFormat);return}
  if(button.dataset.entity==='manual'&&selection?.field.isConnected){const card=button.closest('[data-block]');if(card===selection.field.closest('[data-block]')){const r=readDocumentText(selection.field),source=card.querySelector('textarea[data-key=text],textarea[data-key=items]');source.setSelectionRange(r.offset(selection.range.startContainer,selection.range.startOffset),r.offset(selection.range.endContainer,selection.range.endOffset))}}
  if(button.dataset.docAdd){event.preventDefault();event.stopImmediatePropagation();const blocks=getContent().blocks;if(blocks.length>=79){status('Maximaal 80 blokken.');return}const anchor=find(button.closest('[data-block]')?.dataset.block),b=newArticleBlock(button.dataset.docAdd),index=anchor?blocks.indexOf(anchor)+1:blocks.length
   if(button.dataset.layout){b.layout=button.dataset.layout;b.size=['wide','data'].includes(b.layout)?'full':['left','right'].includes(b.layout)?'small':'large';if(b.type==='image')b.align=['left','right'].includes(b.layout)?b.layout:'center'}
   blocks.splice(index,0,b);if(['left','right'].includes(b.layout)&&blocks[index+1]?.type!=='paragraph')blocks.splice(index+1,0,newArticleBlock('paragraph'));redraw();notify();focus(b.id)
  }
 }
 const down=event=>{if(event.target.closest('.doc-toolbar button'))event.preventDefault()}
 const change=event=>{if(isLocked())return;if(event.target.matches('[data-document-toc]')){getContent().toc=event.target.checked;notify()}
  if(event.target.matches('[data-key=layout]')){const b=find(event.target.closest('[data-block]').dataset.block);if(!b)return;b.size=['wide','data'].includes(b.layout)?'full':['left','right'].includes(b.layout)?'small':'large';if(b.type==='image')b.align=['left','right'].includes(b.layout)?b.layout:'center';redraw();notify();focus(b.id)}
 }
 document.addEventListener('selectionchange',remember);host.addEventListener('input',input);host.addEventListener('beforeinput',beforeInput);host.addEventListener('paste',paste);host.addEventListener('keydown',key);host.addEventListener('click',click,true);host.addEventListener('mousedown',down);host.addEventListener('change',change)
 refresh()
 return {refresh,focus,destroy(){disposed=true;document.removeEventListener('selectionchange',remember);host.removeEventListener('input',input);host.removeEventListener('beforeinput',beforeInput);host.removeEventListener('paste',paste);host.removeEventListener('keydown',key);host.removeEventListener('click',click,true);host.removeEventListener('mousedown',down);host.removeEventListener('change',change)}}
}
