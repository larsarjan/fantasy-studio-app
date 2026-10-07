import { safeHtml } from './html.js'
import { supabase, friendlyError } from './client.js'
import { preferences, savePreferences, exportPrivateData, importLegacyEditorial } from './repository.js'
import { flushSelection, selectionDirty, startSelectionAutosave } from './selectionStorage.js'
import { setProfileAccount, profileName, initials } from '../modules/profile.js'
import { flushUserStorage, hasPendingUserStorage } from '../services/userStorage.js'

let busy = false
function status(text) { const node = document.querySelector('#account-status'); if (node) node.textContent = text }

export async function persistCurrentTeam() {
  if (busy) return false
  busy = true
  try {
    await flushUserStorage()
    await flushSelection()
    return true
  } catch (error) { status(friendlyError(error)); return false }
  finally { busy = false }
}

export function mountAccount(session) {
  setProfileAccount(session.user)
  const toolbar = document.createElement('div')
  toolbar.className = 'platform-toolbar'
  toolbar.innerHTML = safeHtml('<span class="platform-status" id="account-status" role="status">Opgeslagen</span><button id="selection-retry" hidden>Opnieuw opslaan</button><a id="selection-reload" href="" hidden>Herlaad opgeslagen selectie</a><details class="profile-menu"><summary><span class="profile-avatar" id="account-initials"></span><span><strong id="account-display-name"></strong><small id="account-name"></small></span></summary><nav aria-label="Accountmenu"><a href="/studio/profile">Mijn profiel</a><a href="/studio/settings">Instellingen</a><a href="/studio/profile">Account</a><button id="sign-out">Uitloggen</button></nav></details>')
  document.querySelector('.main-content').prepend(toolbar)
  document.querySelector('#account-name').textContent = session.user.email
  const refresh = () => { document.querySelector('#account-display-name').textContent=profileName();document.querySelector('#account-initials').textContent=initials() }
  refresh()
  window.addEventListener('studio:profile-saved',refresh)
  window.addEventListener('studio:selection-status',event=>{
    status(event.detail.status+(event.detail.error?' · '+friendlyError(event.detail.error):''))
    document.querySelector('#selection-retry').hidden=!event.detail.error || event.detail.error.code==='P0001'
    document.querySelector('#selection-reload').hidden=event.detail.error?.code!=='P0001'
  })
  document.querySelector('#selection-retry').onclick=persistCurrentTeam
  startSelectionAutosave()
  document.addEventListener('click', async event => {
    const link=event.target.closest('.app a[href^="/studio"]')
    if(!link || event.ctrlKey || event.metaKey || event.shiftKey || event.button!==0)return
    event.preventDefault()
    if(await persistCurrentTeam())location.assign(link.href)
  })
  document.querySelector('#sign-out').onclick = async () => {
    if (busy) return
    if (!await persistCurrentTeam()) return
    try { await flushUserStorage() } catch (error) { status(friendlyError(error)); return }
    const { error } = await supabase.auth.signOut()
    if (error) status(friendlyError(error))
  }
  window.addEventListener('beforeunload', event => { if (selectionDirty() || busy || hasPendingUserStorage()) { event.preventDefault(); event.returnValue = '' } })
  window.addEventListener('offline', () => status('Je bent offline. Bewaar je wijzigingen zodra de verbinding terug is.'))
  window.addEventListener('online', () => status('Verbinding hersteld. Je kunt weer opslaan.'))
  window.addEventListener('studio:editorial-saved', () => status('Transfernotities opgeslagen in je account'))
  window.addEventListener('studio:save-error', () => status('Transfernotities zijn nog niet opgeslagen. Controleer je verbinding.'))
}

export function createSettingsScreen() {
  return `<div class="panel platform-settings"><h2>Jouw Studio</h2><p>Beheer je voorkeuren en gegevens.</p>
  <section><h3>Profiel</h3><a href="/studio/profile">Weergavenaam en favoriete club wijzigen</a></section><section><h3>Voorkeuren</h3><label><input id="compact-view" type="checkbox"> Compacte weergave</label><br><button id="save-preferences" class="platform-primary">Voorkeuren opslaan</button></section>
  <section><h3>Mijn gegevens</h3><p>Download een kopie van je opgeslagen selecties en instellingen.</p><button id="export-data">Gegevens downloaden</button></section>
  <section><h3>Bestaande desktopgegevens</h3><p>Importeer oude transfernotities uit deze browser. Bestaande cloudnotities worden niet overschreven en de lokale bron blijft bewaard. Selecties uit een screenshot of tekst importeer je via FVT Manager.</p><button id="legacy-import">Lokale transfernotities importeren</button></section>
  <p id="settings-status" class="platform-status" role="status"></p></div>`
}

export function mountSettingsScreen() {
  const report = text => document.querySelector('#settings-status').textContent = text
  document.querySelector('#compact-view').checked = preferences.compact === true
  const run = (id, fn) => { document.querySelector(id).onclick = async event => { event.currentTarget.disabled = true; try { await fn() } catch (error) { report(friendlyError(error)) } finally { const button = document.querySelector(id); if (button) button.disabled = false } } }
  run('#save-preferences', async () => {
    const settings = { ...preferences, compact: document.querySelector('#compact-view').checked }
    await savePreferences(settings)
    document.body.classList.toggle('compact-view', settings.compact)
    report('Je voorkeuren zijn opgeslagen.')
  })
  run('#export-data', async () => {
    const data = await exportPrivateData()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'fantasy-studio-export.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    report('Je export is gedownload.')
  })
  run('#legacy-import', async () => report(`${await importLegacyEditorial()} lokale notities verwerkt. De originele gegevens zijn bewaard.`))
}
