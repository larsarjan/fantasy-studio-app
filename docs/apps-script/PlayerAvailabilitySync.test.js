import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const c=vm.createContext({})
vm.runInContext(readFileSync(new URL('./PlayerAvailabilityCore.gs',import.meta.url),'utf8'),c)
const hash=s=>createHash('sha256').update(s).digest('hex')
const clubs=Array.from({length:18},(_,i)=>`Club ${i}`)
const card=(i,pct='OUT',icon='blessure',name='Speler '+i)=>`<a href="/speler-${i}" class="group"><strong class="text-lg">${name}</strong><img src="/staticimages/icons/${icon}.png" alt="${icon==='blessure'?'Blessure':icon==='schorsing'?'Schorsing':'Twijfelgeval'}"><span class="rounded-full px-2 py-0.5 text-tiny">${pct}</span><span class="hidden text-sm md:block"> - enkelklachten </span><span>Verw. terugkeer :</span><strong>01/11/26</strong></a>`
const page=()=>`<html><div id="club-list">${clubs.map((club,i)=>`<section><h2>${club}</h2>${card(i*2)}${card(i*2+1)}</section>`).join('')}</div></html>`
const source=()=>c.avParse(page(),clubs)
const players=()=>source().map((r,i)=>({id:String(i),name:r.Source_Player_Name,club:r.Source_Club,season:'2026/2027'}))
const plan=(rows,old=[],roster=players(),now='2026-10-23T10:00:00Z')=>c.avPlan(rows,old,roster,'2026/2027',now,hash)
test('full HTML source has factual reasons, return dates, explicit zero and no invented update time',()=>{
 const r=source();assert.equal(r.length,36);assert.equal(r[0].Availability_Percentage,0);assert.equal(r[0].Status_Type,'injury');assert.equal(r[0].Expected_Return,'2026-11-01');assert.equal(r[0].Source_Updated_At,'')
})
test('empty, truncated, schema-changed and missing club responses abort',()=>{
 for(const html of ['',page().slice(0,-7),page().replace('rounded-full px-2 py-0.5 text-tiny','other'),page().replace('<h2>Club 0</h2>','<h2>Missing</h2>')])assert.throws(()=>c.avParse(html,clubs))
})
test('status percentages and suspension are not inferred from group headings',()=>{
 for(const pct of ['OUT','25%','50%','75%','100%','?']){
  const r=c.avParse(page().replace(card(0),card(0,pct,'schorsing')),clubs)[0]
  assert.equal(r.Availability_Percentage,pct==='OUT'?0:pct==='?'?'':parseInt(pct));assert.equal(r.Status_Type,pct==='100%'?'available':'suspension')
 }
})
test('matching is exact or explicit alias, scoped to season and current club; duplicates never auto-link',()=>{
 const r={Source_Player_Name:'Émile van der Berg',Source_Club:'Ajax'}
 const p={id:'a',name:'Emile van der Berg',club:'Ajax',season:'2026/2027'}
 assert.equal(c.avMatch(r,[p],p.season).method,'exact')
 assert.equal(c.avMatch(r,[p,{...p,id:'b'}],p.season).method,'ambiguous')
 assert.equal(c.avMatch(r,[{...p,club:'PSV'}],p.season).method,'unmatched')
 assert.equal(c.avMatch(r,[p],'2025/2026').method,'unmatched')
 assert.equal(c.avMatch(r,[{...p,name:'Berg',aliases:[r.Source_Player_Name]}],p.season).method,'alias')
 assert.equal(c.avMatch({...r,Source_Player_Name:'Berg'},[p],p.season).method,'unmatched')
 assert.equal(c.avMatch(r,[p],p.season,'a').method,'manual')
 assert.equal(c.avName("O’Neill-Jansen"),c.avName("O'Neill Jansen"))
})
test('hash upsert is idempotent; history and first seen survive a change; missing card never clears status',()=>{
 const first=plan(source()), repeat=plan(source(),first.rows)
 assert.equal(repeat.rows.length,36);assert.equal(repeat.changes.length,0)
 const rows=source();rows[0].Availability_Percentage=100;rows[0].Status_Type='available'
 const changed=plan(rows,first.rows,players(),'2026-10-23T11:00:00Z')
 assert.equal(changed.rows.length,37);assert.equal(changed.rows[0].Active,false);assert.equal(changed.rows[36].First_Seen_At,first.rows[0].First_Seen_At)
 const missing=plan(source().slice(1),first.rows);assert.equal(missing.rows[0].Active,true)
 assert.throws(()=>plan(source().slice(0,10),first.rows));assert.throws(()=>plan([],first.rows))
})
test('known explicit ESPN mapping supplies aliases only when club matches and ID mapping is unique',()=>{
 const p={id:'1',name:'Jansen',club:'Ajax',season:'2026/2027'}, m={season:p.season,playerId:'1',espnPlayerId:'8'}, b={elements:[{id:8,first_name:'Jan',second_name:'Jansen',team:1}],teams:[{id:1,name:'Ajax'}]}
 assert.equal(c.avAddAliases([p],[m],b,p.season)[0].aliases[0],'Jan Jansen')
 assert.equal(c.avAddAliases([p],[m,{...m,playerId:'2'}],b,p.season)[0].aliases.length,0)
 assert.equal(c.avAddAliases([{...p,club:'PSV'}],[m],b,p.season)[0].aliases.length,0)
})
test('reviewed alias IDs are never reused after a club or season change',()=>{
 const p={id:'7',name:'Berg',club:'Ajax',season:'2026/2027'}, aliases=[{playerId:'7',playerName:'Berg',sourceName:'Jan Berg',sourceClub:'Ajax',season:p.season}]
 assert.equal(c.avExplicitAliases([p],aliases)[0].aliases[0],'Jan Berg')
 assert.equal(c.avExplicitAliases([{...p,club:'PSV'}],aliases)[0].aliases.length,0)
 assert.equal(c.avExplicitAliases([{...p,season:'2027/2028'}],aliases)[0].aliases.length,0)
})
test('actual Apps Script importer preserves the Sheet on timeout, HTTP error, empty or partial source and throttles retries',()=>{
 for(const failure of ['timeout',503,'',page().replace('<h2>Club 1</h2>','<h2>Missing</h2>')]){
  let writes=0,calls=0;const properties={AVAILABILITY_SEASON:'2026/2027'}
  const data={Spelers:[['PlayerID','Speler','Club','Seizoen'],...players().map(p=>[p.id,p.name,p.club,p.season])],ELITE_PLAYER_STATS:[['Seizoen','SpelerID','ESPNPlayerId']],PLAYER_AVAILABILITY:[Array.from(c.AV_HEADERS)]}
  const context=vm.createContext({Date,Set,PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>properties[k]=v})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},SpreadsheetApp:{getActive:()=>({getSheetByName:name=>({getSheetId:()=>847908298,getDataRange:()=>({getDisplayValues:()=>data[name].map(r=>r.slice())}),getRange:()=>({getDisplayValues:()=>[data[name][0]],setValues:()=>writes++})})})},UrlFetchApp:{fetch:url=>{calls++;if(url.includes('espngoal'))return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({elements:[],teams:[]})};if(failure==='timeout')throw Error('timeout');return{getResponseCode:()=>typeof failure==='number'?failure:200,getContentText:()=>failure}}}})
  for(const file of ['PlayerAvailabilityCore.gs','PlayerAvailabilityAliases.gs','PlayerAvailabilitySync.gs'])vm.runInContext(readFileSync(new URL('./'+file,import.meta.url),'utf8'),context)
  assert.throws(()=>context.syncPlayerAvailability());assert.equal(writes,0);assert.equal(calls,2)
  assert.equal(context.syncPlayerAvailability().skipped,'hourly-limit');assert.equal(calls,2)
 }
})

