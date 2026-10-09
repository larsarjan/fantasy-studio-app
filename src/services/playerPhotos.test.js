import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildPhotoAliases } from './playerPhotoIdentity.js'
import { resolvePlayerPhoto, renderPlayerAvatar, setPlayerPhotoRecords, safePhotoUrl } from './playerPhotos.js'
const manifest = JSON.parse(readFileSync(new URL('../data/playerPhotos.generated.json', import.meta.url)))
const season = '2026/2027'
test('explicit IDs distinguish equal names and survive transfers without rematching', () => {
 const studio=[{id:'a',season,name:'Baas',club:'A'},{id:'b',season,name:'Baas',club:'B'}],espn={season:'2026-2027',players:[{id:1,name:'Baas',club:'Transferred'},{id:2,name:'Baas'}]},links=[{studio_id:'a',espn_id:1,season},{studio_id:'b',espn_id:2,season}]
 const result=buildPhotoAliases(studio,espn,links)
 assert.equal(result.aliases['espn:2026/2027:1'],'studio:2026/2027:a');assert.equal(result.aliases['espn:2026/2027:2'],'studio:2026/2027:b')
 assert.equal(Object.keys(buildPhotoAliases(studio,espn,[]).aliases).length,0)
 assert.deepEqual(buildPhotoAliases(studio.map(p=>({...p,name:'Changed',club:'Other'})),espn,links),result)
})
test('ambiguous, missing and wrong-season links are rejected, including stale conflicts', () => {
 const studio=[{id:'a',season},{id:'b',season}],espn={season,players:[{id:1},{id:2}]}
 for(const links of [
 [{studio_id:'a',espn_id:1,season},{studio_id:'b',espn_id:1,season}],
 [{studio_id:'a',espn_id:1,season},{studio_id:'a',espn_id:2,season}],
 [{studio_id:'a',espn_id:1,season},{studio_id:'missing',espn_id:1,season}],
 [{studio_id:'a',espn_id:3,season}],
 [{studio_id:'a',espn_id:1,season:'2025/2026'}],
 ]) assert.equal(Object.keys(buildPhotoAliases(studio,espn,links).aliases).length,0)
})
test('real crosswalk is one-to-one and every ESPN photo matches the explicit Studio ID', () => {
 assert.equal(new Set(Object.values(manifest.aliases)).size,Object.keys(manifest.aliases).length)
 for(const [espn,studio] of Object.entries(manifest.aliases)) {
  const ep=resolvePlayerPhoto({id:espn.split(':')[2],season},{namespace:'espn'}),sp=resolvePlayerPhoto({id:studio.split(':')[2],season})
  assert.equal(ep.key,sp.key);assert.deepEqual(ep.candidates,sp.candidates)
 }
 for(const p of [{id:'20260288',season},{id:'1',season},{id:'20260001',season:'2025/2026'},{id:'drommel',season}])assert.equal(resolvePlayerPhoto(p).candidates.length,0)
 assert.equal(resolvePlayerPhoto({id:'57',season,name:'Baas'},{namespace:'espn'}).candidates.length,0)
})
test('approved source, override, local, initials precedence; secure URL validation', () => {
 const p={id:'20260001',season,name:'A B'},player_key='studio:2026/2027:20260001'
 setPlayerPhotoRecords([{player_key,source_enabled:true,source_status:'approved',source_url:'https://cdn.example.com/source.webp',override_url:'https://cdn.example.com/manual.webp'}])
 assert.deepEqual(resolvePlayerPhoto(p).candidates.map(c=>c.source),['central','override','local'])
 setPlayerPhotoRecords([{player_key,source_enabled:false,source_url:'https://cdn.example.com/source.webp',override_url:'https://cdn.example.com/manual.webp'}])
 assert.equal(resolvePlayerPhoto(p).candidates[0].source,'override')
 for(const url of ['http://example.com/a','javascript:alert(1)','data:image/png;base64,x','https://user:pass@example.com/a','https://127.0.0.1/a','https://[::1]/a','https://localhost/a','https://app.local/a','//example.com/a','/player-photos/../a.webp','https://example.com/a.svg'])assert.equal(safePhotoUrl(url),null,url)
 setPlayerPhotoRecords([])
 assert.match(resolvePlayerPhoto(p,{size:32}).candidates[0].url,/-thumbnail.webp$/)
 assert.match(resolvePlayerPhoto(p,{size:180}).candidates[0].url,/-detail.webp$/)
 assert.equal(resolvePlayerPhoto({id:'missing',name:'Test Speler'}).initials,'TS')
 assert(!renderPlayerAvatar({...p,name:'<script>"'}).includes('<script>'))
 assert(!renderPlayerAvatar(p).includes('<img'))
})
