import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const session=process.env.FVT_EDITOR_SESSION||'fvt-editor',origin=process.env.FVT_ORIGIN||'http://127.0.0.1:5180',fixture=JSON.parse(readFileSync('test-results/fvt-fixtures.json','utf8'))
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,...args],{encoding:'utf8',timeout:65000})
const evaluate=code=>{const v=JSON.parse(run('eval',`JSON.stringify(${code})`).trim());return typeof v==='string'?JSON.parse(v):v}
const checks=[];const ok=(v,label)=>{assert(v,label);checks.push(label);console.log(label)}
const click=s=>run('eval',`document.querySelector(${JSON.stringify(s)}).click()`)
run('open',origin+'/nieuws/beheer?edit='+fixture.draftId);run('wait','#news-editor');
run('fill','[name=fvt_title]','[Privéconcept] FVT UI-acceptatie');run('fill','[name=intro]','Een privéconcept om de redactiebediening te controleren. Niet voor publicatie.');run('fill','[name=fvt_body]','Dit concept is bijgewerkt via de redactie-interface. <script>alert(1)</script> wordt als gewone tekst weergegeven.');click('#news-editor button[type=submit]');run('wait','--fn','document.querySelector("#news-editor [role=status]")?.textContent !== "Bezig…"');run('open',origin+'/nieuws/beheer?edit='+fixture.draftId);run('wait','#news-editor');ok(evaluate('document.querySelector("[name=fvt_title]").value')==='[Privéconcept] FVT UI-acceptatie','Editorial changes persist after reload');ok(evaluate('document.querySelector("[name=status]").value')==='draft','Article remains a private draft');
for(const [width,height] of [[1366,900],[820,1180],[390,844]]){run('set','viewport',String(width),String(height));ok(!evaluate('document.documentElement.scrollWidth>innerWidth+1'),`Editorial form responsive ${width}`)}
run('open',origin+'/nieuws/'+fixture.draftSlug);run('wait','.fvt-article');ok(evaluate('document.querySelector(".fvt-article").textContent').includes('alleen redactie'),'Editor can preview draft');ok(evaluate('document.querySelector(".fvt-prose script")===null'),'Article body is XSS-safe');ok(evaluate('document.querySelector(".fvt-prose").textContent').includes('<script>'),'Article text is preserved without executing markup');
for(const [width,height] of [[1920,1080],[1366,900],[820,1180],[390,844]]){run('set','viewport',String(width),String(height));ok(!evaluate('document.documentElement.scrollWidth>innerWidth+1'),`Article responsive ${width}`);run('screenshot',`test-results/fvt-article-${width}.png`)}
writeFileSync('test-results/fvt-editor-ui.json',JSON.stringify({origin,checks},null,2));console.log(`${checks.length} editorial UI checks passed`)
