// Presentation validity only. Never changes cached model probabilities or raw ratios.
// Conservative product guardrails, not statistically calibrated price guarantees.
export const THRESHOLD_RULES=Object.freeze({minTransfers:20,fullMagnitudeTransfers:100,minSamples:10,weakSamples:5,minConfidence:60,weakConfidence:40,maxRelativeSpread:.75,unreliableSpread:1.5,maxGapMinutes:45,unreliableGapMinutes:180,ownershipStep:.1,minOwnershipSteps:2,minReferenceOwnership:1,presentationLimit:150,minMaterialPressure:40})
const finite=v=>typeof v==='number'&&Number.isFinite(v)
const range=v=>Array.isArray(v)&&v.length===2&&v.every(finite)&&v[0]>=0&&v[1]>=v[0]
export function thresholdSignal(p){
 const rules=THRESHOLD_RULES,raw=p.price_pressure_percentage,threshold=p.estimated_threshold,net=p.net_transfers_since_reset
 const dir=p.pressure_direction,fall=dir==='fall',reference=p.reset?.ownership,ownership=p.ownership
 const magnitude=finite(net)?Math.abs(net):0,remaining=p.estimated_remaining_range
 const wideRemaining=range(remaining)&&remaining[1]-remaining[0]>Math.max(100,magnitude)
 const reasons=[],weak=[],hard=[],spread=range(p.estimated_threshold_range)&&threshold>0?(p.estimated_threshold_range[1]-p.estimated_threshold_range[0])/threshold:null
 const unavailable=!['rise','fall'].includes(dir)||!finite(threshold)||threshold<=0||!finite(raw)||raw<0||!finite(p.current_pressure)
 if(unavailable)reasons.push('Geen bruikbare historische drempel of drukmeting beschikbaar.')
 if(!unavailable){
  if(p.threshold_unit==='net_transfers'){
   if(threshold<rules.minTransfers)hard.push('Geschatte drempel kleiner dan 20 netto transfers; te gevoelig voor kleine bewegingen.')
  }else if(p.threshold_unit==='ownership_fraction'){
   if(!finite(reference)||reference<rules.minReferenceOwnership)hard.push('Ownership bij de referentie is kleiner dan 1% of onbekend; afronding weegt te zwaar.')
   if(!finite(reference)||threshold*reference+1e-9<rules.ownershipStep*rules.minOwnershipSteps)hard.push('Geschatte ownershipdrempel is kleiner dan twee afrondingsstappen (0,2 procentpunt).')
   if(!finite(ownership))hard.push('Actueel ownership ontbreekt.')
  }else hard.push('Eenheid van de historische drempel is onbekend.')
  if(!finite(p.threshold_samples)||p.threshold_samples<rules.weakSamples)hard.push('Minder dan 5 historische drempelmetingen.')
  else if(p.threshold_samples<rules.minSamples)weak.push('Minder dan 10 historische drempelmetingen.')
  if(!finite(p.threshold_confidence_score)||p.threshold_confidence_score<rules.weakConfidence)hard.push('Threshold-confidence lager dan 40/100 of onbekend.')
  else if(p.threshold_confidence_score<rules.minConfidence)weak.push('Threshold-confidence lager dan 60/100.')
  if(spread==null)weak.push('Historische drempelrange ontbreekt of is ongeldig.')
  else if(spread>rules.unreliableSpread)hard.push('Drempelrange te breed voor precieze drukscore (meer dan 150% van de drempel).')
  else if(spread>rules.maxRelativeSpread)weak.push('Drempelrange breder dan 75% van de geschatte drempel.')
  if(range(p.estimated_threshold_range)&&!(p.estimated_threshold_range[0]<=threshold&&threshold<=p.estimated_threshold_range[1]))hard.push('Puntschatting ligt buiten de historische drempelrange.')
  if(p.reset_confirmed!==true)weak.push('Voorlopige referentie; niet bevestigd door een waargenomen prijswijziging.')
  if(wideRemaining)weak.push('Zeer brede onzekerheidsmarge voor resterende transfers ten opzichte van de huidige beweging.')
  if(!finite(p.max_gap_minutes)||p.max_gap_minutes>rules.unreliableGapMinutes)hard.push('Meetgat groter dan 180 minuten of onbekende meetdekking.')
  else if(p.max_gap_minutes>rules.maxGapMinutes)weak.push('Meetgat groter dan 45 minuten sinds de referentie.')
 }
 const quality=unavailable?'unavailable':hard.length?'unreliable':weak.length?'weak':'valid'
 reasons.push(...hard,...weak)
 const ownershipChange=finite(reference)&&finite(ownership)?Math.max(0,reference-ownership):0
 const directionConsistent=finite(net)&&(dir==='rise'?net>0:dir==='fall'?net<0:false)
 const significant=directionConsistent&&magnitude>=rules.minTransfers&&(!fall||p.threshold_unit!=='ownership_fraction'||ownershipChange+1e-9>=rules.ownershipStep*rules.minOwnershipSteps)
 const showPercentage=quality==='valid'&&significant
 // A ranking score, not a probability. Weak thresholds cannot gain from extreme ratios.
 const score=showPercentage?Math.round(Math.min(raw,rules.presentationLimit)/rules.presentationLimit*Math.sqrt(Math.min(magnitude/rules.fullMagnitudeTransfers,1))*(p.threshold_confidence_score/100)*(.5+.5*Math.max(0,Math.min(100,p.confidence_score??0))/100)*100):0
 const overlap=range(remaining)&&remaining[0]===0&&remaining[1]>0
 return {threshold_quality:quality,reasons,raw_price_pressure_percentage:raw??null,validated_pressure_percentage:showPercentage?raw:null,signal_strength:score,absolute_net_pressure:finite(net)?net:null,significant,material:showPercentage&&raw>=rules.minMaterialPressure,near:showPercentage&&raw>=80,relative_spread:spread,wide_remaining:wideRemaining,range_overlaps:overlap,remaining_reached:showPercentage&&raw>=100&&p.estimated_remaining_net_transfers===0&&!overlap}
}
