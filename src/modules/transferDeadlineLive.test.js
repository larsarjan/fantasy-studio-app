import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'})
try{
  const {renderTransferAssessmentRead,renderTransferAssessmentEdit,renderTransferSharedSyncModal}=await server.ssrLoadModule('/src/modules/transferDeadlineLive.js')
  const row={id:'transfer-1',club:'Ajax',sheetImpact:''}
  const players=[
    {id:'p1',name:'Owen Wijndal',club:'Ajax',position:'verdediger',currentPrice:5.5,ownership:12.4,totalPoints:7,minutes:180},
    {id:'p2',name:'Jorrel Hato',club:'Ajax',position:'verdediger',currentPrice:6,ownership:20,totalPoints:9,minutes:170},
    {id:'p3',name:'Andere club',club:'PSV',position:'middenvelder'},
  ]
  const editorial={role:'vaste basisspeler',impact:'zeer hoog',label:'Must watch',competition:['p1'],note:'Directe basisspeler.'}
  const read=renderTransferAssessmentRead(row,editorial,players)
  assert.match(read,/vaste basisspeler/)
  assert.match(read,/zeer hoog/)
  assert.match(read,/Must watch/)
  assert.match(read,/Owen Wijndal/)
  assert.match(read,/Verdediger/)
  assert.match(read,/12,4%/)
  assert.doesNotMatch(read,/Jorrel Hato/)
  assert.doesNotMatch(read,/<select|type="checkbox"|<textarea/)
  assert.match(read,/data-tdl-editor-open/)

  const unknown=renderTransferAssessmentRead(row,{competition:['missing-player']},players)
  assert.match(unknown,/Onbekende speler/)
  assert.match(unknown,/missing-player/)
  assert.match(unknown,/Nog niet beoordeeld/)
  const presentation=renderTransferAssessmentRead(row,editorial,players,{presentation:true})
  assert.doesNotMatch(presentation,/data-tdl-editor-open|>Bewerken</)

  const edit=renderTransferAssessmentEdit(row,editorial,players)
  assert.match(edit,/<select name="role"/)
  assert.match(edit,/type="checkbox" name="competition" value="p1" checked/)
  assert.match(edit,/Jorrel Hato/)
  assert.doesNotMatch(edit,/Andere club/)
  assert.match(edit,/data-tdl-editor-cancel>Annuleren/)
  assert.match(edit,/<button type="submit">Opslaan<\/button>/)

  const unconfigured=renderTransferSharedSyncModal({endpoint:'',token:'',clientId:''},{state:'local'})
  assert.match(unconfigured,/Gedeelde sync is niet geconfigureerd/)
  assert.match(unconfigured,/name="endpoint" type="url"/)
  assert.match(unconfigured,/name="token" type="password"/)
  assert.match(unconfigured,/data-tdl-shared-sync disabled/)
  assert.doesNotMatch(unconfigured,/prompt\s*\(/)
  const configured=renderTransferSharedSyncModal({endpoint:'https:\/\/example.test\/exec',token:'secret',clientId:'client'},{state:'synced'},{tokenVisible:true,feedback:{state:'success',message:'Gedeelde transferdata bijgewerkt'}})
  assert.match(configured,/value="https:\/\/example.test\/exec"/)
  assert.match(configured,/name="token" type="text"[^>]*value="secret"/)
  assert.match(configured,/Gedeelde transferdata bijgewerkt/)
  assert.doesNotMatch(configured,/data-tdl-shared-sync disabled/)
  console.log('Transfer Deadline modal-tests geslaagd.')
}finally{
  await server.close()
}
