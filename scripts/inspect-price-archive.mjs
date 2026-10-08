import {readPriceArchive} from './lib/priceArchive.mjs'
import {mkdirSync,writeFileSync,createWriteStream} from 'node:fs'
import {once} from 'node:events'
const path=process.argv[2];if(!path)throw Error('Gebruik: node scripts/inspect-price-archive.mjs <zip>')
mkdirSync('test-results',{recursive:true})
const out=createWriteStream('test-results/price-archive.ndjson'),report={files:0,duplicates:0,errors:[],records:0,changes:0,rises:0,falls:0,times:{},steps:{},first:null,last:null},last=new Map()
for await(const batch of readPriceArchive(path,report)){
 report.first??=batch.captured_at;report.last=batch.captured_at;report.records+=batch.players.length
 for(const p of batch.players){const old=last.get(p.player_id);if(old&&p.price!==old.price){report.changes++;report[p.price>old.price?'rises':'falls']++;const time=batch.captured_at.slice(11,16);report.times[time]=(report.times[time]||0)+1;const step=p.price-old.price;report.steps[step]=(report.steps[step]||0)+1}last.set(p.player_id,p)}
 if(!out.write(JSON.stringify(batch)+'\n'))await once(out,'drain')
 if(report.files%200===0)console.log(JSON.stringify({files:report.files,changes:report.changes,last:report.last}))
}
out.end();await once(out,'finish');writeFileSync('test-results/price-archive-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,errors:report.errors.slice(0,5),errorCount:report.errors.length},null,2))
