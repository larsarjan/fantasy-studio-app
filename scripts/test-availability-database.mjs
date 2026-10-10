import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text);create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;`)
for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))
const member='00000000-0000-4000-8000-000000000001',admin='00000000-0000-4000-8000-000000000002',superAdmin='00000000-0000-4000-8000-000000000003'
await db.exec(`insert into auth.users values('${member}'),('${admin}'),('${superAdmin}');insert into user_roles(user_id,role_key) values('${admin}','admin'),('${superAdmin}','super_admin');
insert into reference_imports(id,counts) values('00000000-0000-4000-8000-000000000010','{}');
insert into players(id,import_id,payload) values('1','00000000-0000-4000-8000-000000000010','{"id":"p1","season":"2026/2027","name":"Zelfde naam","club":"Ajax"}'),('2','00000000-0000-4000-8000-000000000010','{"id":"p2","season":"2026/2027","name":"Zelfde naam","club":"PSV"}');`)
const as=async(id,role='authenticated')=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id||''}',false);set role ${role}`)
const checks=[],ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
const denied=async(fn,label)=>{await assert.rejects(fn);ok(true,label)}
const status={player_id:'p1',season:'2026/2027',status_type:'injury',availability_percentage:0,reason:'Test blessure',start_date:'2026-01-01',expected_return_date:'2026-12-01',notes:'Alleen redactie',source_name:'FVT-redactie',is_manual_override:true}
const save=async(data,revision)=>(await db.query('select public.availability_save($1,$2) as result',[JSON.stringify(data),revision])).rows[0].result
const list=async(admin_mode=false)=>(await db.query('select public.availability_list($1) as result',[admin_mode])).rows[0].result
const history=async(admin_mode=false)=>(await db.query('select public.availability_history($1,$2,$3) as result',['p1',status.season,admin_mode])).rows[0].result
await as(member);await denied(()=>save(status,0),'Member cannot write through RPC')
await denied(()=>db.exec("insert into private.player_availability(player_id,season,status_type,availability_percentage) values('p1','2026/2027','injury',0)"),'Direct table write blocked')
await denied(()=>db.exec('select * from private.availability_history'),'Private history inaccessible directly')
await denied(()=>list(true),'Member cannot request admin notes')
await as(admin);await denied(()=>save(status,0),'Admin without availability permission denied')
await as(superAdmin);let current=await save(status,0);ok(current.availability_percentage===0,'Super-admin creates OUT injury')
ok((await list()).length===1,'One effective status per player')
await denied(()=>save({...status,reason:'Stale'},0),'Stale revision cannot overwrite status')
for(const pct of [25,50,75]){current=await save({...status,availability_percentage:pct},current.revision);ok(current.availability_percentage===pct,`${pct}% persisted independently of injury type`)}
await as(member);const visible=await list();ok(!('notes' in visible[0])&&!('updated_by' in visible[0]),'Member reads safe public status only')
ok(!(await history()).some(h=>'notes' in h.new_status),'Internal notes hidden from member history')
await denied(()=>db.query('select public.availability_propose($1,$2,$3)',['club','1',JSON.stringify(status)]),'Member cannot impersonate a source connector')
await as(superAdmin);ok((await history(true))[0].new_status.notes==='Alleen redactie','Authorized admin retains full history')
for(const patch of [{availability_percentage:33},{expected_return_date:'2025-12-31'},{source_url:'javascript:alert(1)'},{source_url:'https://x@example.com'},{player_id:'1'},{player_id:'missing'}])await denied(()=>save({...status,...patch},current.revision),'Invalid input rejected: '+Object.keys(patch)[0]+':'+Object.values(patch)[0])
await db.query('select public.availability_sources($1)',[JSON.stringify({key:'club',name:'Officiële club',url:'https://example.com',approved:true})])
await as('', 'service_role')
const proposalData={...status,availability_percentage:50,is_manual_override:false,reason:'Bronvoorstel'}
const propose=async(external,data=proposalData)=>(await db.query('select public.availability_propose($1,$2,$3) as result',['club',external,JSON.stringify(data)])).rows[0].result
const proposal=await propose('update-1');ok(proposal===await propose('update-1'),'Source update deduplicated by immutable external ID')
await as(superAdmin);ok((await list(true))[0].is_manual_override&&(await list(true))[0].availability_percentage===75,'Automatic proposal never overwrites manual override')
const resolve=(id,decision,revision)=>db.query('select public.availability_proposals($1,$2,$3)',[id,decision,revision])
await denied(()=>resolve(proposal,'accept',0),'Stale conflict decision rejected')
await resolve(proposal,'keep',current.revision);ok((await list(true))[0].availability_percentage===75,'Keep override leaves status intact')
await as('','service_role');const second=await propose('update-2')
await as(superAdmin);await resolve(second,'accept',current.revision);current=(await list(true))[0]
ok(current.availability_percentage===50&&!current.is_manual_override&&current.source_mode==='automatic','Explicit acceptance adopts source and releases override')
ok(current.notes==='Alleen redactie','Source acceptance preserves internal notes')
await denied(()=>resolve(second,'accept',current.revision),'Duplicate source acceptance rejected')
current=await save({...status,status_type:'suspension',availability_percentage:0},current.revision);ok(current.status_type==='suspension','Suspension recorded distinctly')
current=await save({...status,status_type:'available',availability_percentage:100},current.revision);ok(Boolean(current.returned_date),'Return closes active warning and records return date')
ok((await history()).length===7,'Complete history retained after return')
const secondPlayer=await save({...status,player_id:'p2'},0);ok(secondPlayer.player_id==='p2'&&(await list()).length===2,'Duplicate names remain independent through IDs')
await as('', 'postgres');await db.exec("update players set payload=jsonb_set(payload,'{club}','\"FC Utrecht\"') where payload->>'id'='p1'")
await as(superAdmin);ok((await list()).find(r=>r.player_id==='p1').returned_date===current.returned_date,'Transfer does not change stable availability identity')
await as('', 'postgres');await db.exec("insert into players(id,import_id,payload) select '3',import_id,payload from players where id='1'")
await as(superAdmin);await denied(()=>save(status,current.revision),'Ambiguous duplicate player mapping blocked')
await as('', 'postgres');await db.exec("delete from players where id='3'")
await as(superAdmin);await db.exec(`select public.admin_manage_status('${member}','blocked','Test blokkering')`)
await as(member);await denied(()=>list(),'Blocked member cannot read availability')
await as('', 'anon');await denied(()=>list(),'Unauthenticated direct API denied')
await as('', 'postgres');ok((await db.query("select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('player_availability','availability_history','availability_sources','availability_proposals') and c.relrowsecurity")).rows[0].count===4,'RLS enabled on all four tables')
ok((await db.query("select count(*)::int as count from admin_audit_log where action like 'availability.%'")).rows[0].count>=10,'Existing Admin auditlog records status and source decisions')
await db.close();mkdirSync('test-results/availability',{recursive:true});writeFileSync('test-results/availability/database.json',JSON.stringify({checks},null,2));console.log(`${checks.length} availability database checks passed`)
