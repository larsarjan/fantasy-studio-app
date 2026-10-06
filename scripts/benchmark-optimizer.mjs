import {readFileSync,writeFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
import {runManagerOptimizerCore} from '../src/services/optimizer/managerOptimizer.js'
import {createUiResult} from '../src/workers/managerOptimizer.worker.js'
import {compactOptimizerResult} from '../src/services/optimizer/optimizerTransport.js'
const input=JSON.parse(readFileSync('test-results/optimizer-input.json'))
if (process.argv[2]) input.request.period.roundCount = Number(process.argv[2])
const started=performance.now(), phases=[]
const result=runManagerOptimizerCore({...input,onProgress:p=>phases.push({...p,measuredMs:Math.round(performance.now()-started)})})
const compact=createUiResult(result)
const transport=compactOptimizerResult(compact)
const summary={valid:result.valid,errors:result.errors,warnings:result.warnings,elapsedMs:Math.round(performance.now()-started),inputBytes:Buffer.byteLength(JSON.stringify(input)),outputBytes:Buffer.byteLength(JSON.stringify(compact)),transportBytes:Buffer.byteLength(JSON.stringify(transport)),phases,statistics:result.seasonPlannerResult?.result?.statistics}
writeFileSync(`test-results/optimizer-benchmark-${input.request.period.roundCount}.json`,JSON.stringify(summary,null,2))
console.log(JSON.stringify(summary,null,2))
