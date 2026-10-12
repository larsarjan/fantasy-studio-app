const clubs = {
  "ajax": [
    "Ajax"
  ],
  "psv": [
    "PSV",
    "PSV Eindhoven"
  ],
  "feyenoord": [
    "Feyenoord"
  ],
  "fc-utrecht": [
    "FC Utrecht",
    "Utrecht"
  ],
  "fc-twente": [
    "FC Twente",
    "Twente"
  ],
  "az": [
    "AZ",
    "AZ Alkmaar"
  ],
  "nec": [
    "N.E.C.",
    "NEC",
    "N.E.C. Nijmegen",
    "NEC Nijmegen"
  ],
  "fc-groningen": [
    "FC Groningen",
    "Groningen"
  ],
  "sc-heerenveen": [
    "sc Heerenveen",
    "Heerenveen"
  ],
  "go-ahead-eagles": [
    "Go Ahead Eagles"
  ],
  "pec-zwolle": [
    "PEC Zwolle"
  ],
  "sparta-rotterdam": [
    "Sparta Rotterdam",
    "Sparta"
  ],
  "fortuna-sittard": [
    "Fortuna Sittard"
  ],
  "willem-ii": [
    "Willem II"
  ],
  "excelsior": [
    "Excelsior",
    "SBV Excelsior"
  ],
  "ado-den-haag": [
    "ADO Den Haag",
    "ADO"
  ],
  "cambuur-leeuwarden": [
    "SC Cambuur",
    "Cambuur",
    "Cambuur Leeuwarden",
    "SC Cambuur Leeuwarden"
  ],
  "telstar": [
    "Telstar",
    "SC Telstar"
  ]
}
export const normalizeLogoClub = value => String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\./g,'').trim().replace(/\s+/g,' ')
const aliases = new Map(Object.entries(clubs).flatMap(([slug,names])=>names.map(name=>[normalizeLogoClub(name),slug])))
export const CLUB_LOGO_CLUBS = Object.freeze(Object.values(clubs).map(names=>names[0]))
export const logoSlug = club => aliases.get(normalizeLogoClub(club)) || ''
const assetBase = import.meta.env?.BASE_URL || '/'
export const clubLogoFallback = assetBase+'club-logos/club-fallback.svg'
export const getClubLogo = club => logoSlug(club) ? assetBase+'club-logos/'+logoSlug(club)+'.png' : clubLogoFallback
