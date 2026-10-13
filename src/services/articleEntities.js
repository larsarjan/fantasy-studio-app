// Optional references in existing blocks. Offsets use JavaScript UTF-16 units.
import {logoSlug,normalizeLogoClub} from './clubIdentity.js'
export const entityId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value)
export const entitySeason = value => typeof value === 'string' && /^\d{4}\/\d{4}$/.test(value)
export const playerKey = p => `${p.season}:${p.playerId ?? p.id}`
export const blockText = b => b.type === 'list' ? (b.items || []).join('\n') : b.text || ''
export function validPlayerLinks(block) {
 const text=blockText(block),links=[]
 for(const e of [...(Array.isArray(block.players)?block.players:[])].filter(Boolean).sort((a,b)=>a.start-b.start)) {
  if(!e || !entityId(e.playerId)||!entitySeason(e.season)||!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<0||e.end<=e.start||e.end>text.length||text.slice(e.start,e.end)!==e.text||links.some(x=>e.start<x.end&&e.end>x.start))continue
  // Do not create nested interactive content inside an existing Markdown link.
  if([...text.matchAll(/\[[^\]\n]+\]\([^\s)]+\)/g)].some(m=>e.start<m.index+m[0].length&&e.end>m.index))continue
  links.push(e)
 }
 return links
}
export function validateEntityContent(content) {
 if(content.ignoredEntities!==undefined&&(!Array.isArray(content.ignoredEntities)||content.ignoredEntities.length>500||content.ignoredEntities.some(x=>typeof x!=='string'||x.length>250)))throw Error('Ongeldige genegeerde voorstellen.')
 for(const b of content.blocks){
  if(b.players!==undefined&&(!['paragraph','heading','quote','list'].includes(b.type)||!Array.isArray(b.players)||b.players.length>100||validPlayerLinks(b).length!==b.players.length))throw Error('Een spelerkoppeling past niet meer bij de tekst. Controleer de koppelingen.')
  if(b.type==='match'){
   if(!entityId(b.fixtureId)||!entitySeason(b.season))throw Error('Kies een wedstrijd en seizoen.')
   for(const key of ['collapsedByDefault','showTopScorer','showLegend','showSubstitutes','playerLinks'])if(typeof b[key]!=='boolean')throw Error('Ongeldige wedstrijdinstelling.')
  }
 }
}
// Preserve unaffected ranges through edits; overlapping edits remove only that link.
export function adjustPlayerLinks(block,oldText,newText) {
 if(!block.players?.length)return
 let start=0;while(start<oldText.length&&start<newText.length&&oldText[start]===newText[start])start++
 let oldEnd=oldText.length,newEnd=newText.length;while(oldEnd>start&&newEnd>start&&oldText[oldEnd-1]===newText[newEnd-1]){oldEnd--;newEnd--}
 const delta=newEnd-oldEnd
 block.players=block.players.flatMap(e=>e.end<=start?[e]:e.start>=oldEnd?[{...e,start:e.start+delta,end:e.end+delta}]:[]).filter(e=>newText.slice(e.start,e.end)===e.text)
}
export function addPlayerLink(block,start,end,player) {
 const text=blockText(block)
 if(!entityId(String(player.id))||!entitySeason(player.season)||start<0||end<=start||end>text.length)throw Error('Selecteer eerst de tekst die je wilt koppelen.')
 const players=(block.players||[]).filter(e=>e.end<=start||e.start>=end)
 players.push({start,end,text:text.slice(start,end),playerId:String(player.id),season:player.season})
 if(validPlayerLinks({...block,players}).length!==players.length)throw Error('Verwijder eerst de gewone hyperlink rond deze tekst.')
 block.players=players
}
const normal = text => String(text).normalize('NFC').toLocaleLowerCase('nl').trim()
const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
export const ignoreKey = (kind,text) => `${kind}:${normal(text)}`.slice(0,250)
export function suggestArticleEntities(content,catalog) {
 const ignored=new Set(content.ignoredEntities||[]),linked=new Set(content.blocks.flatMap(b=>(b.players||[]).map(playerKey))),names=new Map(),suggestions=[],seen=new Set()
 for(const p of catalog.players||[]){
  for(const term of new Set([p.name,...(p.aliases||[]),p.name?.split(/\s+/).at(-1)].filter(t=>t?.length>=3))){
   const key=normal(term);if(!names.has(key))names.set(key,{term,candidates:[]});const group=names.get(key)
   if(!group.candidates.some(c=>playerKey(c)===playerKey(p)))group.candidates.push(p)
  }
 }
 for(const b of content.blocks){
  if(!['paragraph','heading','quote','list'].includes(b.type))continue
  const text=blockText(b),occupied=validPlayerLinks(b).map(e=>[e.start,e.end])
  const hits=[]
  for(const {term,candidates} of names.values()){
   const re=new RegExp(`(?<![\\p{L}\\p{N}])${escaped(term)}(?![\\p{L}\\p{N}])`,'giu')
   for(const match of text.matchAll(re))hits.push({start:match.index,end:match.index+match[0].length,text:match[0],candidates})
  }
  hits.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start))
  for(const hit of hits){
   const key=ignoreKey('player',hit.text)
   if(ignored.has(key)||seen.has(key)||occupied.some(([s,e])=>hit.start<e&&hit.end>s)||hit.candidates.every(p=>linked.has(playerKey(p))))continue
   if(hit.candidates.length===1&&seen.has(playerKey(hit.candidates[0])))continue
   const full=hit.candidates.length===1&&normal(hit.candidates[0].name)===normal(hit.text)&&hit.text.trim().split(/\s+/).length>=2&&!/\b\p{L}\./u.test(hit.text)
   suggestions.push({kind:'player',blockId:b.id,...hit,key,confidence:hit.candidates.length>1?'low':full?'high':'medium'})
   seen.add(key);if(hit.candidates.length===1)seen.add(playerKey(hit.candidates[0]));occupied.push([hit.start,hit.end])
  }
  for(const line of text.split('\n')){
   const m=line.match(/^\s*(.+?)\s+[-–—]\s+(.+?)(?:\s*\((\d+)\s*[-–]\s*(\d+)\))?\s*$/u);if(!m)continue
   const club=x=>logoSlug(x)||normalizeLogoClub(x),candidates=(catalog.fixtures||[]).filter(f=>club(f.home)===club(m[1])&&club(f.away)===club(m[2])&&(!m[3]||(Number(f.homeScore)===Number(m[3])&&Number(f.awayScore)===Number(m[4]))))
   const key=ignoreKey('match',line)
   if(candidates.length&&!ignored.has(key)&&!seen.has(key)&&!candidates.every(f=>content.blocks.some(x=>x.type==='match'&&x.fixtureId===f.id&&x.season===f.season))){suggestions.push({kind:'match',blockId:b.id,text:line,candidates,key,confidence:candidates.length===1?'high':'low'});seen.add(key)}
  }
 }
 return suggestions.slice(0,150)
}
