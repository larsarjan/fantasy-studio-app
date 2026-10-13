// Local-only UI harness. Football facts come from an existing real snapshot file.
import {createServer} from 'vite'
import {readFileSync} from 'node:fs'
import {presentArticleEntity} from '../server/articleEntities.js'
const data=JSON.parse(readFileSync(process.argv[2],'utf8'))
const coverage=data.fixtures.map(f=>({id:f.id,season:f.season,records:data.playerMatchStats.filter(s=>s.fixtureId===f.id&&s.season===f.season&&s.minutes>0).length}))
const catalog=presentArticleEntity('catalog',{snapshotId:'local-real-snapshot',...data,coverage})
const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true},plugins:[{name:'article-test-harness',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://local')
 if(url.pathname==='/__article-entities'){
  const html=await server.transformIndexHtml(req.url,readFileSync('scripts/fixtures/article-entities.html','utf8'));res.setHeader('Content-Type','text/html');res.end(html);return
 }
 if(url.pathname!=='/api/article-entities')return next()
 res.setHeader('Content-Type','application/json')
 const kind=url.searchParams.get('kind'),id=url.searchParams.get('id'),season=url.searchParams.get('season')
 if(kind==='catalog'){res.end(JSON.stringify(catalog));return}
 const player=data.players.find(p=>p.id===id&&p.season===season),fixture=data.fixtures.find(f=>f.id===id&&f.season===season)
 if(kind==='player'&&!player||kind!=='player'&&!fixture){res.statusCode=404;res.end(JSON.stringify({error:'Deze speler of wedstrijd is niet beschikbaar.'}));return}
 const payload=kind==='player'?{player,photos:[],fixtures:data.fixtures.filter(f=>f.season===season),stats:data.playerMatchStats.filter(s=>s.playerId===id&&s.season===season)}:{fixture,players:data.players.filter(p=>p.season===season),results:data.results,stats:data.playerMatchStats.filter(s=>s.fixtureId===id&&s.season===season)}
 res.end(JSON.stringify(presentArticleEntity(kind,payload)))
})}}]})
await server.listen();console.log('Article entity UI harness ready on http://127.0.0.1:5197/__article-entities')
