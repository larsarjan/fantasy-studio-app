import { renderPublic, icon } from '../public/homepage.js'
import { loginDestination } from './routes.js'
import { supabase, appUrl, friendlyError } from './client.js'
import './platform.css'

let authMode = 'login'
let recovery = new URLSearchParams(location.search).get('flow') === 'recovery'
const requestedPath = loginDestination(location.pathname, import.meta.env.BASE_URL)

function message(text) { const el = document.querySelector('#auth-message'); if (el) el.textContent = text }

export function renderAuth(mode = 'login', notice = '') {
  authMode = mode
  const titles = { login: 'Welkom terug', signup: 'Jouw Studio begint hier', forgot: 'Wachtwoord vergeten?', reset: 'Nieuw wachtwoord instellen' }
  const buttons = { login: 'Inloggen', signup: 'Account aanmaken', forgot: 'Verstuur herstelmail', reset: 'Wachtwoord opslaan' }
  renderPublic(`<span class="fvt-eyebrow">FANTASY STUDIO</span><h2>${titles[mode]}</h2>
      <p>${mode === 'signup' ? 'Maak je persoonlijke account aan en bevestig je e-mailadres.' : mode === 'forgot' ? 'We sturen je een link om je wachtwoord opnieuw in te stellen.' : mode === 'reset' ? 'Gebruik een uniek wachtwoord van minimaal 12 tekens.' : 'Log in om verder te gaan in Fantasy Studio.'}</p>
      <form id="auth-form">
        ${mode !== 'reset' ? '<label for="auth-email">E-mailadres</label><input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="jouw@email.nl">' : ''}
        ${mode !== 'forgot' ? `<label for="auth-password">Wachtwoord</label><div class="fvt-password"><input id="auth-password" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="${mode === 'login' ? 1 : 12}" maxlength="128" placeholder="Je wachtwoord" required><button class="fvt-password-toggle" type="button" aria-controls="auth-password" aria-pressed="false" aria-label="Wachtwoord tonen">Toon</button></div>` : ''}
        ${mode === 'reset' || mode === 'signup' ? '<label for="auth-confirmation">Herhaal wachtwoord</label><input id="auth-confirmation" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>' : ''}
        <p id="auth-message" role="status" aria-live="polite"></p><button class="platform-primary" type="submit">${buttons[mode]} ${icon('arrow')}</button>
      </form><div class="auth-links">${mode === 'login' ? '<button data-auth="forgot" type="button">Wachtwoord vergeten?</button><button data-auth="signup" type="button">Nog geen account? Account aanmaken</button>' : '<button data-auth="login" type="button">Terug naar inloggen</button>'}</div>
      <p class="fvt-account-note">${icon('lock')} Je selectie, instellingen en analyses blijven veilig bewaard.</p>`)
  const toggle = document.querySelector('.fvt-password-toggle')
  if (toggle) toggle.onclick = () => {
    const input = document.querySelector('#auth-password'); const visible = input.type === 'password'
    input.type = visible ? 'text' : 'password'; toggle.textContent = visible ? 'Verberg' : 'Toon'
    toggle.setAttribute('aria-pressed', String(visible)); toggle.setAttribute('aria-label', visible ? 'Wachtwoord verbergen' : 'Wachtwoord tonen')
  }
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
      else if (authMode === 'reset') { recovery = false; location.replace(appUrl('studio')) }
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
  if (location.pathname.includes('/auth/')) history.replaceState(null, '', appUrl('studio'))
  return data.session
}
