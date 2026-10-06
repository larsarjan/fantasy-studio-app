import { execFileSync } from 'node:child_process'
const [session,id]=process.argv.slice(2)
let raw
try { raw=execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session',session,'--json','network','request',id],{encoding:'utf8',timeout:30000,maxBuffer:128*1024*1024}) }
catch { console.error('Request inspection failed; headers and bodies omitted.'); process.exit(1) }
// Never emit request headers/body: auth requests contain passwords and tokens.
const data=JSON.parse(raw)
let body; try { body=JSON.parse(data.data?.responseBody ?? '{}') } catch { body={} }
console.log(JSON.stringify({status:data.data?.status,code:body.code,message:body.message,requestBytes:Buffer.byteLength(data.data?.postData??'')},null,2))
