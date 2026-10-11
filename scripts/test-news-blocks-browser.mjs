// Run against the local Vite server. No production writes; real editor/preview modules.
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {resolve} from 'node:path'
const folder='test-results/news-blocks';mkdirSync(folder,{recursive:true});copyFileSync('scripts/fixtures/news-block-editor.html',folder+'/editor.html')
const bin='node_modules/agent-browser/bin/agent-browser-win32-x64.exe',session='news-blocks',checks=[]
const run=(...args)=>execFileSync(bin,['--session',session,...args],{encoding:'utf8',timeout:60000})
const ev=code=>{const result=JSON.parse(run('eval',`JSON.stringify(${code})`));return typeof result==='string'?JSON.parse(result):result}
const ok=(value,label)=>{assert(value,label);checks.push(label);console.log('PASS',label)}
run('open',(process.env.CMS_ORIGIN||'http://127.0.0.1:5180')+'/test-results/news-blocks/editor.html');run('wait','--fn','window.ready===true')
ok(ev('ed.blocks().blocks.length')===11,'Acceptance sequence: five paragraphs, four-image carousel, two images, heading, quote, list')
ok(ev('ed.blocks().blocks[2].images.length')===4,'Exactly four carousel images')
ev('(()=>{document.querySelectorAll("[data-block]")[1].querySelector("[data-action=up]").click();return true})()');ok(ev('ed.blocks().blocks[0].text.includes("2")'),'Block reorder up')
ev('(()=>{document.querySelector("[data-block] [data-action=down]").click();return true})()');ok(ev('ed.blocks().blocks[0].text.includes("1")'),'Block reorder down')
ev('(()=>{document.querySelector("[data-image] [data-action=image-down]").click();return true})()');ok(ev('ed.blocks().blocks[2].images[1].caption')==='Voorbeeld 1','Image reorder')
ev('(()=>{document.querySelector("[data-block] [data-action=before]").click();return true})()');ok(ev('ed.blocks().blocks[0].text')==='','Insert above')
ev('(()=>{window.confirm=()=>true;document.querySelector("[data-block] [data-action=delete]").click();return true})()');ok(ev('ed.blocks().blocks.length')===11,'Delete block')
ev('(()=>{document.querySelector("[data-block] [data-action=after]").click();return true})()');ok(ev('ed.blocks().blocks[1].text')==='','Insert below')
ev('(()=>{document.querySelectorAll("[data-block]")[1].querySelector("[data-action=delete]").click();return true})()')
for(const type of ['paragraph','heading','image','imageCarousel','quote','list']){ev(`(()=>{document.querySelector('[data-add="${type}"]').click();return true})()`);ok(ev('ed.blocks().blocks.at(-1).type')===type,'Add '+type);ev('(()=>{document.querySelectorAll("[data-block]")[11].querySelector("[data-action=delete]").click();return true})()')}
ev('(()=>{const el=document.querySelector("[data-image] [data-key=alt]");el.value="";el.dispatchEvent(new Event("input",{bubbles:true}));return true})()');ok(ev('!document.querySelector("[data-image] .block-warning").hidden'),'Live alt warning')
ev('(()=>{document.querySelector("[data-image] [data-key=decorative]").click();return true})()');ok(ev('document.querySelector("[data-image] .block-warning").hidden'),'Explicit decorative option')
await sharp('public/club-logos/fc-utrecht.png').resize(3000,2000,{fit:'contain'}).png().toFile(folder+'/large.png')
writeFileSync(folder+'/invalid.png','not an image')
run('upload','[data-block]:nth-child(5) [data-upload]',resolve(folder+'/large.png'));run('wait','--fn','!ed.isBusy()')
ok(ev('ed.blocks().blocks[4].width')===2560,'Large image decoded, re-encoded and resized to 2560 px')
ok(ev('uploads[0].options.upsert===false && uploads[0].options.contentType==="image/png"'),'Immutable UUID upload uses validated MIME')
const original=ev('ed.blocks().blocks[4].url');run('upload','[data-block]:nth-child(5) [data-upload]',resolve(folder+'/invalid.png'));run('wait','--fn','!ed.isBusy()');ok(ev('document.querySelector(".block-editor-status").textContent.includes("geen geldige afbeelding")'),'Invalid binary image rejected');ok(ev('ed.blocks().blocks[4].url')===original,'Failed replacement retains original image')
ev('(window.failUpload=true)');run('upload','[data-block]:nth-child(5) [data-upload]',resolve(folder+'/large.png'));run('wait','--fn','!ed.isBusy()');ok(ev('document.querySelector(".block-editor-status").textContent.includes("upload mislukt")'),'Upload service error remains visible');ev('(window.failUpload=false)')
run('upload','[data-block]:nth-child(3) > label [data-upload]',resolve('public/club-logos/psv.png'),resolve('public/club-logos/ajax.png'));run('wait','--fn','!ed.isBusy()');ok(ev('ed.blocks().blocks[2].images.length')===6,'Multiple carousel images upload in selected order')
ev('(()=>{const cards=document.querySelectorAll("[data-image]");cards[5].querySelector("[data-action=image-delete]").click();document.querySelectorAll("[data-image]")[4].querySelector("[data-action=image-delete]").click();return true})()');ok(ev('ed.blocks().blocks[2].images.length')===4,'Individual carousel image deletion restores four-image acceptance')
for(const [format,expected] of [['bold','**'],['italic','*'],['link','https://example.com']]){
 ev(`(()=>{const field=document.querySelector('[data-key=text]');field.setSelectionRange(0,4);window.prompt=()=>"https://example.com";document.querySelector('[data-inline=${format}]').click();return true})()`);ok(ev('ed.blocks().blocks[0].text').includes(expected),'Text toolbar '+format)
}
for(const width of [390,820,1366,1920]){
 run('set','viewport',String(width),'1000');ok(!ev('document.documentElement.scrollWidth>innerWidth+1'),'Editor no overflow '+width)
 run('screenshot',`${folder}/editor-${width}.png`)
 ev('(()=>{renderPublicTest();document.querySelector("#preview").click();return true})()')
 ok(ev('document.querySelector("#public-render .article-content").innerHTML===document.querySelector("dialog .article-content").innerHTML'),'Preview/public exact markup parity '+width)
 ok(!ev('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth+1'),'Preview no overflow '+width)
 ev('(()=>{document.querySelector("dialog [data-next]").click();return true})()');ok(ev('!document.querySelectorAll("dialog [data-slide]")[1].hidden'),'Preview carousel next '+width)
 ev('(()=>{document.querySelector("dialog [data-previous]").click();document.querySelectorAll("dialog [data-dot]")[3].click();return true})()');ok(ev('!document.querySelectorAll("dialog [data-slide]")[3].hidden'),'Preview previous/dots '+width)
 ev('(()=>{document.querySelector("dialog [data-article-carousel]").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));return true})()');ok(ev('!document.querySelector("dialog [data-slide]").hidden'),'Preview keyboard '+width)
 run('screenshot',`${folder}/preview-${width}.png`);ev('(()=>{document.querySelector("dialog [data-close]").click();return true})()')
}
for(const width of [390,1366]){
 run('set','viewport',String(width),'1000')
 for(const size of ['small','medium','large','full'])for(const align of ['left','center','right']){
  ev(`(()=>{const card=document.querySelectorAll('[data-block]')[4];for(const [key,value] of [['size','${size}'],['align','${align}']]){const field=card.querySelector('[data-key='+key+']');field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}))}renderPublicTest();return true})()`)
  ok(ev(`(()=>{const el=document.querySelector('#public-render .article-size-${size}.article-align-${align}'),r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.width<=p.width+1&&r.left>=p.left-1&&r.right<=p.right+1})()`),`${size}/${align} fits ${width}`)
 }
}
writeFileSync(folder+'/browser-results.json',JSON.stringify({checks,count:checks.length},null,2));console.log(`${checks.length} browser checks passed.`)
