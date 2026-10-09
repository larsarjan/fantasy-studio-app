import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { buildPhotoAliases, photoKey } from '../src/services/playerPhotoIdentity.js'

const audit = JSON.parse(await fs.readFile(process.argv[2] || 'test-results/photo-source-audit.json', 'utf8'))
const { aliases, rejected } = buildPhotoAliases(audit.studio, audit.espn, audit.links)
const local = {}, excluded = [], sizes = { original: 0, thumbnail: 0, detail: 0 }
await fs.mkdir('public/player-photos', { recursive: true })
for (const file of (await fs.readdir('src/assets/Players')).sort()) {
  if (!/^\d+\.(webp|png|jpe?g)$/i.test(file)) { excluded.push({ file, reason: 'not-player-id' }); continue }
  const input = await fs.readFile(path.join('src/assets/Players', file))
  let meta
  try { meta = await sharp(input).metadata() } catch { excluded.push({ file, reason: 'invalid-image' }); continue }
  if (!['webp', 'png', 'jpeg'].includes(meta.format)) { excluded.push({ file, reason: 'unsupported-format' }); continue }
  const id = path.parse(file).name, hash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 12)
  const variants = {}
  sizes.original += input.length
  for (const [variant, width] of [['thumbnail', 96], ['detail', 240]]) {
    const buffer = await sharp(input).resize({ width, height: variant === 'thumbnail' ? 126 : 316, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toBuffer()
    const target = `/player-photos/${id}-${hash}-${variant}.webp`
    await fs.writeFile(`public${target}`, buffer)
    sizes[variant] += buffer.length; variants[variant] = target
  }
  // Local filenames belong to the 2026/2027 Studio catalogue, never to ESPN IDs.
  local[photoKey('studio', '2026/2027', id)] = variants
}
const studioPhotos = audit.studio.filter(p => local[photoKey('studio', p.season, p.id)]).length
const espnPhotos = audit.espn.players.filter(p => local[aliases[photoKey('espn', audit.espn.season, p.id)]]).length
const stats = { studioPlayers: audit.studio.length, espnPlayers: audit.espn.players.length, mapped: Object.keys(aliases).length, rejected: rejected.length, studioUnmapped: audit.studio.length - Object.keys(aliases).length, espnUnmapped: audit.espn.players.length - Object.keys(aliases).length, validLocalPhotos: Object.keys(local).length, studioPhotos, espnPhotos, studioFallbacks: audit.studio.length - studioPhotos, espnFallbacks: audit.espn.players.length - espnPhotos, sizes, excluded }
await fs.mkdir('src/data', { recursive: true })
await fs.writeFile('src/data/playerPhotos.generated.json', JSON.stringify({ provenance: 'Existing explicit elite_player_stats playerId/espnPlayerId pairs; no new name matching. Local filename IDs belong to Studio 2026/2027.', aliases, local, stats }, null, 2) + '\n')
console.log(JSON.stringify(stats, null, 2))
