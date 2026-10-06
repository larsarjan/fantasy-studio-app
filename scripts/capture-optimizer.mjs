import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
try {
 const raw=execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','final','--json','eval','JSON.stringify(window.__acceptanceWorkerInput)'],{encoding:'utf8',timeout:60000,maxBuffer:128*1024*1024})
 const response=JSON.parse(raw)
 const value=response.data?.result
 const data=typeof value==='string'?JSON.parse(value):value
 if(!data?.players?.length) throw new Error('No captured input')
 writeFileSync('test-results/optimizer-input.json',JSON.stringify(data))
 console.log(JSON.stringify({players:data.players.length,bytes:Buffer.byteLength(JSON.stringify(data))}))
}catch{console.error('Optimizer input capture failed; content omitted.');process.exitCode=1}
