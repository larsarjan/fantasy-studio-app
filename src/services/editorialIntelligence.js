import { clamp, mean, round } from './intelligenceHelpers.js'

export const STORY_FAMILIES = Object.freeze({
  'UNDER THE RADAR': 'market-mismatch', 'OWNERSHIP GAP': 'market-mismatch', 'VALUE EMERGING': 'market-mismatch',
  'OWNERSHIP TRAP': 'caution', 'MINUTES DECLINE': 'caution', 'MINUTES BREAKOUT': 'minutes',
  'FIXTURE SWING +': 'fixture', 'FIXTURE SWING -': 'fixture', 'UPCOMING SWING +': 'fixture', 'UPCOMING SWING -': 'fixture', 'GREEN RUN': 'fixture', 'GREEN RUN START': 'fixture', 'RED RUN': 'fixture', 'SCHEDULE CLIFF': 'fixture',
  'STAT OF THE WEEK': 'stat', 'CLUB WATCH': 'club', 'BUDGET EDGE': 'budget',
})

export const storyFamily = (insight) => STORY_FAMILIES[insight?.category] ?? (insight?.category?.startsWith('FIXTURE') ? 'fixture' : 'general')
const subjectKey = (insight) => insight?.entityId || insight?.club || insight?.id

export function buildCompositeStories(insights) {
  const groups = Object.groupBy(insights, (insight) => { const family=storyFamily(insight); return `${subjectKey(insight)}|${family}|${family==='fixture'?insight.category:''}` })
  return Object.values(groups).map((signals) => {
    const sorted = [...signals].sort((a, b) => b.talkingPointScore - a.talkingPointScore), primary = sorted[0], family = storyFamily(primary)
    if (sorted.length === 1) return { ...primary, storyFamily: family, sourceSignals: sorted }
    const confidence = mean(sorted.map((item) => item.confidence?.score ?? 0))
    const score = round(clamp(primary.talkingPointScore * .82 + Math.min(8, (sorted.length - 1) * 3) + confidence * .07, 0, 96))
    const families = sorted.map((item) => item.category.toLowerCase()).join(', ')
    const marketMismatch = family === 'market-mismatch'
    const compositeConfidence = { score: round(confidence), level: confidence >= 72 ? 'hoog' : confidence >= 45 ? 'middel' : 'laag' }
    return { ...primary, id: `COMPOSITE:${subjectKey(primary)}:${family}`, category: marketMismatch ? 'MARKET MISMATCH' : primary.category, title: marketMismatch ? `${primary.subjectName || primary.title} is een duidelijke markt-mismatch` : primary.title, why: `Meerdere signalen komen samen: ${families}. ${primary.why}`, talkingPointScore: score, confidence: compositeConfidence, storyFamily: family, sourceSignals: sorted, composite: true }
  }).sort((a, b) => b.talkingPointScore - a.talkingPointScore || a.id.localeCompare(b.id))
}

const EDITORIAL_LABELS = Object.freeze({ 'market-mismatch': 'ONDER DE RADAR', caution: 'PAS OP', fixture: 'FIXTURE STORY', minutes: 'MINUTES WATCH', budget: 'BUDGETTIP', club: 'CLUB OM TE VOLGEN', stat: 'STAT VAN DE WEEK', general: 'GROOT VERHAAL' })

export function selectEditorialStories(stories, limit = 10) {
  const subjects = new Set(), clubs = new Map(), families = new Map(), fixtureSubtypes = new Set(), selected = []
  const add = (story) => {
    const subject = subjectKey(story), family = story.storyFamily || storyFamily(story), clubCount = clubs.get(story.club) || 0, familyCount = families.get(family) || 0
    const fixtureSubtype = family === 'fixture' ? story.category : ''
    if (subjects.has(subject) || (story.club && clubCount >= 2) || familyCount >= 2 || (fixtureSubtype && fixtureSubtypes.has(fixtureSubtype)) || story.talkingPointScore < 58) return false
    subjects.add(subject); if (story.club) clubs.set(story.club, clubCount + 1); families.set(family, familyCount + 1)
    if (fixtureSubtype) fixtureSubtypes.add(fixtureSubtype)
    selected.push({ ...story, editorialLabel: selected.length === 0 ? 'GROOT VERHAAL' : EDITORIAL_LABELS[family] || 'CONTRAIR IDEE' })
    return true
  }
  if (stories[0]) add(stories[0])
  for (const family of ['caution', 'fixture', 'market-mismatch', 'budget', 'club', 'stat', 'general', 'minutes']) {
    const story = stories.find((item) => (item.storyFamily || storyFamily(item)) === family)
    if (story) add(story)
    if (selected.length >= limit) return selected
  }
  for (const story of stories) { add(story); if (selected.length >= limit) break }
  return selected
}
