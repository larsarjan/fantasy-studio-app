import { randomBytes,randomUUID } from 'node:crypto'
import { mkdirSync,writeFileSync,existsSync } from 'node:fs'
import { hashSync } from 'bcryptjs'
mkdirSync('test-results',{recursive:true})
if(existsSync('test-results/staging-accounts.json')) throw new Error('Existing test credentials retained; reuse instead of replacing them.')
const accounts=['a','b','admin','editor'].map(role=>({role,id:randomUUID(),email:`studio-${role}-${randomBytes(4).toString('hex')}@example.invalid`,password:randomBytes(30).toString('base64url')}))
writeFileSync('test-results/staging-accounts.json',JSON.stringify(accounts),{mode:0o600})
const sql=accounts.map(a=>`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values('00000000-0000-0000-0000-000000000000','${a.id}','authenticated','authenticated','${a.email}','${hashSync(a.password,10)}',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');\ninsert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${a.id}','${a.id}','{"sub":"${a.id}","email":"${a.email}"}','email',now(),now(),now());\n${['admin','editor'].includes(a.role)?`update public.profiles set role='${a.role}' where id='${a.id}';`:''}`).join('\n')
writeFileSync('test-results/staging-bootstrap.sql',sql,{mode:0o600})
console.log('Four staging test accounts prepared; random credentials and hashes are only in ignored test-results/.')
