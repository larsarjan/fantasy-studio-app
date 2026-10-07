import {createClient} from '@supabase/supabase-js';
import {loadEnv} from 'vite';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const env=loadEnv('production',process.cwd(),'');
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rzunbquzffdivlpuomjc.supabase.co');
const db=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:true}});
// Use an explicitly supplied admin account or the project's existing controlled acceptance admin.
const account=process.env.PROMINENT_ADMIN_EMAIL?{email:process.env.PROMINENT_ADMIN_EMAIL,password:process.env.PROMINENT_ADMIN_PASSWORD}:JSON.parse(readFileSync('test-results/staging-accounts.json','utf8')).find(a=>a.role==='admin');
assert(account?.email && account.password,'An authorized admin account is required');
const login=await db.auth.signInWithPassword(account);if(login.error)throw login.error;
const role=await db.from('profiles').select('role').single();assert.equal(role.data?.role,'admin');
const report=[];
try{
 for(let batch=0;batch<100;batch++){
  const {data,error}=await db.functions.invoke('prominent-sync',{body:{}});if(error)throw error;
  report.push(data);console.log(JSON.stringify({batch:batch+1,...data}));
  writeFileSync('test-results/prominent-backfill.json',JSON.stringify(report,null,2));
  if(data.status==='complete')break;
  if(data.status!=='busy' && data.pending===0)throw Error('Source sync warnings remain');
  if(data.errors>0 && data.processed===0)throw Error('No progress: inspect failed jobs before retrying');
  await new Promise(r=>setTimeout(r,data.status==='busy'?10000:1000));
 }
}finally{await db.auth.signOut({scope:'local'});}
