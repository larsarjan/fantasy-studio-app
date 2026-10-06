import test from 'node:test'
import assert from 'node:assert/strict'
import { optimizeSquadForPeriod } from './optimizerSquad.js'
const positions=[...Array(2).fill('goalkeeper'),...Array(5).fill('defender'),...Array(5).fill('midfielder'),...Array(3).fill('forward')]
const players=positions.map((position,index)=>({id:String(index),name:`Speler ${index}`,club:`Club ${index%5}`,fantasyPosition:position,currentPrice:5,chanceOfPlaying:null,expectedPointsProjection:{rounds:[{round:9,expectedPoints:5,expectedMinutes:81,appearanceProbability:0.9,fixtureCount:1,type:'single'}]}}))
const run=pool=>optimizeSquadForPeriod({players:pool,startRound:9,roundCount:1,budget:100,minimumAvailability:75})
test('minimum availability uses the existing projection when manual sheet values are absent',()=>assert.equal(run(players).valid,true))
test('explicit zero availability is never replaced by the projection',()=>assert.equal(run(players.map((p,i)=>i===0?{...p,chanceOfPlaying:0}:p)).valid,false))
test('missing projections are not treated as certainty',()=>assert.equal(run(players.map((p,i)=>i===0?{...p,expectedPointsProjection:null}:p)).valid,false))
