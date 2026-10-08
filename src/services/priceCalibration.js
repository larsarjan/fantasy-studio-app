// Incremental, prospective calibration. Only settled observation windows update
// these counts; current outcomes can never calibrate an earlier prediction.
export const probabilityBucket=p=>p>=95?'95–100':p>=90?'90–94':`${Math.floor(p/10)*10}–${Math.floor(p/10)*10+9}`
export const confidenceLabel=score=>score>=90?'Zeer hoog':score>=75?'Hoog':score>=50?'Midden':score>=25?'Laag':'Zeer laag'
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),round=v=>Math.round(v*100)/100
export function priceFeature(p,cycle){const r=cycle.reset,net=(p.transfers_in-r.transfers_in)-(p.transfers_out-r.transfers_out),loss=r.ownership>0?(r.ownership-p.ownership)/r.ownership:null;const n=Math.sign(net)*Math.min(8,Math.floor(Math.log2(1+Math.abs(net)/20))),rel=loss==null?'na':clamp(Math.floor(loss*20),-5,5),ownership=r.ownership<2?0:r.ownership<10?1:2;return {exact:`${n}:${rel}:${ownership}:${cycle.confirmed?1:0}`,parent:`${Math.sign(net)}:${ownership}`,net,loss}}
export function estimateProbabilities(state,feature){
 const exact=state.bins[feature.exact],parent=state.groups?.[feature.parent],population=state.population
 const source=exact?.n>=5&&exact.days>=2?exact:parent?.n>=20&&parent.days>=3?parent:population?.n>=100&&population.days>=3?population:null
 if(!source)return {rise:null,fall:null,raw_rise:null,raw_fall:null,samples:0,days:0,basis:'none',calibration_samples:0,calibration_error:null}
 const basis=source===exact?'comparable':source===parent?'broader':'season',prior=parent?.n>=20&&source===exact?parent:population
 const raw={};for(const dir of ['rise','fall'])raw[dir]=100*(source[dir]+10*(prior?.n?(prior[dir]+1)/(prior.n+3):1/3))/(source.n+10)
 const calibrated={},reliability=[]
 for(const dir of ['rise','fall']){const b=state.calibration?.[`${dir}:${probabilityBucket(raw[dir])}`];const usable=b?.n>=30&&b.days>=3;calibrated[dir]=usable?(raw[dir]*30+b.actual*100)/(b.n+30):raw[dir];if(usable)reliability.push({n:b.n,error:Math.abs(b.predicted_sum/b.n-b.actual*100/b.n)})}
 const total=calibrated.rise+calibrated.fall;if(total>99)for(const dir of ['rise','fall'])calibrated[dir]*=99/total
 return {rise:round(clamp(calibrated.rise,0.01,99)),fall:round(clamp(calibrated.fall,0.01,99)),raw_rise:round(raw.rise),raw_fall:round(raw.fall),samples:source.n,days:source.days,basis,calibration_samples:reliability.reduce((s,b)=>s+b.n,0),calibration_error:reliability.length?reliability.reduce((s,b)=>s+b.error,0)/reliability.length:null}
}
export function confidenceScore({estimate,cycle,at,threshold,ownership}){
 if(estimate.rise==null)return 0
 const sample=Math.min(1,Math.sqrt(estimate.samples/200))*Math.min(1,estimate.days/10),basis=estimate.basis==='comparable'?1:estimate.basis==='broader'?.65:.3
 const reset=cycle.confirmed?1:.35,snapshots=Math.min(1,(cycle.snapshot_count||1)/12),fresh=Math.max(0,1-(Date.parse(at)-Date.parse(cycle.previous.captured_at))/2700000)
 const gap=1-Math.min(1,(cycle.max_gap_minutes||0)/1440),stability=threshold.spread==null?.2:1/(1+threshold.spread*3),calibration=estimate.calibration_error==null?.25:Math.max(0,1-estimate.calibration_error/25),quality=ownership>=1?1:ownership>0?.5:.2
 return Math.round(clamp(25*sample*basis+15*reset+10*snapshots+10*fresh+10*gap+10*stability+15*calibration+5*quality,0,100))
}
function increment(target,key,actual,window,forecast){const b=target[key]??={n:0,rise:0,fall:0,days:0,last_window:null,evaluated:0,correct:0};b.n++;if(actual!=='stable')b[actual]++;if(b.last_window!==window){b.days++;b.last_window=window}if(forecast.direction!=='unknown'){b.evaluated++;b.correct+=forecast.direction===actual?1:0}return b}
export function learnPriceObservation(state,entry,actual,window){
 state.groups??={};state.calibration??={};const f=entry.feature
 increment(state.bins,f.exact,actual,window,entry.prediction);increment(state.groups,f.parent,actual,window,entry.prediction)
 const population={all:state.population};state.population=increment(population,'all',actual,window,entry.prediction)
 for(const dir of ['rise','fall']){const raw=entry.prediction[`raw_${dir}_probability`];if(raw==null)continue;const key=`${dir}:${probabilityBucket(raw)}`,b=state.calibration[key]??={n:0,actual:0,predicted_sum:0,days:0,last_window:null};b.n++;b.actual+=actual===dir?1:0;b.predicted_sum+=raw;if(b.last_window!==window){b.days++;b.last_window=window}}
}
export function riskStatus(probability,confidence,pressure,direction){if(probability==null)return 'insufficient';if(probability>=90&&confidence>=75)return 'very_likely';if(probability>=80&&confidence>=50)return 'likely';if(probability>=60||pressure>=80&&pressure<=120)return 'near';return direction==='rise'?'light_rise':direction==='fall'?'light_fall':'stable'}
