import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const run=(...args)=>execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','article-entities',...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']});
const ev=code=>{const r=JSON.parse(run('eval',`JSON.stringify(${code})`));return typeof r==='string'?JSON.parse(r):r};
run('open','http://127.0.0.1:5197/__article-document');run('wait','--fn','!!window.documentTest');
assert.deepEqual(ev('window.documentTest.editor.blocks()'),ev('window.documentTest.initial'));console.log('PASS opening preserves complete structured content');
ev(`(()=>{const fields=document.querySelectorAll('#editor [data-document-text]'),f=fields[fields.length-1];f.focus();const r=document.createRange();r.selectNodeContents(f);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);return true})()`);
const before=ev('window.documentTest.editor.blocks().blocks.length');
run('press','Enter');
assert.equal(ev('window.documentTest.editor.blocks().blocks.length'),before+1);console.log('PASS Enter creates structured paragraph');
run('press','Shift+Enter');assert.equal(ev('window.documentTest.editor.blocks().blocks.length'),before+1);console.log('PASS Shift Enter preserves paragraph');
run('open','http://127.0.0.1:5197/__article-document');run('wait','--fn','!!window.documentTest');
for(const w of [390,820,1366,1920]){run('set','viewport',String(w),'1000');assert(ev('document.documentElement.scrollWidth<=innerWidth+1'),`overflow at ${w}`);console.log('PASS document no overflow',w)}
