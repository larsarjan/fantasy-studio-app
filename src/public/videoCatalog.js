// Editorial configuration. Keep labels/order stable even when a feed has no matches.
export const VIDEO_CATEGORIES = ['5 Vooruit','De Picks','Terugblik','Samenwerkingen','Live','Overige / Specials']

// Verified 2026-10-08 against the series label printed on each real YouTube
// thumbnail. IDs, not speculative title similarity, identify these exceptions.
// Add an override only after checking the actual episode/thumbnail.
export const VIDEO_CATEGORY_OVERRIDES = Object.freeze({
  y6yc9CT78Jk: '5 Vooruit',
  CqU44oDa5N4: '5 Vooruit',
  '2gqvVfkE2WA': '5 Vooruit',
  phMUUdCZ1I0: 'De Picks',
  'sI-A2G-rTlc': 'De Picks',
  IBWwwKKV4ig: 'De Picks',
  THCDnQHsnVo: 'Terugblik',
})
// First explicit match wins. A live show remains Live even with a guest.
// Teamcheck is grouped under Samenwerkingen by the FVT editorial convention.
export const VIDEO_CATEGORY_RULES = [
  {pattern:/\blive\b/i, category:'Live'},
  {pattern:/\b(?:5|vijf)[\s-]*vooruit\b/i, category:'5 Vooruit'},
  {pattern:/\bde[\s-]+picks\b/i, category:'De Picks'},
  {pattern:/\b(?:terugblik|nabeschouwing)\b/i, category:'Terugblik'},
  {pattern:/\b(?:team[\s-]*check|samenwerking(?:en)?|collab(?:oration)?|ft\.?|feat\.?)\b|\bte gast\b/i, category:'Samenwerkingen'},
]
export function videoCategory(video) {
  if(typeof video==='string') video={title:video}
  return VIDEO_CATEGORY_OVERRIDES[video.id] ?? VIDEO_CATEGORY_RULES.find(r=>r.pattern.test(video.title))?.category ?? 'Overige / Specials'
}
export function thumbnailSources(id) {
  if(!/^[\w-]{11}$/.test(id)) throw new Error('Invalid video identity')
  return [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,`https://i.ytimg.com/vi/${id}/hqdefault.jpg`]
}
