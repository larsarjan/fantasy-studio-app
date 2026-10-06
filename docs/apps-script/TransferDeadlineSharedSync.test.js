import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source=fs.readFileSync(new URL('./TransferDeadlineSharedSync.gs',import.meta.url),'utf8')
const sandbox={
  tokenValue:'  correct-token\n',
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>sandbox.tokenValue})},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput:text=>({text,setMimeType(){return this}})},
  LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>false,releaseLock(){}})},
  SpreadsheetApp:{getActive:()=>({getSheetByName:()=>null})},
  console,
}
vm.createContext(sandbox)
vm.runInContext(source,sandbox)

assert.throws(()=>sandbox.transferSharedAuthorize_(''),/Niet geautoriseerd/)
assert.throws(()=>sandbox.transferSharedAuthorize_('wrong-token'),/Niet geautoriseerd/)
const diagnostics=sandbox.transferSharedAuthorize_(' correct-token ')
assert.equal(diagnostics.serverTokenConfigured,true)
assert.equal(diagnostics.clientTokenProvided,true)
assert.equal(diagnostics.clientTokenLength,13)
assert.equal(diagnostics.serverTokenLength,13)
assert.equal(diagnostics.tokenMatch,true)

const response=payload=>JSON.parse(sandbox.doPost({postData:{contents:JSON.stringify(payload)}}).text)
assert.equal(response({action:'snapshot'}).code,'AUTH')
assert.equal(response({action:'snapshot',token:'wrong-token'}).code,'AUTH')
const snapshot=response({action:'snapshot',token:'correct-token'})
assert.equal(snapshot.ok,true)
assert.equal(snapshot.authDiagnostics.tokenMatch,true)

sandbox.patchTransferSharedEditorial_=()=>({action:'patchEditorial'})
sandbox.upsertTransferSharedLive_=()=>({action:'upsertLiveTransfer'})
sandbox.deleteTransferSharedLive_=()=>({action:'deleteLiveTransfer'})
assert.equal(response({action:'patchEditorial',token:'correct-token'}).result.action,'patchEditorial')
assert.equal(response({action:'upsertLiveTransfer',token:'correct-token'}).result.action,'upsertLiveTransfer')
assert.equal(response({action:'deleteLiveTransfer',token:'correct-token'}).result.action,'deleteLiveTransfer')

const unauthorized=JSON.stringify(response({action:'snapshot',token:'wrong-token'}))
assert.equal(unauthorized.includes('correct-token'),false)
assert.equal(unauthorized.includes('wrong-token'),false)
console.log('Transfer Deadline Apps Script auth-tests geslaagd.')
