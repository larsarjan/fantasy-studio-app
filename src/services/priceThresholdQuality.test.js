import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {thresholdSignal} from './priceThresholdQuality.js'
import {filterPrices,nearThreshold,materialPressure,pressureStatus} from './pricePresentation.js'
import {priceDetail,priceRow,remaining} from '../modules/priceSignalsUi.js'
const p=(overrides={})=>({player_id:1,name:'Fixture',club:'Test',pressure_direction:'rise',direction:'stable',current_price:50,expected_next_price:50,threshold_unit:'net_transfers',estimated_threshold:100,estimated_threshold_range:[90,110],current_pressure:90,price_pressure_percentage:90,net_transfers_since_reset:90,threshold_samples:30,threshold_confidence_score:85,confidence_score:80,confidence_label:'Hoog',reset_confirmed:true,max_gap_minutes:15,rise_probability:.8,fall_probability:.2,estimated_remaining_net_transfers:10,estimated_remaining_range:[0,20],expected_update_window:{start:'2026-10-09T02:30:00Z',end:'2026-10-09T02:40:00Z'},...overrides})
const primary=player=>new JSDOM(priceDetail(player)).window.document.querySelector('.pp-pressure-hero')
test('A: five transfers against a one-transfer threshold never becomes a strong 500% signal',()=>{
 const x=p({estimated_threshold:1,estimated_threshold_range:[1,2],current_pressure:5,price_pressure_percentage:500,net_transfers_since_reset:5,estimated_remaining_net_transfers:0,estimated_remaining_range:[0,0]});const q=thresholdSignal(x)
 assert.equal(q.threshold_quality,'unreliable');assert.equal(q.raw_price_pressure_percentage,500);assert.equal(q.validated_pressure_percentage,null);assert.equal(q.signal_strength,0);assert.doesNotMatch(primary(x).textContent,/500%|sterke stijgingsdruk/i);assert.match(primary(x).textContent,/Drempel onzeker/);assert(!nearThreshold(x));assert(!materialPressure(x))
})
test('B: a supported threshold of 100 and movement of 90 retains its usable 90% ratio',()=>{
 const x=p();assert.equal(thresholdSignal(x).threshold_quality,'valid');assert.equal(thresholdSignal(x).validated_pressure_percentage,90);assert.match(primary(x).textContent,/90%/);assert(nearThreshold(x));assert(materialPressure(x))
})
test('C/F: reliable overshoot and zero remaining render reached, never plus-minus zero',()=>{
 const x=p({current_pressure:120,price_pressure_percentage:120,net_transfers_since_reset:120,estimated_remaining_net_transfers:0,estimated_remaining_range:[0,0]});assert.equal(remaining(x),'Geschatte grens bereikt');assert.match(primary(x).textContent,/120%/);assert.equal(thresholdSignal(x).remaining_reached,true)
})
test('D/G: low threshold confidence suppresses overshoot and zero-remaining claims independently of model confidence',()=>{
 const x=p({current_pressure:120,price_pressure_percentage:120,threshold_confidence_score:30,confidence_score:99,net_transfers_since_reset:120,estimated_remaining_net_transfers:0,estimated_remaining_range:[0,0]});assert.equal(thresholdSignal(x).threshold_quality,'unreliable');assert.doesNotMatch(primary(x).textContent,/120%|grens bereikt|sterke stijgingsdruk/i);assert.equal(remaining(x),'Niet betrouwbaar te schatten');assert(!nearThreshold(x))
})
test('E: 0–520 remaining and dispersed historical thresholds cannot support a precise pressure score',()=>{
 const x=p({estimated_threshold:126,estimated_threshold_range:[5,663],current_pressure:143,net_transfers_since_reset:143,price_pressure_percentage:113.49,estimated_remaining_net_transfers:0,estimated_remaining_range:[0,520]});assert.equal(thresholdSignal(x).threshold_quality,'unreliable');assert(thresholdSignal(x).wide_remaining);assert.doesNotMatch(primary(x).textContent,/113,5%|Sterke stijgingsdruk/);assert.match(priceDetail(x),/Zeer brede onzekerheidsmarge/)
 const independentlyWide=p({estimated_remaining_range:[0,520]});assert.notEqual(thresholdSignal(independentlyWide).threshold_quality,'valid')
})
test('H: only a qualified ratio above 150 is abbreviated, with raw source intact',()=>{
 const x=p({price_pressure_percentage:347,current_pressure:347,net_transfers_since_reset:347,estimated_remaining_net_transfers:0,estimated_remaining_range:[0,0]}),before=JSON.stringify(x);assert.equal(thresholdSignal(x).raw_price_pressure_percentage,347);assert.equal(thresholdSignal(x).validated_pressure_percentage,347);assert.match(primary(x).textContent,/>150% van geschatte grens/);assert.doesNotMatch(primary(x).textContent,/347%/);assert.equal(JSON.stringify(x),before)
})
test('ownership rounding is evaluated in percentage points, not confused with transfers',()=>{
 const x=p({pressure_direction:'fall',threshold_unit:'ownership_fraction',reset:{ownership:.1},ownership:0,estimated_threshold:.2,estimated_threshold_range:[.15,.25],price_pressure_percentage:500,current_pressure:1,net_transfers_since_reset:-1});assert.equal(thresholdSignal(x).threshold_quality,'unreliable');assert(thresholdSignal(x).reasons.some(r=>r.includes('afronding')))
 const valid=p({pressure_direction:'fall',threshold_unit:'ownership_fraction',reset:{ownership:10},ownership:8.2,estimated_threshold:.2,estimated_threshold_range:[.18,.22],current_pressure:.18,price_pressure_percentage:90,net_transfers_since_reset:-90});assert.equal(thresholdSignal(valid).threshold_quality,'valid');assert(nearThreshold(valid))
})
test('few events, provisional resets, gaps and missing/invalid ranges cannot be promoted by comparable stable hitrate',()=>{
 for(const overrides of [{threshold_samples:4},{threshold_samples:9},{reset_confirmed:false},{max_gap_minutes:46},{max_gap_minutes:181},{estimated_threshold_range:null},{estimated_threshold_range:[110,90]}]){const x=p({...overrides,comparable_historical_count:90000,comparable_historical_hitrate:100});assert.notEqual(thresholdSignal(x).threshold_quality,'valid');assert(!nearThreshold(x))}
})
test('absolute significance is required even for a numerically large ratio; quality-first sort demotes weak extremes',()=>{
 const tiny=p({name:'A',estimated_threshold:1,estimated_threshold_range:[1,1],price_pressure_percentage:500,current_pressure:5,net_transfers_since_reset:5}),robust=p({name:'B',estimated_threshold:600,estimated_threshold_range:[550,650],price_pressure_percentage:83.33,current_pressure:500,net_transfers_since_reset:500});assert(thresholdSignal(robust).signal_strength>thresholdSignal(tiny).signal_strength);assert.equal(filterPrices([tiny,robust])[0].name,'B');assert.equal(filterPrices([tiny,robust],{sort:'near'})[0].name,'B');assert.equal(filterPrices([tiny,robust],{view:'near'}).length,1)
})
test('overlapping credible range uses possible-reached wording instead of a strong status',()=>{
 const x=p({current_pressure:105,price_pressure_percentage:105,net_transfers_since_reset:105,estimated_remaining_net_transfers:0,estimated_remaining_range:[0,5]});assert.equal(thresholdSignal(x).threshold_quality,'valid');assert.match(remaining(x),/mogelijk bereikt/);assert(!thresholdSignal(x).remaining_reached);assert.doesNotMatch(pressureStatus(x),/Sterke|Zeer sterke/)
})
test('raw model probabilities and both confidence scores stay unchanged in every UI path',()=>{
 const x=p({threshold_confidence_score:30,rise_probability:.8,fall_probability:.2,confidence_score:69}),before=JSON.stringify(x);thresholdSignal(x);filterPrices([x]);priceDetail(x);priceRow(x,0,1);assert.equal(JSON.stringify(x),before);assert.equal(primary(x).querySelector('.pp-bar'),null);assert.match(priceDetail(x),/0,8%/)
})
