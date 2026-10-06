// Synchronous view of the current user's data for legacy editorial functions.
// Never reads another user's or pre-authentication browser storage.
let values = new Map()
let persist = null
let pending = Promise.resolve()
let lastError = null
let outstanding = 0
const editorialKey = 'fantasy-studio-transfer-deadline-editorial-v1'
export const hasPendingUserStorage = () => outstanding > 0 || lastError !== null
export function configureUserStorage(initial = {}, save = null) {
  values = new Map(Object.entries(initial)); persist = save; pending = Promise.resolve(); lastError = null; outstanding = 0
}
export const userStorage = {
  getItem(key) { return values.get(key) ?? null },
  setItem(key, value) {
    values.set(key, String(value))
    if (persist && key === editorialKey) {
      const snapshot = String(value)
      outstanding++
      pending = pending.then(async () => {
        try { await persist(snapshot); lastError = null; window.dispatchEvent(new CustomEvent('studio:editorial-saved')) }
        catch (error) { lastError = error; window.dispatchEvent(new CustomEvent('studio:save-error')) }
        finally { outstanding-- }
      })
    }
  },
  removeItem(key) { values.delete(key) },
}
export async function flushUserStorage() {
  await pending
  if (lastError && persist) {
    // Retry the latest local snapshot; the repository still enforces its original revision.
    userStorage.setItem(editorialKey, values.get(editorialKey))
    await pending
  }
  if (lastError) throw lastError
}
