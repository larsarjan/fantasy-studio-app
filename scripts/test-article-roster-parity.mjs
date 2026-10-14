import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {presentArticleEntity,fixtureResult} from '../server/articleEntities.js';
import {resolveHistoricalMatch} from '../src/services/historicalMatchDetails.js';
import {renderHistoricalMatchContent} from '../src/modules/historicalScoreView.js';
const data=JSON.parse(readFileSync(process.argv[2],'utf8'));
for(const [home,away] of [['PSV','sc Heerenveen'],['Feyenoord','AZ'],['Ajax','N.E.C.']]){
 const fixture=data.fixtures.find(f=>f.home===home&&f.away===away&&Number(f.round)===8);
 assert(fixture,`${home} fixture available`);
 const result=fixtureResult(fixture,data.results);
 const central=resolveHistoricalMatch({...fixture,...result,fixtureId:fixture.id},data.fixtures,data.players,data.playerMatchStats);
 const article=presentArticleEntity('match',{fixture,results:data.results,players:data.players,stats:data.playerMatchStats.filter(s=>s.fixtureId===fixture.id&&s.season===fixture.season)});
 assert.deepEqual(article.groups,central,'all player IDs, starts, minutes, points, events identical');
 assert.equal(renderHistoricalMatchContent(article.groups,result),renderHistoricalMatchContent(central,result));
 for(const side of ['home','away']){
  const rows=article.groups[side];assert.equal(rows.filter(r=>r.match.started).length,11,`${home} ${away}: eleven starters ${side}`);
  assert.equal(new Set(rows.map(r=>r.player.id)).size,rows.length);
 }
 console.log(JSON.stringify({match:`${home} - ${away}`,home:central.home.length,away:central.away.length,unassigned:central.unassigned.length,parity:'players/minutes/points/events/render exact'}));
}
