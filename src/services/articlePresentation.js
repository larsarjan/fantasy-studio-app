import {logoSlug} from './clubIdentity.js'
export const MEDIA_LAYOUTS={normal:'Normaal',wide:'Breed',left:'Klein links',right:'Klein rechts',data:'Data visual'}
export function mediaLayout(block){
 if(MEDIA_LAYOUTS[block.layout])return block.layout
 if(block.size==='small'&&['left','right'].includes(block.align))return block.align
 return block.size==='full'?'wide':'normal'
}
export function matchHeading(text){
 const m=String(text||'').match(/^\s*(.+?)\s+[-–—]\s+(.+?)\s*\((\d+)\s*[-–]\s*(\d+)\)\s*$/u)
 if(!m||!logoSlug(m[1])||!logoSlug(m[2]))return null
 return {home:m[1],away:m[2],homeScore:Number(m[3]),awayScore:Number(m[4])}
}
export function articleSections(content){
 return (content?.blocks||[]).filter(b=>b.type==='heading'&&String(b.text||'').trim()).map((b,i)=>({id:'article-section-'+i,blockId:b.id,text:b.text}))
}
