// Prepare temporary real Supabase acceptance accounts; never print passwords.
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {hashSync} from 'bcryptjs'
mkdirSync('test-results/admin-live',{recursive:true})
if(existsSync('test-results/admin-live/accounts.json'))throw Error('Reuse or clean existing acceptance accounts before preparing again.')
const accounts=['member','moderator','editor','publisher','admin','super_admin'].map(role=>({role,id:randomUUID(),email:`fvt-acceptance-${role}-${randomBytes(6).toString('hex')}@example.invalid`,password:randomBytes(30).toString('base64url')}))
writeFileSync('test-results/admin-live/accounts.json',JSON.stringify(accounts),{mode:0o600})
const sql=accounts.map(a=>`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values('00000000-0000-0000-0000-000000000000','${a.id}','authenticated','authenticated','${a.email}','${hashSync(a.password,10)}',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${a.id}','${a.id}','{"sub":"${a.id}","email":"${a.email}"}','email',now(),now(),now());
${a.role==='member'?'':`insert into public.user_roles(user_id,role_key) values('${a.id}','${a.role}');`}`).join('\n')
writeFileSync('test-results/admin-live/bootstrap.sql','begin;\n'+sql+'\ncommit;\n',{mode:0o600})
const ids=accounts.map(a=>`'${a.id}'`).join(',')
writeFileSync('test-results/admin-live/cleanup.sql',`begin;
delete from public.news_articles where author_id in (${ids});
delete from public.forum_topics where user_id in (${ids});
delete from public.forum_posts where user_id in (${ids});
delete from auth.users where id in (${ids});
commit;
select count(*) as remaining_acceptance_accounts from auth.users where id in (${ids});`,{mode:0o600})
console.log('Six temporary acceptance accounts prepared in ignored test-results/admin-live; credentials not printed.')
