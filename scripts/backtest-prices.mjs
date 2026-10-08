import {createReadStream,writeFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createPriceState,processPriceBatch,summarizeEvaluations} from '../src/services/priceModel.js'
let state,count=0;const events=[],evaluations=[]
for await(const line of createInterface({input:createReadStream('test-results/price-archive.ndjson'),crlfDelay:Infinity})){
 const batch=JSON.parse(line);state??=createPriceState(batch.season);const result=processPriceBatch(state,batch);events.push(...result.events);evaluations.push(...result.evaluations);count++
 if(count%200===0)console.log(JSON.stringify({batches:count,events:events.length,windows:evaluations.length}))
}
const report={batches:count,events:events.length,eligible:events.filter(e=>e.calibration_eligible).length,thresholdSamples:{rise:state.thresholds.rise.length,fall:state.thresholds.fall.length},metrics:summarizeEvaluations(evaluations)}
writeFileSync('test-results/price-backtest.json',JSON.stringify(report,null,2));writeFileSync('test-results/price-model-state.json',JSON.stringify(state));writeFileSync('test-results/price-events.json',JSON.stringify(events));writeFileSync('test-results/price-evaluations.json',JSON.stringify(evaluations));console.log(JSON.stringify(report,null,2))
