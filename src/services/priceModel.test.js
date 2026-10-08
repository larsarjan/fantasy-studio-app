import test from 'node:test'
import assert from 'node:assert/strict'
import {createPriceState,processPriceBatch,predictPrice,pressure,nextPriceWindow,summarizeEvaluations,validatePriceBatch} from './priceModel.js'
import {filterPrices,pricePeriodStart,summarizePriceChanges} from './pricePresentation.js'
import {normalizePriceBootstrap,priceDue,retainedPredictions} from './priceCollector.js'
const player=(patch={})=>({player_id:1,name:'Unit fixture',club:'Local only',price:50,ownership:10,transfers_in:100,transfers_out:20,transfers_in_event:10,transfers_out_event:2,...patch})
const batch=(at,p=player())=>({season:'2026-2027',captured_at:`2026-09-${at}`,gameweek:5,total_players:10000,players:[p],events:[{id:5,deadline_time:'2026-09-01T12:00:00Z'}],source:'archive'})
test('rise/fall detection, immutable pre-change evidence and reset cycles',()=>{
 const s=createPriceState('2026-2027');processPriceBatch(s,batch('09T01:00:00Z'))
 processPriceBatch(s,batch('09T02:20:00Z',player({transfers_in:180,transfers_out:30,ownership:10.7})))
 assert.deepEqual(pressure(s.players[1].previous,s.players[1]),{net:70,ownership_loss:-0.06999999999999992})
 const rise=processPriceBatch(s,batch('09T02:40:00Z',player({price:51,transfers_in:190,transfers_out:30,ownership:10.8})))
 assert.equal(rise.events.length,1);assert.equal(rise.events[0].direction,'rise');assert.equal(rise.events[0].net_pressure,70);assert.equal(rise.events[0].reset.price,50);assert.equal(s.players[1].reset.price,51);assert.equal(rise.predictions[0].net_transfers_since_reset,0);assert.equal(rise.events[0].prediction.predicted_at,'2026-09-09T02:20:00.000Z');assert.equal(rise.events[0].prediction.origin,'backtest')
 processPriceBatch(s,batch('10T02:20:00Z',player({price:51,transfers_in:190,transfers_out:140,ownership:9.7})))
 const fall=processPriceBatch(s,batch('10T02:40:00Z',player({price:50,transfers_in:190,transfers_out:145,ownership:9.6})))
 assert.equal(fall.events[0].direction,'fall');assert.equal(fall.events[0].reset.price,51);assert(fall.events[0].ownership_loss>0.1);assert.equal(s.players[1].reset.transfers_out,145)
 const before=JSON.stringify(s);assert.equal(processPriceBatch(s,batch('10T02:40:00Z')).status,'duplicate');assert.equal(JSON.stringify(s),before)
})
test('unknown probabilities, threshold units and remaining ownership estimates',()=>{
 const s=createPriceState('2026-2027');const r=processPriceBatch(s,batch('09T01:00:00Z'));assert.equal(r.predictions[0].direction,'unknown');assert.equal(r.predictions[0].rise_probability,null);assert.equal(r.predictions[0].estimated_remaining_net_transfers,null)
 s.thresholds.fall=Array.from({length:6},()=>({value:.1,group:2}));const p=player({ownership:9.5,transfers_out:70}),cycle=s.players[1];cycle.previous={...p,captured_at:'2026-09-09T01:10:00Z'}
 const prediction=predictPrice(s,p,cycle,'2026-09-09T01:10:00Z',10000);assert.equal(prediction.price_pressure_percentage,50);assert.equal(prediction.estimated_remaining_net_transfers,50);assert.equal(prediction.confidence_score,0);assert.equal(prediction.status,'insufficient')
 s.thresholds.rise=Array.from({length:6},()=>({value:100,group:2}));const rise=predictPrice(s,player({transfers_in:160}),cycle,'2026-09-09T01:10:00Z',10000);assert.equal(rise.estimated_remaining_net_transfers,40)
})
test('counter corrections invalidate confirmed baseline; gaps do not train precise events',()=>{
 const s=createPriceState('2026-2027');processPriceBatch(s,batch('09T01:00:00Z'));s.players[1].confirmed=true
 processPriceBatch(s,batch('09T01:10:00Z',player({transfers_in:90})));assert.equal(s.players[1].confirmed,false)
 const r=processPriceBatch(s,batch('09T06:00:00Z',player({price:51,transfers_in:200})));assert.equal(r.events[0].calibration_eligible,false);assert.equal(r.events[0].prediction,null)
})
test('walk-forward probabilities are frozen before outcomes and never reach 100%',()=>{
 const prefix=[batch('09T01:30:00Z'),batch('09T02:20:00Z',player({transfers_in:200}))]
 const s=createPriceState('2026-2027');for(const b of prefix)processPriceBatch(s,b)
 const frozen=JSON.stringify(s.players[1].last_prediction);const copied=structuredClone(s)
 processPriceBatch(s,batch('09T02:40:00Z',player({price:51,transfers_in:220})));const outcome=processPriceBatch(s,batch('09T03:00:00Z',player({price:51,transfers_in:220})))
 assert.equal(outcome.evaluations[0].actual,1);assert.equal(outcome.evaluations[0].correct,0);assert.equal(outcome.evaluations[0].false_negatives,1);assert.equal(JSON.stringify(copied.players[1].last_prediction),frozen)
 for(const b of Object.values(s.bins)){b.n=100;b.rise=100;b.fall=0}
 const pred=predictPrice(s,player({transfers_in:200}),copied.players[1],'2026-09-09T02:20:00Z',10000);assert(pred.rise_probability<100)
 assert.equal(summarizeEvaluations(outcome.evaluations).recall,0)
})
test('unobserved windows cannot be scored as stable; predictions retain event matches',()=>{
 const s=createPriceState('2026-2027');processPriceBatch(s,batch('09T01:40:00Z'));processPriceBatch(s,batch('09T02:20:00Z'));assert.equal(processPriceBatch(s,batch('09T05:00:00Z')).evaluations.length,0)
 const p={player_id:1,predicted_at:'2026-09-09T12:01:00Z'},prior={player_id:2,predicted_at:'2026-09-09T11:50:00Z'}
 assert.deepEqual(retainedPredictions({predictions:[p],events:[{prediction:prior}]},'2026-09-09T12:00:00Z'),[prior])
})
test('deadline-based periods ignore postponed fixture kickoff dates',()=>{
 const rounds=[{id:1,deadline_time:'2026-08-01T12:00:00Z'},{id:2,deadline_time:'2026-08-08T12:00:00Z'},{id:3,deadline_time:'2026-08-15T12:00:00Z'}],now=Date.parse('2026-08-16T12:00:00Z')
 assert.equal(pricePeriodStart('previous',rounds,now),rounds[1].deadline_time);assert.equal(pricePeriodStart('current',rounds,now),rounds[2].deadline_time);assert.equal(pricePeriodStart('season',rounds,now),rounds[0].deadline_time);assert.equal(pricePeriodStart('24h',rounds,now),'2026-08-15T12:00:00.000Z')
})
test('current filters, history summaries and configurable collector frequency',()=>{
 const rows=[{player_id:1,name:'A',club:'Ajax',pressure_direction:'rise',rise_probability:60,fall_probability:1,current_price:60,price_pressure_percentage:90,gameweek:5,status:'likely'},{player_id:2,name:'B',club:'PSV',pressure_direction:'fall',rise_probability:null,fall_probability:null,current_price:50,price_pressure_percentage:null,gameweek:5,status:'insufficient'}]
 assert.equal(filterPrices(rows,{view:'rise'}).length,1);assert.equal(filterPrices(rows,{view:'fall'})[0].name,'B');assert.equal(filterPrices(rows,{search:'psv'}).length,1);assert.equal(filterPrices(rows,{view:'likely'}).length,1);assert.equal(filterPrices(rows,{view:'near'}).length,1);assert.equal(filterPrices(rows,{gameweek:'4'}).length,0)
 const sum=summarizePriceChanges([{player_id:1,name:'A',direction:'rise',previous_price:50,new_price:51},{player_id:1,name:'A',direction:'fall',previous_price:51,new_price:50}]);assert.equal(sum.repeatPlayers,1);assert.equal(sum.meanMove,.1)
 assert.equal(priceDue('2026-09-09T12:00:00Z','2026-09-09T12:05:00Z'),false);assert.equal(priceDue('2026-09-09T02:30:00Z','2026-09-09T02:35:00Z'),true);assert.equal(nextPriceWindow('2026-09-09T04:00:00Z').start,'2026-09-10T02:30:00.000Z')
})
test('reject malformed values and normalize existing ESPN fields without ID remapping',()=>{
 assert.throws(()=>validatePriceBatch(batch('09T01:00:00Z',player({ownership:NaN}))));assert.throws(()=>validatePriceBatch(batch('09T01:00:00Z',player({transfers_in:-1}))))
 const b=normalizePriceBootstrap({events:[{id:1,deadline_time:'2026-08-07T12:00:00Z'}],total_players:1000,teams:[{id:1,name:'Ajax'}],elements:[{id:20,web_name:'P',team:1,now_cost:49,selected_by_percent:'1.0',transfers_in:1,transfers_out:2,transfers_in_event:0,transfers_out_event:1}]},'2026-09-09T01:00:00Z');assert.equal(b.players[0].player_id,20);assert.equal(b.players[0].price,49);assert.equal(b.gameweek,1)
})
