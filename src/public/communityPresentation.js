import { esc,date,author } from './contentUI.js'
import { appUrl } from '../platform/client.js'
const symbols={'Algemeen Fantasy':'◎','Selectie & Transfers':'⇄','Spelers':'★','Clubs':'⚑','Speelrondes & Captainkeuzes':'◷','FVT-video’s & content':'▶','Off-topic voetbal':'✦'}
export function categoryCards(categories,selected='') {
 return categories.map(c=>`<button type="button" class="fvt-category-card" data-forum-category="${c.id}" aria-pressed="${c.id===selected}"><span class="fvt-category-icon" aria-hidden="true">${symbols[c.name]||'◎'}</span><span><strong>${esc(c.name)}</strong><small>${esc(c.description)}</small></span><span class="fvt-category-arrow" aria-hidden="true">↗</span></button>`).join('')
}
export function topicCard(t,userId) {
 const count=t.forum_posts?.[0]?.count||0,last=t.latest_reply?.[0];
 return `<article class="fvt-card fvt-topic ${t.pinned?'is-pinned':''}"><div class="fvt-topic-main"><div class="fvt-meta"><span class="fvt-badge">${esc(t.forum_categories?.name)}</span>${t.pinned?'<span class="fvt-topic-pin">◆ Vastgezet</span>':''}${t.closed?'<span class="fvt-topic-closed">Gesloten</span>':''}</div><h2><a href="${appUrl('community/'+t.id)}">${esc(t.title)}</a></h2><div class="fvt-topic-author">${author(t.author_name,userId===t.user_id)}<span>gestart ${date(t.created_at)}</span></div></div><div class="fvt-topic-activity"><span class="fvt-reply-count"><strong>${count}</strong> ${count===1?'reactie':'reacties'}</span><div><span>${last?'Laatste reactie':'Gestart door'} <strong>${esc(last?.author_name||t.author_name)}</strong></span><time datetime="${esc(last?.created_at||t.created_at)}">${date(last?.created_at||t.created_at)}</time></div></div></article>`
}
