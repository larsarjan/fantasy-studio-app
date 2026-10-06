import {execFileSync} from 'node:child_process'
import {readFileSync,readdirSync,statSync} from 'node:fs'
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)
function walk(dir){return readdirSync(dir).flatMap(n=>{const p=`${dir}/${n}`;return statSync(p).isDirectory()?walk(p):[p]})}
files.push(...walk('dist'))
const issues=[]
for(const file of [...new Set(files)]) {
 if(/(^|\/)\.env(\.|$)/.test(file)&&!file.endsWith('.env.example')){issues.push(file);continue}
 if(!/\.(js|mjs|cjs|json|html|sql|toml|md|txt|gs|yml|yaml|map)$/.test(file))continue
 const text=readFileSync(file,'utf8')
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/i.test(text))issues.push(file)
 for(const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
  try{if(JSON.parse(Buffer.from(match[1],'base64url')).role==='service_role')issues.push(file)}catch{}
 }
}
console.log(JSON.stringify({scanned:new Set(files).size,issues:[...new Set(issues)]}))
if(issues.length)process.exitCode=1
