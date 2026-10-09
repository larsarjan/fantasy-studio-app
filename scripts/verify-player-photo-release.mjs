import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
const origin=process.env.PHOTO_ORIGIN||'https://fantasy-studio-app.vercel.app'
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
const remote=execFileSync('git',['ls-remote','production','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s/)[0]
assert.equal(sha,remote,'GitHub main must match local release')
const release=await(await fetch(origin+'/release.json',{cache:'no-store'})).json()
assert.equal(release.commit,sha,'Live release SHA must match GitHub')
const hash=data=>crypto.createHash('sha256').update(data).digest('hex')
const files=['index.html',...(await fs.readdir('dist/assets')).filter(f=>/\.(js|css)$/.test(f)).map(f=>'assets/'+f),...(await fs.readdir('dist/player-photos')).map(f=>'player-photos/'+f)]
let index=0,verified=0
await Promise.all(Array.from({length:8},async()=>{
 while(index<files.length){const file=files[index++],response=await fetch(`${origin}/${file}`);assert(response.ok,`${file}: ${response.status}`)
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),hash(await fs.readFile(path.join('dist',file))),file)
  if(file.startsWith('player-photos/')){assert.match(response.headers.get('content-type'),/image\/webp/);assert.match(response.headers.get('cache-control'),/immutable/)}
  verified++
 }
}))
const result={origin,commit:sha,verified,photos:files.filter(f=>f.startsWith('player-photos/')).length}
await fs.writeFile('test-results/player-photo-release.json',JSON.stringify(result,null,2));console.log(result)
