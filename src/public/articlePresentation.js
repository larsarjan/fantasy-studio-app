import {logoSlug} from '../services/clubIdentity.js'
let headers
// Small played-fixture headers only; never requests player stats or a snapshot.
export async function bindArticlePresentation(root){
 const headings=[...root.querySelectorAll('[data-match-section]')];if(!headings.length)return
 try{
  headers??=fetch('/api/article-entities?kind=fixtures',{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error('headers unavailable');return (await r.json()).fixtures}).catch(error=>{headers=null;throw error})
  const fixtures=await headers
  for(const heading of headings){
   const candidates=fixtures.filter(f=>logoSlug(f.home)===heading.dataset.home&&logoSlug(f.away)===heading.dataset.away&&Number(f.homeScore)===Number(heading.dataset.homeScore)&&Number(f.awayScore)===Number(heading.dataset.awayScore))
   if(candidates.length!==1)continue
   const round=heading.querySelector('[data-section-round]');if(round){round.textContent=`Speelronde ${candidates[0].round} · ${candidates[0].season}`;round.hidden=false}
  }
 }catch{ /* The original heading and logos remain readable without enrichment. */ }
}
