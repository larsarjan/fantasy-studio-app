import test from 'node:test'
import assert from 'node:assert/strict'
import {VIDEO_CATEGORIES,videoCategory,thumbnailSources,VIDEO_CATEGORY_OVERRIDES} from '../src/public/videoCatalog.js'
test('stable editorial categories and conservative title classification',()=>{
 assert.deepEqual(VIDEO_CATEGORIES,['5 Vooruit','De Picks','Terugblik','Samenwerkingen','Live','Overige / Specials'])
 for(const [title,category] of [['TEAMCHECK met EFV Tips','Samenwerkingen'],['Een terugblik op speelronde 8','Terugblik'],['Nabeschouwing speelronde 5','Terugblik'],['5 Vooruit: het programma','5 Vooruit'],['Vijf-vooruit','5 Vooruit'],['De Picks: ronde 6','De Picks'],['LIVE met een gast','Live'],['Dit zijn de beste spelers','Overige / Specials'],['Special: andere fantasyvragen','Overige / Specials']])assert.equal(videoCategory({title}),category)
})
test('visually verified episode IDs cover series omitted from titles',()=>{
 assert.equal(videoCategory({id:'y6yc9CT78Jk',title:'PEC Zwolle & Go Ahead zijn NU interessant'}),'5 Vooruit')
 assert.equal(videoCategory({id:'phMUUdCZ1I0',title:'DUBBELE speelronde 6'}),'De Picks')
 assert.equal(videoCategory({id:'THCDnQHsnVo',title:'CHAOS in speelronde 5'}),'Terugblik')
 assert(Object.values(VIDEO_CATEGORY_OVERRIDES).every(c=>VIDEO_CATEGORIES.includes(c)))
})
test('every thumbnail fallback belongs to the same validated episode',()=>{
 const sources=thumbnailSources('y6yc9CT78Jk');assert(sources[0].endsWith('/maxresdefault.jpg'));assert(sources[1].endsWith('/hqdefault.jpg'));assert(sources.every(s=>new URL(s).pathname.split('/')[2]==='y6yc9CT78Jk'))
 assert.throws(()=>thumbnailSources('../other'));assert.throws(()=>thumbnailSources('javascript:alert(1)'))
})
