import {createEspnClient} from './prominentCollector.js'
import {seasonOf} from './prominentModel.js'
import {createPriceState,processPriceBatch,PRICE_CONFIG,PRICE_MODEL_VERSION,summarizeEvaluations,validatePriceBatch} from './priceModel.js'
const unwrap=r=>{if(r.error)throw Error(r.error.message);return r.data}
export function normalizePriceBootstrap(b,captured_at){
 const teams=new Map(b.teams.map(t=>[t.id,t.name])),events=b.events.map(e=>({id:e.id,deadline_time:e.deadline_time}))
 return {season:seasonOf(b),captured_at,gameweek:events.filter(e=>Date.parse(e.deadline_time)<=Date.parse(captured_at)).sort((a,b)=>a.id-b.id).at(-1)?.id||0,total_players:b.total_players,events,source:'live',players:b.elements.map(p=>({player_id:p.id,name:p.web_name,club:teams.get(p.team)||'',price:p.now_cost,ownership:Number(p.selected_by_percent),transfers_in:p.transfers_in,transfers_out:p.transfers_out,transfers_in_event:p.transfers_in_event,transfers_out_event:p.transfers_out_event}))}
}
export function priceDue(last,now,config=PRICE_CONFIG){const t=new Date(now),minutes=t.getUTCHours()*60+t.getUTCMinutes();const dense=minutes>=config.window_start_utc-config.dense_margin&&minutes<=config.window_end_utc+config.settle_minutes;return !last||Date.parse(now)-Date.parse(last)>=(dense?config.dense_minutes:config.normal_minutes)*60000-5000}
export function currentPriceCache(state,predictions,sourceAt){return {model_version:PRICE_MODEL_VERSION,players:predictions,rounds:state.rounds,last_snapshot:state.last_at,last_espn_sync:sourceAt,last_prediction_update:state.last_at,config:state.config,backtest:summarizeEvaluations(state.evaluations.filter(e=>e.origin==='backtest')),live:summarizeEvaluations(state.evaluations.filter(e=>e.origin==='live'))}}
export function retainedPredictions(result,previousAt){
 const at=result.predictions[0]?.predicted_at;if(!at)return []
 const t=new Date(at),mins=t.getUTCHours()*60+t.getUTCMinutes(),dense=mins>=120&&mins<=180
 const bucket=dense?Math.floor(Date.parse(at)/300000):Math.floor(Date.parse(at)/3600000),old=previousAt?(dense?Math.floor(Date.parse(previousAt)/300000):Math.floor(Date.parse(previousAt)/3600000)):null
 const list=bucket!==old?result.predictions:[];const unique=new Map(list.map(p=>[`${p.player_id}:${p.predicted_at}`,p]))
 for(const e of result.events)if(e.prediction)unique.set(`${e.player_id}:${e.prediction.predicted_at}`,e.prediction)
 return [...unique.values()]
}
export async function syncPrices(db,{get=createEspnClient(),now=()=>new Date().toISOString(),force=false,seedState=null}={}){
 const saved=unwrap(await db.from('price_model_calibration').select('season,state,updated_at').order('updated_at',{ascending:false}).limit(1))[0]
 const at=now(),config=saved?.state.config||PRICE_CONFIG
 if(!force&&!priceDue(saved?.updated_at,at,config))return {status:'not_due',last_snapshot:saved.updated_at}
 // Reuse the existing ESPN bootstrap cache and HTTP client. Refresh that same
 // shared cache only when its snapshot is too old for this sampling interval.
 const cached=unwrap(await db.from('prominent_bootstrap').select('*').order('fetched_at',{ascending:false}).limit(1))[0]
 let bootstrap,sourceAt
 if(!seedState&&cached&&Date.parse(at)-Date.parse(cached.fetched_at)<4*60000&&cached.game_settings?._price_total_players){bootstrap={...cached,elements:cached.players,total_players:cached.game_settings._price_total_players};sourceAt=cached.fetched_at}
 else {
   bootstrap=await get('bootstrap-static/');sourceAt=now()
   const row={season:seasonOf(bootstrap),events:bootstrap.events,players:bootstrap.elements,teams:bootstrap.teams,element_types:bootstrap.element_types,chips:bootstrap.chips,game_settings:{...bootstrap.game_settings,_price_total_players:bootstrap.total_players},game_config:bootstrap.game_config||{},fetched_at:sourceAt}
   unwrap(await db.from('prominent_bootstrap').upsert(row,{onConflict:'season'}))
 }
 const batch=normalizePriceBootstrap(bootstrap,sourceAt);validatePriceBatch(batch)
 const state=seedState||(saved?.season===batch.season?saved.state:createPriceState(batch.season,config))
 if(state.version!==PRICE_MODEL_VERSION)throw Error('Model upgrade required')
 if(seedState&&saved?.season===batch.season&&Date.parse(saved.updated_at)>Date.parse(seedState.last_at)){
   // Catch up from persisted source observations, never from future labels.
   // Replayed tail is explicitly a backtest, not a forecast made in the past.
   const tail=[];for(let offset=0;;offset+=1000){const page=unwrap(await db.from('price_snapshots').select('*').eq('season',batch.season).gt('captured_at',seedState.last_at).lte('captured_at',saved.updated_at).order('captured_at').order('player_id').range(offset,offset+999));tail.push(...page);if(page.length<1000)break;if(tail.length>50000)throw Error('Catch-up exceeds one job; rebuild with newer source snapshots')}
   const names=new Map(batch.players.map(p=>[p.player_id,p])),groups=new Map();for(const row of tail){const name=names.get(row.player_id)||saved.state.players[row.player_id]?.previous||seedState.players[row.player_id]?.previous;if(!name)throw Error('Missing player identity during replay');const p={...row,name:name.name,club:name.club,ownership:Number(row.ownership)};const list=groups.get(row.captured_at)||[];list.push(p);groups.set(row.captured_at,list)}
   for(const [captured_at,players]of groups)processPriceBatch(state,{...batch,captured_at,total_players:state.total_players||batch.total_players,gameweek:players[0].gameweek,players,source:'archive'})
 }
 const previousAt=state.last_at
 const output=processPriceBatch(state,batch)
 if(output.status==='duplicate')return {status:'duplicate',last_snapshot:state.last_at}
 const counts=unwrap(await db.rpc('price_commit',{expected_at:saved?.season===batch.season?saved.updated_at:null,payload:{season:batch.season,state,current:currentPriceCache(state,output.predictions,sourceAt),snapshots:output.snapshots,events:output.events,evaluations:output.evaluations,predictions:seedState?output.predictions:retainedPredictions(output,previousAt)}}))
 return {status:'complete',...counts,last_snapshot:state.last_at}
}
