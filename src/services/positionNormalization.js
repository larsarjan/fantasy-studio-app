const POSITION_ALIASES = Object.freeze({
  doelman: 'keeper', keeper: 'keeper', goalkeeper: 'keeper', gk: 'keeper',
  verdediger: 'verdediger', defender: 'verdediger', defence: 'verdediger', defense: 'verdediger',
  middenvelder: 'middenvelder', middenveld: 'middenvelder', midfielder: 'middenvelder', midfield: 'middenvelder',
  spits: 'aanvaller', aanvaller: 'aanvaller', aanval: 'aanvaller', forward: 'aanvaller', attacker: 'aanvaller', striker: 'aanvaller',
})

export function normalizePosition(value) {
  const key = String(value ?? '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ')
  return POSITION_ALIASES[key] ?? 'onbekend'
}

export const positionDisplayLabel = (value) => ({ keeper: 'Doelman', verdediger: 'Verdediger', middenvelder: 'Middenvelder', aanvaller: 'Spits' }[normalizePosition(value)] ?? 'Onbekend')
