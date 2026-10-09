import test from 'node:test'
import assert from 'node:assert/strict'
import { mountTurnstile } from './turnstile.js'
test('CAPTCHA tokens expire, reset after use and never survive widget destruction',async()=>{
 let options,resets=0,removed=0;const states=[]
 const widget=mountTurnstile({}, {sitekey:'public-key',onChange:s=>states.push(s),load:async()=>({render:(c,o)=>{options=o;return 1},reset:()=>resets++,remove:()=>removed++})})
 await new Promise(r=>setTimeout(r,0));assert.equal(widget.token(),'')
 options.callback('verified');assert.equal(widget.token(),'verified')
 options['expired-callback']();assert.equal(widget.token(),'')
 options.callback('second');widget.reset();assert.equal(widget.token(),'');assert.equal(resets,1)
 options['error-callback']();assert.match(states.at(-1).message,/mislukt/)
 widget.destroy();options.callback('late');assert.equal(widget.token(),'');assert.equal(removed,1)
})
test('missing key and blocked script fail closed with a Dutch message',async()=>{
 for(const sitekey of ['', 'public-key']){let state;const widget=mountTurnstile({}, {sitekey,onChange:s=>state=s,load:async()=>{throw Error('blocked')}});await new Promise(r=>setTimeout(r,0));assert.equal(widget.token(),'');assert.match(state.message,/niet ingesteld|niet bereikbaar/);widget.destroy()}
})
