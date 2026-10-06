const CLUB_LOGO_SLUGS = Object.freeze({
  'ado den haag':'ado-den-haag',
  cambuur:'cambuur-leeuwarden',
  'sc cambuur':'cambuur-leeuwarden',
  'cambuur leeuwarden':'cambuur-leeuwarden',
  'fc groningen':'fc-groningen',
  'fc twente':'fc-twente',
  'fc utrecht':'fc-utrecht',
  'fortuna sittard':'fortuna-sittard',
  'go ahead eagles':'go-ahead-eagles',
  'n.e.c.':'nec',
  nec:'nec',
  'pec zwolle':'pec-zwolle',
  'sc heerenveen':'sc-heerenveen',
  heerenveen:'sc-heerenveen',
  'sparta rotterdam':'sparta-rotterdam',
  'willem ii':'willem-ii',
})

export const logoSlug = club => CLUB_LOGO_SLUGS[String(club??'').trim().toLowerCase()]??String(club??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-')
