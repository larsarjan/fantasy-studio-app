// Presentation names come from this season's fixtures, never historical players.
const aliases = { azalkmaar: 'az', nec: 'nec', adodenhaag: 'adodenhaag', scheerenveen: 'heerenveen', cambuurleeuwarden: 'cambuur', sccambuur: 'cambuur' }
export function clubKey(value) {
  const key = String(value ?? '').toLocaleLowerCase('nl').replace(/[^a-z0-9]/g, '')
  return aliases[key] ?? key
}
const labels = { az: 'AZ', nec: 'N.E.C.', adodenhaag: 'ADO Den Haag', heerenveen: 'sc Heerenveen', cambuur: 'SC Cambuur' }
export function canonicalClubs(fixtures) {
  const season = fixtures.map(f => String(f.season ?? '')).sort().at(-1)
  const clubs = new Map()
  for (const f of fixtures.filter(f => String(f.season ?? '') === season)) {
    for (const club of [f.home, f.away]) if (club) clubs.set(clubKey(club), labels[clubKey(club)] ?? club.trim())
  }
  return [...clubs.values()].sort((a,b) => a.localeCompare(b,'nl'))
}
export const canonicalFavorite = (value, clubs) => clubs.find(c => clubKey(c) === clubKey(value)) ?? ''
