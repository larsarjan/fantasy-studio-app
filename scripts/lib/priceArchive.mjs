import unzipper from 'unzipper'
import {seasonOf} from '../../src/services/prominentModel.js'

export function parsePriceCsv(text) {
  const rows=[];let row=[],cell='',quoted=false
  for(let i=0;i<text.length;i++) { const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(!quoted&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[]}}else cell+=c }
  if(quoted)throw Error('Onafgesloten CSV-veld');if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
  const header=rows.shift()?.map(s=>s.replace(/^\uFEFF/,''));if(!header?.includes('timestamp')||!header.includes('transfers_out'))throw Error('Onbekend CSV-formaat')
  return rows.map(r=>{if(r.length!==header.length)throw Error('Onvolledige CSV-regel');return Object.fromEntries(header.map((h,i)=>[h,r[i]]))})
}
export async function boundedEntry(entry,limit) {
  if(entry.uncompressedSize>limit)throw Error('ZIP-bestand te groot')
  let length=0;const chunks=[]
  for await(const chunk of entry.stream()){length+=chunk.length;if(length>limit)throw Error('ZIP-uitvoer overschrijdt limiet');chunks.push(chunk)}
  return Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,'')
}
// Never extract paths. Read one bounded pair at a time, ordered by archive name;
// actual timestamps always come from the CSV, including its explicit offset.
export async function* readPriceArchive(path,report={files:0,duplicates:0,errors:[]}) {
  const zip=await unzipper.Open.file(path)
  if(zip.files.length>10000)throw Error('Te veel ZIP-bestanden')
  const byPath=new Map(zip.files.map(f=>[f.path,f])), seen=new Set()
  for(const entry of zip.files.filter(f=>/(^|\/)snapshot_[\d_-]+\.csv$/.test(f.path)).sort((a,b)=>a.path.localeCompare(b.path))) {
    try {
      const csv=parsePriceCsv(await boundedEntry(entry,2*1024*1024));if(!csv.length)throw Error('Lege snapshot')
      const times=csv.map(r=>Date.parse(r.timestamp))
      if(times.some(t=>!Number.isFinite(t))||Math.max(...times)-Math.min(...times)>60000)throw Error('Ongeldige snapshotmomenten')
      // Export timestamps are generated per row. Use completion time, never an
      // earlier timestamp at which some rows were not yet observed.
      const captured_at=new Date(Math.max(...times)).toISOString()
      if(seen.has(captured_at)){report.duplicates++;continue}
      const json=byPath.get(entry.path.replace(/\.csv$/,'.json'));if(!json)throw Error('Bijbehorende JSON ontbreekt')
      const bootstrap=JSON.parse(await boundedEntry(json,10*1024*1024)),season=seasonOf(bootstrap)
      const elements=new Map(bootstrap.elements.map(p=>[p.id,p])),teams=new Map(bootstrap.teams.map(t=>[t.id,t.name]))
      const events=bootstrap.events.map(e=>({id:e.id,deadline_time:e.deadline_time}));const gameweek=events.filter(e=>Date.parse(e.deadline_time)<=Date.parse(captured_at)).sort((a,b)=>a.id-b.id).at(-1)?.id||0
      const players=csv.map(r=>{
        const id=Number(r.id),p=elements.get(id),price=Math.round(Number(r.prijs.replace(',','.'))*10)
        const s={player_id:id,name:r.speler,club:teams.get(Number(r.team))||String(r.team),price,ownership:Number(r.ownership),transfers_in:Number(r.transfers_in),transfers_out:Number(r.transfers_out),transfers_in_event:Number(r.transfers_in_event),transfers_out_event:Number(r.transfers_out_event)}
        if(!p||p.now_cost!==price||p.transfers_in!==s.transfers_in||p.transfers_out!==s.transfers_out||Number(p.selected_by_percent)!==s.ownership)throw Error('CSV/JSON komen niet overeen')
        if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(price)||price<0||s.ownership<0||s.ownership>100||Object.values(s).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('Ongeldige spelerwaarden')
        return s
      })
      if(new Set(players.map(p=>p.player_id)).size!==players.length)throw Error('Dubbele speler-ID')
      seen.add(captured_at);report.files++;yield {season,captured_at,gameweek,total_players:bootstrap.total_players,events,players,source:'archive'}
    }catch(e){report.errors.push({file:entry.path,error:e.message})}
  }
}
