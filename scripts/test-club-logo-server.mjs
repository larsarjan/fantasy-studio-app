// Local fixture only: reuse committed Eredivisie fixtures; never synchronize or publish.
import {createServer} from 'vite'
const server=await createServer({plugins:[{name:'local-club-logo-fixtures',enforce:'pre',transform(source,id){if(id.replaceAll('\\','/').endsWith('/src/services/database.js'))return source.replace('fixtures: [],','fixtures: fallbackFixtures,')}}],server:{host:'127.0.0.1',port:5195}})
await server.listen();console.log('Club logo acceptance: http://127.0.0.1:5195/scripts/fixtures/club-logos.html')
