import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {CLUB_LOGO_CLUBS,getClubLogo,clubLogoFallback} from '../src/services/clubIdentity.js'
const origin='https://fantasyvoetbaltalk.nl',hash=b=>createHash('sha256').update(b).digest('hex')
for(const club of CLUB_LOGO_CLUBS){const path=getClubLogo(club),r=await fetch(new URL(path,origin+'/studio/fixtures'));assert(r.ok,club);assert(r.headers.get('content-type').includes('image/png'),club);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(hash(bytes),hash(readFileSync('public'+path)),club);const m=await sharp(bytes).metadata();assert(m.width>0&&m.height>0,club);console.log('PASS Live logo '+club)}
const fallback=await fetch(origin+clubLogoFallback);assert(fallback.ok);assert(fallback.headers.get('content-type').includes('image/svg+xml'));console.log('PASS Live neutral fallback')
