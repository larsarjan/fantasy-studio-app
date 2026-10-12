import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM} from 'jsdom'
import sharp from 'sharp'
import {CLUB_LOGO_CLUBS,getClubLogo,logoSlug,clubLogoFallback} from './clubIdentity.js'
import {renderClubLogo,installClubLogoFallback} from './clubLogos.js'
test('All 18 clubs have decodable PNG assets and route-independent production paths',async()=>{
 assert.equal(CLUB_LOGO_CLUBS.length,18)
 for(const name of CLUB_LOGO_CLUBS){const path=getClubLogo(name);assert(path.startsWith('/club-logos/'));const meta=await sharp('public'+path).metadata();assert.equal(meta.format,'png');assert(meta.width>0&&meta.height>0);assert.equal(new URL(path,'https://fantasyvoetbaltalk.nl/studio/fixtures').pathname,path)}
})
test('Explicit aliases, dots, accents, whitespace and case share canonical assets',()=>{
 for(const [name,slug] of Object.entries({'N.E.C.':'nec','NEC':'nec','N.E.C. Nijmegen':'nec','AZ Alkmaar':'az','AZ':'az','ADO':'ado-den-haag','ADO Den Haag':'ado-den-haag','SC Cambuur':'cambuur-leeuwarden','Cambuur':'cambuur-leeuwarden','Cambuur Leeuwarden':'cambuur-leeuwarden',' SC   Heerenveen ':'sc-heerenveen','FÇ Utrecht':'fc-utrecht'}))assert.equal(logoSlug(name),slug)
 assert.equal(getClubLogo('Unknown FC'),clubLogoFallback);assert.equal(getClubLogo(null),clubLogoFallback)
})
test('Logo markup is safe, dimensioned, lazy and survives sanitization without inline error handlers',async()=>{
 const dom=new JSDOM('<body></body>'),{default:createPurify}=await import('dompurify'),purify=createPurify(dom.window)
 dom.window.document.body.innerHTML=purify.sanitize(renderClubLogo('FC Utrecht','round-club-logo')+renderClubLogo('N.E.C.','round-club-logo')+renderClubLogo('Unknown <script>'))
 const imgs=dom.window.document.querySelectorAll('img');assert.equal(imgs.length,3);assert.equal(imgs[0].getAttribute('src'),'/club-logos/fc-utrecht.png');assert.equal(imgs[1].getAttribute('src'),'/club-logos/nec.png')
 for(const img of imgs){assert.equal(img.width,24);assert.equal(img.height,24);assert.equal(img.getAttribute('loading'),'lazy');assert(!img.hasAttribute('onerror'));assert(img.hasAttribute('data-club-logo'))}
 installClubLogoFallback(dom.window.document);imgs[0].dispatchEvent(new dom.window.Event('error'));const fallback=dom.window.document.querySelector('span');assert.equal(fallback.getAttribute('aria-label'),'FC Utrecht');assert.equal(fallback.style.width,'24px');assert.equal(dom.window.document.querySelectorAll('img').length,2);dom.window.close()
})
test('All existing logo consumers delegate to one renderer',()=>{
 for(const file of ['fixtures','players','intelligenceUi','captainRadar']){const s=readFileSync(`src/modules/${file}.js`,'utf8');assert(s.includes('../services/clubLogos.js'));assert(!s.includes('./club-logos/'))}
})
