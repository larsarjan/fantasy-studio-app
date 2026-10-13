import test from 'node:test'
import assert from 'node:assert/strict'
import {addPlayerLink,adjustPlayerLinks,suggestArticleEntities,validPlayerLinks,validateEntityContent} from './articleEntities.js'
import {renderArticleContent,newArticleBlock} from './articleBlocks.js'
import {renderHistoricalMatchContent} from '../modules/historicalScoreView.js'
const p={id:'20260001',season:'2026/2027',name:'Luuk de Jong',club:'PSV'},other={...p,id:'20260002',name:'Frenkie de Jong',club:'Ajax'}
const content=text=>({version:1,blocks:[{id:'a',type:'paragraph',text}]})
test('recognition is pure, first meaningful mention only, full name high and ambiguous surname low',()=>{
 const c=content('Luuk de Jong scoort. Luuk de Jong opnieuw. Jong speelt ook.'),before=JSON.stringify(c)
 const s=suggestArticleEntities(c,{players:[p,other]});assert.equal(JSON.stringify(c),before);assert.equal(s.filter(s=>s.text==='Luuk de Jong').length,1);assert.equal(s[0].confidence,'high');assert.equal(s.at(-1).confidence,'low');assert.equal(s.at(-1).candidates.length,2)
})
test('manual selection uses exact ID and season, ambiguity never writes, ignore survives serialization',()=>{
 const c=content('Jong speelde goed vandaag.');assert.equal(suggestArticleEntities(c,{players:[p,other]}).length,1);assert.equal(c.blocks[0].players,undefined)
 c.ignoredEntities=['player:jong'];assert.equal(suggestArticleEntities(JSON.parse(JSON.stringify(c)),{players:[p,other]}).length,0)
 addPlayerLink(c.blocks[0],0,4,other);assert.equal(c.blocks[0].players[0].playerId,other.id);assert.doesNotThrow(()=>validateEntityContent(c))
})
test('text edits preserve unaffected links, shift following links and remove overlapping links',()=>{
 const b=content('Luuk de Jong scoort.').blocks[0];addPlayerLink(b,0,12,p);adjustPlayerLinks(b,b.text,'Vandaag '+b.text);b.text='Vandaag '+b.text;assert.equal(validPlayerLinks(b)[0].start,8)
 adjustPlayerLinks(b,b.text,'Vandaag Luuk scoort.');assert.equal(b.players.length,0)
})
test('invalid/null/overlap/stale ranges fail closed and validation rejects malformed data',()=>{
 const c=content('Jong en Jong');c.blocks[0].players=[null,{start:0,end:4,text:'wrong',playerId:p.id,season:p.season}];assert.deepEqual(validPlayerLinks(c.blocks[0]),[]);assert.throws(()=>validateEntityContent(c));assert.doesNotThrow(()=>renderArticleContent({content_blocks:c}))
 c.blocks[0].players=[];addPlayerLink(c.blocks[0],0,4,p);c.blocks[0].players.push({...c.blocks[0].players[0]});assert.throws(()=>validateEntityContent(c))
})
test('ordinary Markdown hyperlinks cannot become nested interactive content and failed linking does not mutate',()=>{
 const b=content('[Jong](https://example.org) Jong').blocks[0],before=JSON.stringify(b);assert.throws(()=>addPlayerLink(b,1,5,p));assert.equal(JSON.stringify(b),before)
})
test('linked names preserve formatting, escaping and plain old article HTML',()=>{
 const b=content('**Luuk de Jong** scoort. <script>alert(1)</script>').blocks[0];addPlayerLink(b,2,14,p);const html=renderArticleContent({content_blocks:{version:1,blocks:[b]}});assert.match(html,/<strong><button/);assert.match(html,/data-season="2026\/2027"/);assert(!html.includes('<script>'))
 assert.equal(renderArticleContent({content_blocks:content('Gewone **tekst**.')}),'<div class="article-content"><p>Gewone <strong>tekst</strong>.</p></div>')
})
test('list offsets and Unicode are stable',()=>{const b={id:'a',type:'list',items:['⚽ Goed','Luuk de Jong'],ordered:false};addPlayerLink(b,7,19,p);assert.match(renderArticleContent({content_blocks:{version:1,blocks:[b]}}),/<li><button/);assert.doesNotThrow(()=>validateEntityContent({blocks:[b]}))})
test('match recognition uses club aliases and score, keeps original heading unchanged',()=>{
 const c=content('N.E.C. - AZ Alkmaar (2-0)'),before=JSON.stringify(c),fixture={id:'f1',season:p.season,home:'NEC',away:'AZ',homeScore:2,awayScore:0}
 const s=suggestArticleEntities(c,{players:[],fixtures:[fixture]});assert.equal(s[0].kind,'match');assert.equal(s[0].candidates[0].id,'f1');assert.equal(JSON.stringify(c),before)
})
test('match default is collapsed with explicit boolean settings and safe identifiers',()=>{
 const b={...newArticleBlock('match'),fixtureId:'f1',season:p.season};assert.doesNotThrow(()=>validateEntityContent({blocks:[b]}));assert.match(renderArticleContent({content_blocks:{version:1,blocks:[b]}}),/aria-expanded="false"/);b.fixtureId='"><script>';assert.throws(()=>validateEntityContent({blocks:[b]}));assert(!renderArticleContent({content_blocks:{version:1,blocks:[b]}}).includes('<script>'))
})
test('shared score renderer keeps points, minutes, positions, substitutes, legend and safe player links',()=>{
 const starter={player:{...p,position:'Spits'},match:{started:true,minutes:90,punten:{totaal:9},goals:1}},sub={player:{...other,position:'Middenvelder'},match:{started:false,minutes:20,punten:{totaal:1}}},groups={fixture:{home:'PSV',away:'Ajax',round:1},home:[starter],away:[sub],unassigned:[]}
 const html=renderHistoricalMatchContent(groups,{round:1},{article:true});assert.match(html,/data-article-player="20260001"/);assert.match(html,/90'/);assert.match(html,/9 pt/);assert.match(html,/Invallers/);assert.match(html,/Legenda/)
 const limited=renderHistoricalMatchContent(groups,{round:1},{article:true,showSubstitutes:false,showLegend:false,showTopScorer:false,playerLinks:false});assert(!limited.includes('data-article-player'));assert(!limited.includes('Invallers'));assert(!limited.includes('Fantasy-topscorer'));assert(!limited.includes('history-match-legend'))
 assert.match(renderHistoricalMatchContent(groups,{round:1}),/data-history-player/)
})