test('manual pilot verifies read-back, reports hourly skip honestly and never installs a trigger',()=>{
 const logs=[],properties={},now='2026-10-24T09:18:45.242Z'
 let rows=[{Active:'true',Last_Seen_At:now,Source_Player_Name:'Known',Match_Status:'alias'},{Active:'true',Last_Seen_At:now,Source_Player_Name:'Unknown',Source_Club:'Ajax',Match_Status:'unmatched'}]
 const sandbox=vm.createContext({console:{log:s=>logs.push(s)},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>properties[k]=v})},SpreadsheetApp:{getActive:()=>({getSheetByName:()=>({})})}})
 for(const file of ['PlayerAvailabilityCore.gs','PlayerAvailabilitySync.gs'])vm.runInContext(readFileSync(new URL('./'+file,import.meta.url),'utf8'),sandbox)
 sandbox.setupPlayerAvailability=()=>{}
 sandbox.avReadSheet_=()=>rows
 sandbox.syncPlayerAvailability=()=>{properties.AVAILABILITY_LAST_SUCCESS=JSON.stringify({at:now,count:2});return {alias:1,unmatched:1}}
 assert.equal(sandbox.testPlayerAvailabilityPilot().status,'PASS')
 assert.equal(properties.AVAILABILITY_SEASON,'2026/2027')
 assert(logs.some(s=>s==='AV_PILOT_MATCH matched=1 unmatched=1 ambiguous=0'))
 rows=[];assert.throws(()=>sandbox.testPlayerAvailabilityPilot(),/read-back/)
 sandbox.syncPlayerAvailability=()=>({skipped:'hourly-limit'})
 assert.equal(sandbox.testPlayerAvailabilityPilot().status,'WAIT')
 properties.AVAILABILITY_SEASON='2025/2026';assert.throws(()=>sandbox.testPlayerAvailabilityPilot(),/bestaande instelling/)
 assert.equal(typeof sandbox.installHourlyPlayerAvailability,'undefined')
})
