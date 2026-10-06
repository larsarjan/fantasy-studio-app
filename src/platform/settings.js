import { safeHtml } from './html.js'
import { supabase, friendlyError } from './client.js'
import { profile, preferences, savePreferences, saveTeam, exportPrivateData, importLegacyEditorial } from './repository.js'
import { getManagerSettings, getManagerTeamState } from '../modules/optimizer.js'
import { flushUserStorage, hasPendingUserStorage } from '../services/userStorage.js'

let busy = false
let baseline = ''
const snapshot = () => JSON.stringify([getManagerTeamState(), getManagerSettings()])
function status(text) { const node = document.querySelector('#account-status'); if (node) node.textContent = text }

export async function persistCurrentTeam() {
  if (busy) return false
  busy = true
  const button = document.querySelector('#save-team')
  if (button) button.disabled = true
  const current = snapshot()
  status('Team opslaan…')
  try {
    const [state, settings] = JSON.parse(current)
    await flushUserStorage()
    await saveTeam(state, settings)
    baseline = current
    status('Team opgeslagen in je account')
    return true
  } catch (error) { status(friendlyError(error)); return false }
  finally { busy = false; if (button) button.disabled = false }
}

export function mountAccount(session) {
  baseline = snapshot()
  const toolbar = document.createElement('div')
  toolbar.className = 'platform-toolbar'
  toolbar.innerHTML = safeHtml('<small id="account-name"></small><span class="platform-status" id="account-status" role="status"></span><button id="save-team" class="platform-primary">Team opslaan</button><button id="sign-out">Uitloggen</button>')
  document.querySelector('.main-content').prepend(toolbar)
  document.querySelector('#account-name').textContent = session.user.email
  document.querySelector('#save-team').onclick = persistCurrentTeam
  document.querySelector('#sign-out').onclick = async () => {
    if (busy) return
    if (snapshot() !== baseline && !await persistCurrentTeam()) return
    try { await flushUserStorage() } catch (error) { status(friendlyError(error)); return }
    const { error } = await supabase.auth.signOut()
    if (error) status(friendlyError(error))
  }
  window.addEventListener('beforeunload', event => { if (snapshot() !== baseline || busy || hasPendingUserStorage()) { event.preventDefault(); event.returnValue = '' } })
  window.addEventListener('offline', () => status('Je bent offline. Bewaar je wijzigingen zodra de verbinding terug is.'))
  window.addEventListener('online', () => status('Verbinding hersteld. Je kunt weer opslaan.'))
  window.addEventListener('studio:editorial-saved', () => status('Transfernotities opgeslagen in je account'))
  window.addEventListener('studio:save-error', () => status('Transfernotities zijn nog niet opgeslagen. Controleer je verbinding.'))
}

export function createSettingsScreen() {
  return `<div class="panel platform-settings"><h2>Jouw Studio</h2><p>Beheer je voorkeuren en gegevens.</p>
  <section><h3>Voorkeuren</h3><label class="platform-field">Weergavenaam<input id="display-name" maxlength="80"></label><label><input id="compact-view" type="checkbox"> Compacte weergave</label><br><button id="save-preferences" class="platform-primary">Voorkeuren opslaan</button></section>
  <section><h3>Mijn gegevens</h3><p>Download een kopie van je opgeslagen teams en instellingen.</p><button id="export-data">Gegevens downloaden</button></section>
  <section><h3>Bestaande desktopgegevens</h3><p>Importeer oude transfernotities uit deze browser. Bestaande cloudnotities worden niet overschreven en de lokale bron blijft bewaard. Teams uit een screenshot of tekst importeer je via FVT Manager.</p><button id="legacy-import">Lokale transfernotities importeren</button></section>
  <p id="settings-status" class="platform-status" role="status"></p></div>`
}

export function mountSettingsScreen() {
  const report = text => document.querySelector('#settings-status').textContent = text
  document.querySelector('#display-name').value = preferences.displayName ?? profile?.display_name ?? ''
  document.querySelector('#compact-view').checked = preferences.compact === true
  const run = (id, fn) => { document.querySelector(id).onclick = async event => { event.currentTarget.disabled = true; try { await fn() } catch (error) { report(friendlyError(error)) } finally { const button = document.querySelector(id); if (button) button.disabled = false } } }
  run('#save-preferences', async () => {
    const settings = { ...preferences, displayName: document.querySelector('#display-name').value.trim(), compact: document.querySelector('#compact-view').checked }
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
