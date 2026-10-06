import assert from 'node:assert/strict'
import { compactManagerImport } from './managerPersistence.js'
import { resolveManagerCurrentTeam } from './optimizer/managerTeamResolver.js'
const positions = ['Doelman','Doelman',...Array(5).fill('Verdediger'),...Array(5).fill('Middenvelder'),...Array(3).fill('Spits')]
const players = positions.map((position,i)=>({id:String(i+1),name:`Player ${i}`,club:`Club ${Math.floor(i/3)}`,position,season:'2026/2027',endPrice:5,matchProfile:{history:'x'.repeat(100000)}}))
const records=players.map(player=>({status:'matched',player,matches:[player],currentPrice:5,purchasePrice:4.5,sellingPrice:4.8,priceSources:{selling:'manual'}}))
const original={valid:true,players:records,matchedPlayers:records,warnings:[],positionCounts:{goalkeeper:2,defender:5,midfielder:5,forward:3}}
const compact=JSON.parse(JSON.stringify(compactManagerImport(original)))
assert(Buffer.byteLength(JSON.stringify(original))>2000000)
assert(Buffer.byteLength(JSON.stringify(compact))<30000)
assert.equal(original.players[0].player.matchProfile.history.length,100000)
assert.equal(compact.players[0].player.matchProfile,undefined)
assert.equal(compact.players[0].purchasePrice,4.5)
assert.equal(compact.players[0].sellingPrice,4.8)
assert.equal(compact.players[0].priceSources.selling,'manual')
const options={players,bank:1.5,purchasePrices:{'1':4.2},manualSellingPrices:{'1':4.7}}
assert.deepEqual(resolveManagerCurrentTeam({...options,importResult:compact}),resolveManagerCurrentTeam({...options,importResult:original}))
assert.deepEqual(compactManagerImport(compact),compact)
assert.equal(compactManagerImport(null),null)
console.log('Full team persistence: compact roundtrip preserves identity, prices and optimizer resolution without mutating profiles.')
