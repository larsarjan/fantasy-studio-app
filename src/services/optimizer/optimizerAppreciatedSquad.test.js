import assert from 'node:assert/strict'
import { generatePlannerActions } from './optimizerTransferPlanner.js'
const positions=[...Array(2).fill('goalkeeper'),...Array(5).fill('defender'),...Array(5).fill('midfielder'),...Array(3).fill('forward')]
const squad=positions.map((fantasyPosition,i)=>({id:`p${i}`,name:`Player ${i}`,club:`Club ${i%5}`,fantasyPosition,currentPrice:8,expectedPointsProjection:{rounds:[{round:8,expectedPoints:5,expectedMinutes:90,appearanceProbability:1,fixtureCount:1}]}}))
const expensive={...squad[0],id:'expensive',currentPrice:50}
const result=generatePlannerActions({currentSquad:squad,playerPool:[...squad,expensive],bank:1,startRound:8,roundCount:1,maximumActions:4})
assert.equal(result.valid,true)
assert(result.result.validOptions.some(o=>o.actionType==='no-transfer'))
assert(result.result.validOptions.every(o=>o.bankAfter>=0))
assert(!result.result.validOptions.some(o=>JSON.stringify(o).includes('expensive')))
const duplicate=generatePlannerActions({currentSquad:[squad[0],squad[0],...squad.slice(2)],playerPool:squad,bank:1,startRound:8,roundCount:1})
assert.equal(duplicate.valid,false)
console.log('Appreciated €120M squad accepted; unaffordable transfers and duplicate identities still rejected.')
