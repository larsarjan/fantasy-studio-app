import { getManagerSettings, getManagerTeamState, restoreManagerState } from '../modules/optimizer.js'
import { saveTeam } from './repository.js'

let baseline = '', saving = null, failed = false, timer = null
const snapshot = () => JSON.stringify([getManagerTeamState(), getManagerSettings()])
function announce(status, error) { window.dispatchEvent(new CustomEvent('studio:selection-status', { detail: { status, error } })) }
export const selectionDirty = () => snapshot() !== baseline || Boolean(saving)
export function changeSelection(state, settings = getManagerSettings()) {
  restoreManagerState(state, settings)
  window.dispatchEvent(new Event('studio:selection-changed'))
  if (!failed) { announce('Bezig met opslaan'); clearTimeout(timer); timer = setTimeout(() => { flushSelection().catch(() => {}) }, 650) }
}
export async function flushSelection() {
  clearTimeout(timer)
  if (saving) await saving
  if (snapshot() === baseline) return
  // A stale writer must reload, never retry with an implicitly refreshed version.
  saving = (async () => {
    try {
      while (snapshot() !== baseline) {
        const current = snapshot(), [state, settings] = JSON.parse(current)
        announce('Bezig met opslaan')
        await saveTeam(state, settings)
        baseline = current
      }
      failed = false
      announce('Opgeslagen')
    } catch (error) { failed = true; announce('Synchronisatiefout', error); throw error }
  })()
  try { await saving } finally { saving = null }
}
export function startSelectionAutosave() {
  baseline = snapshot()
  // Also catches existing Manager controls/imports without changing optimizer logic.
  setInterval(() => { if (!failed && !saving && snapshot() !== baseline) flushSelection().catch(() => {}) }, 1500)
  window.addEventListener('online', () => { if (!failed) flushSelection().catch(() => {}) })
  announce('Opgeslagen')
}
