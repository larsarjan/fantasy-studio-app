import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM} from 'jsdom'
import {registrationOpen} from '../platform/registration.js'

test('Registration closure preserves login, recovery, reset, session and logout',async()=>{
 assert.equal(registrationOpen,false)
 const dom=new JSDOM('<body></body>',{url:'https://fantasyvoetbaltalk.nl/admin/nieuws'}),names=['document','location','FormData','history','__registrationTest'],before=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]))
 const calls=[],redirects=[];let listener,session={user:{id:'existing-user'}},captchaMounts=0
 const result=method=>async(...args)=>{calls.push({method,args});return {error:null}}
 try{
  for(const name of ['document','FormData','history'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]})
  globalThis.location={pathname:'/admin/nieuws',origin:'https://fantasyvoetbaltalk.nl',search:'',hash:'',replace:url=>redirects.push(url)}
  globalThis.__registrationTest={registrationOpen,renderPublic:html=>document.body.innerHTML=html,icon:()=>'',loginDestination:()=>'/admin/nieuws',appUrl:path=>'https://fantasyvoetbaltalk.nl/'+(path||''),friendlyError:()=>'',mountTurnstile:()=>{captchaMounts++;return {destroy(){}}},supabase:{auth:{signUp:result('signup'),signInWithPassword:result('login'),resetPasswordForEmail:result('forgot'),updateUser:result('reset'),getSession:async()=>({data:{session}}),onAuthStateChange:callback=>listener=callback}}}
  let source=readFileSync(new URL('../platform/auth.js',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replaceAll('import.meta.env',JSON.stringify({BASE_URL:'/',VITE_AUTH_CAPTCHA_ENABLED:'false'}))
  source='const {registrationOpen,renderPublic,icon,loginDestination,appUrl,friendlyError,mountTurnstile,supabase}=globalThis.__registrationTest;\n'+source
  const {renderAuth,requireSession}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
  renderAuth('signup');assert.equal(document.querySelector('[data-auth=signup]'),null);assert.equal(document.querySelector('#auth-confirmation'),null);assert.match(document.body.textContent,/Fantasy Studio is in ontwikkeling/);assert.match(document.querySelector('[type=submit]').textContent,/Inloggen/)
  const submit=async()=>{const form=document.querySelector('form');await form.onsubmit({preventDefault(){},currentTarget:form})}
  document.querySelector('#auth-email').value='existing@example.invalid';document.querySelector('#auth-password').value='ExistingPassword';await submit();assert.equal(calls.at(-1).method,'login');assert.equal(redirects.at(-1),'https://fantasyvoetbaltalk.nl/admin/nieuws');assert.equal(captchaMounts,0)
  document.querySelector('[data-auth=forgot]').click();assert.equal(document.querySelector('[type=password]'),null);document.querySelector('#auth-email').value='existing@example.invalid';await submit();assert.equal(calls.at(-1).method,'forgot');assert.equal(calls.at(-1).args[1].redirectTo,'https://fantasyvoetbaltalk.nl/auth/callback?flow=recovery')
  assert.equal(await requireSession(),session);listener('PASSWORD_RECOVERY');assert.equal(document.querySelector('#auth-email'),null);for(const el of document.querySelectorAll('[type=password]'))el.value='NewLocalTestPassword';await submit();assert.equal(calls.at(-1).method,'reset')
  listener('SIGNED_OUT');assert.equal(redirects.at(-1),'https://fantasyvoetbaltalk.nl/');assert(!calls.some(c=>c.method==='signup'))
  session=null;await requireSession();assert(document.querySelector('#registration-title'));assert(document.querySelector('#auth-email'))
 }finally{dom.window.close();for(const n of names){if(before[n])Object.defineProperty(globalThis,n,before[n]);else delete globalThis[n]}}
})
