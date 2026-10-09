export const photoSeason = value => String(value ?? '').replace(/\s/g, '').replace('-', '/')
export const photoKey = (namespace, season, id) => `${namespace}:${photoSeason(season)}:${String(id ?? '')}`

// Only persisted, explicit ID pairs are accepted. Names and clubs are never keys.
export function buildPhotoAliases(studio, espn, links) {
  const studioIds = new Set(studio.map(p => photoKey('studio', p.season, p.id)))
  const espnIds = new Set(espn.players.map(p => photoKey('espn', espn.season, p.id)))
  const byStudio = new Map(), byEspn = new Map()
  for (const p of links) {
    const s = photoKey('studio', p.season, p.studio_id), e = photoKey('espn', p.season, p.espn_id)
    if (!byStudio.has(s)) byStudio.set(s, new Set())
    if (!byEspn.has(e)) byEspn.set(e, new Set())
    byStudio.get(s).add(e); byEspn.get(e).add(s)
  }
  const aliases = {}, rejected = []
  for (const [s, values] of byStudio) for (const e of values) {
    if (values.size !== 1 || byEspn.get(e).size !== 1 || !studioIds.has(s) || !espnIds.has(e)) rejected.push({ studio: s, espn: e })
    else aliases[e] = s
  }
  return { aliases, rejected }
}
