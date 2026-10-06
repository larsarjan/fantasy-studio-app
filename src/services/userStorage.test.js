import test from 'node:test'
import assert from 'node:assert/strict'
import { configureUserStorage, userStorage, flushUserStorage, hasPendingUserStorage } from './userStorage.js'
globalThis.window = new EventTarget()
const key = 'fantasy-studio-transfer-deadline-editorial-v1'
test('editorial writes stay ordered, failed writes remain dirty and flush retries latest snapshot', async () => {
  const saved=[]; let offline=true
  configureUserStorage({},async value => { if(offline) throw new Error('offline'); saved.push(value) })
  userStorage.setItem(key,'first')
  await assert.rejects(flushUserStorage(),/offline/)
  assert.equal(hasPendingUserStorage(),true)
  offline=false
  userStorage.setItem(key,'second')
  await flushUserStorage()
  assert.deepEqual(saved,['second'])
  assert.equal(hasPendingUserStorage(),false)
  configureUserStorage()
  assert.equal(userStorage.getItem(key),null)
})
