import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {filterPrices,pressureStatus,presentedExpectedPrice} from '../services/pricePresentation.js'
import {priceRow,priceDetail,nearCard,info} from './priceSignalsUi.js'
// Isolated rendering fixtures only; never written to the production cache/database.
const player=(overrides={})=>({player_id:1,name:'Testspeler',club:'Testclub',current_price:79,expected_next_price:79,pressure_direction:'fall',direction:'stable',price_pressure_percentage:111.3,rise_probability:.2,fall_probability:.8,confidence_score:69,confidence_label:'Midden',estimated_remaining_net_transfers:0,estimated_remaining_range:[0,0],estimated_threshold:100,estimated_threshold_range:[100,100],threshold_unit:'net_transfers',threshold_samples:30,threshold_confidence_score:85,reset_confirmed:true,max_gap_minutes:15,current_pressure:overrides.price_pressure_percentage??111.3,net_transfers_since_reset:(overrides.pressure_direction==='rise'?1:-1)*(overrides.price_pressure_percentage??111.3),expected_update_window:{start:'2026-10-09T02:30:00Z',end:'2026-10-09T02:40:00Z'},...overrides})
const dom=html=>new JSDOM(html).window.document
test('fall rendering promotes pressure and remaining above unchanged low model chance',()=>{
 const d=dom(priceDetail(player()));assert.equal(d.querySelector('aside').dataset.ppDirection,'fall');assert.match(d.querySelector('.pp-pressure-hero').textContent,/111,3%/);assert.match(d.querySelector('.pp-pressure-hero').textContent,/Sterke dalingsdruk/);assert.match(d.querySelector('.pp-remaining-hero').textContent,/Geschatte grens bereikt/);assert.equal(d.querySelector('.pp-probability').textContent,'0,8%');assert.equal(d.querySelectorAll('.pp-prob-bar').length,0)
 assert(d.querySelector('.pp-pressure-hero').compareDocumentPosition(d.querySelector('.pp-secondary'))&4)
})
test('rise detail follows pressure even when fall probability is higher',()=>{
 const p=player({pressure_direction:'rise',rise_probability:.2,fall_probability:.8});const d=dom(priceDetail(p));assert.equal(d.querySelector('aside').dataset.ppDirection,'rise');assert.match(d.querySelector('.pp-pressure-hero').textContent,/Sterke stijgingsdruk/);assert.equal(d.querySelector('.pp-probability').textContent,'0,2%');assert.match(d.querySelector('.pp-remaining-hero').textContent,/Geschatte grens bereikt/);assert.doesNotMatch(d.querySelector('.pp-secondary').textContent,/Op daling/)
})
test('neutral and insufficient states do not invent direction or pressure',()=>{
 for(const direction of ['stable','unknown']){const d=dom(priceDetail(player({pressure_direction:'stable',direction,price_pressure_percentage:null})));assert.equal(d.querySelector('aside').dataset.ppDirection,'stable');assert.match(d.querySelector('.pp-pressure-hero').textContent,/Geen gerichte druk/);assert.match(d.querySelector('.pp-chip').textContent,direction==='unknown'?/Onvoldoende data/:/Stabiel/)}
})
test('pressure boundaries separate weak, moderate, near and exceeded signals',()=>{
 const labels=[[3,'Beperkte absolute druk'],[40,'Matige dalingsdruk'],[80,'Dicht bij daling'],[100,'Sterke dalingsdruk'],[120,'Zeer sterke dalingsdruk']];for(const [value,label]of labels)assert.equal(pressureStatus(player({price_pressure_percentage:value})),label)
 const strong=dom(`<table>${priceRow(player(),0,1)}</table>`),weak=dom(`<table>${priceRow(player({price_pressure_percentage:3}),0,1)}</table>`);assert(strong.querySelector('tr.pp-over'));assert(!weak.querySelector('tr.pp-over'));assert.match(strong.querySelector('.pp-pressure-cell').textContent,/Geschatte grens bereikt/);assert.equal(weak.querySelector('.pp-pressure-cell .pp-bar'),null)
})
test('high chance remains visible with low confidence but excluded from likely tonight',()=>{
 const p=player({fall_probability:96,confidence_score:20,confidence_label:'Zeer laag'});const d=dom(priceDetail(p));assert.equal(d.querySelector('.pp-probability').textContent,'96%');assert.match(d.querySelector('.pp-secondary').textContent,/20\/100/);assert.equal(filterPrices([p],{view:'likely'}).length,0);assert.equal(filterPrices([player({fall_probability:96,confidence_score:75})],{view:'likely'}).length,1)
})
test('active direction tabs and details always agree',()=>{
 const rows=[player(),player({player_id:2,pressure_direction:'rise'}),player({player_id:3,pressure_direction:'stable'})];for(const view of ['rise','fall'])for(const p of filterPrices(rows,{view})){assert.equal(p.pressure_direction,view);assert.equal(dom(priceDetail(p)).querySelector('aside').dataset.ppDirection,view)}
})
test('expected price never contradicts pressure or presents unchanged value as a forecast',()=>{
 assert.equal(presentedExpectedPrice(player()),null);assert.equal(presentedExpectedPrice(player({expected_next_price:80})),null);assert.equal(presentedExpectedPrice(player({expected_next_price:78})),78);assert.equal(presentedExpectedPrice(player({pressure_direction:'rise',expected_next_price:80})),80);assert.match(dom(priceDetail(player())).textContent??dom(priceDetail(player())).body.textContent,/Nog geen prijswijziging voorspeld/)
})
test('near-threshold includes low probabilities and exceeded thresholds; proximity sorting is deterministic',()=>{
 const rows=[111,3,80,150,99].map((pressure,i)=>player({player_id:i,name:String(i),price_pressure_percentage:pressure}));assert.deepEqual(filterPrices(rows,{view:'near',sort:'near'}).map(p=>p.price_pressure_percentage),[99,111,80,150]);assert.deepEqual(filterPrices(rows,{view:'fall'}).map(p=>p.price_pressure_percentage),[150,111,99,80,3]);assert.match(dom(nearCard(rows[0])).body.textContent,/111% dalingsdruk/)
})
test('all requested sorts put unknown values last and keep source values untouched',()=>{
 const rows=[player({name:'A',confidence_score:20,estimated_remaining_net_transfers:15,net_transfers_since_reset:20}),player({name:'B',confidence_score:90,estimated_remaining_net_transfers:5,net_transfers_since_reset:-60}),player({name:'C',confidence_score:null,estimated_remaining_net_transfers:null,net_transfers_since_reset:null})],original=JSON.stringify(rows)
 for(const [sort,first]of [['confidence','B'],['remaining','B'],['buy','A'],['sell','B']])assert.equal(filterPrices(rows,{sort})[0].name,first);assert.equal(JSON.stringify(rows),original)
})
test('accessible info distinguishes confidence, threshold pressure and remaining estimates',()=>{
 for(const [key,text]of [['confidence','niet hetzelfde als de kans'],['pressure','geen gegarandeerde ESPN-grens'],['remaining','geen officiële ESPN-drempel']]){const el=dom(info(key)).querySelector('[tabindex="0"]');assert(el.getAttribute('aria-label').includes(text));assert(el.querySelector('.pp-tooltip').textContent.includes(text))}
})
test('player content remains escaped in rows and details',()=>{
 const p=player({name:'<img src=x onerror=alert(1)>',club:'<script>bad()</script>'});for(const html of [priceRow(p,0,1),priceDetail(p),nearCard(p)]){assert(!dom(html).querySelector('script,img'));assert(html.includes('&lt;'))}
})
