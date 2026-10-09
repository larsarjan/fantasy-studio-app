import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { renderPlayerAvatar, setPlayerPhotoRecords } from './playerPhotos.js'
import { initializePlayerPhotos } from './playerPhotoRuntime.js'

test('visibility gates requests; broken sources fall back once across rerenders and preserve dimensions', async () => {
 const dom=new JSDOM('<!doctype html><main></main>')
 globalThis.document=dom.window.document;globalThis.MutationObserver=dom.window.MutationObserver
 let observeCallback;const observed=new Set(),requests=[]
 globalThis.IntersectionObserver=class {constructor(cb){observeCallback=cb}observe(n){observed.add(n)}unobserve(n){observed.delete(n)}}
 globalThis.Image=class {set src(url){requests.push(url);queueMicrotask(()=>{if(url.includes('broken'))this.onerror?.();else{this.naturalWidth=96;this.onload?.()}})}removeAttribute(){}}
 setPlayerPhotoRecords([{player_key:'studio:2026/2027:20260001',source_enabled:true,source_status:'approved',source_url:'https://cdn.example.com/broken.webp',override_url:'https://cdn.example.com/override.webp'}])
 initializePlayerPhotos()
 const main=document.querySelector('main'),markup=renderPlayerAvatar({id:'20260001',name:'Test Speler'},{size:40})
 main.innerHTML=markup+markup
 await new Promise(r=>setTimeout(r,0));assert.equal(requests.length,0)
 observeCallback([...observed].map(target=>({target,isIntersecting:true})))
 await new Promise(r=>setTimeout(r,0))
 assert.equal(requests.filter(url=>url.includes('broken')).length,1)
 assert.equal(requests.filter(url=>url.includes('override')).length,1)
 assert.equal(main.querySelectorAll('img').length,2)
 assert.equal(main.querySelector('img').getAttribute('width'),'40')
 main.innerHTML=markup
 await new Promise(r=>setTimeout(r,0));observeCallback([...observed].map(target=>({target,isIntersecting:true})))
 await new Promise(r=>setTimeout(r,0));assert.equal(requests.filter(url=>url.includes('broken')).length,1)
 // Failure of the mounted image advances to the valid local candidate.
 const img=main.querySelector('img');img.onerror()
 await new Promise(r=>setTimeout(r,0));assert.match(main.querySelector('img').src,/-thumbnail.webp$/)
 main.innerHTML=renderPlayerAvatar({id:'missing',name:'Fallback Speler'})
 await new Promise(r=>setTimeout(r,0));observeCallback([...observed].map(target=>({target,isIntersecting:true})))
 await new Promise(r=>setTimeout(r,0));assert.equal(main.querySelectorAll('img').length,0)
 assert.equal(main.firstElementChild.dataset.initials,'FS');assert.equal(main.firstElementChild.dataset.photoSource,'initials')
 setPlayerPhotoRecords([]);dom.window.close()
})
