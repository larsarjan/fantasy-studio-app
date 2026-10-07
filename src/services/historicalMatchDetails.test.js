import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveHistoricalMatch } from './historicalMatchDetails.js'
// Existing source identities, match and stat values observed in Studio Cloud.
const result={season:'2026/2027',round:1,date:'2026-08-07',home:'Cambuur Leeuwarden',away:'Excelsior'}
const fixtures=[{...result,id:'er-2627-001'}]
const players=[{id:'20260199',name:'Amofa',season:'2026/2027',club:'Cambuur Leeuwarden',position:'Verdediger'}]
const stats=[{id:'2026/2027-1-er-2627-001-20260199',playerId:'20260199',fixtureId:'er-2627-001',season:'2026/2027',status:'Basis',minutes:90,goals:0,assists:0,goalsConceded:4,cleanSheet:false,yellowCards:0,redCards:0}]
test('raw stored players without matchHistory load real match details and existing fantasy scoring',()=>{const r=resolveHistoricalMatch(result,fixtures,players,stats);assert.equal(r.home.length,1);assert.equal(r.home[0].match.minutes,90);assert.equal(r.home[0].match.started,true);assert(Number.isFinite(r.home[0].match.punten.totaal));assert.equal(r.away.length,0)})
test('season separator normalization and explicit facts; no invented historical rows or duplicate matches',()=>{assert.equal(resolveHistoricalMatch({...result,season:'2026-2027'},fixtures,players,stats).home.length,1);assert.equal(resolveHistoricalMatch(result,fixtures,players,[...stats,...stats]).home.length,1);assert.equal(resolveHistoricalMatch(result,fixtures,players,[]).home.length,0);assert.equal(resolveHistoricalMatch({...result,season:'2012/2013'},fixtures,players,stats).fixture,null);assert.equal(resolveHistoricalMatch(result,fixtures,players,[{...stats[0],minutes:0}]).home.length,0)})
test('transferred players retain true match facts without inventing their historical club',()=>{const r=resolveHistoricalMatch(result,fixtures,[{...players[0],club:'Other club'}],stats);assert.equal(r.unassigned.length,1);assert.equal(r.unassigned[0].player.club,'');assert.equal(r.home.length,0)})
