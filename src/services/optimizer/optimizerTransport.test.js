import assert from 'node:assert/strict'
import {compactOptimizerResult} from './optimizerTransport.js'
const match={spelerId:'1',statistieken:{minutes:90},samenvatting:{score:5},wedstrijden:['x'.repeat(100000)],recenteWedstrijden:[1],matches:[2],recentMatches:[3]}
const player={id:'1',name:'Test',position:'Spits',currentPrice:8,matchProfile:match,profile:{match},recentMatches:[4],matchHistory:[5],expectedPointsProjection:{rounds:[{round:8,expectedPoints:7}]}}
const result={lineup:{captain:{player,expectedPoints:7},starters:[player]},transfer:{player,bankAfter:1},statistics:{matches:4},score:14}
const compact=compactOptimizerResult(result)
assert.equal(compact.lineup.captain.player,compact.transfer.player)
assert.equal(compact.lineup.captain.player.matchProfile,compact.transfer.player.profile.match)
assert.equal(compact.lineup.captain.player.matchHistory,undefined)
assert.equal(compact.lineup.captain.player.matchProfile.wedstrijden,undefined)
assert.deepEqual(compact.lineup.captain.player.expectedPointsProjection,player.expectedPointsProjection)
assert.deepEqual(compact.lineup.captain.player.matchProfile.statistieken,match.statistieken)
assert.equal(compact.lineup.captain.expectedPoints,7)
assert.equal(compact.statistics.matches,4)
assert.equal(compact.transfer.bankAfter,1)
assert.equal(player.matchHistory.length,1)
assert.deepEqual(compactOptimizerResult(compact),compact)
assert(Buffer.byteLength(JSON.stringify(compact))<2000)
console.log('Optimizer transport preserves scores, projections, aggregates and aliases without duplicating match histories or mutating the calculation.')
