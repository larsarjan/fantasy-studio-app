import {registerHooks} from 'node:module'
import {execFileSync} from 'node:child_process'
import {writeFileSync,readFileSync,openSync,closeSync} from 'node:fs'
import assert from 'node:assert/strict'
const folder='test-results/performance',mode=process.argv[2]
if(mode){
 const sheets=JSON.parse(readFileSync(folder+'/source-sheets.json','utf8'));const start=performance.now();let data
 if(mode==='baseline'){
  globalThis.__referenceTestSheets=sheets
  const original=execFileSync('git',['show','e0713bdf5036eabfaf1bdc89d8f0a4c4ee388594:src/services/database.js'],{encoding:'utf8'}).replaceAll('\r\n','\n')
  registerHooks({load(url,context,next){if(!url.endsWith('/services/database.js')) {
   const relative = url.includes('/src/services/') ? 'src/services/' + url.split('/src/services/')[1] : ''
   if (['src/services/historyAnalytics.js','src/services/playerMatchStatsEngine.js','src/services/fixtureIntelligenceEngine.js','src/services/expectedPoints/expectedPointsEngine.js','src/services/expectedPoints/expectedPointsFixture.js','src/services/analysisEngine.js','src/services/captainRadarEngine.js','src/services/differentialEngine.js'].includes(relative)) return {format:'module',source:execFileSync('git',['show','e0713bdf5036eabfaf1bdc89d8f0a4c4ee388594:'+relative],{encoding:'utf8'}),shortCircuit:true}
   return next(url,context)
  };let source=original.replace('fetchSheet(name).then','Promise.resolve(globalThis.__referenceTestSheets[name]).then');const a=source.indexOf("    const { publishReferenceData } = await import('../platform/referenceData.js')"),b=source.indexOf('\n  } catch (error) {',a);assert(a>0&&b>a);source=source.slice(0,a)+'    return database\n'+source.slice(b);return {format:'module',source,shortCircuit:true}}})
  data=await (await import('../src/services/database.js')).synchronizeDatabase()
 }else{data=await (await import('../server/referenceSync.js')).prepareReferenceSheets(sheets)}
 writeFileSync(folder+'/parity-'+mode+'.json',JSON.stringify(data));writeFileSync(folder+'/parity-'+mode+'-time.json',JSON.stringify({computeMs:performance.now()-start}))
}else{
 for(const worker of ['baseline','server']){const fd=openSync(folder+'/parity-'+worker+'.log','w');try{execFileSync(process.execPath,['scripts/test-reference-model-parity.mjs',worker],{stdio:['ignore',fd,fd],timeout:60000})}finally{closeSync(fd)}}
 const before=JSON.parse(readFileSync(folder+'/parity-baseline.json','utf8')),after=JSON.parse(readFileSync(folder+'/parity-server.json','utf8'))
 const stable=row=>JSON.stringify(row,(key,value)=>key==='fantasyScoresCalculatedAt'?undefined:value)
 for(const [key,rows] of Object.entries(after)){assert.equal(rows.length,before[key].length,key);for(let i=0;i<rows.length;i++)assert.equal(stable(rows[i])===stable(before[key][i]),true,`Model mismatch: ${key} row ${i}`)}
 const result={at:new Date().toISOString(),baseline:JSON.parse(readFileSync(folder+'/parity-baseline-time.json','utf8')),server:JSON.parse(readFileSync(folder+'/parity-server-time.json','utf8')),datasets:Object.fromEntries(Object.entries(after).map(([k,v])=>[k,v.length])),identical:true,excludedMetadata:['fantasyScoresCalculatedAt'],published:false}
 writeFileSync(folder+'/model-parity.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}
