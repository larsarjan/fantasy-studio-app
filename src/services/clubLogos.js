import {getClubLogo,logoSlug} from './clubIdentity.js'
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
// Image errors do not bubble. Capture avoids inline handlers removed by safeHtml/CSP.
export function installClubLogoFallback(root=document){
 if(root.__fvtClubLogoFallback)return
 root.__fvtClubLogoFallback=true
 root.addEventListener('error',event=>{
  const img=event.target;if(img.tagName!=='IMG'||!img.hasAttribute('data-club-logo'))return
  const fallback=root.createElement('span'),rect=img.getBoundingClientRect()
  fallback.className=img.className+' club-logo-fallback';fallback.textContent='◇'
  fallback.setAttribute('role','img');fallback.setAttribute('aria-label',img.alt)
  Object.assign(fallback.style,{width:(rect.width||24)+'px',height:(rect.height||24)+'px',display:'inline-grid',placeItems:'center',flexShrink:'0'})
  img.replaceWith(fallback)
 },true)
}
export function renderClubLogo(club,className='club-logo'){
 if(typeof document!=='undefined')installClubLogoFallback(document)
 return `<img class="${escape(className)} club-logo--${logoSlug(club)||'onbekend'}" data-club-logo src="${getClubLogo(club)}" alt="${escape(club||'Onbekende club')}" width="24" height="24" loading="lazy" decoding="async" style="object-fit:contain;flex-shrink:0">`
}
