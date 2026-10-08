import test from 'node:test'
import assert from 'node:assert/strict'
import {canonicalClubs,canonicalFavorite,clubKey} from './canonicalClubs.js'
test('current fixtures define unique clubs, historical clubs do not leak into profile',()=>{
 const fixtures=[{season:'2025/2026',home:'Oude club',away:'Ajax'},{season:'2026/2027',home:'AZ',away:'ADO Den Haag'},{season:'2026/2027',home:'AZ Alkmaar',away:'ADO den Haag'},{season:'2026/2027',home:'N.E.C.',away:'N.E.C'},{season:'2026/2027',home:'Cambuur Leeuwarden',away:'sc Heerenveen'}]
 const clubs=canonicalClubs(fixtures)
 assert.deepEqual(clubs,['ADO Den Haag','AZ','N.E.C.','SC Cambuur','sc Heerenveen'])
 for(const [alias,name] of [['az alkmaar','AZ'],['ADO den Haag','ADO Den Haag'],['N.E.C','N.E.C.'],['SC Cambuur','SC Cambuur']])assert.equal(canonicalFavorite(alias,clubs),name)
 assert.equal(canonicalFavorite('Oude club',clubs),'');assert.equal(clubKey(' N.E.C. '),clubKey('nec'))
})
