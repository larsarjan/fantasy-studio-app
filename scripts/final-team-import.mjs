import {readFileSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {parseFantasyTeamText} from '../src/services/optimizer/teamImportParser.js'
const players=JSON.parse(readFileSync('test-results/acceptance-players.json'))
const selected=[],clubs=new Map()
for(const [position,count,code] of [['Doelman',2,'KEE'],['Verdediger',5,'VER'],['Middenvelder',5,'MID'],['Spits',3,'SPI']]) {
 const candidates=players.filter(p=>p.position===position&&p.id&&p.name&&Number(p.endPrice)>0).sort((a,b)=>Number(b.minutes)-Number(a.minutes))
 for(const p of candidates) {
  if((clubs.get(p.club)??0)>=3) continue
  selected.push({...p,code});clubs.set(p.club,(clubs.get(p.club)??0)+1)
  if(selected.filter(p=>p.position===position).length===count) break
 }
}
assert.equal(selected.length,15)
const text=selected.map(p=>[p.club,p.name,'CLB','-',p.code,p.endPrice,Number(p.endPrice)-0.1,Number(p.endPrice)-0.2].join('\n')).join('\n')
assert.equal(parseFantasyTeamText({text,players}).valid,true)
writeFileSync('test-results/imported-selection.json',JSON.stringify(selected.map(({id,name,endPrice})=>({id,name,endPrice}))))
execFileSync('node_modules/agent-browser/bin/agent-browser-win32-x64.exe',['--session','final','fill','#manager-team-paste-input',text],{stdio:'pipe',timeout:60000})
console.log('Filled a valid 15-player selection through the real import control, including purchase and selling prices.')
