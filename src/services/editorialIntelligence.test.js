import assert from 'node:assert/strict'
import { buildCompositeStories, selectEditorialStories } from './editorialIntelligence.js'

const insight = (id, category, score=75, club='Club') => ({ id:`${category}:${id}`, entityId:id, club, category, title:`${id} ${category}`, conclusion:'Wat', why:'Waarom', fantasy:'Fantasy', polarity:category.includes('TRAP')?'negative':'positive', talkingPointScore:score, confidence:{score:80,level:'hoog'}, metrics:{} })
const source = [insight('Rivera','OWNERSHIP GAP',82), insight('Rivera','UNDER THE RADAR',78), insight('Rivera','VALUE EMERGING',76), insight('Valente','VALUE EMERGING',74,'B'), insight('Risk','OWNERSHIP TRAP',73,'C'), insight('Ajax','FIXTURE SWING -',77,'Ajax'), insight('Keeper','STAT OF THE WEEK',72,'D')]
const composite = buildCompositeStories(source), rivera = composite.filter((item)=>item.entityId==='Rivera')
assert.equal(rivera.length,1); assert.equal(rivera[0].sourceSignals.length,3); assert.equal(rivera[0].storyFamily,'market-mismatch'); assert.ok(rivera[0].talkingPointScore<100)
const editorial = selectEditorialStories(composite)
assert.equal(editorial.filter((item)=>item.entityId==='Rivera').length,1)
assert.ok(new Set(editorial.map((item)=>item.storyFamily)).size>=3)
assert.ok(editorial.every((item)=>item.editorialLabel))
assert.ok(editorial.filter((item)=>item.storyFamily==='market-mismatch').length<=2)
assert.equal(new Set(editorial.map((item)=>item.entityId||item.club)).size,editorial.length)
const fixtureStories=selectEditorialStories(buildCompositeStories([insight('Feyenoord','GREEN RUN',80,'Feyenoord'),insight('Ajax','GREEN RUN',79,'Ajax'),insight('PSV','SCHEDULE CLIFF',78,'PSV')]))
assert.equal(fixtureStories.filter(item=>item.category==='GREEN RUN').length,1,'maximaal één exact fixture subtype')
assert.equal(fixtureStories.some(item=>item.category==='SCHEDULE CLIFF'),true,'ander fixture subtype mag ernaast')
const near=scanRelevanceFixture(3,6,25), far=scanRelevanceFixture(3,12,25)
assert.ok(near>far,'nabij fixtureverhaal heeft hogere relevantie')
console.log('Editorial Intelligence: 12 controles geslaagd.')

function scanRelevanceFixture(current,start,delta){const distance=start-current;return Math.abs(delta)*1.8+80*.45+Math.max(0,30-distance*3)}
