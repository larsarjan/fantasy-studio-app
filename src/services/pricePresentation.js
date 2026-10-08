// Small, pure presentation helpers. Never import the backend model here.
export const PRICE_VIEWS=[['rise','↑ Stijgers'],['fall','↓ Dalers'],['all','Alle spelers'],['likely','Waarschijnlijk vannacht'],['near','Bijna op grens']]
export const PRICE_SORTS=[['pressure','Hoogste prijsdruk'],['near','Dichtst bij geschatte grens'],['chance','Hoogste modelkans'],['confidence','Hoogste confidence'],['remaining','Minste nog nodig'],['buy','Grootste koopdruk'],['sell','Grootste verkoopdruk'],['price','Hoogste prijs'],['name','Naam']]
export const pressureDirection=p=>['rise','fall'].includes(p.pressure_direction)?p.pressure_direction:'stable'
export const directionalChance=p=>pressureDirection(p)==='stable'?(p.rise_probability==null&&p.fall_probability==null?null:Math.max(p.rise_probability??0,p.fall_probability??0)):p[`${pressureDirection(p)}_probability`]??null
export const nearThreshold=p=>pressureDirection(p)!=='stable'&&p.price_pressure_percentage!=null&&p.price_pressure_percentage>=80
export const likelyTonight=p=>pressureDirection(p)!=='stable'&&directionalChance(p)>=80&&p.confidence_score>=50
export function pressureStatus(p){
 const direction=pressureDirection(p),pressure=p.price_pressure_percentage
 if(direction==='stable')return p.direction==='unknown'?'Onvoldoende data':'Stabiel'
 const word=direction==='rise'?'stijgingsdruk':'dalingsdruk'
 if(pressure==null)return `${direction==='rise'?'Stijgingsdruk':'Dalingsdruk'} · drempel onbekend`
 if(pressure<=0)return 'Geen meetbare drempeldruk'
 if(pressure>=120)return `Zeer sterke ${word}`
 if(pressure>=100)return `Sterke ${word}`
 if(pressure>=80)return `Dicht bij ${direction==='rise'?'stijging':'daling'}`
 return `${pressure>=40?'Matige':'Lichte'} ${word}`
}
export const hasRemainingRange=p=>p.estimated_remaining_range&&p.estimated_remaining_range[1]-p.estimated_remaining_range[0]>Math.max(10,(p.estimated_remaining_net_transfers??0)*.2)
export function presentedExpectedPrice(p){
 const dir=pressureDirection(p),next=p.expected_next_price,current=p.current_price
 return next!=null&&(dir==='rise'&&next>current||dir==='fall'&&next<current)?next:null
}
export function filterPrices(rows,{search='',view='all',sort='pressure',gameweek='all'}={}){
 const q=search.toLocaleLowerCase('nl'),distance=p=>p.price_pressure_percentage==null?Infinity:Math.abs(p.price_pressure_percentage-100)
 const descending=(a,b)=> (b??-Infinity)-(a??-Infinity),ascending=(a,b)=>(a??Infinity)-(b??Infinity)
 return rows.filter(p=>(!q||`${p.name} ${p.club}`.toLocaleLowerCase('nl').includes(q))&&(gameweek==='all'||p.gameweek===Number(gameweek))&&(view==='all'||view==='rise'&&pressureDirection(p)==='rise'||view==='fall'&&pressureDirection(p)==='fall'||view==='likely'&&likelyTonight(p)||view==='near'&&nearThreshold(p))).sort((a,b)=>{
  const order=sort==='name'?0:sort==='price'?descending(a.current_price,b.current_price):sort==='near'?distance(a)-distance(b):sort==='chance'?descending(directionalChance(a),directionalChance(b)):sort==='confidence'?descending(a.confidence_score,b.confidence_score):sort==='remaining'?ascending(a.estimated_remaining_net_transfers,b.estimated_remaining_net_transfers):sort==='buy'?descending(a.net_transfers_since_reset,b.net_transfers_since_reset):sort==='sell'?ascending(a.net_transfers_since_reset,b.net_transfers_since_reset):descending(a.price_pressure_percentage,b.price_pressure_percentage)
  return order||a.name.localeCompare(b.name,'nl')
 })
}
export function pricePeriodStart(period,rounds,now=Date.now()){
 if(period==='24h')return new Date(now-86400000).toISOString()
 const sorted=rounds.filter(e=>Number.isFinite(Date.parse(e.deadline_time))).sort((a,b)=>Date.parse(a.deadline_time)-Date.parse(b.deadline_time)),started=sorted.filter(e=>Date.parse(e.deadline_time)<=now)
 return period==='season'?sorted[0]?.deadline_time||null:period==='previous'?(started.at(-2)||started[0])?.deadline_time||null:started.at(-1)?.deadline_time||null
}
export function summarizePriceChanges(events){const rises=events.filter(e=>e.direction==='rise'),falls=events.filter(e=>e.direction==='fall'),byPlayer=new Map();for(const e of events)byPlayer.set(e.player_id,(byPlayer.get(e.player_id)||0)+1);return {rises:rises.length,falls:falls.length,biggestRise:[...rises].sort((a,b)=>(b.new_price-b.previous_price)-(a.new_price-a.previous_price))[0]||null,biggestFall:[...falls].sort((a,b)=>(a.new_price-a.previous_price)-(b.new_price-b.previous_price))[0]||null,repeatPlayers:[...byPlayer.values()].filter(n=>n>1).length,meanMove:events.length?events.reduce((s,e)=>s+Math.abs(e.new_price-e.previous_price),0)/events.length/10:null}}
