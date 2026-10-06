import { safeHtml } from './html.js'
import { supabase, appUrl, friendlyError } from './client.js'
import './platform.css'

const root = () => document.querySelector('#app')
let authMode = 'login'
let recovery = new URLSearchParams(location.search).get('flow') === 'recovery'
const requestedPath = location.pathname.startsWith(import.meta.env.BASE_URL) && !location.pathname.includes('/auth/') ? location.pathname : import.meta.env.BASE_URL

function message(text) { const el = document.querySelector('#auth-message'); if (el) el.textContent = text }

export function renderAuth(mode = 'login', notice = '') {
  authMode = mode
  const titles = { login: 'Welkom terug', signup: 'Jouw Studio begint hier', forgot: 'Wachtwoord vergeten?', reset: 'Nieuw wachtwoord instellen' }
  const buttons = { login: 'Inloggen', signup: 'Account aanmaken', forgot: 'Verstuur herstelmail', reset: 'Wachtwoord opslaan' }
  root().innerHTML = safeHtml(`<main class="auth-layout">
    <section class="auth-story"><a class="auth-brand" href="${appUrl()}"><span>FVT</span> FANTASY VOETBAL STUDIO</a>
      <div><span class="auth-kicker">JOUW VOORSPRONG BEGINT HIER</span><h1>Meer inzicht.<br>Betere keuzes.<br><em>Jouw beste team.</em></h1>
      <p>Spelers, programma en slimme analyses. Alles voor jouw fantasyseizoen, op één plek.</p>
      <div class="auth-features"><span>Captain Radar</span><span>FVT Manager</span><span>Intelligence</span></div></div>
      <small>Fantasy Voetbal Talk · Eredivisie</small></section>
    <section class="auth-card"><span class="auth-kicker">FANTASY STUDIO</span><h2>${titles[mode]}</h2>
      <p>${mode === 'signup' ? 'Maak je persoonlijke account aan en bevestig je e-mailadres.' : mode === 'forgot' ? 'We sturen je een link om je wachtwoord opnieuw in te stellen.' : mode === 'reset' ? 'Gebruik een uniek wachtwoord van minimaal 12 tekens.' : 'Log in en werk verder aan jouw seizoen.'}</p>
      <form id="auth-form">
        ${mode !== 'reset' ? '<label>E-mailadres<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="jij@voorbeeld.nl"></label>' : ''}
        ${mode !== 'forgot' ? `<label>Wachtwoord<input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="${mode === 'login' ? 1 : 12}" maxlength="128" required></label>` : ''}
        ${mode === 'reset' || mode === 'signup' ? '<label>Herhaal wachtwoord<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>' : ''}
        <p id="auth-message" role="status" aria-live="polite"></p><button class="platform-primary" type="submit">${buttons[mode]}</button>
      </form><div class="auth-links">${mode === 'login' ? '<button data-auth="forgot">Wachtwoord vergeten?</button><button data-auth="signup">Account aanmaken</button>' : '<button data-auth="login">Terug naar inloggen</button>'}</div>
      <small class="auth-footer">Je team en instellingen worden veilig in je account bewaard.</small>
    </section></main>`)
  message(notice)
  document.querySelectorAll('[data-auth]').forEach(button => button.onclick = () => renderAuth(button.dataset.auth))
  document.querySelector('#auth-form').onsubmit = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    if (values.confirmation !== undefined && values.password !== values.confirmation) return message('De wachtwoorden komen niet overeen.')
    const button = form.querySelector('[type=submit]')
    button.disabled = true
    message('Even geduld…')
    try {
      if (!supabase) throw new Error('configuration')
      let result
      if (authMode === 'login') result = await supabase.auth.signInWithPassword({ email: values.email, password: values.password })
      if (authMode === 'signup') result = await supabase.auth.signUp({ email: values.email, password: values.password, options: { emailRedirectTo: appUrl('auth/callback') } })
      if (authMode === 'forgot') result = await supabase.auth.resetPasswordForEmail(values.email, { redirectTo: appUrl('auth/callback?flow=recovery') })
      if (authMode === 'reset') result = await supabase.auth.updateUser({ password: values.password })
      if (result.error) throw result.error
      if (authMode === 'signup' || authMode === 'forgot') message('Controleer je e-mail. Als je aanvraag kan worden verwerkt, ontvang je een link. Kijk ook in je spammap.')
      else if (authMode === 'reset') { recovery = false; location.replace(appUrl()) }
      else location.replace(new URL(requestedPath, location.origin).href)
    } catch (error) { message(friendlyError(error)) }
    finally { button.disabled = false }
  }
}

export async function requireSession() {
  if (!supabase) { renderAuth('login', 'Studio is nog niet geconfigureerd. De beheerder moet de verbinding instellen.'); return null }
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { recovery = true; renderAuth('reset') }
    if (event === 'SIGNED_OUT') location.replace(appUrl())
  })
  const params = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.slice(1))
  if (hash.get('type') === 'invite') recovery = true
  if (params.has('error') || hash.has('error')) {
    history.replaceState(null, '', appUrl())
    renderAuth('forgot', 'Deze link is ongeldig of verlopen. Vraag een nieuwe link aan.')
    return null
  }
  // Admin-generated invitations/recovery links use a token fragment, while
  // browser-initiated email flows use PKCE. Validate both through Supabase.
  if (location.pathname.includes('/auth/') && hash.has('access_token') && hash.has('refresh_token')) {
    const { error } = await supabase.auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') })
    history.replaceState(null, '', appUrl('auth/callback'))
    if (error) { renderAuth('forgot', 'Deze link is ongeldig of verlopen. Vraag een nieuwe link aan.'); return null }
    if (['recovery', 'invite'].includes(hash.get('type'))) recovery = true
  }
  const { data, error } = await supabase.auth.getSession()
  if (error) { renderAuth('login', friendlyError(error)); return null }
  if (recovery && data.session) { renderAuth('reset'); return null }
  if (!data.session) { renderAuth('login', location.pathname.includes('/auth/') ? 'De link is verlopen of is geopend in een andere browser. Vraag hier een nieuwe link aan.' : ''); return null }
  if (location.pathname.includes('/auth/')) history.replaceState(null, '', appUrl())
  return data.session
}
