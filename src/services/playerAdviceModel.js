export const ADVICE_TYPES={purchase:'Beste aankoop',differential:'Beste differential',budget:'Beste budgetoptie'}
export function adviceDefaults(){return {subtype:'purchase',season:'2026/2027',startRound:9,horizon:5,snapshot:null,selections:Array(5).fill(null),analyses:{},risks:{}}}
export function validateAdvice(b,{publish=false}={}){
 if(!ADVICE_TYPES[b.subtype]||!/^\d{4}\/\d{4}$/.test(b.season)||!Number.isInteger(b.startRound)||b.startRound<1||b.startRound>38||![1,3,5].includes(b.horizon))throw Error('Kies geldige adviesinstellingen.')
 if(!Array.isArray(b.selections)||b.selections.length!==5)throw Error('Gebruik één hoofdoptie en vier alternatieven.')
 const ids=new Set()
 const player=p=>{if(!p||typeof p.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(p.id)||typeof p.name!=='string'||typeof p.club!=='string'||!Array.isArray(p.matches)||p.matches.length>15)throw Error('Ongeldige spelerdata.');for(const key of ['price','expectedPoints','formScore','ownership','score'])if(p[key]!==null&&!Number.isFinite(p[key]))throw Error('Ongeldige spelerstatistiek.')}
 for(const p of b.selections){if(!p){if(publish)throw Error('Kies één hoofdoptie en vier alternatieven.');continue}player(p);if(ids.has(p.id))throw Error('Deze speler is al geselecteerd.');ids.add(p.id)}
 for(const field of ['analyses','risks']){if(!b[field]||typeof b[field]!=='object'||Array.isArray(b[field])||Object.values(b[field]).some(t=>typeof t!=='string'||t.length>10000))throw Error('Ongeldige redactionele tekst.')}
 if(b.snapshot){const s=b.snapshot;if(s.subtype!==b.subtype||s.season!==b.season||s.startRound!==b.startRound||s.horizon!==b.horizon||!Array.isArray(s.candidates)||s.candidates.length>10)throw Error('Bereid de kandidaten opnieuw voor na gewijzigde instellingen.');if(typeof s.preparedAt!=='string'||!Number.isFinite(Date.parse(s.preparedAt)))throw Error('Ongeldige momentopname.');s.candidates.forEach(player)}else if(publish)throw Error('Bereid eerst de kandidaten voor.')
}
export function selectAdvicePlayer(b,slot,player){
 if(!Number.isInteger(slot)||slot<0||slot>4)throw Error('Kies een geldige plek.')
 if(b.selections.some((p,i)=>i!==slot&&p?.id===player.id))throw Error('Deze speler staat al bij de geselecteerde opties. Kies een andere speler of maak die plek eerst vrij.')
 b.selections[slot]={...structuredClone(player),origin:b.snapshot?.candidates.some(p=>p.id===player.id)?'suggestion':'manual'}
}
