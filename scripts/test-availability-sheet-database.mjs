import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {collectAvailabilitySheet} from '../server/availabilitySheet.js'
import {createAvailabilitySyncHandler} from '../server/availabilitySyncHandler.js'
import {setAvailabilityRecords,availabilityPolicy} from '../src/services/availability.js'
import {initializeWorkerAvailability} from '../src/workers/managerOptimizer.worker.js'
import {classifyPrimaryAction} from '../src/services/analysisEngine.js'
const db=new PGlite()
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema private;
 create table public.players(season text,payload jsonb);
 create table private.player_availability(player_id text,season text,updated_at timestamptz,notes text,updated_by uuid,status_type text,availability_percentage int);
 create function private.active_member() returns boolean language sql as $$select current_setting('test.active',true)='true'$$;
 create function private.has_permission(text) returns boolean language sql as $$select false$$;
 grant usage on schema private to authenticated;
 insert into public.players values ('2026/2027','{"id":"p1","club":"Ajax"}'),('2026/2027','{"id":"p2","club":"PSV"}');`)
 await db.exec(readFileSync('supabase/migrations/20261024163635_availability_sheet_current.sql','utf8'))
 await db.exec(readFileSync('supabase/migrations/20261025003741_availability_sheet_runtime_activation.sql','utf8'))
 const row={player_id:'p1',season:'2026/2027',club:'Ajax',status_type:'injury',availability_percentage:0,reason:'enkel',source_url:'https://www.blessuresenschorsingen.nl/test-1',observed_at:new Date().toISOString(),source_hash:'a'.repeat(64),match_method:'alias'}
 const sync=async rows=>(await db.query('select public.availability_sheet_sync($1) n',[JSON.stringify(rows)])).rows[0].n
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>sync([row]));await assert.rejects(()=>db.query('select * from private.player_availability_current'));await db.exec('reset role')}
 await db.exec('set role service_role');assert.equal(await sync([row]),1);assert.equal(await sync([row]),0)
 await assert.rejects(()=>sync([]));await assert.rejects(()=>sync([row,row]));await assert.rejects(()=>sync([{...row,club:'PSV'}]));await assert.rejects(()=>sync([{...row,player_id:'missing'}]))
 await assert.rejects(()=>sync([{...row,source_url:'https://evil.test/x'}]));await assert.rejects(()=>sync([{...row,availability_percentage:42}]))
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.player_availability_current')).rows[0].n,1)
 await db.exec("select set_config('test.active','true',false)")
 let list=(await db.query('select private.availability_list(false) r')).rows[0].r;assert.equal(list[0].availability_percentage,0)
 await db.exec("insert into private.player_availability values('p1','2026/2027',now(),'secret',null,'available',100)")
 list=(await db.query('select private.availability_list(false) r')).rows[0].r;assert.equal(list.length,1);assert.equal(list[0].availability_percentage,100);assert.equal(list[0].notes,undefined)
 // Isolated complete data path: actual parser/planner -> Sheet-shaped rows -> actual
 // HTTP handler/collector -> PostgreSQL RPC -> effective records -> advice/worker.
 // The Sheet boundary is in memory here; this does not claim a live Google pilot.
 const context=vm.createContext({})
 vm.runInContext(readFileSync('docs/apps-script/PlayerAvailabilityCore.gs','utf8'),context)
 const clubs=Array.from({length:18},(_,i)=>`Club ${i}`)
 const roster=Array.from({length:36},(_,i)=>({id:`chain${i}`,name:`Speler ${i}`,club:clubs[Math.floor(i/2)],season:'2026/2027',cautionScore:10}))
 const card=i=>`<a href="/speler-${i}" class="group"><strong class="text-lg">Speler ${i}</strong><img src="/staticimages/icons/blessure.png" alt="Blessure"><span class="rounded-full px-2 py-0.5 text-tiny">OUT</span><span class="hidden text-sm md:block"> - enkel </span><span>Verw. terugkeer :</span><strong>Onbekend</strong></a>`
 const html=`<html><div id="club-list">${clubs.map((club,i)=>`<section><h2>${club}</h2>${card(2*i)}${card(2*i+1)}</section>`).join('')}</div></html>`
 const hash=s=>createHash('sha256').update(s).digest('hex')
 for(const p of roster)await db.query('insert into public.players values($1,$2)',[p.season,JSON.stringify(p)])
 let sheet=[],clock=Date.now()-120000, sheetFailure=false, backendFailure=false
 const importSource=(sourceHtml,players=roster)=>{
  const parsed=context.avParse(sourceHtml,clubs)
  const plan=context.avPlan(parsed,sheet,players,'2026/2027',new Date(clock).toISOString(),hash)
  sheet=JSON.parse(JSON.stringify(plan.rows));return plan
 }
 const handler=createAvailabilitySyncHandler({
  env:{AVAILABILITY_SHEET_ENABLED:'true',VITE_SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'local-test-only'},
  collect:()=>collectAvailabilitySheet({fetchRows:async()=>{if(sheetFailure)throw Error('Sheet unavailable');return sheet.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])))}}),
  clientFactory:()=>({rpc:async(name,args)=>{
   if(name==='reference_check_scheduler')return {data:args.supplied_token==='local-test-only'}
   if(backendFailure)return {error:{message:'simulated unavailable'}}
   try{await db.exec('set role service_role');return {data:await sync(args.items)}}catch(error){return {error}}finally{await db.exec('reset role')}
  }}),
 })
 const run=()=>handler(new Request('https://isolated.invalid/api/availability-sync',{method:'POST',headers:{'x-sync-token':'local-test-only'},body:'{}'}))
 const current=async()=>(await db.query('select private.availability_list(false) r')).rows[0].r
 importSource(html);let response=await run();assert.equal(response.status,200);assert.equal((await response.json()).written,36)
 const baseline=await current();importSource(html);assert.equal((await (await run()).json()).written,0)
 clock+=1000;importSource(html.replace('>OUT<','>50%<'))
 assert.equal(sheet.length,37);assert.equal((await run()).status,200)
 let effective=await current();setAvailabilityRecords(effective)
 assert.equal(availabilityPolicy(roster[0]).factor,.4);assert.equal(classifyPrimaryAction(roster[0]),'hold')
 initializeWorkerAvailability(structuredClone({records:effective,ready:true}));assert.equal(availabilityPolicy(roster[0]).factor,.4)
 const beforeFailure=JSON.stringify(effective)
 for(const bad of ['',html.slice(0,-7),html.replace('<h2>Club 0</h2>','<h2>Missing</h2>')])assert.throws(()=>importSource(bad))
 assert.equal(JSON.stringify(await current()),beforeFailure)
 sheetFailure=true;assert.equal((await run()).status,503);sheetFailure=false
 backendFailure=true;assert.equal((await run()).status,503);backendFailure=false
 assert.equal(JSON.stringify(await current()),beforeFailure)
 // A missing player remains OUT; no automatic healthy reset.
 clock+=1000;importSource(html.replace(card(1),''));assert.equal((await run()).status,200)
 assert.equal((await current()).find(r=>r.player_id==='chain1').availability_percentage,0)
 // Unmatched and ambiguous observations do not publish guessed IDs.
 clock+=1000;const mapped=importSource(html,roster.filter(p=>p.id!=='chain2').concat({...roster[3],id:'duplicate'}))
 assert.equal(mapped.counts.unmatched,1);assert.equal(mapped.counts.ambiguous,1)
 assert.equal((await run()).status,200)
 assert.equal((await current()).some(r=>r.player_id==='duplicate'),false)
 await db.exec("insert into private.player_availability values('chain0','2026/2027',now(),'private',null,'available',100)")
 clock+=1000;importSource(html);assert.equal((await run()).status,200)
 effective=await current();setAvailabilityRecords(effective);assert.equal(availabilityPolicy(roster[0]).factor,1)
 initializeWorkerAvailability(structuredClone({records:effective,ready:true}));assert.equal(availabilityPolicy(roster[0]).factor,1)
 assert.equal((await (await run()).json()).written,0)
 setAvailabilityRecords([])
 assert.equal(baseline.filter(r=>r.player_id.startsWith('chain')).length,36)
 console.log('Isolated chain passed: first/repeat/change, malformed/empty/partial, disappearance, unmatched/ambiguous, Sheet/backend failure, recovery, manual priority, advice and worker')
 await db.exec("select set_config('test.active','false',false)");await assert.rejects(()=>db.query('select private.availability_list(false)'))
 console.log('Availability current: service-only writes, RLS, identity, atomic validation, idempotency, manual precedence and privacy passed')
}finally{await db.close()}
