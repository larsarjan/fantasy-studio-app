// Backend-only incremental model. No history/model state is imported by the UI.
import {priceFeature,estimateProbabilities,confidenceScore,confidenceLabel,learnPriceObservation,probabilityBucket,riskStatus} from './priceCalibration.js'
export const PRICE_MODEL_VERSION='empirical-window-v2.1'
export const PRICE_CONFIG=Object.freeze({window_start_utc:150,window_end_utc:160,settle_minutes:20,normal_minutes:15,dense_minutes:5,dense_margin:20,max_gap_minutes:45})
const minute=60000,day=86400000
const iso=t=>new Date(t).toISOString()
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:null}
const round=v=>Number.isFinite(v)?Math.round(v*100)/100:null
export function nextPriceWindow(at,config=PRICE_CONFIG){const t=Date.parse(at),start=Math.floor(t/day)*day+config.window_start_utc*minute;const next=t>start+10*minute?start+day:start;return {start:iso(next),end:iso(next+(config.window_end_utc-config.window_start_utc)*minute),empirical:true}}
export function createPriceState(season,config=PRICE_CONFIG){return {season,version:PRICE_MODEL_VERSION,config:{...config},last_at:null,players:{},thresholds:{rise:[],fall:[]},bins:{},pending:null,evaluations:[],events:[],rounds:[]}}
export function pressure(p,cycle){const r=cycle.reset;return {net:(p.transfers_in-r.transfers_in)-(p.transfers_out-r.transfers_out),ownership_loss:r.ownership>0?(r.ownership-p.ownership)/r.ownership:null}}
const feature=priceFeature
function threshold(state,direction,ownership){const all=state.thresholds[direction],group=ownership<2?0:ownership<10?1:2;const peers=all.filter(e=>e.group===group),chosen=peers.length>=5?peers:all,values=chosen.map(e=>e.value).sort((a,b)=>a-b);return {value:values.length>=5?median(values):null,low:values.length>=5?values[Math.floor((values.length-1)*.2)]:null,high:values.length>=5?values[Math.ceil((values.length-1)*.8)]:null,samples:values.length,confirmed:chosen.filter(e=>e.confirmed).length,spread:values.length>=5?median(values.map(v=>Math.abs(v-median(values))))/Math.max(median(values),0.0001):null}}
export function predictPrice(state,p,cycle,at,totalPlayers){
 const x=pressure(p,cycle),f=feature(p,cycle),bin=state.bins[f.exact],estimate=estimateProbabilities(state,f),samples=estimate.samples
 const usable=estimate.rise!=null,rp=estimate.rise,fp=estimate.fall
 const pressureDirection=x.net>0?'rise':x.net<0?'fall':'stable',direction=usable?(rp>=50?'rise':fp>=50?'fall':'stable'):'unknown'
 const th=pressureDirection==='stable'||pressureDirection==='fall'&&x.ownership_loss==null?{value:null,samples:0,spread:null}:threshold(state,pressureDirection,cycle.reset.ownership)
 const current=pressureDirection==='fall'?x.ownership_loss:x.net
 const percentage=th.value>0?round(Math.max(0,current/th.value*100)):null
 const owners=cycle.reset.ownership*totalPlayers/100
 const remaining=th.value==null?null:Math.max(0,Math.round(pressureDirection==='rise'?th.value-x.net:(th.value-(x.ownership_loss||0))*owners))
 const score=confidenceScore({estimate,cycle,at,threshold:th,ownership:cycle.reset.ownership}),confidence=confidenceLabel(score)
 const comparable=bin?.evaluated||0,hit=comparable>=10&&bin.days>=3?round(100*bin.correct/comparable):null
 const convert=v=>Math.max(0,Math.round(pressureDirection==='rise'?v-x.net:(v-(x.ownership_loss||0))*owners))
 const range=th.low==null?null:[convert(th.low),convert(th.high)],thresholdScore=th.value==null?0:Math.round(Math.min(100,40*Math.min(1,th.samples/30)+25/(1+(th.spread||0)*3)+20*(th.confirmed/(th.samples||1))+15*(cycle.confirmed?1:.35)))
 return {player_id:p.player_id,name:p.name,club:p.club,season:state.season,gameweek:p.gameweek,current_price:p.price,ownership:p.ownership,predicted_at:at,rise_probability:rp,fall_probability:fp,raw_rise_probability:estimate.raw_rise,raw_fall_probability:estimate.raw_fall,probability_basis:estimate.basis,probability_sample_count:samples,probability_window_count:estimate.days,direction,pressure_direction:pressureDirection,price_pressure_percentage:percentage,estimated_threshold:th.value,estimated_threshold_range:th.low==null?null:[th.low,th.high],threshold_unit:pressureDirection==='fall'?'ownership_fraction':'net_transfers',current_pressure:round(current),net_transfers_since_reset:x.net,estimated_remaining_net_transfers:remaining,estimated_remaining_range:range,threshold_confidence_score:thresholdScore,expected_next_price:direction==='rise'?p.price+1:direction==='fall'?p.price-1:p.price,confidence,confidence_label:confidence,confidence_score:score,expected_update_window:nextPriceWindow(at,state.config),last_price_change:cycle.last_change,reset:cycle.reset,reset_confirmed:cycle.confirmed,comparable_samples:comparable,comparable_historical_count:comparable,comparable_historical_correct:bin?.correct||0,comparable_historical_hitrate:hit,threshold_samples:th.samples,historical_hit_rate:hit,model_version:PRICE_MODEL_VERSION,status:riskStatus(chanceValue(rp,fp),score,percentage,direction),snapshot_count_since_reset:cycle.snapshot_count||1,max_gap_minutes:round(cycle.max_gap_minutes||0)}
}
const chanceValue=(r,f)=>r==null||f==null?null:Math.max(r,f)
export function validatePriceBatch(batch){
 if(!batch||!/^\d{4}-\d{4}$/.test(batch.season)||!Number.isFinite(Date.parse(batch.captured_at))||!Array.isArray(batch.players)||!batch.players.length||batch.players.length>2000||!Number.isInteger(batch.gameweek)||batch.gameweek<0||batch.gameweek>60||!Number.isInteger(batch.total_players)||batch.total_players<=0)throw Error('Ongeldige prijssnapshot')
 const ids=new Set();for(const p of batch.players){if(ids.has(p.player_id)||!Number.isInteger(p.player_id)||p.player_id<=0||!Number.isInteger(p.price)||p.price<0||p.price>1000||!Number.isFinite(p.ownership)||p.ownership<0||p.ownership>100||['transfers_in','transfers_out','transfers_in_event','transfers_out_event'].some(k=>!Number.isInteger(p[k])||p[k]<0)||typeof p.name!=='string'||p.name.length>120||typeof p.club!=='string'||p.club.length>120)throw Error('Ongeldige spelerwaarden');ids.add(p.player_id)}
}
export function processPriceBatch(state,batch){
 validatePriceBatch(batch);if(state.season!==batch.season)throw Error('Seizoen komt niet overeen')
 const t=Date.parse(batch.captured_at),at=iso(t),config=state.config
 if(state.last_at&&t<=Date.parse(state.last_at))return {status:'duplicate',snapshots:[],events:[],predictions:[],evaluations:[]}
 const events=[],snapshots=[],predictions=[],evaluations=[],start=Math.floor(t/day)*day+config.window_start_utc*minute,end=Math.floor(t/day)*day+(config.window_end_utc+config.settle_minutes)*minute
 // Resolve one prospective observation per player/update window. Missing coverage
 // is unscored, never silently counted as a correct stable prediction.
 let matured=null
 if(state.pending&&state.last_at&&t-Date.parse(state.last_at)>config.max_gap_minutes*minute)state.pending.incomplete=true
 if(state.pending&&t>=Date.parse(state.pending.end)){
   if(!state.pending.incomplete&&t-Date.parse(state.pending.end)<=config.max_gap_minutes*minute&&t-Date.parse(state.last_at)<=config.max_gap_minutes*minute)matured=state.pending
   state.pending=null
 }
 for(const raw of batch.players){
   const p={...raw,captured_at:at,gameweek:batch.gameweek},id=p.player_id;let cycle=state.players[id]
   if(!cycle){cycle={previous:p,reset:p,confirmed:false,last_change:null,last_prediction:null,snapshot_count:0,max_gap_minutes:0};state.players[id]=cycle}
   const old=cycle.previous,gap=t-Date.parse(old.captured_at),changed=p.price!==old.price
   const countersReset=p.transfers_in<old.transfers_in||p.transfers_out<old.transfers_out
   cycle.snapshot_count=(cycle.snapshot_count||0)+1;cycle.max_gap_minutes=Math.max(cycle.max_gap_minutes||0,gap/minute)
   snapshots.push({...p,season:batch.season,net_transfers:p.transfers_in-p.transfers_out})
   if(changed){
     const direction=p.price>old.price?'rise':'fall',x=pressure(old,cycle),prior=cycle.last_prediction
     const validPrior=prior&&Date.parse(prior.predicted_at)<t&&Date.parse(prior.expected_update_window.start)<=t&&Date.parse(prior.expected_update_window.end)+config.settle_minutes*minute>=t&&gap<=config.max_gap_minutes*minute?prior:null
     const value=direction==='rise'?x.net:x.ownership_loss,eligible=!countersReset&&gap<=config.max_gap_minutes*minute&&value>0
     const event={player_id:id,name:p.name,club:p.club,season:batch.season,gameweek:batch.gameweek,detected_at:at,previous_seen_at:old.captured_at,previous_price:old.price,new_price:p.price,direction,reset:cycle.reset,before:old,after:p,net_pressure:x.net,ownership_loss:x.ownership_loss,calibration_eligible:eligible,model_version:PRICE_MODEL_VERSION,origin:batch.source==='archive'?'reconstructed':'live',prediction:validPrior,correct:validPrior&&validPrior.direction!=='unknown'?validPrior.direction===direction:null}
     events.push(event)
     if(state.pending)state.pending.events.push(event)
     // Training occurs only after this event's prior forecast has been frozen.
     if(eligible){state.thresholds[direction].push({at,value,confirmed:cycle.confirmed,group:cycle.reset.ownership<2?0:cycle.reset.ownership<10?1:2});state.thresholds[direction]=state.thresholds[direction].slice(-500)}
     cycle.reset=p;cycle.confirmed=true;cycle.last_change=at;cycle.snapshot_count=1;cycle.max_gap_minutes=gap/minute
   }else if(countersReset||gap>2*day){cycle.reset=p;cycle.confirmed=false;cycle.snapshot_count=1;cycle.max_gap_minutes=gap/minute}
   cycle.previous=p
 }
 if(matured){
   const observed=new Map(batch.players.map(p=>[p.player_id,p])),evaluation={evaluated_at:at,window_start:matured.start,origin:batch.source==='archive'?'backtest':'live',model_version:PRICE_MODEL_VERSION,actual:0,rises:0,falls:0,correct:0,correct_rises:0,correct_falls:0,false_positives:0,false_negatives:0,unknown:0,scored:0,buckets:{},threshold_error_sum:0,threshold_error_n:0,remaining_error_sum:0,remaining_error_n:0,timing_error_minutes:null}
   for(const [id,entry]of Object.entries(matured.players)){
     const p=observed.get(Number(id));if(!p)continue
     const actual=p.price>entry.price?'rise':p.price<entry.price?'fall':'stable',forecast=entry.prediction,called=['rise','fall'].includes(forecast.direction)
     evaluation.scored++;if(actual!=='stable'){evaluation.actual++;evaluation[actual==='rise'?'rises':'falls']++;if(forecast.direction===actual){evaluation.correct++;evaluation[actual==='rise'?'correct_rises':'correct_falls']++}else evaluation.false_negatives++}
     if(called&&forecast.direction!==actual)evaluation.false_positives++
     if(forecast.direction==='unknown')evaluation.unknown++
     for(const dir of ['rise','fall']){const probability=forecast[`${dir}_probability`];if(probability!=null){const key=`${dir}:${probabilityBucket(probability)}`;const b=evaluation.buckets[key]??={n:0,actual:0,predicted_sum:0};b.n++;b.actual+=actual===dir?1:0;b.predicted_sum+=probability}}
     if(forecast.direction!=='unknown'){const correct=forecast.direction===actual,prefix=correct?'correct':'incorrect';evaluation[`${prefix}_confidence_sum`]=(evaluation[`${prefix}_confidence_sum`]||0)+(forecast.confidence_score||0);evaluation[`${prefix}_confidence_n`]=(evaluation[`${prefix}_confidence_n`]||0)+1}
     learnPriceObservation(state,entry,actual,matured.start)
     const ev=[...(matured.events||[]),...events].find(e=>e.player_id===Number(id))
     if(ev&&forecast.estimated_threshold!=null&&forecast.pressure_direction===actual){const pressureAt=actual==='rise'?ev.net_pressure:ev.ownership_loss;if(pressureAt!=null){evaluation[`${actual}_threshold_error_sum`]=(evaluation[`${actual}_threshold_error_sum`]||0)+Math.abs(forecast.estimated_threshold-pressureAt);evaluation[`${actual}_threshold_error_n`]=(evaluation[`${actual}_threshold_error_n`]||0)+1}if(forecast.estimated_remaining_net_transfers!=null){const realized=Math.abs((ev.before.transfers_in-entry.transfers_in)-(ev.before.transfers_out-entry.transfers_out));evaluation.remaining_error_sum+=Math.abs(forecast.estimated_remaining_net_transfers-realized);evaluation.remaining_error_n++}}
   }
   evaluations.push(evaluation);state.evaluations.push(evaluation);state.evaluations=state.evaluations.slice(-400)
 }
 for(const raw of batch.players){const cycle=state.players[raw.player_id],p=cycle.previous,pred=predictPrice(state,p,cycle,at,batch.total_players);pred.origin=batch.source==='archive'?'backtest':'live';cycle.last_prediction=pred;predictions.push(pred)}
 // Replacing candidates before the window is safe; never replace after it starts.
 if(t>=start-60*minute&&t<start){state.pending={start:iso(start),end:iso(end),events:[],players:Object.fromEntries(predictions.map(pred=>{const p=state.players[pred.player_id].previous;return [p.player_id,{price:p.price,transfers_in:p.transfers_in,transfers_out:p.transfers_out,feature:feature(p,state.players[p.player_id]),prediction:pred}]}))}}
 state.last_at=at;state.rounds=batch.events||state.rounds;state.total_players=batch.total_players
 return {status:'processed',snapshots,events,predictions,evaluations}
}
export {priceMetrics as summarizeEvaluations} from './priceMetrics.js'
