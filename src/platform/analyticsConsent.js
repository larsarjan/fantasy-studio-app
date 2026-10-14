import {createAnalytics} from '../services/analytics.js'
import './analyticsConsent.css'
export const analytics=createAnalytics({window,document,enabled:import.meta.env.PROD && import.meta.env.VITE_GA4_MANUAL_PAGEVIEWS_CONFIRMED==='true'})
const host=document.createElement('aside');host.className='fvt-consent';host.setAttribute('aria-label','Cookievoorkeuren');document.body.append(host)
function show(expanded=false){
  if(location.pathname.startsWith('/admin')){host.hidden=true;return}
  host.hidden=false
  host.innerHTML=analytics.choice&&!expanded?'<button type="button" data-preferences>Cookievoorkeuren</button>':'<section><h2>Jouw privacyvoorkeuren</h2><p>Noodzakelijke opslag houdt de site werkend. Met jouw toestemming gebruiken we Google Analytics voor bezoekersstatistieken en campagnemeting. Advertentietracking blijft uit.</p><p><a href="/privacy">Lees ons privacyoverzicht</a></p><div><button type="button" data-deny>Alleen noodzakelijk</button><button type="button" data-allow>Analytics toestaan</button></div></section>'
  host.querySelector('[data-preferences]')?.addEventListener('click',()=>show(true))
  for(const [selector,value] of [['[data-deny]',false],['[data-allow]',true]])host.querySelector(selector)?.addEventListener('click',()=>{analytics.consent(value);show()})
}
show()
// History-only popup state and repeated renders never create another pageview.
let pending=false
const navigation=()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;analytics.navigate();show()})}
for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(...args){const result=original.apply(this,args);navigation();return result}}
window.addEventListener('popstate',navigation)
window.addEventListener('storage',event=>{if(event.key==='fvt.analytics-consent.v1')location.reload()})
document.addEventListener('click',event=>{
  const node=event.target.closest?.('a,button');if(!node)return
  if(node.matches('.fixture-mode[data-mode="compare"]'))analytics.track('fixture_compare_open')
  if(node.matches('[data-player-id],[data-article-player]'))analytics.track('player_profile_open')
  if(node.tagName==='A'){try{const url=new URL(node.href);if(['www.youtube.com','youtube.com','youtu.be'].includes(url.hostname))analytics.track('youtube_click')}catch{/* invalid link */}}
})

document.addEventListener('fvt:login-success',()=>{analytics.navigate();analytics.track('login_success')})
